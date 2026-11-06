import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderCard } from '@fxembed/atmosphere/providers/twitter/card';
import { buildAPITwitterStatus } from '@fxembed/atmosphere/providers/twitter/processor';
import type { TwitterBuildHost } from '@fxembed/atmosphere/providers/twitter/build-host';
import type { APITwitterStatus } from '@fxembed/atmosphere/types/api-schemas';
import fixture from './mocks/TweetResultByRestId/20.json';
import unifiedCard from './fixtures/twitter/unified-image-website.json';
import { app } from '../src/worker';
import harness from './helpers/harness';
import { botHeaders } from './helpers/data';

const host: TwitterBuildHost = { t: key => key };
const destination = 'https://youtube.com/shorts/ihCtO4twl7Y';
const image = 'https://pbs.twimg.com/media/HQtIsD-aoAAXX1k.jpg';

afterEach(() => vi.restoreAllMocks());

function cardFromUnified(value: unknown): GraphQLTwitterCard {
  return {
    legacy: {
      binding_values: [
        { key: 'unified_card', value: { type: 'STRING', string_value: JSON.stringify(value) } },
        { key: 'card_url', value: { type: 'STRING', string_value: 'https://twitter.com' } }
      ]
    }
  };
}

describe('Twitter unified website cards (#2408)', () => {
  test('retains the image destination and details from the reported post', async () => {
    const card = await renderCard(host, cardFromUnified(unifiedCard));

    expect(card.media).toHaveLength(1);
    expect(card.website_card).toMatchObject({
      url: destination,
      title: 'ご主人様、少々お時間頂戴しますね 動画はこちら',
      domain: 'youtube.com',
      card_name: 'unified_card',
      image: { url: image, width: 1200, height: 628 }
    });
  });

  test.each([false, true])(
    'publishes the link alongside the photo (legacy API: %s)',
    async legacy => {
      const raw = structuredClone(fixture.data.tweetResult.result) as GraphQLTwitterStatus;
      raw.card = cardFromUnified(unifiedCard);
      const status = (await buildAPITwitterStatus(
        host,
        raw,
        undefined,
        null,
        legacy
      )) as APITwitterStatus;

      expect(status.card?.url).toBe(destination);
      expect(status.card?.image?.url).toBe(image);
      expect(status.media.photos).toHaveLength(1);
      expect(status.media.photos?.[0]).toMatchObject({
        url: `${image}?name=orig`,
        width: 1200,
        height: 628
      });
      expect(status.text).toBe('just setting up my twttr');
      expect(status.media.external).toBeUndefined();
    }
  );

  test.each(['/2/status/20', '/status/20'])('returns the destination through %s', async path => {
    const raw = structuredClone(fixture.data.tweetResult.result) as GraphQLTwitterStatus;
    raw.card = cardFromUnified(unifiedCard);
    vi.spyOn(harness.TwitterProxy, 'fetch').mockImplementation(async request => {
      const method = new URL(request).pathname.split('/').pop();
      switch (method) {
        case 'TweetResultByRestId':
          return Response.json({ data: { tweetResult: { result: raw } } });
        case 'TweetResultsByRestIds':
          return Response.json({ data: { tweetResult: [{ result: raw }] } });
        case 'TweetResultsByIdsQuery':
          return Response.json({ data: { tweet_results: [{ result: raw }] } });
        default:
          throw new Error(`Unexpected query: ${method}`);
      }
    });

    const response = await app.request(
      `https://api.fxtwitter.com${path}`,
      { headers: botHeaders },
      harness
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: APITwitterStatus; tweet?: APITwitterStatus };
    const status = body.status ?? body.tweet;
    expect(status?.card?.url).toBe(destination);
    expect(status?.media.photos).toHaveLength(1);
  });

  test('follows component references instead of unrelated destinations or details', async () => {
    const value = {
      ...structuredClone(unifiedCard),
      destination_objects: {
        unused: { type: 'browser', data: { url_data: { url: 'https://example.com/unused' } } },
        ...unifiedCard.destination_objects
      },
      component_objects: {
        unrelated: {
          type: 'details',
          data: { destination: 'unused', title: { content: 'Unrelated title' } }
        },
        ...unifiedCard.component_objects
      },
      components: ['unrelated', ...unifiedCard.components]
    };
    const card = await renderCard(host, cardFromUnified(value));
    expect(card.website_card?.url).toBe(destination);
    expect(card.website_card?.title).toBe(
      unifiedCard.component_objects.details_1.data.title.content
    );
  });

  test('retains the destination when media or details are unavailable', async () => {
    const value = { ...unifiedCard, media_entities: {}, components: ['media_1'] };
    const card = await renderCard(host, cardFromUnified(value));
    expect(card.website_card).toMatchObject({ url: destination, domain: 'youtube.com' });
    expect(card.website_card?.title).toBeUndefined();
    expect(card.website_card?.image).toBeUndefined();
  });

  test.each(['', 'not a url', 'javascript:alert(1)', 'card://123'])(
    'ignores invalid website URL %j',
    async url => {
      const value = structuredClone(unifiedCard);
      value.destination_objects.browser_1.data.url_data.url = url;
      const card = await renderCard(host, cardFromUnified(value));
      expect(card.website_card).toBeUndefined();
      expect(card.media).toHaveLength(1);
    }
  );

  test.each(['image_app', 'image_carousel_website'])(
    'retains media without inventing a single website for %s',
    async type => {
      const card = await renderCard(host, cardFromUnified({ ...unifiedCard, type }));
      expect(card.website_card).toBeUndefined();
      expect(card.media).toHaveLength(1);
    }
  );

  test('retains media-only unified cards', async () => {
    const card = await renderCard(
      host,
      cardFromUnified({ media_entities: unifiedCard.media_entities })
    );
    expect(card.website_card).toBeUndefined();
    expect(card.media).toHaveLength(1);
  });

  test('ignores missing or non-browser destinations without dropping media', async () => {
    const value = structuredClone(unifiedCard);
    value.destination_objects.browser_1.type = 'app';
    const card = await renderCard(host, cardFromUnified(value));
    expect(card.website_card).toBeUndefined();
    expect(card.media).toHaveLength(1);

    const missing = await renderCard(host, cardFromUnified({ ...value, destination_objects: {} }));
    expect(missing.website_card).toBeUndefined();
    expect(missing.media).toHaveLength(1);
  });

  test('retains videos and their website destination', async () => {
    const value = {
      ...unifiedCard,
      type: 'video_website',
      media_entities: {
        '3_2092846373662269440': {
          ...unifiedCard.media_entities['3_2092846373662269440'],
          type: 'video',
          video_info: {
            aspect_ratio: [16, 9],
            duration_millis: 1000,
            variants: [
              { bitrate: 1000, content_type: 'video/mp4', url: 'https://video.twimg.com/test.mp4' }
            ]
          }
        }
      }
    };
    const raw = structuredClone(fixture.data.tweetResult.result) as GraphQLTwitterStatus;
    raw.card = cardFromUnified(value);
    const status = (await buildAPITwitterStatus(host, raw, undefined, null)) as APITwitterStatus;
    expect(status.card?.url).toBe(destination);
    expect(status.media.videos?.[0]?.url).toBe('https://video.twimg.com/test.mp4');
    expect(status.media.all).toHaveLength(1);
    expect(status.media.external).toBeUndefined();
    expect(status.embed_card).toBe('player');
  });
});
