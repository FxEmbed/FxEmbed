import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import authorFeed from './fixtures/bluesky/author-feed.json';

afterEach(() => vi.restoreAllMocks());

test.each(['media.xml', 'media.atom.xml'])(
  '%s excludes replies by default and includes them with with_replies',
  async format => {
    const makePost = (rkey: string, reply = false) => {
      const entry = structuredClone(authorFeed.feed[0]);
      entry.post.uri = `at://did:plc:test111/app.bsky.feed.post/${rkey}`;
      entry.post.record.text = rkey;
      if (reply) {
        Object.assign(entry.post.record, {
          reply: { parent: { uri: 'at://did:plc:test111/app.bsky.feed.post/parent' } }
        });
      }
      return entry;
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname.endsWith('getAuthorFeed')) {
        const secondPage = url.searchParams.has('cursor');
        return Response.json(
          secondPage
            ? { feed: [makePost('next')] }
            : { feed: [makePost('reply', true), makePost('main')], cursor: 'next-page' }
        );
      }
      if (url.pathname.endsWith('getProfiles')) {
        return Response.json({ profiles: [authorFeed.feed[0].post.author] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const feedUrl = `https://fxbsky.app/profile/author.test/${format}?count=2`;
    const withoutReplies = await app.request(feedUrl);
    expect(withoutReplies.status).toBe(200);
    const defaultXml = await withoutReplies.text();
    expect(defaultXml).toContain('/post/main');
    expect(defaultXml).toContain('/post/next');
    expect(defaultXml).not.toContain('/post/reply');

    const withReplies = await app.request(`${feedUrl}&with_replies=1`);
    expect(withReplies.status).toBe(200);
    const repliesXml = await withReplies.text();
    expect(repliesXml).toContain('/post/reply');
    expect(repliesXml).toContain('/post/main');
    expect(repliesXml).not.toContain('/post/next');
  }
);
