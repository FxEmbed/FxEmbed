import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildAPITwitterStatus } from '@fxembed/atmosphere/providers/twitter/processor';
import { APIMediaContainerSchema } from '@fxembed/atmosphere/types/api-schemas';
import type { APITwitterStatus } from '@fxembed/atmosphere/types/api-schemas';
import { app } from '../src/worker';
import harness from './helpers/harness';
import { botHeaders } from './helpers/data';
import {
  getTwitterProviderEnv,
  setTwitterProviderEnv
} from '@fxembed/atmosphere/providers/twitter-runtime';
import baseTweet from './mocks/TweetResultByRestId/20.json';
import single from './fixtures/twitter/unified-image-website.json';
import carousel from './fixtures/twitter/unified-carousel-website.json';
import collection from './fixtures/twitter/unified-collection-website.json';

afterEach(() => vi.restoreAllMocks());

function tweetWithCard(value: unknown): GraphQLTwitterStatus {
  const tweet = structuredClone(baseTweet.data.tweetResult.result) as GraphQLTwitterStatus;
  tweet.card = {
    legacy: {
      binding_values: [
        { key: 'unified_card', value: { type: 'STRING', string_value: JSON.stringify(value) } }
      ]
    }
  };
  return tweet;
}

async function build(value: unknown, legacy = false) {
  return (await buildAPITwitterStatus(
    { t: key => key },
    tweetWithCard(value),
    undefined,
    null,
    legacy
  )) as APITwitterStatus;
}

const cases = [
  {
    name: 'single image',
    value: single,
    ids: ['2092846373662269440'],
    urls: ['https://youtube.com/shorts/ihCtO4twl7Y']
  },
  {
    name: 'carousel',
    value: carousel,
    ids: ['1931954784086446080', '1931954792345014272'],
    urls: [
      'https://touch-suntory-line-mini-app.s3.ap-northeast-1.amazonaws.com/closedCampaign.html?id=be967d99-bebc-4d46-b70c-647351aebcd6',
      'https://www.suntory.co.jp/softdrink/campaign/touch/'
    ]
  },
  {
    name: 'collection',
    value: collection,
    ids: [
      '2015618820724142080',
      '2015618813207916544',
      '2015618820950593536',
      '2015618822439596032',
      '2015618812897546240'
    ],
    urls: [
      'https://x.com/imassc_official',
      collection.destination_objects.browser_2.data.url_data.url,
      collection.destination_objects.browser_3.data.url_data.url,
      collection.destination_objects.browser_4.data.url_data.url,
      collection.destination_objects.browser_5.data.url_data.url
    ]
  }
];

describe.each(cases)('unified card media links: $name', ({ value, ids, urls }) => {
  test.each([false, true])(
    'retains ordered links in both media arrays (legacy: %s)',
    async legacy => {
      const status = await build(value, legacy);
      expect(status.media.all?.map(item => item.id)).toEqual(ids);
      expect(status.media.photos?.map(item => item.id)).toEqual(ids);
      expect(status.media.photos?.map(item => item.link?.url)).toEqual(urls);
      expect(status.media.all).toEqual(status.media.photos);
      expect(APIMediaContainerSchema.parse(status.media)).toMatchObject({
        photos: urls.map(url => ({ link: { url } })),
        all: urls.map(url => ({ link: { url } }))
      });
      if (ids.length > 1) expect(status.card).toBeUndefined();
    }
  );

  test.each(['/2/status/20', '/status/20'])('returns links through %s', async path => {
    const tweet = tweetWithCard(value);
    vi.spyOn(harness.TwitterProxy, 'fetch').mockImplementation(async request => {
      switch (new URL(request).pathname.split('/').pop()) {
        case 'TweetResultByRestId':
          return Response.json({ data: { tweetResult: { result: tweet } } });
        case 'TweetResultsByRestIds':
          return Response.json({ data: { tweetResult: [{ result: tweet }] } });
        case 'TweetResultsByIdsQuery':
          return Response.json({ data: { tweet_results: [{ result: tweet }] } });
        default:
          throw new Error(`Unexpected query: ${request}`);
      }
    });
    const response = await app.request(
      `https://api.fxtwitter.com${path}`,
      { headers: botHeaders },
      harness
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: APITwitterStatus; tweet?: APITwitterStatus };
    const status = (body.status ?? body.tweet)!;
    expect(status.media.all?.map(item => item.id)).toEqual(ids);
    expect(status.media.photos?.map(item => item.link?.url)).toEqual(urls);
  });
});

test('retains collection post-intent query strings without decoding or rewriting them', async () => {
  const status = await build(collection);
  const urls = status.media.photos?.map(item => item.link?.url) ?? [];
  expect(urls.slice(1)).toEqual(cases[2].urls.slice(1));
  expect(new URL(urls[1]!).searchParams.get('text')).toContain('寒中お見舞い🍊');
  expect(new URL(urls[4]!).searchParams.get('text')).toContain('寒中お見舞い🍍');
});

