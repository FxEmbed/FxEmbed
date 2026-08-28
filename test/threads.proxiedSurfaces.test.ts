import { afterEach, describe, expect, it, vi } from 'vitest';
import { setInstagramProxyRuntime } from '@fxembed/atmosphere/providers/instagram-runtime';
import { constructThreadsProfileTab } from '@fxembed/atmosphere/providers/threads/profile-tabs';
import { constructThreadsRelationshipList } from '@fxembed/atmosphere/providers/threads/relationships';
import { constructThreadsStatusLikes } from '@fxembed/atmosphere/providers/threads/likes';
import {
  constructThreadsSearch,
  constructThreadsUserSearch
} from '@fxembed/atmosphere/providers/threads/search';
import { constructThreadsTrends } from '@fxembed/atmosphere/providers/threads/trends';
import { constructThreadsPost } from '@fxembed/atmosphere/providers/threads/post';
import { constructThreadsConversation } from '@fxembed/atmosphere/providers/threads/conversation';
import { constructThreadsProfile } from '@fxembed/atmosphere/providers/threads/profile';
import {
  decodeThreadsConversationCursor,
  decodeThreadsSearchCursor,
  decodeThreadsTokenCursor
} from '@fxembed/atmosphere/providers/threads/cursors';

const ctx = { credentialKey: 'test-key', userAgent: 'FxEmbedTest/1.0' };

function installProxy() {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => true,
    hasInstagramProxyAccounts: () => true,
    getShuffledInstagramAccounts: () => [{ sessionId: 'session', username: 'proxy_account' }]
  });
}

function clearProxy() {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => false,
    hasInstagramProxyAccounts: () => false,
    getShuffledInstagramAccounts: () => []
  });
}

/** Routes each requested v1 path to a canned JSON body, and records the URLs that were hit. */
function stubApi(routes: Record<string, unknown>) {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      requested.push(url.pathname + url.search);
      for (const [prefix, body] of Object.entries(routes)) {
        if (url.pathname.startsWith(prefix)) {
          return new Response(JSON.stringify(body), { status: 200 });
        }
      }
      return new Response('{}', { status: 404 });
    })
  );
  return requested;
}

const zuck = { user: { pk: 314216, username: 'zuck', full_name: 'Mark Zuckerberg' } };

/** One row in the shape `text_feed/…` returns: a thread wrapping its posts. */
const threadRow = (code: string, text: string) => ({
  id: `${code}_314216`,
  thread_items: [
    {
      post: {
        pk: '1',
        code,
        taken_at: 1700000000,
        like_count: 5,
        caption: { text },
        user: { pk: 314216, username: 'zuck', full_name: 'Mark Zuckerberg' }
      }
    }
  ]
});

