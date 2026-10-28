import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildAPITwitterStatus } from '@fxembed/atmosphere/providers/twitter/processor';
import type { TwitterBuildHost } from '@fxembed/atmosphere/providers/twitter/build-host';
import type { APITwitterStatus } from '@fxembed/atmosphere/types/api-schemas';
import {
  getTwitterProviderEnv,
  setTwitterProviderEnv
} from '@fxembed/atmosphere/providers/twitter-runtime';
import fixture from './mocks/TweetResultByRestId/20.json';

const originalEnv = getTwitterProviderEnv();

beforeEach(() => {
  setTwitterProviderEnv({ polyglotDomainList: ['translation.example'] });
});

afterEach(() => {
  setTwitterProviderEnv(originalEnv);
});

function makeHost(response: unknown): TwitterBuildHost {
  return {
    t: key => key,
    twitterProxy: {
      fetch: vi.fn(async () => new Response(JSON.stringify(response)))
    },
    translatePolyglot: vi.fn(async () => ({
      translated_text: '正在设置我的账号',
      source_lang: 'en',
      provider: 'bing'
    }))
  };
}

async function translate(host: TwitterBuildHost) {
  return (await buildAPITwitterStatus(
    host,
    structuredClone(fixture.data.tweetResult.result) as GraphQLTwitterStatus,
    'zh-cn',
    null
  )) as APITwitterStatus;
}

describe('Twitter translation fallback', () => {
  test.each([
    null,
    {},
    { errors: [{ message: 'Translation unavailable' }] },
    { result: null },
    { result: {} },
    { result: { text: null } },
    { result: { text: 123 } },
    { result: { text: '' } },
    { result: { text: ' \n\t ' } }
  ])('continues to Polyglot when Grok provides no usable text: %j', async response => {
    const host = makeHost(response);
    const status = await translate(host);

    expect(host.translatePolyglot).toHaveBeenCalledOnce();
    expect(status.translation?.text).toBe('正在设置我的账号');
    expect(status.translation?.provider).toBe('bing');
  });

  test('retains a valid Grok translation without calling fallback', async () => {
    const host = makeHost({ result: { text: '正在设置我的推特' } });
    const status = await translate(host);

    expect(status.translation?.text).toBe('正在设置我的推特');
    expect(status.translation?.provider).toBe('grok');
    expect(host.translatePolyglot).not.toHaveBeenCalled();
  });

  test('does not publish an empty translation when no fallback is available', async () => {
    const host = makeHost({ result: { text: '' } });
    setTwitterProviderEnv({ polyglotDomainList: [] });
    const status = await translate(host);

    expect(status.translation).toBeFalsy();
    expect(status.text).toBe('just setting up my twttr');
  });

  test('falls back for an empty quote translation while retaining the Grok body', async () => {
    const host = makeHost(null);
    host.twitterProxy!.fetch = vi.fn(async (_url, init) => {
      const { id } = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ result: { text: id === '21' ? '' : '正文译文' } }));
    });
    const raw = structuredClone(fixture.data.tweetResult.result) as GraphQLTwitterStatus;
    const quote = structuredClone(raw);
    quote.rest_id = '21';
    raw.quoted_status_result = { result: quote };
    const status = (await buildAPITwitterStatus(host, raw, 'zh-cn', null)) as APITwitterStatus;

    expect(status.translation?.text).toBe('正文译文');
    expect(status.translation?.provider).toBe('grok');
    expect((status.quote as APITwitterStatus).translation?.text).toBe('正在设置我的账号');
    expect((status.quote as APITwitterStatus).translation?.provider).toBe('bing');
    expect(host.translatePolyglot).toHaveBeenCalledOnce();
  });
});
