import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import threadSingle from './fixtures/bluesky/thread-single.json';

afterEach(() => vi.restoreAllMocks());

const PAYLOAD = '"><script>document.title="XSS_"+document.domain</script><x a="';

function mockThreadWithHostileAuthor() {
  const thread = structuredClone(threadSingle);
  thread.thread.post.author.displayName = PAYLOAD;
  (thread.thread.post.record as { langs?: string[] }).langs = ['en"><script>alert(1)</script>'];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('app.bsky.feed.getPostThread')) return Response.json(thread);
    if (url.includes('app.bsky.actor.getProfiles')) return Response.json({ profiles: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

test.each([
  ['a bot', 'Discordbot/2.0', 'https://fxbsky.app/profile/author.test/post/rkeymain'],
  [
    'a telegram bot',
    'TelegramBot (like TwitterBot)',
    'https://fxbsky.app/profile/author.test/post/rkeymain'
  ],
  [
    'a browser on a direct-media path',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'https://fxbsky.app/profile/author.test/post/rkeymain.jpg'
  ]
])('Bluesky embed escapes a hostile display name for %s', async (_label, userAgent, url) => {
  mockThreadWithHostileAuthor();
  const response = await app.request(url, { headers: { 'User-Agent': userAgent } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  const html = await response.text();
  expect(html).not.toContain('<script>');
  expect(html).toContain('&#34;&gt;&lt;script&gt;');
  expect(html).toContain('<html lang="en">');
});
