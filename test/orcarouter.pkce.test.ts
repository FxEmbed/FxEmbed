import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateState,
  isValidCodeVerifier,
  timingSafeEqual
} from '../src/helpers/orcarouter/pkce';
import {
  OrcaAuthError,
  connectOrcaWithPastedCode,
  exchangeOrcaCode,
  startOrcaAuthorization
} from '../src/helpers/orcarouter/connect';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';

const AUTH_ORIGIN = 'https://www.orcarouter.ai';
const API_ORIGIN = 'https://api.orcarouter.ai/v1';
const ORIGINS = resolveOrcaOrigins({});

/** Base64url of a sha256 digest, decoded for comparison. */
function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PKCE primitives', () => {
  it('generates a fresh verifier and state on every attempt', () => {
    const verifiers = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
    const states = new Set(Array.from({ length: 50 }, () => generateState()));
    expect(verifiers.size).toBe(50);
    expect(states.size).toBe(50);
  });

  it('generates verifiers inside the RFC 7636 length window', () => {
    for (let i = 0; i < 20; i++) {
      const verifier = generateCodeVerifier();
      expect(isValidCodeVerifier(verifier)).toBe(true);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    }
  });

  it('derives an unpadded base64url S256 challenge from the verifier', async () => {
    const verifier = 'fixed-verifier-for-hash-check-0123456789abcdefghij';
    const challenge = await codeChallengeFromVerifier(verifier);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');

    // Independent recomputation of base64url(sha256(verifier)).
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    );
    const expected = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
    expect(decodeBase64Url(challenge).length).toBe(32);
  });

  it('compares state in constant time without early-exit on length', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});

describe('authorize URL', () => {
  it('uses the auth origin, the fixed /auth path, oob delivery and mandatory S256', async () => {
    const start = await startOrcaAuthorization({ origins: ORIGINS, appName: 'FxEmbed' });
    const url = new URL(start.authorizeUrl);

    expect(url.origin).toBe(AUTH_ORIGIN);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('callback_url')).toBe('oob');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('app_name')).toBe('FxEmbed');
    expect(url.searchParams.get('scope')).toBe('api');
    expect(url.searchParams.get('state')).toBe(start.state);
    expect(url.searchParams.get('code_challenge')).toBe(
      await codeChallengeFromVerifier(start.codeVerifier)
    );
  });

  it('never puts the verifier in the URL', async () => {
    const start = await startOrcaAuthorization({ origins: ORIGINS, appName: 'FxEmbed' });
    expect(start.authorizeUrl).not.toContain(start.codeVerifier);
    expect(start.authorizeUrl).not.toContain('code_verifier');
  });

  it('passes a login hint through when supplied', async () => {
    const start = await startOrcaAuthorization({
      origins: ORIGINS,
      appName: 'FxEmbed',
      loginHint: 'user@example.com'
    });
    expect(new URL(start.authorizeUrl).searchParams.get('login_hint')).toBe('user@example.com');
  });
});

