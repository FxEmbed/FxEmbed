import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import threadSingle from './fixtures/bluesky/thread-single.json';
import threadMultiImage from './fixtures/bluesky/thread-multi-image.json';
import threadGallery from './fixtures/bluesky/thread-gallery.json';
import profileDetail from './fixtures/bluesky/profile-detail.json';
import authorFeed from './fixtures/bluesky/author-feed.json';
import getFollowers from './fixtures/bluesky/get-followers.json';
import getFollows from './fixtures/bluesky/get-follows.json';
import followersProfilesBatch from './fixtures/bluesky/followers-profiles-batch.json';
import followingProfilesBatch from './fixtures/bluesky/following-profiles-batch.json';
import searchPosts from './fixtures/bluesky/search-posts.json';
import getRepostedBy from './fixtures/bluesky/get-reposted-by.json';
import repostersProfilesBatch from './fixtures/bluesky/reposters-profiles-batch.json';
import getLikes from './fixtures/bluesky/get-likes.json';
import likersProfilesBatch from './fixtures/bluesky/likers-profiles-batch.json';
import conversationThread from './fixtures/bluesky/conversation-thread.json';
import getTrendingTopics from './fixtures/bluesky/get-trending-topics.json';
import type { APITrendsResponse } from '../src/realms/api/schemas';

afterEach(() => {
  vi.restoreAllMocks();
});

test('GET /2/status uses rkey as id and returns cid', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getPostThread')) {
      return new Response(JSON.stringify(threadSingle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      return new Response(JSON.stringify({ profiles: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/author.test/rkeymain', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    status: {
      id: string;
      cid?: string;
      url: string;
      quote?: { text: string };
      author?: { verification?: { verified?: boolean; verified_by?: string } };
    };
  };
  expect(body.code).toBe(200);
  expect(body.status.id).toBe('rkeymain');
  expect(body.status.cid).toBe('bafycidmain');
  expect(body.status.url).toContain('/author.test/post/rkeymain');
  expect(body.status.author?.verification?.verified).toBe(true);
  expect(body.status.author?.verification?.verified_by).toBe('bsky.app');
});

test('GET /2/status multi-image embed exposes photos', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getPostThread')) {
      return new Response(JSON.stringify(threadMultiImage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      return new Response(JSON.stringify({ profiles: [] }), { status: 200 });
    }
    if (u.includes('mosaic.fxbsky.app')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/pics.test/rkeypics', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: { media: { photos?: { url: string }[] } } };
  expect(body.status.media.photos?.length).toBeGreaterThanOrEqual(2);
});

test('GET /2/status gallery embed exposes all carousel photos', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getPostThread')) {
      return new Response(JSON.stringify(threadGallery), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      return new Response(JSON.stringify({ profiles: [] }), { status: 200 });
    }
    if (u.includes('[REDACTED]')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/gallery.test/rkeygallery', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    status: {
      embed_card: string;
      media: { photos?: { url: string; altText?: string }[]; all?: unknown[] };
    };
  };
  expect(body.status.embed_card).toBe('summary_large_image');
  expect(body.status.media.photos?.length).toBe(6);
  expect(body.status.media.photos?.[0]?.url).toBe('https://cdn.bsky.app/gallery-full1');
  expect(body.status.media.photos?.[5]?.altText).toBe('six');
  expect(body.status.media.all?.length).toBe(6);
});

test('GET /2/search returns results and cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.searchPosts')) {
      expect(u).toContain('q=fixture');
      expect(u).toContain('sort=latest');
      expect(u).toContain('limit=30');
      return new Response(JSON.stringify(searchPosts), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/search?q=fixture', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: { id: string; text: string }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('search-next-cursor');
  expect(body.results.length).toBe(1);
  expect(body.results[0].id).toBe('rkeysearch');
  expect(body.results[0].text).toContain('Search hit fixture');
});

