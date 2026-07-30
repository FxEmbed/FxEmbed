import type {
  APIFacet,
  APIPhoto,
  APIStatusTombstone,
  APITombstoneReason,
  APIThreadsStatus,
  APIUser,
  APIVideo,
  APISubstatus
} from '../../types/api-schemas.js';

function pickInt(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  }
  return 0;
}

function pickFloat(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

function isoFromUnix(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return new Date(0).toISOString();
  return new Date(sec * 1000).toISOString();
}

function buildPhoto(url: string, w: number, h: number): APIPhoto {
  return {
    type: 'photo',
    url,
    width: w || 1,
    height: h || 1
  };
}

function buildVideo(
  url: string,
  w: number,
  h: number,
  durationSec: number,
  thumb: string | null | undefined
): APIVideo {
  return {
    type: 'video',
    url,
    width: w || 1,
    height: h || 1,
    duration: durationSec > 0 ? durationSec : 0,
    formats: [{ url, width: w || undefined, height: h || undefined }],
    thumbnail_url: thumb ?? null
  };
}

export function stubAuthorFromThreads(
  id: string,
  username: string,
  fullName: string | undefined,
  avatarUrl: string | null,
  verified: boolean
): APIUser {
  const uname = username.replace(/^@/, '');
  return {
    type: 'profile',
    id,
    name: fullName ?? uname,
    screen_name: uname,
    avatar_url: avatarUrl,
    banner_url: null,
    description: '',
    raw_description: { text: '', facets: [] },
    location: '',
    url: `https://www.threads.com/@${encodeURIComponent(uname)}/`,
    protected: false,
    followers: 0,
    following: 0,
    statuses: 0,
    media_count: 0,
    likes: 0,
    joined: '1970-01-01T00:00:00.000Z',
    website: null,
    profile_embed: true,
    verification: {
      verified,
      type: verified ? 'individual' : null
    }
  };
}

function permalinkForThreadsPost(username: string, code: string): string {
  return `https://www.threads.com/@${encodeURIComponent(username)}/post/${encodeURIComponent(code)}/`;
}

function mediaPkFromPost(post: Record<string, unknown>): string | undefined {
  const pk = post.pk;
  if (typeof pk === 'string' || typeof pk === 'number') {
    const part = String(pk).split('_')[0];
    return part || String(pk);
  }
  const id = post.id;
  if (typeof id === 'string') {
    return id.split('_')[0] || id;
  }
  return undefined;
}

/** Concatenated body + facets from `post.text_post_app_info.text_fragments.fragments`. */
function textAndFacetsFromThreadsTextFragments(post: Record<string, unknown>): {
  text: string;
  facets: APIFacet[];
} {
  const tpi = post.text_post_app_info as Record<string, unknown> | undefined;
  const frags = (tpi?.text_fragments as { fragments?: unknown[] } | undefined)?.fragments ?? [];
  let text = '';
  const facets: APIFacet[] = [];
  for (const raw of frags) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    const ft = String(f.fragment_type ?? '');
    const start = text.length;
    if (ft === 'plaintext' && typeof f.plaintext === 'string') {
      text += f.plaintext;
      continue;
    }
    if (ft === 'mention') {
      const plain = typeof f.plaintext === 'string' ? f.plaintext : '';
      const mf = f.mention_fragment as Record<string, unknown> | undefined;
      const mentioned =
        mf && typeof mf === 'object'
          ? ((mf.mentioned_user as Record<string, unknown> | undefined)?.username as
              string | undefined)
          : undefined;
      const slice = plain.length > 0 ? plain : mentioned ? `@${mentioned}` : '';
      if (!slice) continue;
      text += slice;
      const end = text.length;
      if (mentioned) {
        facets.push({
          type: 'mention',
          indices: [start, end],
          replacement: `@${mentioned}`
        });
      }
      continue;
    }
    if (ft === 'link' && f.link_fragment && typeof f.link_fragment === 'object') {
      const lf = f.link_fragment as Record<string, unknown>;
      const display =
        typeof f.plaintext === 'string' ? f.plaintext : String(lf.display_text ?? lf.url ?? '');
      const url = typeof lf.url === 'string' ? lf.url : '';
      if (!display && !url) continue;
      const slice = display || url;
      text += slice;
      const end = text.length;
      facets.push({
        type: 'url',
        indices: [start, end],
        original: url || undefined,
        display: display || undefined
      });
      continue;
    }
  }
  return { text, facets };
}

