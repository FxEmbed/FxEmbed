import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import {
  isAITranslationAvailable,
  stripReasoning,
  translateStatusAI,
  translateTextOpenAICompatible
} from '../src/helpers/translateAI';

const config = {
  baseUrl: 'https://llm.example/v1/',
  apiKey: 'test-key',
  model: 'test-model'
};

const completion = (content: string | null, init?: ResponseInit) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' }, ...init }
  );

describe('stripReasoning', () => {
  it('leaves plain text untouched, including surrounding whitespace', () => {
    expect(stripReasoning('Hello world\n')).toBe('Hello world\n');
  });

  it('removes a leading think block', () => {
    expect(stripReasoning('<think>\nsource is Japanese\n</think>\n\nHello')).toBe('Hello');
  });

  it('removes reasoning when the opening tag was prefilled by the chat template', () => {
    expect(stripReasoning('source is Japanese\n</think>\nHello')).toBe('Hello');
  });
});

describe('translateTextOpenAICompatible', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts an OpenAI chat completions request and returns the translation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(completion('Hello 🌸 #花見'));

    const result = await translateTextOpenAICompatible('こんにちは 🌸 #花見', 'ja', 'en', {
      ...config,
      extraBody: { thinking: { type: 'disabled' }, model: 'ignored' }
    });

    expect(result).toEqual({
      translated_text: 'Hello 🌸 #花見',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://llm.example/v1/chat/completions');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('test-model');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'こんにちは 🌸 #花見' });
  });

  it('omits the Authorization header without an API key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(completion('Hello'));

    await translateTextOpenAICompatible('Hola', 'es', 'en', { ...config, apiKey: '' });

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('strips inline reasoning from the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      completion('<think>The user wants English.</think>\nHello')
    );

    const result = await translateTextOpenAICompatible('Hola', 'es', 'en', config);

    expect(result?.translated_text).toBe('Hello');
  });

  it('returns null on an error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"message":"invalid model"}}', { status: 400 })
    );

    expect(await translateTextOpenAICompatible('Hola', 'es', 'en', config)).toBeNull();
  });

  it('returns null when the response has no usable content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(null));
    expect(await translateTextOpenAICompatible('Hola', 'es', 'en', config)).toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion('<think>hmm</think>'));
    expect(await translateTextOpenAICompatible('Hola', 'es', 'en', config)).toBeNull();
  });
});

describe('translateStatusAI', () => {
  it('is unavailable without a Workers AI binding or OpenAI-compatible endpoint', async () => {
    const c = { env: {} } as unknown as Context;

    expect(isAITranslationAvailable(c)).toBe(false);
    expect(
      await translateStatusAI({ text: 'Hola', lang: 'es' } as unknown as APIStatus, 'en', c)
    ).toBeNull();
  });

  it('is available with a Workers AI binding', () => {
    const c = { env: { AI: { run: vi.fn() } } } as unknown as Context;

    expect(isAITranslationAvailable(c)).toBe(true);
  });
});
