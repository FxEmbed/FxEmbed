import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKeyAdapter,
  createPkceAdapter,
  looksLikeOrcaKey,
  maskOrcaKey,
  orcaCredentialAdapters,
  redactOrcaSecrets,
  resolveOrcaCredential
} from '../src/helpers/orcarouter/credential';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';
import { orcaChatCompletion } from '../src/helpers/orcarouter/provider';
import { resolveOrcaCatalog } from '../src/helpers/orcarouter/catalog';

/** Obviously fake, but shaped like a real key so the shape check is exercised. */
const FAKE_API_KEY = 'sk-orca-testonly0000000000000000000001';
const FAKE_OAUTH_KEY = 'sk-orca-testonly0000000000000000000002';

const ORIGINS = resolveOrcaOrigins({});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('credential adapters', () => {
  it('exposes API key and PKCE as two independently selectable adapters', () => {
    const adapters = orcaCredentialAdapters({ ORCAROUTER_API_KEY: FAKE_API_KEY });
    expect(adapters.map(a => a.source)).toEqual(['api_key', 'pkce']);
  });

  it('resolves a pasted API key without starting any PKCE login', () => {
    const credential = resolveOrcaCredential({ ORCAROUTER_API_KEY: FAKE_API_KEY });
    expect(credential).toEqual({ apiKey: FAKE_API_KEY, source: 'api_key', generation: 0 });
  });

  it('resolves a PKCE-issued key when no pasted key is configured', () => {
    const credential = resolveOrcaCredential({ ORCAROUTER_OAUTH_KEY: FAKE_OAUTH_KEY });
    expect(credential).toEqual({ apiKey: FAKE_OAUTH_KEY, source: 'pkce', generation: 0 });
  });

  it('prefers an explicitly configured API key when both are present', () => {
    const credential = resolveOrcaCredential({
      ORCAROUTER_API_KEY: FAKE_API_KEY,
      ORCAROUTER_OAUTH_KEY: FAKE_OAUTH_KEY
    });
    expect(credential?.source).toBe('api_key');
    expect(credential?.apiKey).toBe(FAKE_API_KEY);
  });

  it('returns null when neither adapter is configured, so OrcaRouter stays disabled', () => {
    expect(resolveOrcaCredential({})).toBeNull();
    expect(resolveOrcaCredential({ ORCAROUTER_API_KEY: '   ' })).toBeNull();
    expect(createApiKeyAdapter(undefined).resolve()).toBeNull();
    expect(createPkceAdapter('').resolve()).toBeNull();
  });

  it('produces the same credential shape from both adapters', () => {
    const fromKey = createApiKeyAdapter(FAKE_API_KEY).resolve()!;
    const fromPkce = createPkceAdapter(FAKE_OAUTH_KEY).resolve()!;
    expect(Object.keys(fromKey).sort()).toEqual(Object.keys(fromPkce).sort());
    expect(typeof fromKey.apiKey).toBe(typeof fromPkce.apiKey);
  });

  it('accepts update and clear of a stored key', () => {
    expect(createApiKeyAdapter(FAKE_API_KEY).resolve()?.apiKey).toBe(FAKE_API_KEY);
    expect(createApiKeyAdapter(undefined).resolve()).toBeNull();
  });
});