/** Prefer `text_post_app_info.text_fragments`; fall back to `caption.text` with empty facets. */
export function textAndFacetsFromThreadsPost(post: Record<string, unknown>): {
  text: string;
  facets: APIFacet[];
} {
  const fromFragments = textAndFacetsFromThreadsTextFragments(post);
  if (fromFragments.text.length > 0) {
    return fromFragments;
  }
  const cap = post.caption;
  if (cap && typeof cap === 'object' && typeof (cap as { text?: unknown }).text === 'string') {
    const t = (cap as { text: string }).text;
    if (t.length > 0) return { text: t, facets: [] };
  }
  return { text: '', facets: [] };
}

function mediaContainerFromThreadsPost(post: Record<string, unknown>): {
  photos: APIPhoto[];
  videos: APIVideo[];
  all: (APIPhoto | APIVideo)[];
} {
  const photos: APIPhoto[] = [];
  const videos: APIVideo[] = [];
  const all: (APIPhoto | APIVideo)[] = [];
  const isVideo = Boolean(post.is_video) || post.media_type === 2;
  const dims = (post.dimensions as { width?: number; height?: number } | undefined) ?? {};
  const w = pickInt(dims.width, post.original_width);
  const h = pickInt(dims.height, post.original_height);
  const carousel = post.carousel_media;
  if (Array.isArray(carousel) && carousel.length > 0) {
    for (const slide of carousel) {
      if (!slide || typeof slide !== 'object') continue;
      const s = slide as Record<string, unknown>;
      if (s.is_video || s.video_url) {
        const vu = s.video_versions as
          { url?: string; width?: number; height?: number }[] | undefined;
        const url = (typeof s.video_url === 'string' && s.video_url) || vu?.[0]?.url || '';
        if (url) {
          const durRaw = pickFloat(s.video_duration);
          const durationSec = Number.isFinite(durRaw) ? durRaw : 0;
          const v = buildVideo(
            url,
            pickInt(s.original_width, vu?.[0]?.width, w),
            pickInt(s.original_height, vu?.[0]?.height, h),
            durationSec,
            typeof s.display_url === 'string' ? s.display_url : undefined
          );
          videos.push(v);
          all.push(v);
        }
      } else {
        const img =
          (s.display_url as string | undefined) ||
          ((s.image_versions2 as { candidates?: { url?: string }[] } | undefined)?.candidates?.[0]
            ?.url ??
            undefined);
        if (img) {
          const p = buildPhoto(img, pickInt(s.original_width, w), pickInt(s.original_height, h));
          photos.push(p);
          all.push(p);
        }
      }
    }
  } else if (isVideo) {
    const vv = post.video_versions as
      { url?: string; width?: number; height?: number }[] | undefined;
    const url = (typeof post.video_url === 'string' && post.video_url) || vv?.[0]?.url || '';
    if (url) {
      const durRaw = pickFloat(post.video_duration);
      const durationSec = Number.isFinite(durRaw) ? durRaw : 0;
      const v = buildVideo(
        url,
        pickInt(vv?.[0]?.width, w),
        pickInt(vv?.[0]?.height, h),
        durationSec,
        typeof post.display_url === 'string' ? post.display_url : undefined
      );
      videos.push(v);
      all.push(v);
    }
  } else {
    const img =
      (typeof post.display_url === 'string' && post.display_url) ||
      (typeof post.display_src === 'string' && post.display_src) ||
      ((
        post.image_versions2 as
          { candidates?: { url?: string; width?: number; height?: number }[] } | undefined
      )?.candidates?.[0]?.url ??
        '');
    const cand = (
      post.image_versions2 as
        { candidates?: { url?: string; width?: number; height?: number }[] } | undefined
    )?.candidates?.[0];
    if (img) {
      const p = buildPhoto(img, pickInt(cand?.width, w), pickInt(cand?.height, h));
      photos.push(p);
      all.push(p);
    }
  }
  return { photos, videos, all };
}

