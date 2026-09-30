import { expect, test } from 'vitest';
import { handleQuote } from '@fxembed/atmosphere/helpers';
import { DataProvider } from '../src/enum';
import type { APIStatus, APIStatusTombstone } from '../src/types/apiStatus';

const strings = {
  quotedFromTombstone: 'Quoting an unavailable post',
  quotedFrom: 'Quoting {name} (@{screen_name})'
};

const quotedStatus = (overrides: Partial<APIStatus> = {}): APIStatus =>
  ({
    type: 'status',
    provider: DataProvider.Twitter,
    id: '20',
    url: 'https://x.com/jack/status/20',
    text: 'original quoted text',
    created_at: 'Tue Mar 21 20:50:14 +0000 2006',
    created_timestamp: 1142974214,
    likes: 0,
    replies: 0,
    reposts: 0,
    lang: 'ja',
    possibly_sensitive: false,
    replying_to: null,
    source: null,
    embed_card: 'tweet',
    media: {},
    raw_text: { text: 'original quoted text', facets: [] },
    author: {
      type: 'user',
      id: '12',
      url: 'https://x.com/jack',
      name: 'jack',
      screen_name: 'jack',
      description: ''
    },
    ...overrides
  }) as APIStatus;

test('quote renders the translation when the quoted post has one', () => {
  const out = handleQuote(
    quotedStatus({
      translation: {
        text: 'texto traducido',
        source_lang: 'ja',
        source_lang_en: 'Japanese',
        target_lang: 'es',
        provider: 'grok'
      }
    }),
    strings
  );
  expect(out).toContain('Quoting jack (@jack)');
  expect(out).toContain('texto traducido');
  expect(out).not.toContain('original quoted text');
});

test('quote falls back to the original text when there is no translation', () => {
  const out = handleQuote(quotedStatus(), strings);
  expect(out).toContain('Quoting jack (@jack)');
  expect(out).toContain('original quoted text');
});

test('quote tombstone renders the tombstone message', () => {
  const tombstone: APIStatusTombstone = {
    type: 'tombstone',
    provider: 'twitter',
    reason: 'unavailable',
    message: 'This post is unavailable'
  };
  const out = handleQuote(tombstone, strings);
  expect(out).toContain('Quoting an unavailable post');
  expect(out).toContain('This post is unavailable');
});