describe('code exchange', () => {
  it('posts to the auth origin exchange path with the verifier and S256 method', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(
          JSON.stringify({ key: 'sk-orca-exchanged', user_id: '1', scope: 'api' }),
          {
            status: 200
          }
        );
      })
    );

    const result = await exchangeOrcaCode({
      origins: ORIGINS,
      code: 'one-time-code',
      codeVerifier: 'the-verifier-value'
    });

    expect(calls[0].url).toBe(`${AUTH_ORIGIN}/api/v1/auth/keys`);
    // The documented mistake is the relay path; it must never be used for auth.
    expect(calls[0].url).not.toBe(`${API_ORIGIN}/auth/keys`);
    expect(calls[0].body).toEqual({
      code: 'one-time-code',
      code_verifier: 'the-verifier-value',
      code_challenge_method: 'S256'
    });
    expect(result.apiKey).toBe('sk-orca-exchanged');
    expect(result.scope).toBe('api');
  });

  it('reports a denied or already-used code as terminal, not retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 403 }))
    );
    const error = await exchangeOrcaCode({
      origins: ORIGINS,
      code: 'stale',
      codeVerifier: 'v'
    }).catch((e: OrcaAuthError) => e);

    expect(error).toBeInstanceOf(OrcaAuthError);
    expect((error as OrcaAuthError).kind).toBe('code_rejected');
    expect((error as OrcaAuthError).message).toMatch(/single-use|expired|already used/i);
  });

  it('reports a PKCE method mismatch as a 400 invalid request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 400 }))
    );
    const error = await exchangeOrcaCode({ origins: ORIGINS, code: 'c', codeVerifier: 'v' }).catch(
      (e: OrcaAuthError) => e
    );
    expect((error as OrcaAuthError).kind).toBe('invalid_request');
    expect((error as OrcaAuthError).status).toBe(400);
  });

  it('surfaces rate limiting with the 10-keys-per-day explanation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 }))
    );
    const error = await exchangeOrcaCode({ origins: ORIGINS, code: 'c', codeVerifier: 'v' }).catch(
      (e: OrcaAuthError) => e
    );
    expect((error as OrcaAuthError).kind).toBe('rate_limited');
    expect((error as OrcaAuthError).message).toMatch(/10 keys per user per 24 hours/i);
  });

  it('surfaces a network failure without hanging or leaking the verifier', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket closed while sending verifier=THE_VERIFIER');
      })
    );
    const error = await exchangeOrcaCode({
      origins: ORIGINS,
      code: 'c',
      codeVerifier: 'THE_VERIFIER'
    }).catch((e: OrcaAuthError) => e);

    expect((error as OrcaAuthError).kind).toBe('network');
    expect((error as OrcaAuthError).message).not.toContain('THE_VERIFIER');
  });

  it('rejects a scope downgrade instead of assuming the requested grant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ key: 'sk-orca-x', user_id: '1', scope: 'connector' }), {
            status: 200
          })
      )
    );
    const error = await exchangeOrcaCode({
      origins: ORIGINS,
      code: 'c',
      codeVerifier: 'v',
      scope: 'api'
    }).catch((e: OrcaAuthError) => e);

    expect((error as OrcaAuthError).kind).toBe('scope_insufficient');
    expect((error as OrcaAuthError).message).toContain('connector');
  });

  it('rejects a response with no key rather than persisting an empty credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"user_id":"1"}', { status: 200 }))
    );
    const error = await exchangeOrcaCode({ origins: ORIGINS, code: 'c', codeVerifier: 'v' }).catch(
      (e: OrcaAuthError) => e
    );
    expect((error as OrcaAuthError).kind).toBe('malformed_response');
  });
});

/**
 * The full Flow B round trip against a local fake consent/exchange server. This exercises
 * the adapter the CLI actually uses, not a stray hash helper.
 */
