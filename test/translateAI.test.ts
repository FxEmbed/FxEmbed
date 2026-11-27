import type { Context } from 'hono';
import { expect, test, vi } from 'vitest';
import { translateStatusAI } from '../src/helpers/translateAI';
import type { APITwitterStatus } from '../src/realms/api/schemas';

const status = { text: 'Hello, world.', lang: 'en' } as APITwitterStatus;
const usage = { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 };
const translation = { translated_text: 'こんにちは、世界。', usage };

function makeContext(run: ReturnType<typeof vi.fn>): Context {
  return { env: { AI: { run } } } as Context;
}

test('reads the Workers AI chat completion translation', async () => {
  const run = vi.fn().mockResolvedValue({
    choices: [{ message: { content: translation.translated_text } }],
    usage
  });

  expect(await translateStatusAI(status, 'ja', makeContext(run))).toEqual(translation);
  expect(run).toHaveBeenCalledOnce();
});

test('accepts the legacy Workers AI response format', async () => {
  const run = vi.fn().mockResolvedValue({ response: translation.translated_text, usage });

  expect(await translateStatusAI(status, 'ja', makeContext(run))).toEqual(translation);
  expect(run).toHaveBeenCalledOnce();
});

test.each([undefined, null, '', ' \n\t '])(
  'tries M2M100 when the chat completion has no usable translation: %j',
  async content => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ choices: [{ message: { content } }], usage })
      .mockResolvedValueOnce(translation);

    expect(await translateStatusAI(status, 'ja', makeContext(run))).toEqual(translation);
    expect(run).toHaveBeenNthCalledWith(2, '@cf/meta/m2m100-1.2b', {
      text: status.text,
      source_lang: 'en',
      target_lang: 'ja'
    });
  }
);