test('GET /2/trends maps Bluesky getTrendingTopics to APITrendsResponse', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.unspecced.getTrendingTopics')) {
      expect(u).toContain('limit=4');
      return new Response(JSON.stringify(getTrendingTopics), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/trends?count=4', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as APITrendsResponse;
  expect(body.code).toBe(200);
  expect(body.timeline_type).toBe('trending');
  expect(body.trends).toHaveLength(4);
  expect(body.trends[0].name).toBe('Topic One');
  expect(body.trends[0].context).toBe('https://bsky.app/profile/trending.bsky.app/feed/1');
  expect(body.trends[1].name).toBe('Topic Two');
  expect(body.trends[2].name).toBe('Suggested A');
  expect(body.trends[2].context).toContain('Suggested feed');
  expect(body.trends[2].context).toContain('https://bsky.app/profile/bsky.app/feed/with-friends');
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBeNull();
});

test('GET /2/trends?type=suggested returns only suggested rows', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.unspecced.getTrendingTopics')) {
      expect(u).toContain('limit=2');
      return new Response(JSON.stringify(getTrendingTopics), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/trends?type=suggested&count=2', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as APITrendsResponse;
  expect(body.timeline_type).toBe('suggested');
  expect(body.trends).toHaveLength(2);
  expect(body.trends[0].name).toBe('Suggested A');
  expect(body.trends[0].context).toContain('Suggested feed');
  expect(body.trends[1].name).toBe('Suggested B');
});

