import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import threadMultiImage from './fixtures/bluesky/thread-multi-image.json';

afterEach(() => vi.restoreAllMocks());

function mockMultiImageThread() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app.bsky.feed.getPostThread')) return Response.json(threadMultiImage);
    if (url.includes('app.bsky.actor.getProfiles')) return Response.json({ profiles: [] });
    if (url.includes('mosaic.fxbsky.app')) return Response.json({ ok: true });
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

test.each([
  ['photo/1', 'https://cdn.bsky.app/full1'],
  ['photo/2', 'https://cdn.bsky.app/full2'],
  ['photo/2/en', 'https://cdn.bsky.app/full2']
])('Bluesky /%s embeds only the selected image', async (path, expected) => {
  mockMultiImageThread();
  const response = await app.request(`https://fxbsky.app/profile/pics.test/post/rkeypics/${path}`, {
    headers: { 'User-Agent': 'Twitterbot' }
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain(`<meta property="og:image" content="${expected}"`);
});

test('Bluesky prefixed localized photo URL embeds the selected image', async () => {
  mockMultiImageThread();
  const response = await app.request(
    'https://fxbsky.app/bsky/profile/pics.test/post/rkeypics/photo/2/en',
    { headers: { 'User-Agent': 'Twitterbot' } }
  );
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('<meta property="og:image" content="https://cdn.bsky.app/full2"');
  expect(html).not.toContain('<meta property="og:image" content="https://cdn.bsky.app/full1"');
});

test('Bluesky /photo/N rejects an unavailable image', async () => {
  mockMultiImageThread();
  const response = await app.request(
    'https://fxbsky.app/profile/pics.test/post/rkeypics/photo/99',
    {
      headers: { 'User-Agent': 'Twitterbot' }
    }
  );
  expect(response.status).toBe(404);
});

test('Bluesky photo selection reaches the Discord activity response', async () => {
  mockMultiImageThread();
  const response = await app.request('https://fxbsky.app/profile/pics.test/post/rkeypics/photo/2', {
    headers: { 'User-Agent': 'Discordbot/2.0' }
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  const activityHref = html.match(
    /<link href='([^']+)' rel='alternate' type='application\/activity\+json'/
  )?.[1];
  expect(activityHref).toBeDefined();
  const snowcode = activityHref?.split('/').at(-1);
  const activity = await app.request(`https://fxbsky.app/api/v1/statuses/${snowcode}`, {
    headers: { 'User-Agent': 'Discordbot/2.0' }
  });
  expect(activity.status).toBe(200);
  const body = await activity.text();
  expect(body).toContain('https://cdn.bsky.app/full2');
  expect(body).not.toContain('https://cdn.bsky.app/full1');
});
