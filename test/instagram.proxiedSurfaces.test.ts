import { afterEach, describe, expect, it, vi } from 'vitest';
import { setInstagramProxyRuntime } from '@fxembed/atmosphere/providers/instagram-runtime';
import { constructInstagramRelationshipList } from '@fxembed/atmosphere/providers/instagram/relationships';
import { constructInstagramProfileTagged } from '@fxembed/atmosphere/providers/instagram/tagged';
import { constructInstagramProfileStories } from '@fxembed/atmosphere/providers/instagram/stories';
import {
  constructInstagramTypeahead,
  constructInstagramUserSearch
} from '@fxembed/atmosphere/providers/instagram/search';
import { decodeMaxIdCursor } from '@fxembed/atmosphere/providers/instagram/cursors';

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

const cristiano = {
  user: { pk: 173560420, username: 'cristiano', full_name: 'Cristiano Ronaldo' }
};

describe('proxied Instagram surfaces', () => {
  afterEach(() => {
    clearProxy();
    vi.unstubAllGlobals();
  });

  it('resolves a handle, lists followers and mints a resumable cursor', async () => {
    installProxy();
    const requested = stubApi({
      '/api/v1/users/cristiano/usernameinfo/': cristiano,
      '/api/v1/friendships/173560420/followers/': {
        users: [{ pk: 1, username: 'alpha' }],
        next_max_id: 'PAGE2',
        big_list: true
      }
    });

    const page = await constructInstagramRelationshipList('cristiano', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(page.code).toBe(200);
    expect(page.results.map(u => u.screen_name)).toEqual(['alpha']);
    expect(requested[0]).toContain('/api/v1/users/cristiano/usernameinfo/');
    expect(requested[1]).toContain('/api/v1/friendships/173560420/followers/');

    const cursor = decodeMaxIdCursor(page.cursor.bottom ?? '');
    expect(cursor).toMatchObject({ k: 'followers', id: '173560420', u: 'cristiano', m: 'PAGE2' });

    // Page two carries the user id in the cursor, so it skips the profile lookup entirely.
    const page2 = await constructInstagramRelationshipList('cristiano', 'followers', {
      count: 20,
      cursor: page.cursor.bottom,
      ctx
    });
    expect(page2.code).toBe(200);
    expect(requested[2]).toContain('max_id=PAGE2');
    expect(requested.filter(u => u.includes('usernameinfo'))).toHaveLength(1);
  });

  it('stops paginating followers when Instagram closes the list', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/cristiano/usernameinfo/': cristiano,
      '/api/v1/friendships/173560420/followers/': {
        users: [{ pk: 1, username: 'alpha' }],
        next_max_id: 'IGNORED',
        big_list: false
      }
    });
    const page = await constructInstagramRelationshipList('cristiano', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(page.cursor.bottom).toBeNull();
  });

  it('rejects a cursor minted for a different list or account', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/cristiano/usernameinfo/': cristiano,
      '/api/v1/friendships/173560420/followers/': { users: [], next_max_id: 'P2', big_list: true }
    });
    const page = await constructInstagramRelationshipList('cristiano', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    const followersCursor = page.cursor.bottom;

    const wrongList = await constructInstagramRelationshipList('cristiano', 'following', {
      count: 20,
      cursor: followersCursor,
      ctx
    });
    expect(wrongList.code).toBe(400);

    const wrongUser = await constructInstagramRelationshipList('leomessi', 'followers', {
      count: 20,
      cursor: followersCursor,
      ctx
    });
    expect(wrongUser.code).toBe(400);

    // Instagram handles are case-insensitive, so differing case must still resume the same list.
    const sameUserOtherCase = await constructInstagramRelationshipList('Cristiano', 'followers', {
      count: 20,
      cursor: followersCursor,
      ctx
    });
    expect(sameUserOtherCase.code).toBe(200);
  });

  it('maps the tagged feed, unwrapping its { media } entries', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/cristiano/usernameinfo/': cristiano,
      '/api/v1/usertags/173560420/feed/': {
        items: [
          {
            media: {
              code: 'DXeh-kYiIge',
              media_type: 1,
              taken_at: 1770000000,
              like_count: 42,
              comment_count: 7,
              caption: { text: 'tagged post' },
              image_versions2: {
                candidates: [{ url: 'https://cdn.example/a.jpg', width: 1080, height: 1080 }]
              },
              user: { pk: 1, username: 'someone_else' }
            }
          }
        ],
        next_max_id: 'TAG2',
        more_available: true
      }
    });
    const page = await constructInstagramProfileTagged('cristiano', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(page.code).toBe(200);
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({
      id: 'DXeh-kYiIge',
      text: 'tagged post',
      likes: 42,
      replies: 7,
      provider: 'instagram'
    });
    // The post's own author wins over the profile whose tagged grid we asked for.
    expect(page.results[0].author.screen_name).toBe('someone_else');
    expect(decodeMaxIdCursor(page.cursor.bottom ?? '')).toMatchObject({ k: 'tagged', m: 'TAG2' });
  });

  it('flattens the story tray and de-duplicates repeated items', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/cristiano/usernameinfo/': cristiano,
      '/api/v1/feed/reels_media/': {
        reels: {
          '173560420': {
            items: [
              { pk: '1', code: 'STORYONE', media_type: 1, taken_at: 1770000000 },
              { pk: '2', code: 'STORYTWO', media_type: 1, taken_at: 1770000100 }
            ]
          }
        },
        reels_media: [
          { items: [{ pk: '2', code: 'STORYTWO', media_type: 1, taken_at: 1770000100 }] }
        ]
      }
    });
    const page = await constructInstagramProfileStories('cristiano', { ctx });
    expect(page.code).toBe(200);
    expect(page.results.map(s => s.id)).toEqual(['STORYONE', 'STORYTWO']);
    expect(page.cursor).toEqual({ top: null, bottom: null });
  });

  it('maps user search results and caps them at count', async () => {
    installProxy();
    stubApi({
      '/api/v1/users/search/': {
        users: [
          { pk: 1, username: 'alpha' },
          { pk: 2, username: 'beta' },
          { pk: 3, username: 'gamma' }
        ]
      }
    });
    const res = await constructInstagramUserSearch('al', { count: 2, ctx });
    expect(res.code).toBe(200);
    expect(res.results.map(u => u.screen_name)).toEqual(['alpha', 'beta']);
    expect(res.cursor.bottom).toBeNull();
  });

  it('splits typeahead into users and topics, tagging hashtags and places', async () => {
    installProxy();
    stubApi({
      '/api/v1/fbsearch/ig_typeahead/': {
        list: [
          { user: { pk: 1, username: 'alpha', full_name: 'Alpha' } },
          { hashtag: { name: 'football', formatted_media_count: '12M' } },
          { place: { location: { name: 'Old Trafford', city: 'Manchester' } } },
          { unknown_entry: true }
        ]
      }
    });
    const res = await constructInstagramTypeahead('al', { ctx });
    expect(res.code).toBe(200);
    expect(res.query).toBe('al');
    expect(res.users.map(u => u.screen_name)).toEqual(['alpha']);
    expect(res.topics).toEqual([
      {
        topic: '#football',
        result_context: {
          display_string: '12M posts',
          redirect_url: 'https://www.instagram.com/explore/tags/football/',
          types: [{ type: 'hashtag' }]
        }
      },
      {
        topic: 'Old Trafford',
        result_context: { display_string: 'Manchester', types: [{ type: 'place' }] }
      }
    ]);
    expect(res.num_results).toBe(3);
    expect(res.events).toEqual([]);
  });

  it('reports 501 rather than an empty list when no proxy is configured', async () => {
    clearProxy();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const followers = await constructInstagramRelationshipList('cristiano', 'followers', {
      count: 20,
      cursor: null,
      ctx
    });
    expect(followers.code).toBe(501);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