test('GET /2/trends returns 404 when upstream topics are empty', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.unspecced.getTrendingTopics')) {
      return new Response(JSON.stringify({ topics: [], suggested: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/trends', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
});

test('GET /2/trends returns 500 when upstream errors', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.unspecced.getTrendingTopics')) {
      return new Response('upstream', { status: 502 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/trends', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(500);
});

test('GET /2/search passes cursor and feed=top as sort', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.searchPosts')) {
      expect(u).toContain('q=foo');
      expect(u).toContain('sort=top');
      expect(u).toContain('cursor=page-two');
      expect(u).toContain('limit=10');
      return new Response(JSON.stringify({ posts: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/search?q=foo&feed=top&count=10&cursor=page-two',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/search rejects empty q with 400', async () => {
  const res = await app.request('https://api.fxbsky.app/2/search?q=', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { code?: number; message?: string };
  expect(body.code).toBe(400);
  expect(typeof body.message).toBe('string');
});

test('GET /2/profile returns user envelope and counts', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.actor.getProfile')) {
      return new Response(JSON.stringify(profileDetail), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/test.bsky.social', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    message: string;
    user?: {
      screen_name: string;
      name: string;
      description: string;
      followers: number;
      following: number;
      statuses: number;
      id: string;
      verification?: { verified?: boolean; verified_by?: string };
    };
  };
  expect(body.code).toBe(200);
  expect(body.user?.id).toBe('test.bsky.social');
  expect(body.user?.screen_name).toBe('test.bsky.social');
  expect(body.user?.name).toBe('Fixture User');
  expect(body.user?.followers).toBe(100);
  expect(body.user?.following).toBe(50);
  expect(body.user?.statuses).toBe(42);
  expect(body.user?.description).toContain('https://example.com/page');
  expect(body.user?.verification?.verified).toBe(true);
  expect(body.user?.verification?.verified_by).toBe('bsky.app');
});

test('GET /2/profile/{handle}/statuses returns feed, cursor.bottom, and reposted_by', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      expect(u).toContain('filter=posts_no_replies');
      return new Response(JSON.stringify(authorFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/author.test/statuses', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: { id: string; text: string; reposted_by?: { screen_name: string } }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('opaque-next-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].id).toBe('rkeymain');
  expect(body.results[0].text).toContain('Hello timeline');
  expect((body.results[0] as { type?: string }).type).toBe('status');
  expect(body.results[1].reposted_by?.screen_name).toBe('reposter.test');
});

test('GET /2/profile/{handle}/statuses?groupthreads=1 returns discriminated timeline rows', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      return new Response(JSON.stringify(authorFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/statuses?groupthreads=1',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: Array<{ type: 'status' | 'thread'; statuses?: unknown[]; conversation_id?: string }>;
  };
  expect(body.code).toBe(200);
  expect(body.results.length).toBe(2);
  for (const row of body.results) {
    expect(row.type === 'status' || row.type === 'thread').toBe(true);
  }
});

test('GET /2/profile/{handle}/media uses posts_with_media filter and cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      expect(u).toContain('filter=posts_with_media');
      return new Response(JSON.stringify(authorFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/author.test/media', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: { id: string; text: string }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('opaque-next-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].id).toBe('rkeymain');
});

test('GET /2/profile/{handle}/media accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      expect(u).toContain('filter=posts_with_media');
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=next-page-token');
      return new Response(JSON.stringify({ feed: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/media?count=5&cursor=next-page-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/media maps invalid actor (400) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      expect(u).toContain('filter=posts_with_media');
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not resolve identity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/bad.actor/media', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/likes uses getActorLikes and cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getActorLikes')) {
      expect(u).toContain('actor=author.test');
      expect(u).toContain('limit=20');
      return new Response(JSON.stringify(authorFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/author.test/likes', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: { id: string; text: string; reposted_by?: { screen_name: string } }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('opaque-next-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].id).toBe('rkeymain');
  expect(body.results[1].reposted_by?.screen_name).toBe('reposter.test');
});

test('GET /2/profile/{handle}/likes accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getActorLikes')) {
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=next-page-token');
      return new Response(JSON.stringify({ feed: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/likes?count=5&cursor=next-page-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/likes maps invalid actor (400) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getActorLikes')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not resolve identity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/bad.actor/likes', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/statuses with_replies uses posts_with_replies filter', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      expect(u).toContain('filter=posts_with_replies');
      return new Response(JSON.stringify({ feed: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/statuses?with_replies=1',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/statuses maps invalid actor (400) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getAuthorFeed')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not resolve identity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/bad.actor/statuses', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
});

test('GET /2/profile maps invalid actor (400) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.actor.getProfile')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'Could not find actor' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/nobody.invalid.handle', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as { code: number; message: string };
  expect(body.code).toBe(404);
  expect(body.message).toBe('User not found');
});

test('GET /2/profile/{handle}/followers returns users, hydrates via getProfiles, cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollowers')) {
      expect(u).toContain('actor=author.test');
      expect(u).toContain('limit=20');
      return new Response(JSON.stringify(getFollowers), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      expect(u).toContain('actors=did%3Aplc%3Afollowerone');
      expect(u).toContain('actors=did%3Aplc%3Afollowertwo');
      return new Response(JSON.stringify(followersProfilesBatch), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/author.test/followers', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: {
      id: string;
      screen_name: string;
      followers: number;
      following: number;
      statuses: number;
    }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('next-followers-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].screen_name).toBe('follower.one');
  expect(body.results[0].followers).toBe(10);
  expect(body.results[0].following).toBe(5);
  expect(body.results[0].statuses).toBe(3);
  expect(body.results[1].screen_name).toBe('follower.two');
  expect(body.results[1].followers).toBe(20);
});

test('GET /2/profile/{handle}/followers accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollowers')) {
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=page-two-token');
      return new Response(JSON.stringify({ ...getFollowers, followers: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/followers?count=5&cursor=page-two-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/followers maps invalid actor (404) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollowers')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not resolve identity' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/bad.actor/followers', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as {
    code: number;
    results: unknown[];
    cursor: { top: null; bottom: null };
  };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
  expect(body.cursor.bottom).toBeNull();
});

test('GET /2/profile/{handle}/following returns users, hydrates via getProfiles, cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollows')) {
      expect(u).toContain('actor=author.test');
      expect(u).toContain('limit=20');
      return new Response(JSON.stringify(getFollows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      expect(u).toContain('actors=did%3Aplc%3Afollowingone');
      expect(u).toContain('actors=did%3Aplc%3Afollowingtwo');
      return new Response(JSON.stringify(followingProfilesBatch), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/author.test/following', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: {
      id: string;
      screen_name: string;
      followers: number;
      following: number;
      statuses: number;
    }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('next-following-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].screen_name).toBe('following.one');
  expect(body.results[0].followers).toBe(100);
  expect(body.results[0].following).toBe(200);
  expect(body.results[0].statuses).toBe(30);
  expect(body.results[1].screen_name).toBe('following.two');
  expect(body.results[1].followers).toBe(300);
});

test('GET /2/profile/{handle}/following accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollows')) {
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=page-two-token');
      return new Response(JSON.stringify({ ...getFollows, follows: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/profile/author.test/following?count=5&cursor=page-two-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/profile/{handle}/following maps invalid actor (400) to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.graph.getFollows')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not resolve identity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/profile/bad.actor/following', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as {
    code: number;
    results: unknown[];
    cursor: { top: null; bottom: null };
  };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
  expect(body.cursor.bottom).toBeNull();
});

test('GET /2/status/{handle}/{rkey}/reposts returns users, hydrates via getProfiles, cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getRepostedBy')) {
      const urlObj = new URL(u);
      expect(urlObj.searchParams.get('uri')).toBe('at://author.test/app.bsky.feed.post/rkeyrepost');
      expect(urlObj.searchParams.get('limit')).toBe('20');
      return new Response(JSON.stringify(getRepostedBy), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      expect(u).toContain('actors=did%3Aplc%3Areposterone');
      expect(u).toContain('actors=did%3Aplc%3Arepostertwo');
      return new Response(JSON.stringify(repostersProfilesBatch), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/author.test/rkeyrepost/reposts', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: {
      id: string;
      screen_name: string;
      followers: number;
      following: number;
      statuses: number;
    }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('next-reposts-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].screen_name).toBe('reposter.one');
  expect(body.results[0].followers).toBe(11);
  expect(body.results[1].screen_name).toBe('reposter.two');
});

test('GET /2/status/{handle}/{rkey}/reposts accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getRepostedBy')) {
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=page-two-token');
      return new Response(JSON.stringify({ ...getRepostedBy, repostedBy: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/status/author.test/rkeyrepost/reposts?count=5&cursor=page-two-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/status/{handle}/{rkey}/reposts maps upstream not found to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getRepostedBy')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not find repo' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/bad.actor/rkeygone/reposts', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as {
    code: number;
    results: unknown[];
    cursor: { top: null; bottom: null };
  };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
  expect(body.cursor.bottom).toBeNull();
});

test('GET /2/status/{handle}/{rkey}/likes returns users, hydrates via getProfiles, cursor.bottom', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getLikes')) {
      const urlObj = new URL(u);
      expect(urlObj.searchParams.get('uri')).toBe('at://author.test/app.bsky.feed.post/rkeylikes');
      expect(urlObj.searchParams.get('limit')).toBe('20');
      return new Response(JSON.stringify(getLikes), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      expect(u).toContain('actors=did%3Aplc%3Alikerone');
      expect(u).toContain('actors=did%3Aplc%3Alikertwo');
      return new Response(JSON.stringify(likersProfilesBatch), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/author.test/rkeylikes/likes', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    code: number;
    results: {
      id: string;
      screen_name: string;
      followers: number;
      following: number;
      statuses: number;
    }[];
    cursor: { top: null; bottom: string | null };
  };
  expect(body.code).toBe(200);
  expect(body.cursor.top).toBeNull();
  expect(body.cursor.bottom).toBe('next-likes-cursor');
  expect(body.results.length).toBe(2);
  expect(body.results[0].screen_name).toBe('liker.one');
  expect(body.results[0].followers).toBe(31);
  expect(body.results[1].screen_name).toBe('liker.two');
});

test('GET /2/status/{handle}/{rkey}/likes accepts count and cursor query params', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getLikes')) {
      expect(u).toContain('limit=5');
      expect(u).toContain('cursor=page-two-token');
      return new Response(JSON.stringify({ ...getLikes, likes: [], cursor: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/status/author.test/rkeylikes/likes?count=5&cursor=page-two-token',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: number; results: unknown[] };
  expect(body.code).toBe(200);
  expect(body.results).toEqual([]);
});

test('GET /2/status/{handle}/{rkey}/likes maps upstream not found to 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getLikes')) {
      return new Response(
        JSON.stringify({ error: 'InvalidRequest', message: 'could not find repo' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request('https://api.fxbsky.app/2/status/bad.actor/rkeygone/likes', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(res.status).toBe(404);
  const body = (await res.json()) as {
    code: number;
    results: unknown[];
    cursor: { top: null; bottom: null };
  };
  expect(body.code).toBe(404);
  expect(body.results).toEqual([]);
  expect(body.cursor.bottom).toBeNull();
});

test('GET /2/conversation ranks direct replies, excludes self-thread branch, paginates with cursor', async () => {
  let getPostThreadCalls = 0;
  const selfOnlyThread = {
    thread: {
      $type: 'app.bsky.feed.defs#threadViewPost',
      post: (
        conversationThread as {
          thread: { replies: { post: Record<string, unknown> }[] };
        }
      ).thread.replies[0].post
    }
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getPostThread')) {
      getPostThreadCalls += 1;
      if (u.includes('rkeyself1')) {
        return new Response(JSON.stringify(selfOnlyThread), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (u.includes('parentHeight=0')) {
        expect(u).toContain('depth=1');
      } else {
        expect(u).toContain('depth=10');
        expect(u).toContain('parentHeight=80');
      }
      return new Response(JSON.stringify(conversationThread), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      return new Response(JSON.stringify({ profiles: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res1 = await app.request(
    'https://api.fxbsky.app/2/conversation/author.test/rkeyconv?count=2&ranking_mode=likes',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res1.status).toBe(200);
  const body1 = (await res1.json()) as {
    code: number;
    thread: { id: string }[];
    replies: { id: string; likes: number }[];
    cursor: { bottom: string | null };
  };
  expect(body1.code).toBe(200);
  expect(body1.thread.map(t => t.id)).toEqual(['rkeyconv', 'rkeyself1']);
  expect(body1.replies.map(r => r.id)).toEqual(['rkeyhilikes', 'rkeymidlikes']);
  expect(body1.replies[0].likes).toBe(10);
  expect(body1.cursor.bottom).toBeTruthy();

  const res2 = await app.request(
    `https://api.fxbsky.app/2/conversation/author.test/rkeyconv?cursor=${encodeURIComponent(body1.cursor.bottom!)}`,
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res2.status).toBe(200);
  const body2 = (await res2.json()) as {
    code: number;
    thread: { id: string }[];
    replies: { id: string }[];
    cursor: { bottom: string | null };
  };
  expect(body2.code).toBe(200);
  expect(body2.thread).toHaveLength(1);
  expect(body2.thread[0].id).toBe('rkeyconv');
  expect(body2.replies.map(r => r.id)).toEqual(['rkeytwolikes', 'rkeylowlikes']);
  expect(body2.cursor.bottom).toBeNull();
  expect(getPostThreadCalls).toBe(3);
});

test('GET /2/conversation ranking_mode=recency orders by indexedAt', async () => {
  const selfOnlyThread = {
    thread: {
      $type: 'app.bsky.feed.defs#threadViewPost',
      post: (
        conversationThread as {
          thread: { replies: { post: Record<string, unknown> }[] };
        }
      ).thread.replies[0].post
    }
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo) => {
    const u = typeof input === 'string' ? input : input.url;
    if (u.includes('app.bsky.feed.getPostThread')) {
      if (u.includes('rkeyself1')) {
        return new Response(JSON.stringify(selfOnlyThread), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(conversationThread), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.includes('app.bsky.actor.getProfiles')) {
      return new Response(JSON.stringify({ profiles: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });

  const res = await app.request(
    'https://api.fxbsky.app/2/conversation/author.test/rkeyconv?count=2&ranking_mode=recency',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { replies: { id: string }[] };
  expect(body.replies.map(r => r.id)).toEqual(['rkeytwolikes', 'rkeyhilikes']);
});

test('GET /2/conversation returns 400 for invalid cursor', async () => {
  const res = await app.request(
    'https://api.fxbsky.app/2/conversation/author.test/rkeyconv?cursor=Zm9v',
    { headers: { 'User-Agent': 'FxEmbedTest/1.0' } }
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { code: number; message: string };
  expect(body.code).toBe(400);
  expect(body.message).toBe('Invalid cursor');
});