describe('proxied Threads surfaces', () => {
  afterEach(() => {
    clearProxy();
    vi.unstubAllGlobals();
  });

  it('answers 501 on every proxy-only surface when no account is configured', async () => {
    clearProxy();
    const tab = await constructThreadsProfileTab('zuck', 'replies', {
      count: 20,
      cursor: null,
      ctx
    });
    const followers = await constructThreadsRelationshipList('zuck', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    const likes = await constructThreadsStatusLikes('DXhZAMkljvS', { count: 20, ctx });
    const search = await constructThreadsSearch('meta', { count: 20, cursor: null, ctx });
    const users = await constructThreadsUserSearch('meta', { count: 20, ctx });
    const trends = await constructThreadsTrends({ ctx });
    expect([tab.code, followers.code, likes.code, search.code, users.code, trends.code]).toEqual([
      501, 501, 501, 501, 501, 501
    ]);
  });

  it('reads the replies tab and mints a resumable cursor', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/users/zuck/usernameinfo/': zuck,
      '/api/v1/text_feed/314216/profile/replies/': {
        items: [threadRow('AAA', 'a reply')],
        paging_tokens: { downwards: 'PAGE2' },
        has_more: true
      }
    });

    const page = await constructThreadsProfileTab('zuck', 'replies', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(page.code).toBe(200);
    expect(page.results.map(s => s.id)).toEqual(['AAA']);
    expect(page.results[0]?.author.screen_name).toBe('zuck');
    expect(requested[0]).toContain('/api/v1/users/zuck/usernameinfo/');
    expect(requested[1]).toContain('/api/v1/text_feed/314216/profile/replies/');

    const decoded = decodeThreadsTokenCursor(page.cursor.bottom ?? '', 'replies');
    expect(decoded).toMatchObject({ id: '314216', u: 'zuck', t: 'PAGE2' });
  });

  it('rejects a cursor minted for a different tab or handle', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/zuck/usernameinfo/': zuck,
      '/api/v1/text_feed/314216/profile/replies/': {
        items: [threadRow('AAA', 'a reply')],
        paging_tokens: { downwards: 'PAGE2' },
        has_more: true
      }
    });
    const page = await constructThreadsProfileTab('zuck', 'replies', {
      count: 20,
      cursor: null,
      ctx
    });
    const cursor = page.cursor.bottom ?? '';

    const wrongTab = await constructThreadsProfileTab('zuck', 'reposts', {
      count: 20,
      cursor,
      ctx
    });
    expect(wrongTab.code).toBe(400);

    const wrongHandle = await constructThreadsProfileTab('mosseri', 'replies', {
      count: 20,
      cursor,
      ctx
    });
    expect(wrongHandle.code).toBe(400);
  });

  it('resumes a profile tab from a cursor without re-resolving the handle', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/zuck/usernameinfo/': zuck,
      '/api/v1/text_feed/314216/profile/media/': {
        items: [threadRow('AAA', 'first')],
        paging_tokens: { downwards: 'PAGE2' },
        has_more: true
      }
    });
    const first = await constructThreadsProfileTab('zuck', 'media', {
      count: 20,
      cursor: null,
      ctx
    });

    const requested = stubApi({
      '/api/v1/text_feed/314216/profile/media/': {
        items: [threadRow('BBB', 'second')],
        has_more: false
      }
    });
    const second = await constructThreadsProfileTab('zuck', 'media', {
      count: 20,
      cursor: first.cursor.bottom,
      ctx
    });
    expect(second.code).toBe(200);
    expect(second.results.map(s => s.id)).toEqual(['BBB']);
    expect(second.cursor.bottom).toBeNull();
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('max_id=PAGE2');
  });

  it('searches posts on the top tab, pins the tab into the cursor, and rejects a cursor from another query', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/fbsearch/text_app/serp/': {
        media: [threadRow('AAA', 'about meta')],
        page_token: 'PAGE2',
        rank_token: 'RANK',
        has_more: true
      }
    });

    const page = await constructThreadsSearch('meta', { count: 20, cursor: null, ctx });
    expect(page.code).toBe(200);
    expect(page.results.map(s => s.id)).toEqual(['AAA']);
    expect(requested[0]).toContain('search_surface=ig_text_search_serp_top');
    expect(requested[0]).toContain('recent=0');

    const decoded = decodeThreadsSearchCursor(page.cursor.bottom ?? '');
    expect(decoded).toMatchObject({ q: 'meta', r: false, t: 'PAGE2', rt: 'RANK', p: 1 });

    const withOtherQuery = await constructThreadsSearch('threads', {
      count: 20,
      cursor: page.cursor.bottom,
      ctx
    });
    expect(withOtherQuery.code).toBe(400);
  });

  it('sends the recent surface for the recent tab', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/fbsearch/text_app/serp/': {
        media: [threadRow('AAA', 'about meta')],
        has_more: false
      }
    });
    const page = await constructThreadsSearch('meta', {
      count: 20,
      cursor: null,
      sortOrder: 'recent',
      ctx
    });
    expect(page.code).toBe(200);
    expect(requested[0]).toContain('search_surface=ig_text_search_serp_recent');
    expect(requested[0]).toContain('recent=1');
    expect(page.cursor.bottom).toBeNull();
  });

  it('filters user search down to accounts that are on Threads', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/search/': {
        users: [
          { pk: 1, username: 'on_threads', is_active_on_text_post_app: true },
          { pk: 2, username: 'instagram_only' },
          { pk: 3, username: 'onboarded', has_onboarded_to_text_post_app: true }
        ]
      }
    });
    const page = await constructThreadsUserSearch('meta', { count: 20, ctx });
    expect(page.code).toBe(200);
    expect(page.results.map(u => u.screen_name)).toEqual(['on_threads', 'onboarded']);
    expect(page.results[0]?.url).toBe('https://www.threads.com/@on_threads/');
  });

  it('lists likers of a post by decoding its shortcode', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/media/': { users: [{ pk: 1, username: 'liker' }] }
    });
    const page = await constructThreadsStatusLikes(
      'https://www.threads.com/@zuck/post/DXhZAMkljvS',
      { count: 20, ctx }
    );
    expect(page.code).toBe(200);
    expect(page.results.map(u => u.screen_name)).toEqual(['liker']);
    expect(requested[0]).toMatch(/^\/api\/v1\/media\/\d+\/likers\/$/);
  });

  it('lists followers through the shared Instagram graph', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/users/zuck/usernameinfo/': zuck,
      '/api/v1/friendships/314216/followers/': {
        users: [{ pk: 1, username: 'alpha' }],
        next_max_id: 'PAGE2'
      }
    });
    const page = await constructThreadsRelationshipList('zuck', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(page.code).toBe(200);
    expect(page.results.map(u => u.screen_name)).toEqual(['alpha']);
    expect(requested[1]).toContain('/api/v1/friendships/314216/followers/');
    expect(decodeThreadsTokenCursor(page.cursor.bottom ?? '', 'followers')).toMatchObject({
      t: 'PAGE2'
    });
  });

  it('reads a post through single_thread when a proxy is available', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/text_feed/': {
        containing_thread: {
          thread_items: [
            { post: { ...threadRow('AAA', 'first in chain').thread_items[0]!.post } },
            {
              post: {
                pk: '2',
                code: 'DXhZAMkljvS',
                taken_at: 1700000001,
                caption: { text: 'the focal post' },
                user: { pk: 314216, username: 'zuck' }
              }
            }
          ]
        }
      }
    });

    const res = await constructThreadsPost('DXhZAMkljvS', 'FxEmbedTest/1.0', ctx);
    expect(res.code).toBe(200);
    expect(res.status?.type).toBe('status');
    expect(res.status && 'id' in res.status ? res.status.id : null).toBe('DXhZAMkljvS');
    expect(res.thread?.map(s => ('id' in s ? s.id : null))).toEqual(['AAA']);
    expect(requested[0]).toMatch(/^\/api\/v1\/text_feed\/\d+\/single_thread\//);
  });

  it('reads replies through the proxy and mints a proxy-tagged cursor', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/text_feed/': {
        containing_thread: {
          thread_items: [
            {
              post: {
                pk: '1',
                code: 'DXhZAMkljvS',
                taken_at: 1700000000,
                caption: { text: 'focal' },
                user: { pk: 314216, username: 'zuck' }
              }
            }
          ]
        },
        reply_threads: [threadRow('RRR', 'a reply')],
        paging_tokens: { downwards: 'REPLIES2' },
        has_more: true
      }
    });

    const res = await constructThreadsConversation('DXhZAMkljvS', {
      cursor: null,
      count: 20,
      sortOrder: 'top',
      ctx
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.code).toBe(200);
    expect(res.data.replies?.map(r => r.id)).toEqual(['RRR']);
    expect(requested[0]).toContain('/replies/');
    expect(requested[0]).toContain('sort_order=top');
    expect(decodeThreadsConversationCursor(res.data.cursor?.bottom ?? '')?.src).toBe('proxy');
  });

  it('resolves a profile through usernameinfo when a proxy is available', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/users/zuck/usernameinfo/': {
        user: {
          pk: 314216,
          username: 'zuck',
          full_name: 'Mark Zuckerberg',
          biography: 'bio',
          follower_count: 42,
          is_verified: true
        }
      }
    });
    const res = await constructThreadsProfile('zuck', 'FxEmbedTest/1.0', ctx);
    expect(res.code).toBe(200);
    expect(res.user?.screen_name).toBe('zuck');
    expect(res.user?.followers).toBe(42);
    expect(res.user?.url).toBe('https://www.threads.com/@zuck/');
    expect(requested).toHaveLength(1);
  });

  it('maps trending topics onto the shared trends shape', async () => {
    installProxy();
    stubApi({
      '/api/v1/fbsearch/text_app/trends/': {
        trending_topics: [
          {
            trend_title: 'Something happened',
            trend_description: 'A big deal',
            trend_rank: 1,
            related_communities: [{ name: 'News' }]
          },
          { topic_name: 'Another topic', post_count: 4200 },
          { trend_description: 'nameless rows are dropped' }
        ]
      }
    });
    const page = await constructThreadsTrends({ ctx });
    expect(page.code).toBe(200);
    expect(page.timeline_type).toBe('threads');
    expect(page.trends).toEqual([
      {
        name: 'Something happened',
        rank: '1',
        context: 'A big deal',
        grouped_topics: [{ name: 'News' }]
      },
      { name: 'Another topic', rank: null, context: '4200 posts' }
    ]);
  });
});
