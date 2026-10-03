import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import { resetOrcaCatalogCache, translateStatusAI } from '../src/helpers/translateAI';
import { resolveOrcaCredential } from '../src/helpers/orcarouter/credential';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';

const ORIGINS = resolveOrcaOrigins({});
const KEY = 'sk-orca-testonly0000000000000000000001';

const LIVE_CATALOG = {
  data: [
    {
      id: 'orcarouter/auto',
      supported_endpoint_types: ['openai', 'anthropic', 'gemini', 'openai-response'],
      architecture: { input_modalities: ['text'] }
    },
    {
      id: 'openai/gpt-5.5',
      supported_endpoint_types: ['openai', 'openai-response'],
      architecture: { input_modalities: ['text'] }
    },
    {
      id: 'openai/gpt-image-2',
      supported_endpoint_types: ['image-generation'],
      architecture: { input_modalities: ['text'] }
    }
  ]
};

/**
 * Minimal Hono-like context. The entry point only reads `c.env`, so this is the same
 * shape the worker passes in — the integration is exercised through `translateStatusAI`,
 * not through a reimplementation of it.
 */
function fakeContext(env: Record<string, unknown>): Context {
  return { env } as unknown as Context;
}

const STATUS = { text: 'hola mundo', lang: 'es' } as never;

beforeEach(() => {
  resetOrcaCatalogCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetOrcaCatalogCache();
});

describe('translation entry point routes through OrcaRouter when configured', () => {
  it('discovers the chat catalog and sends the completion to the inference origin', async () => {
    const calls: Array<{ url: string; auth?: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ url: String(url), auth: headers.Authorization, body: init?.body as string });
        if (String(url).includes('/models')) {
          return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            model: 'orcarouter/auto',
            choices: [{ message: { content: 'hello world' } }],
            usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 }
          }),
          { status: 200 }
        );
      })
    );

    const result = await translateStatusAI(
      STATUS,
      'en',
      fakeContext({
        ORCAROUTER_API_KEY: KEY,
        ORCAROUTER_MODEL: 'orcarouter/auto'
      })
    );

    expect(result?.translated_text).toBe('hello world');
    expect(result?.usage).toEqual({ prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 });

    const catalogCall = calls.find(c => c.url.includes('/models'));
    const inferenceCall = calls.find(c => c.url.includes('/chat/completions'));
    expect(catalogCall?.url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(inferenceCall?.url).toBe('https://api.orcarouter.ai/v1/chat/completions');
    expect(inferenceCall?.auth).toBe(`Bearer ${KEY}`);
    // Auth origin is never contacted for inference or discovery.
    expect(calls.every(c => !c.url.includes('www.orcarouter.ai'))).toBe(true);
  });

  it('sends the model id verbatim, preserving the vendor namespace', async () => {
    let sentModel = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes('/models')) {
          return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
        }
        sentModel = JSON.parse(String(init?.body)).model;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          }),
          { status: 200 }
        );
      })
    );

    await translateStatusAI(
      STATUS,
      'en',
      fakeContext({ ORCAROUTER_API_KEY: KEY, ORCAROUTER_MODEL: 'openai/gpt-5.5' })
    );
    expect(sentModel).toBe('openai/gpt-5.5');
  });

  it('refuses a configured model that is not in the compatible chat catalog', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        urls.push(String(url));
        return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
      })
    );

    const result = await translateStatusAI(
      STATUS,
      'en',
      // An image model is not a valid text-chat selection.
      fakeContext({ ORCAROUTER_API_KEY: KEY, ORCAROUTER_MODEL: 'openai/gpt-image-2' })
    );

    expect(result).toBeNull();
    expect(urls.some(u => u.includes('/chat/completions'))).toBe(false);
  });

  it('leaves other providers untouched when OrcaRouter is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const aiRun = vi.fn(async () => ({
      response: 'from workers ai',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }));

    expect(resolveOrcaCredential({})).toBeNull();

    const result = await translateStatusAI(STATUS, 'en', fakeContext({ AI: { run: aiRun } }));

    expect(result?.translated_text).toBe('from workers ai');
    expect(aiRun).toHaveBeenCalledWith('@cf/openai/gpt-oss-120b', expect.anything());
    // No OrcaRouter traffic at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the existing provider when OrcaRouter discovery fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 }))
    );
    const aiRun = vi.fn(async () => ({
      response: 'workers ai fallback',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }));

    const result = await translateStatusAI(
      STATUS,
      'en',
      fakeContext({
        ORCAROUTER_API_KEY: KEY,
        ORCAROUTER_MODEL: 'orcarouter/auto',
        AI: { run: aiRun }
      })
    );

    // Discovery failed and the completion then failed too, so the existing provider is used.
    expect(result?.translated_text).toBe('workers ai fallback');
  });

  it('does not attempt a second request after a 401 and reports reauthentication', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const inferenceCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/models')) {
          return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
        }
        inferenceCalls.push(String(url));
        return new Response('{"error":"revoked"}', { status: 401 });
      })
    );

    await translateStatusAI(
      STATUS,
      'en',
      fakeContext({ ORCAROUTER_API_KEY: KEY, ORCAROUTER_MODEL: 'orcarouter/auto' })
    );

    // Exactly one attempt: a revoked durable key is terminal, never a retry loop.
    expect(inferenceCalls.length).toBe(1);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/reauthenticate/i);
  });

  it('caches a successful catalog so a second translation does not re-discover', async () => {
    const catalogCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/models')) {
          catalogCalls.push(String(url));
          return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          }),
          { status: 200 }
        );
      })
    );

    const env = { ORCAROUTER_API_KEY: KEY, ORCAROUTER_MODEL: 'orcarouter/auto' };
    await translateStatusAI(STATUS, 'en', fakeContext(env));
    await translateStatusAI(STATUS, 'en', fakeContext(env));

    expect(catalogCalls.length).toBe(1);
  });
});

describe('both credential adapters drive the same entry point', () => {
  it('translates with a pasted API key and with a PKCE key identically', async () => {
    const originsUsed: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes('/models')) {
          return new Response(JSON.stringify(LIVE_CATALOG), { status: 200 });
        }
        originsUsed.push((init?.headers as Record<string, string>).Authorization ?? '');
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'translated' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          }),
          { status: 200 }
        );
      })
    );

    const viaApiKey = await translateStatusAI(
      STATUS,
      'en',
      fakeContext({ ORCAROUTER_API_KEY: KEY, ORCAROUTER_MODEL: 'orcarouter/auto' })
    );
    resetOrcaCatalogCache();
    const viaPkce = await translateStatusAI(
      STATUS,
      'en',
      fakeContext({
        ORCAROUTER_OAUTH_KEY: 'sk-orca-pkce000000000000000000000000002',
        ORCAROUTER_MODEL: 'orcarouter/auto'
      })
    );

    expect(viaApiKey?.translated_text).toBe('translated');
    expect(viaPkce?.translated_text).toBe('translated');
    expect(originsUsed[0]).toBe(`Bearer ${KEY}`);
    expect(originsUsed[1]).toBe('Bearer sk-orca-pkce000000000000000000000000002');
  });

  it('exposes both origins on the resolved config used by the entry point', () => {
    expect(ORIGINS.authBase).toBe('https://www.orcarouter.ai');
    expect(ORIGINS.apiBase).toBe('https://api.orcarouter.ai/v1');
  });
});
