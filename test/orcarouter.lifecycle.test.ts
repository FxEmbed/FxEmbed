import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOrcaCredentialStore,
  shouldReuseStoredCredential
} from '../src/helpers/orcarouter/lifecycle';
import { OrcaRequestError, orcaChatCompletion } from '../src/helpers/orcarouter/provider';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';

const ORIGINS = resolveOrcaOrigins({});
const KEY = 'sk-orca-testonly0000000000000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('durable key lifecycle', () => {
  it('reuses a stored credential until it is revoked', () => {
    const store = createOrcaCredentialStore();
    expect(shouldReuseStoredCredential(store.get())).toBe(true);
  });

  it('marks the exact rejected generation for reauthentication', () => {
    const store = createOrcaCredentialStore();
    const state = store.markRejected(0);
    expect(state.status).toBe('needs_reauth');
    expect(state.rejectedGeneration).toBe(0);
    expect(shouldReuseStoredCredential(state)).toBe(false);
  });

  it('lets a stale async failure leave a newly reauthorized credential untouched', () => {
    const store = createOrcaCredentialStore();
    const oldGeneration = store.get().generation;

    // The user signs in again while the old request is still in flight.
    const fresh = store.install('sk-orca-…0002');
    expect(fresh.generation).toBe(oldGeneration + 1);

    // The old request now fails with 401. It must not poison the new credential.
    const after = store.markRejected(oldGeneration);
    expect(after.status).toBe('active');
    expect(after.generation).toBe(fresh.generation);
    expect(store.isCurrent(oldGeneration)).toBe(false);
    expect(store.isCurrent(fresh.generation)).toBe(true);
  });

  it('returns to active once a new login installs a credential', () => {
    const store = createOrcaCredentialStore();
    store.markRejected(0);
    expect(store.get().status).toBe('needs_reauth');
    const reinstalled = store.install('sk-orca-…0003');
    expect(reinstalled.status).toBe('active');
    expect(reinstalled.rejectedGeneration).toBeUndefined();
  });

  it('never attempts a refresh grant when a durable key is rejected', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response('{"error":"revoked"}', { status: 401 });
      })
    );

    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'orcarouter/auto',
      messages: [{ role: 'user', content: 'hi' }]
    }).catch((e: OrcaRequestError) => e);

    expect((error as OrcaRequestError).kind).toBe('needs_reauth');
    expect((error as OrcaRequestError).status).toBe(401);
    // One attempt only: no retry loop, no fabricated refresh.
    expect(bodies.length).toBe(1);
    expect(bodies.some(b => b.includes('refresh'))).toBe(false);
  });
});

describe('inference errors are classified, not retried', () => {
  it('classifies a revoked credential as terminal reauthentication', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('needs_reauth');
    expect((error as OrcaRequestError).message).toMatch(/sign in again/i);
  });

  it('does not mistake a key-scope 403 for a revoked credential', async () => {
    // Live shape: the key authenticates, but it is not allowed to use this model.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'model_access_denied',
                message: 'This API key does not have access to model orcarouter/auto.'
              }
            }),
            { status: 403 }
          )
      )
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'orcarouter/auto',
      messages: []
    }).catch((e: OrcaRequestError) => e);

    expect((error as OrcaRequestError).kind).toBe('model_forbidden');
    // Telling the user to sign in again would be wrong: the credential is fine.
    expect((error as OrcaRequestError).message).not.toMatch(/sign in again/i);
    expect((error as OrcaRequestError).message).toContain('orcarouter/auto');
  });

  it('reports an unrecognised 403 as a plain authorization failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"nope"}', { status: 403 }))
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('forbidden');
  });

  it('classifies 429 separately from a revoked credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 }))
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('rate_limited');
  });

  it('classifies a transport failure as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connection reset while sending Bearer ${KEY}`);
      })
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('network');
    expect((error as OrcaRequestError).message).not.toContain(KEY);
  });

  it('rejects an empty completion instead of returning blank text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })
      )
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('bad_response');
  });

  it('rejects a non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>oops</html>', { status: 200 }))
    );
    const error = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'm',
      messages: []
    }).catch((e: OrcaRequestError) => e);
    expect((error as OrcaRequestError).kind).toBe('bad_response');
  });

  it('reports usage in the shape the existing translation path expects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'orcarouter/auto',
              choices: [{ message: { content: 'hola' } }],
              usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
            }),
            { status: 200 }
          )
      )
    );
    const result = await orcaChatCompletion({
      origins: ORIGINS,
      apiKey: KEY,
      model: 'orcarouter/auto',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect(result.text).toBe('hola');
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 4, totalTokens: 16 });
  });
});