export function buildThreadsTombstone(
  reason: APITombstoneReason,
  opts?: { id?: string; url?: string; message?: string }
): APIStatusTombstone {
  return {
    type: 'tombstone',
    provider: 'threads',
    reason,
    message: opts?.message ?? 'This post is unavailable',
    id: opts?.id,
    url: opts?.url
  };
}

export function threadsPostToStatus(
  post: Record<string, unknown>,
  ownerFallback: { id: string; username: string; fullName?: string; pic?: string | null }
): APIThreadsStatus | null {
  const shortcode =
    (typeof post.shortcode === 'string' && post.shortcode) ||
    (typeof post.code === 'string' && post.code) ||
    '';
  if (!shortcode) return null;
  if (post.is_post_unavailable === true) return null;

  const owner = (post.user as Record<string, unknown> | undefined) ?? {};
  const oid = String(owner.id ?? owner.pk ?? ownerFallback.id);
  const ouser = String(owner.username ?? ownerFallback.username);
  const oname = typeof owner.full_name === 'string' ? owner.full_name : ownerFallback.fullName;
  const opic =
    typeof owner.profile_pic_url === 'string' ? owner.profile_pic_url : (ownerFallback.pic ?? null);
  const author = stubAuthorFromThreads(oid, ouser, oname, opic, Boolean(owner.is_verified));

  const takenRaw = pickInt(
    post.taken_at_timestamp,
    post.taken_at,
    (post as { device_timestamp?: number }).device_timestamp
  );
  const taken = takenRaw > 0 ? takenRaw : 0;
  const likes = pickInt(post.like_count);
  const tpi = post.text_post_app_info as Record<string, unknown> | undefined;
  const replies = pickInt(
    tpi?.direct_reply_count,
    post.comment_count,
    (post.edge_media_to_comment as { count?: number } | undefined)?.count
  );
  const quotes = pickInt(tpi?.quote_count);
  const reposts = pickInt(tpi?.repost_count, tpi?.reshare_count, 0);

  const { text, facets } = textAndFacetsFromThreadsPost(post);
  const { photos, videos, all } = mediaContainerFromThreadsPost(post);
  const mediaPk = mediaPkFromPost(post);

  const isReply = Boolean(tpi?.is_reply ?? post.is_reply);
  const replyTo = tpi?.reply_to_author as Record<string, unknown> | undefined;
  const replying_to =
    isReply && replyTo && typeof replyTo === 'object'
      ? {
          screen_name: String(replyTo.username ?? ''),
          status: String(replyTo.pk ?? replyTo.id ?? ''),
          ...(typeof replyTo.username === 'string'
            ? {
                profile_url: `https://www.threads.com/@${encodeURIComponent(String(replyTo.username))}/`
              }
            : {})
        }
      : null;

  return {
    type: 'status',
    id: shortcode,
    url: permalinkForThreadsPost(ouser, shortcode),
    text,
    created_at: isoFromUnix(taken),
    created_timestamp: taken,
    likes,
    reposts,
    quotes: quotes > 0 ? quotes : undefined,
    replies,
    author,
    media: {
      photos: photos.length ? photos : undefined,
      videos: videos.length ? videos : undefined,
      all: all.length ? all : undefined
    },
    raw_text: { text, facets },
    lang: null,
    possibly_sensitive: false,
    replying_to,
    source: 'threads',
    embed_card:
      all.length === 0
        ? 'summary'
        : all.some(m => m.type === 'video')
          ? 'player'
          : 'summary_large_image',
    provider: 'threads',
    media_pk: mediaPk
  };
}