describe('Flow B end to end through the connect adapter', () => {
  it('authorize -> paste code -> exchange -> persist the returned key', async () => {
    const persisted: string[] = [];
    const seen: Array<{ path: string; challenge?: string; method?: string; verifier?: string }> =
      [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const parsed = new URL(String(url));
        // A fake auth server that enforces the PKCE binding like the real one does.
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, string>;
          seen.push({ path: parsed.pathname, verifier: body.code_verifier });
          const expectedChallenge = seen[0]?.challenge;
          const actualChallenge = await codeChallengeFromVerifier(body.code_verifier ?? '');
          if (actualChallenge !== expectedChallenge) {
            return new Response('{"error":"invalid_grant"}', { status: 403 });
          }
          if (body.code !== 'GOOD-CODE') {
            return new Response('{"error":"invalid_grant"}', { status: 403 });
          }
          return new Response(
            JSON.stringify({ key: 'sk-orca-from-flow-b', user_id: '42', scope: 'api' }),
            { status: 200 }
          );
        }
        seen.push({ path: parsed.pathname });
        return new Response('{}', { status: 200 });
      })
    );

    const result = await connectOrcaWithPastedCode({
      origins: ORIGINS,
      appName: 'FxEmbed',
      promptForCode: async authorizeUrl => {
        const url = new URL(authorizeUrl);
        // Record what the consent screen would receive, then act as the user pasting a code.
        seen[0] = {
          path: url.pathname,
          challenge: url.searchParams.get('code_challenge') ?? undefined,
          method: url.searchParams.get('code_challenge_method') ?? undefined
        };
        return 'GOOD-CODE';
      }
    });

    persisted.push(result.apiKey);

    expect(seen[0].path).toBe('/auth');
    expect(seen[0].method).toBe('S256');
    expect(seen[1].path).toBe('/api/v1/auth/keys');
    expect(result.apiKey).toBe('sk-orca-from-flow-b');
    expect(result.scope).toBe('api');
    expect(persisted).toEqual(['sk-orca-from-flow-b']);
    // The verifier was presented to the exchange, and it matched the challenge.
    expect(seen[1].verifier).toBeTruthy();
  });

  it('rejects the exchange when the verifier does not match the challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 403 }))
    );
    const error = await connectOrcaWithPastedCode({
      origins: ORIGINS,
      appName: 'FxEmbed',
      promptForCode: async () => 'GOOD-CODE'
    }).catch((e: OrcaAuthError) => e);

    expect((error as OrcaAuthError).kind).toBe('code_rejected');
  });

  it('treats a blank paste as an explicit cancel, not a failed exchange', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const error = await connectOrcaWithPastedCode({
      origins: ORIGINS,
      appName: 'FxEmbed',
      promptForCode: async () => null
    }).catch((e: OrcaAuthError) => e);

    expect((error as OrcaAuthError).kind).toBe('cancelled');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not attempt a refresh grant — a rejected durable key is terminal', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response('{"error":"invalid_grant"}', { status: 403 });
      })
    );

    await connectOrcaWithPastedCode({
      origins: ORIGINS,
      appName: 'FxEmbed',
      promptForCode: async () => 'CODE'
    }).catch(() => undefined);

    expect(bodies.some(b => b.includes('refresh_token'))).toBe(false);
    expect(bodies.some(b => b.includes('grant_type'))).toBe(false);
  });
});

describe('origins', () => {
  it('keeps auth and inference on their own origins', () => {
    expect(ORIGINS.authBase).toBe(AUTH_ORIGIN);
    expect(ORIGINS.apiBase).toBe(API_ORIGIN);
    expect(ORIGINS.authBase).not.toBe(ORIGINS.apiBase);
  });

  it('lets explicit overrides win over the shared self-hosted base', () => {
    const shared = resolveOrcaOrigins({ ORCA_BASE_URL: 'https://orca.internal' });
    expect(shared.authBase).toBe('https://orca.internal');
    expect(shared.apiBase).toBe('https://orca.internal/v1');

    const explicit = resolveOrcaOrigins({
      ORCA_BASE_URL: 'https://orca.internal',
      ORCA_AUTH_BASE_URL: 'https://auth.internal',
      ORCA_API_BASE_URL: 'https://relay.internal/v1'
    });
    expect(explicit.authBase).toBe('https://auth.internal');
    expect(explicit.apiBase).toBe('https://relay.internal/v1');
  });

  it('requires HTTPS for remote origins and allows HTTP only on loopback', () => {
    expect(() => resolveOrcaOrigins({ ORCA_BASE_URL: 'http://orca.example.com' })).toThrow(/HTTPS/);
    expect(resolveOrcaOrigins({ ORCA_BASE_URL: 'http://127.0.0.1:8787' }).authBase).toBe(
      'http://127.0.0.1:8787'
    );
    expect(resolveOrcaOrigins({ ORCA_BASE_URL: 'http://localhost:8787' }).apiBase).toBe(
      'http://localhost:8787/v1'
    );
    expect(() => resolveOrcaOrigins({ ORCA_BASE_URL: 'not a url' })).toThrow(/valid absolute URL/);
  });
});
