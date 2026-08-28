import { afterEach, describe, expect, it, vi } from 'vitest';
import { setInstagramProxyRuntime } from '@fxembed/atmosphere/providers/instagram-runtime';
import { constructInstagramPost } from '@fxembed/atmosphere/providers/instagram/post';
import { constructInstagramConversation } from '@fxembed/atmosphere/providers/instagram/conversation';
import { decodeCommentCursor } from '@fxembed/atmosphere/providers/instagram/cursors';
import { instagramShortcodeToPk } from '@fxembed/atmosphere/providers/instagram/shortcode';

const SHORTCODE = 'DXeh-kYiIge';
const MEDIA_PK = String(instagramShortcodeToPk(SHORTCODE));
const credentialKey = 'test-key';

const mediaItem = {
  code: SHORTCODE,
  pk: `${MEDIA_PK}_173560420`,
  media_type: 2,
  taken_at: 1770000000,
  like_count: 1000,
  comment_count: 25,
  caption: { text: 'proxied caption' },
  original_width: 1080,
  original_height: 1920,
  video_duration: 12.5,
  video_versions: [{ url: 'https://cdn.example/hi.mp4', width: 1080, height: 1920, type: 101 }],
  image_versions2: {
    candidates: [{ url: 'https://cdn.example/thumb.jpg', width: 1080, height: 1920 }]
  },
  user: { pk: 173560420, username: 'cristiano', full_name: 'Cristiano Ronaldo', is_verified: true }
};

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

describe('Instagram post and conversation through the account proxy', () => {
  afterEach(() => {
    clearProxy();
    vi.unstubAllGlobals();
  });

  it('fetches a post from media/{pk}/info/ instead of scraping the logged-out page', async () => {
    installProxy();
    const requested = stubApi({
      [`/api/v1/media/${MEDIA_PK}/info/`]: { items: [mediaItem] }
    });

    const thread = await constructInstagramPost(SHORTCODE, 'FxEmbedTest/1.0', { credentialKey });
    expect(thread.code).toBe(200);
    expect(thread.status).toMatchObject({
      id: SHORTCODE,
      text: 'proxied caption',
      likes: 1000,
      replies: 25
    });
    expect(thread.status?.media?.videos?.[0]).toMatchObject({
      url: 'https://cdn.example/hi.mp4',
      width: 1080,
      height: 1920,
      duration: 12.5
    });
    expect(thread.author?.screen_name).toBe('cristiano');
    // One request, and no www.instagram.com HTML scrape behind it.
    expect(requested).toEqual([`/api/v1/media/${MEDIA_PK}/info/`]);
  });

  it('falls through to the logged-out path when the proxy account gets a 404', async () => {
    installProxy();
    // A poster who has blocked the proxy account 404s `media/{pk}/info/` for a post that is
    // perfectly visible logged-out, so a proxy 404 must not end the lookup.
    const requested = stubApi({});
    const thread = await constructInstagramPost(SHORTCODE, 'FxEmbedTest/1.0', { credentialKey });
    expect(thread.code).not.toBe(200);
    expect(requested[0]).toBe(`/api/v1/media/${MEDIA_PK}/info/`);
    expect(requested.some(u => !u.startsWith('/api/v1/'))).toBe(true);
  });

  it('pages comments through media/{pk}/comments/ and mints a proxy cursor', async () => {
    installProxy();
    const requested = stubApi({
      [`/api/v1/media/${MEDIA_PK}/info/`]: { items: [mediaItem] },
      [`/api/v1/media/${MEDIA_PK}/comments/`]: {
        comments: [
          {
            pk: '18000000000000001',
            text: 'first',
            created_at: 1770000100,
            comment_like_count: 3,
            user: { pk: 99, username: 'fan', full_name: 'A Fan' }
          }
        ],
        next_max_id: 'COMMENTS2',
        has_more_comments: true
      }
    });

    const result = await constructInstagramConversation(SHORTCODE, {
      cursor: null,
      count: 20,
      sortOrder: 'popular',
      userAgent: 'FxEmbedTest/1.0',
      credentialKey
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.code).toBe(200);
    expect(result.data.replies).toHaveLength(1);
    expect(result.data.replies?.[0]).toMatchObject({
      id: '18000000000000001',
      text: 'first',
      likes: 3,
      parent_id: SHORTCODE
    });

    const cursor = decodeCommentCursor(result.data.cursor?.bottom ?? '');
    expect(cursor).toMatchObject({ src: 'proxy', mediaId: MEDIA_PK, after: 'COMMENTS2' });
    expect(requested.some(u => u.includes(`/api/v1/media/${MEDIA_PK}/comments/`))).toBe(true);

    const page2 = await constructInstagramConversation(SHORTCODE, {
      cursor: result.data.cursor?.bottom ?? null,
      count: 20,
      sortOrder: 'popular',
      userAgent: 'FxEmbedTest/1.0',
      credentialKey
    });
    expect(page2.ok).toBe(true);
    expect(requested.some(u => u.includes('max_id=COMMENTS2'))).toBe(true);
  });

  it('refuses a GraphQL cursor on the proxy path rather than serving the wrong page', async () => {
    installProxy();
    stubApi({
      [`/api/v1/media/${MEDIA_PK}/info/`]: { items: [mediaItem] },
      [`/api/v1/media/${MEDIA_PK}/comments/`]: { comments: [] }
    });
    // A cursor minted by the logged-out GraphQL path carries `src: 'gql'`; its `after` value is
    // meaningless to the private API.
    const gqlCursor = btoa(
      JSON.stringify({
        v: 1,
        mediaId: MEDIA_PK,
        shortcode: SHORTCODE,
        sort: 'popular',
        after: 'QVFB...',
        count: 20,
        src: 'gql'
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await constructInstagramConversation(SHORTCODE, {
      cursor: gqlCursor,
      count: 20,
      sortOrder: 'popular',
      userAgent: 'FxEmbedTest/1.0',
      credentialKey
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('Invalid cursor');
  });
});