describe('key shape and masking', () => {
  it('recognises an sk-orca- prefix but treats it as a hint only', () => {
    expect(looksLikeOrcaKey(FAKE_API_KEY)).toBe(true);
    expect(looksLikeOrcaKey('  sk-orca-abcdefgh  ')).toBe(true);
    expect(looksLikeOrcaKey('sk-other-1234567890')).toBe(false);
    expect(looksLikeOrcaKey('sk-orca-')).toBe(false);
    expect(looksLikeOrcaKey('')).toBe(false);
  });

  it('masks a key without revealing its middle', () => {
    const masked = maskOrcaKey(FAKE_API_KEY);
    expect(masked).not.toBe(FAKE_API_KEY);
    expect(masked).not.toContain('testonly000000000000000000');
    expect(masked.startsWith('sk-orca-')).toBe(true);
    expect(masked.endsWith('0001')).toBe(true);
    expect(maskOrcaKey('')).toBe('');
  });

  it('redacts key-shaped values from arbitrary text', () => {
    const redacted = redactOrcaSecrets(`failed with key ${FAKE_API_KEY} in body`);
    expect(redacted).not.toContain(FAKE_API_KEY);
    expect(redacted).toContain('sk-orca-…');
  });

  it('redacts verifier-shaped JSON fields from an echoed request body', () => {
    const redacted = redactOrcaSecrets('{"code":"abc","code_verifier":"SUPER_SECRET_VERIFIER"}');
    expect(redacted).not.toContain('SUPER_SECRET_VERIFIER');
  });
});

describe('downstream code is indifferent to the credential source', () => {
  it('sends identical inference requests for an API key and a PKCE key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          model: 'orcarouter/auto',
          choices: [{ message: { content: 'hola' } }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fakeFetch);

    const results = [];
    for (const env of [
      { ORCAROUTER_API_KEY: FAKE_API_KEY },
      { ORCAROUTER_OAUTH_KEY: FAKE_OAUTH_KEY }
    ]) {
      const credential = resolveOrcaCredential(env)!;
      results.push(
        await orcaChatCompletion({
          origins: ORIGINS,
          apiKey: credential.apiKey,
          model: 'orcarouter/auto',
          messages: [{ role: 'user', content: 'hello' }]
        })
      );
    }

    // Same result, same destination, same auth scheme — only the key value differs.
    expect(results[0]).toEqual(results[1]);
    expect(calls[0].url).toBe('https://api.orcarouter.ai/v1/chat/completions');
    expect(calls[1].url).toBe(calls[0].url);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_API_KEY}`
    );
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_OAUTH_KEY}`
    );
  });

  it('discovers models identically for an API key and a PKCE key', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        urls.push(String(url));
        return new Response(
          JSON.stringify({
            data: [{ id: 'orcarouter/auto', supported_endpoint_types: ['openai'] }]
          }),
          { status: 200 }
        );
      })
    );

    for (const env of [
      { ORCAROUTER_API_KEY: FAKE_API_KEY },
      { ORCAROUTER_OAUTH_KEY: FAKE_OAUTH_KEY }
    ]) {
      const credential = resolveOrcaCredential(env)!;
      const catalog = await resolveOrcaCatalog({
        origins: ORIGINS,
        apiKey: credential.apiKey,
        capability: 'chat'
      });
      expect(catalog.models.map(m => m.id)).toEqual(['orcarouter/auto']);
    }

    expect(urls).toEqual([
      'https://api.orcarouter.ai/v1/models?capability=chat',
      'https://api.orcarouter.ai/v1/models?capability=chat'
    ]);
  });
});

describe('credentials never reach logs or errors', () => {
  it('does not log the key or the verifier while resolving and using a credential', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"boom"}', { status: 500 }))
    );

    const credential = resolveOrcaCredential({ ORCAROUTER_API_KEY: FAKE_API_KEY })!;
    await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: credential.apiKey,
      model: 'orcarouter/auto',
      messages: [{ role: 'user', content: 'hi' }]
    }).catch(() => undefined);

    const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(output).not.toContain(FAKE_API_KEY);
    expect(output).not.toContain('SUPER_SECRET_VERIFIER');
  });

  it('keeps the key out of a thrown error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(`{"error":{"message":"bad key ${FAKE_API_KEY}"}}`, { status: 500 })
      )
    );

    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: FAKE_API_KEY,
      model: 'orcarouter/auto',
      messages: [{ role: 'user', content: 'hi' }]
    }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(FAKE_API_KEY);
  });
});
