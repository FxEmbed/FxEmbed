import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

const ATMOSPHERE = 'https://api.atmosphere.tools';

const get = (path: string) =>
  app.request(new Request(`${ATMOSPHERE}${path}`, { headers: botHeaders }), undefined, harness);

const user = {
  id: '107955',
  uniqueId: 'tiktok',
  nickname: 'TikTok',
  avatarLarger: 'https://cdn.example/large.jpg',
  signature: 'One TikTok can make a big impact',
  createTime: 1425144149,
  verified: true,
  secUid: 'MS4wLjABAAAA'
};

const embedItem = {
  id: '7571171661639175454',
  desc: 'hello',
  width: 720,
  height: 1280,
  coverUrl: 'https://cdn.example/cover.jpg',
  playAddr: 'https://cdn.example/video.mp4',
  playCount: 42800,
  authorUniqueId: 'tiktok'
};

const page = (id: string, payload: unknown) =>
  new Response(
    `<html><body><script id="${id}" type="application/json">${JSON.stringify(
      payload
    )}</script></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } }
  );

const embedPage = (route: string, data: unknown) =>
  page('__FRONTITY_CONNECT_STATE__', { source: { data: { [route]: data } } });

/** Serves the TikTok web surfaces from fixtures and records what was requested. */
function stubTikTok() {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      const url = new URL(typeof input === 'string' ? input : (input as Request).url);
      requested.push(url.pathname);

      if (url.pathname === '/@tiktok') {
        return page('__UNIVERSAL_DATA_FOR_REHYDRATION__', {
          __DEFAULT_SCOPE__: {
            'webapp.user-detail': {
              userInfo: {
                user,
                statsV2: {
                  followerCount: '95384989',
                  followingCount: '2',
                  heart: '462934211',
                  heartCount: '462934211',
                  videoCount: '1496',
                  diggCount: '0',
                  friendCount: '1'
                }
              }
            }
          }
        });
      }
      if (url.pathname === '/embed/@tiktok') {
        return embedPage('/embed/@tiktok/', {
          userInfo: { id: '107955', uniqueId: 'tiktok', nickname: 'TikTok', followerCount: 100 },
          videoList: [embedItem, { ...embedItem, id: '7571171661639175455' }]
        });
      }
      if (url.pathname === '/embed/tag/cats') {
        return embedPage('/embed/tag/cats/', {
          embedInfo: { id: '5216', viewCount: '431325662637', videoCount: '29582574' },
          videoList: [embedItem]
        });
      }
      if (url.pathname === '/embed/music/7571176808381467422') {
        return embedPage('/embed/music/7571176808381467422/', {
          // Sound pages send `artist` and a numeric videoCount, unlike hashtag pages.
          embedInfo: { id: '7571176808381467422', artist: 'Harbee', videoCount: 1 },
          videoList: [embedItem]
        });
      }
      if (url.pathname === '/embed/@ghost' || url.pathname === '/@ghost') {
        return embedPage(url.pathname, { isError: true, errorCode: 10000, errorStatus: 404 });
      }
      return new Response('', { status: 404 });
    })
  );
  return requested;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('profile is read from the server-rendered profile page', async () => {
  stubTikTok();
  const res = await get('/2/tiktok/profile/tiktok');
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    user: { screen_name: string; followers: number };
  };
  expect(body.code).toBe(200);
  expect(body.user.screen_name).toBe('tiktok');
  expect(body.user.followers).toBe(95384989);
});

test('profile accepts a handle with a leading @', async () => {
  const requested = stubTikTok();
  const res = await get('/2/tiktok/profile/@tiktok');
  expect(res.status).toBe(200);
  expect(requested).toContain('/@tiktok');
});

test('profile reports 404 for an account neither surface knows', async () => {
  stubTikTok();
  const res = await get('/2/tiktok/profile/ghost');
  expect(res.status).toBe(404);
});

test('profile statuses come from the creator embed and honour count', async () => {
  stubTikTok();
  const res = await get('/2/tiktok/profile/tiktok/statuses?count=1');
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: { id: string; media: { videos?: { url: string }[] } }[];
    cursor: { top: string | null; bottom: string | null };
  };
  expect(body.results).toHaveLength(1);
  expect(body.results[0].id).toBe('7571171661639175454');
  // The embed pages take no cursor, so there is never a next page.
  expect(body.cursor).toEqual({ top: null, bottom: null });
  expect(body.results[0].media.videos?.[0].url).toContain('/proxy?');
});

test('profile statuses rejects a count past what TikTok server-renders', async () => {
  stubTikTok();
  expect((await get('/2/tiktok/profile/tiktok/statuses?count=50')).status).toBe(400);
  expect((await get('/2/tiktok/profile/tiktok/statuses?count=0')).status).toBe(400);
});

test('hashtag returns the collection header alongside the posts', async () => {
  stubTikTok();
  const res = await get('/2/tiktok/hashtag/cats');
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    collection: { id: string; name: string; views: number; statuses: number };
    results: { author: { screen_name: string; profile_embed?: boolean } }[];
  };
  expect(body.collection.id).toBe('5216');
  expect(body.collection.name).toBe('#cats');
  expect(body.collection.views).toBe(431325662637);
  expect(body.collection.statuses).toBe(29582574);
  expect(body.results).toHaveLength(1);
  /* A hashtag timeline mixes creators, so each row gets its own author rather than the
     hashtag placeholder. */
  expect(body.results[0].author.screen_name).toBe('tiktok');
  expect(body.results[0].author.profile_embed).toBe(true);
});

test('hashtag strips a leading #', async () => {
  const requested = stubTikTok();
  const res = await get('/2/tiktok/hashtag/%23cats');
  expect(res.status).toBe(200);
  expect(requested).toContain('/embed/tag/cats');
});

test('music accepts the slug-id fragment from a sound URL', async () => {
  const requested = stubTikTok();
  const res = await get('/2/tiktok/music/original-sound-7571176808381467422');
  expect(res.status).toBe(200);
  expect(requested).toContain('/embed/music/7571176808381467422');
  const body = (await res.json()) as {
    collection: {
      name: string;
      author_name: string | null;
      statuses: number;
      views: number | null;
    };
  };
  expect(body.collection.author_name).toBe('Harbee');
  expect(body.collection.statuses).toBe(1);
  // Sound pages report no view total, and a missing counter must not read as zero.
  expect(body.collection.views).toBeNull();
});

/* Media in TikTok payloads points back at whichever host served the payload, so `/proxy` has to
   exist on the Atmosphere host too — otherwise every video URL the API hands out 404s. */
test('the Atmosphere host serves the TikTok video proxy', async () => {
  const res = await get('/proxy');
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'Missing url parameter' });
});

test('the video proxy rejects a URL outside TikTok CDNs', async () => {
  const res = await get(`/proxy?url=${encodeURIComponent('https://evil.example/video.mp4')}`);
  expect(res.status).toBe(400);
});

test('Atmosphere OpenAPI documents the TikTok routes and schemas', async () => {
  const res = await get('/2/openapi.json');
  expect(res.status).toBe(200);
  const doc = (await res.json()) as {
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };
  for (const path of [
    '/2/tiktok/status/{id}',
    '/2/tiktok/profile/{handle}',
    '/2/tiktok/profile/{handle}/statuses',
    '/2/tiktok/hashtag/{hashtag}',
    '/2/tiktok/music/{id}'
  ]) {
    expect(doc.paths[path], `missing OpenAPI path ${path}`).toBeDefined();
  }
  // The status route used to be documented with the generic SocialThread shape.
  expect(doc.components.schemas.APITikTokStatus).toBeDefined();
  expect(doc.components.schemas.SocialThreadTikTok).toBeDefined();
  expect(doc.components.schemas.APITikTokCollectionResults).toBeDefined();
});
