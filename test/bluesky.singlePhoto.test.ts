import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import threadMultiImage from './fixtures/bluesky/thread-multi-image.json';

afterEach(() => vi.restoreAllMocks());

test.each([
  [1, 'https://cdn.bsky.app/full1'],
  [2, 'https://cdn.bsky.app/full2']
])('Bluesky /photo/%i embeds only the selected image', async (number, expected) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app.bsky.feed.getPostThread')) return Response.json(threadMultiImage);
    if (url.includes('app.bsky.actor.getProfiles')) return Response.json({ profiles: [] });
    if (url.includes('mosaic.fxbsky.app')) return Response.json({ ok: true });
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const response = await app.request(
    `https://fxbsky.app/profile/pics.test/post/rkeypics/photo/${number}`,
    { headers: { 'User-Agent': 'Twitterbot' } }
  );
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain(`<meta property="og:image" content="${expected}"`);
});