/** Map a reply thread edge (`XDTThread`) to an `APISubstatus` (surface = last `thread_items` post). */
export function xdtThreadEdgeToSubstatus(
  edge: Record<string, unknown>,
  parentShortcode: string,
  focalAuthorUsername: string
): APISubstatus | null {
  const node = edge.node as Record<string, unknown> | undefined;
  if (!node) return null;
  const items = node.thread_items as unknown[] | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  const lastItem = items[items.length - 1] as Record<string, unknown>;
  const post = lastItem.post as Record<string, unknown> | undefined;
  if (!post) return null;
  const st = threadsPostToStatus(post, {
    id: '',
    username: focalAuthorUsername,
    pic: null
  });
  if (!st) return null;
  return {
    type: 'substatus',
    parent_id: parentShortcode,
    id: st.id,
    url: st.url,
    text: st.text,
    created_at: st.created_at,
    created_timestamp: st.created_timestamp,
    likes: st.likes,
    reposts: st.reposts,
    replies: st.replies,
    author: st.author,
    media: st.media,
    raw_text: st.raw_text,
    lang: st.lang,
    possibly_sensitive: st.possibly_sensitive,
    replying_to: {
      screen_name: focalAuthorUsername,
      status: parentShortcode,
      url: `https://www.threads.com/@${encodeURIComponent(focalAuthorUsername)}/post/${encodeURIComponent(parentShortcode)}/`
    },
    source: 'threads',
    embed_card: st.embed_card,
    provider: 'threads',
    media_pk: st.media_pk
  };
}

function biographyFromProfileUser(user: Record<string, unknown>): {
  text: string;
  facets: APIFacet[];
} {
  if (typeof user.biography === 'string' && user.biography.length > 0) {
    return { text: user.biography, facets: [] };
  }
  const tb = user.text_app_biography as Record<string, unknown> | undefined;
  if (tb?.text_fragments) {
    return textAndFacetsFromThreadsPost({
      caption: null,
      text_post_app_info: { text_fragments: tb.text_fragments }
    });
  }
  return { text: '', facets: [] };
}

export function userFromThreadsProfilePayload(user: Record<string, unknown>): APIUser | null {
  const id = String(user.pk ?? user.id ?? '');
  const username = String(user.username ?? '');
  if (!id || !username) return null;
  const { text, facets } = biographyFromProfileUser(user);
  const picHd = Array.isArray(user.hd_profile_pic_versions)
    ? (user.hd_profile_pic_versions as { url?: string }[])
        .map(x => x?.url)
        .filter(Boolean)
        .pop()
    : undefined;
  const pic =
    (typeof picHd === 'string' && picHd) ||
    (typeof user.profile_pic_url === 'string' ? user.profile_pic_url : null);
  const followers = pickInt(user.follower_count);
  return {
    type: 'profile',
    id,
    name: String(user.full_name ?? username),
    screen_name: username.replace(/^@/, ''),
    avatar_url: pic,
    banner_url: null,
    description: text,
    raw_description: { text, facets },
    location: '',
    url: `https://www.threads.com/@${encodeURIComponent(username.replace(/^@/, ''))}/`,
    protected: Boolean(user.text_post_app_is_private),
    followers,
    following: 0,
    statuses: 0,
    media_count: 0,
    likes: 0,
    joined: '1970-01-01T00:00:00.000Z',
    website: null,
    profile_embed: true,
    verification: {
      verified: Boolean(user.is_verified),
      type: user.is_verified ? 'individual' : null
    }
  };
}