test('preserves interleaved photo and video order with their links', async () => {
  const value = structuredClone(carousel);
  Object.assign(value.media_entities['3_1931954792345014272'], {
    type: 'video',
    video_info: {
      aspect_ratio: [1, 1],
      duration_millis: 1000,
      variants: [
        { bitrate: 1000, content_type: 'video/mp4', url: 'https://video.twimg.com/test.mp4' }
      ]
    }
  });
  const status = await build(value);
  expect(status.media.all?.map(item => item.type)).toEqual(['photo', 'video']);
  expect(status.media.all?.map(item => item.link?.url)).toEqual(cases[1].urls);
  expect(status.media.photos?.[0].link?.url).toBe(cases[1].urls[0]);
  expect(status.media.videos?.[0].link?.url).toBe(cases[1].urls[1]);
  expect(APIMediaContainerSchema.parse(status.media).videos?.[0].link?.url).toBe(cases[1].urls[1]);
  expect(status.embed_card).toBe('player');
});

test('keeps separate destinations when slides reuse the same media entity', async () => {
  const value = structuredClone(carousel);
  value.component_objects.media_2.data.id = value.component_objects.media_1.data.id;
  delete (value.media_entities as Record<string, unknown>)['3_1931954792345014272'];
  const status = await build(value);
  expect(status.media.photos?.map(item => item.id)).toEqual([
    '1931954784086446080',
    '1931954784086446080'
  ]);
  expect(status.media.photos?.map(item => item.link?.url)).toEqual(cases[1].urls);
});

test('merges native and card media without duplicating their shared attachment', async () => {
  const tweet = tweetWithCard(carousel);
  tweet.legacy.extended_entities = {
    media: [carousel.media_entities['3_1931954784086446080'] as TweetMedia]
  };
  const status = (await buildAPITwitterStatus(
    { t: key => key },
    tweet,
    undefined,
    null
  )) as APITwitterStatus;
  expect(status.media.photos?.map(item => item.id)).toEqual(cases[1].ids);
  expect(status.media.photos?.map(item => item.link?.url)).toEqual(cases[1].urls);
});

test('does not add link metadata to an ordinary native photo', async () => {
  const tweet = tweetWithCard(carousel);
  delete tweet.card;
  tweet.legacy.extended_entities = {
    media: [carousel.media_entities['3_1931954784086446080'] as TweetMedia]
  };
  const status = (await buildAPITwitterStatus(
    { t: key => key },
    tweet,
    undefined,
    null
  )) as APITwitterStatus;
  expect(status.media.photos).toHaveLength(1);
  expect(status.media.photos?.[0]).not.toHaveProperty('link');
});

test('keeps valid media when components, destinations, or layout references are incomplete', async () => {
  const value = structuredClone(carousel);
  value.layout.data.slides.unshift(['missing']);
  delete (value.destination_objects as Record<string, unknown>).browser_1;
  Object.assign(value.component_objects, { broken: null });
  Object.assign(value.media_entities, { invalid: null });
  const status = await build(value);
  expect(status.media.photos?.map(item => item.id)).toEqual(cases[1].ids);
  expect(status.media.photos?.[0]).not.toHaveProperty('link');
  expect(status.media.photos?.[1].link).toEqual({
    url: cases[1].urls[1],
    title: 'Touch! SUNTORY',
    domain: 'suntory.co.jp'
  });
});

test('retains media when a layout component loses its media reference', async () => {
  const value = structuredClone(carousel);
  value.component_objects.media_1.data.id = 'missing';
  const status = await build(value);
  expect(status.media.photos).toHaveLength(2);
  expect(status.media.photos?.[0].id).toBe(cases[1].ids[1]);
  expect(status.media.photos?.[1].id).toBe(cases[1].ids[0]);
  expect(status.media.photos?.[1]).not.toHaveProperty('link');
});

test('keeps card media links and order inside a quoted post', async () => {
  const tweet = structuredClone(baseTweet.data.tweetResult.result) as GraphQLTwitterStatus;
  const quote = tweetWithCard(collection);
  quote.rest_id = '21';
  tweet.quoted_status_result = { result: quote };
  const status = (await buildAPITwitterStatus(
    { t: key => key },
    tweet,
    undefined,
    null
  )) as APITwitterStatus;
  const quoted = status.quote as APITwitterStatus;
  expect(quoted.media.photos?.map(item => item.id)).toEqual(cases[2].ids);
  expect(quoted.media.photos?.map(item => item.link?.url)).toEqual(cases[2].urls);
});

test('builds mosaics from the final ordered photos without removing individual links', async () => {
  const originalEnv = getTwitterProviderEnv();
  setTwitterProviderEnv({ mosaicDomainList: ['mosaic.example'] });
  try {
    const status = await build(collection);
    expect(status.media.mosaic?.formats.jpeg).toBe(
      'https://mosaic.example/jpeg/20/G_jqo2PasAAe--D/G_jqoaPaMAAIZoo/G_jqo3FaEAAII-J/G_jqo8oacAAvWip'
    );
    expect(status.media.photos?.map(item => item.link?.url)).toEqual(cases[2].urls);
    expect(status.media.all).toHaveLength(5);
  } finally {
    setTwitterProviderEnv(originalEnv);
  }
});
