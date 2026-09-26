import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import threadSingle from './fixtures/bluesky/thread-single.json';

afterEach(() => vi.restoreAllMocks());

test.each([
  ['with thumbnail', 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:test111/cid'],
  ['without thumbnail', undefined]
])('GET /2/status external card %s', async (_scenario, thumbnail) => {
  const fixture = structuredClone(threadSingle);
  const external = {
    uri: 'https://example.com/article',
    title: 'Article',
    description: 'Card description',
    ...(thumbnail ? { thumb: thumbnail } : {})
  };
  Object.assign(fixture.thread.post, { embed: { external } });
  Object.assign(fixture.thread.post.record, {
    embed: { external: { ...external, thumb: { ref: { $link: 'cid' } } } }
  });

  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app.bsky.feed.getPostThread')) return Response.json(fixture);
    if (url.includes('app.bsky.actor.getProfiles')) return Response.json({ profiles: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const response = await app.request('https://api.fxbsky.app/2/status/author.test/rkeymain', {
    headers: { 'User-Agent': 'FxEmbedTest/1.0' }
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { status: { media: { photos?: { url: string }[] } } };
  expect(body.status.media.photos?.map(photo => photo.url) ?? []).toEqual(
    thumbnail ? [thumbnail] : []
  );
});
