import type {
  APIInstagramStatus,
  APISubstatus,
  APIUser,
  APIVideo,
  APIPhoto
} from '../../types/api-schemas.js';
import { parseDashPresentationDurationSec } from './extractors.js';

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

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/** Instagram media_type: 1 photo, 2 video, 8 carousel. */
function isVideoNode(node: Record<string, unknown>): boolean {
  if (node.media_type === 2) return true;
  if (Boolean(node.is_video) || node.__typename === 'GraphVideo') return true;
  if (typeof node.__typename === 'string' && node.__typename.includes('Video')) return true;
  if (Array.isArray(node.video_versions) && node.video_versions.length > 0) return true;
  if (typeof node.video_url === 'string' && node.video_url.length > 0) return true;
  return false;
}

function displayImageUrl(node: Record<string, unknown>): string {
  return pickString(
    node.display_url,
    node.display_uri,
    node.display_src,
    (node.image_versions2 as { candidates?: { url?: string }[] } | undefined)?.candidates?.[0]?.url
  );
}

function pickBestVideoVersion(
  versions: { url?: string; width?: number; height?: number; type?: number }[] | undefined
): { url: string; width: number; height: number } | null {
  if (!versions?.length) return null;
  // Prefer entries with dimensions; otherwise first URL (polaris often omits width/height).
  let best: { url: string; width: number; height: number } | null = null;
  for (const v of versions) {
    if (typeof v?.url !== 'string' || !v.url) continue;
    const w = pickInt(v.width);
    const h = pickInt(v.height);
    const candidate = { url: v.url, width: w, height: h };
    if (!best) {
      best = candidate;
      continue;
    }
    const bestArea = best.width * best.height;
    const area = w * h;
    if (area > bestArea) best = candidate;
  }
  return best;
}

function videoDurationSec(node: Record<string, unknown>): number {
  const durRaw = pickFloat(node.video_duration);
  if (Number.isFinite(durRaw) && durRaw > 0) return durRaw;
  const fromDash = parseDashPresentationDurationSec(
    typeof node.video_dash_manifest === 'string' ? node.video_dash_manifest : undefined
  );
  return Number.isFinite(fromDash) ? fromDash : 0;
}

function isoFromUnix(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return new Date(0).toISOString();
  return new Date(sec * 1000).toISOString();
}

export function captionFromMedia(node: Record<string, unknown>): string {
  const cap = node.caption;
  if (cap && typeof cap === 'object' && typeof (cap as { text?: unknown }).text === 'string') {
    return (cap as { text: string }).text;
  }
  const em = node.edge_media_to_caption;
  if (em && typeof em === 'object') {
    const edges = (em as { edges?: unknown[] }).edges;
    const n0 = edges?.[0] as { node?: { text?: string } } | undefined;
    if (n0?.node?.text) return n0.node.text;
  }
  return '';
}

export function stubAuthorFromIg(
  id: string,
  username: string,
  fullName: string | undefined,
  avatarUrl: string | null,
  verified: boolean
): APIUser {
  return {
    type: 'profile',
    id,
    name: fullName ?? username,
    screen_name: username,
    avatar_url: avatarUrl,
    banner_url: null,
    description: '',
    raw_description: { text: '', facets: [] },
    location: '',
    url: `https://www.instagram.com/${encodeURIComponent(username)}/`,
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

export function fullUserFromWebProfile(d: Record<string, unknown>): APIUser | null {
  const u = d.data;
  if (!u || typeof u !== 'object') return null;
  const user = (u as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  const rec = user as Record<string, unknown>;
  const id = String(rec.id ?? rec.pk ?? '');
  const username = String(rec.username ?? '');
  if (!id || !username) return null;
  const bio = typeof rec.biography === 'string' ? rec.biography : '';
  const edgeFollowed = rec.edge_followed_by as { count?: number } | undefined;
  const edgeFollow = rec.edge_follow as { count?: number } | undefined;
  const edgeMedia = rec.edge_owner_to_timeline_media as { count?: number } | undefined;
  const pic =
    typeof rec.profile_pic_url_hd === 'string'
      ? rec.profile_pic_url_hd
      : typeof rec.profile_pic_url === 'string'
        ? rec.profile_pic_url
        : null;
  const isVerified = Boolean(rec.is_verified);
  const isPrivate = Boolean(rec.is_private);
  return {
    type: 'profile',
    id,
    name: String(rec.full_name ?? username),
    screen_name: username,
    avatar_url: pic,
    banner_url: null,
    description: bio,
    raw_description: { text: bio, facets: [] },
    location: '',
    url: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    protected: isPrivate,
    followers: pickInt(edgeFollowed?.count),
    following: pickInt(edgeFollow?.count),
    statuses: pickInt(edgeMedia?.count),
    media_count: pickInt(rec.media_count, edgeMedia?.count),
    likes: 0,
    joined: '1970-01-01T00:00:00.000Z',
    website:
      typeof rec.external_url === 'string' && rec.external_url.length > 0
        ? { url: rec.external_url, display_url: rec.external_url.replace(/^https?:\/\//, '') }
        : null,
    verification: {
      verified: isVerified,
      type: isVerified ? 'individual' : null
    }
  };
}

function permalinkForNode(node: Record<string, unknown>, shortcode: string): string {
  const pt = node.product_type;
  // Clips/reels use /reel/; feed videos and carousels use /p/.
  if (pt === 'clips') {
    return `https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/`;
  }
  return `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`;
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

function mediaPkFromNode(node: Record<string, unknown>): string | undefined {
  const pk = node.pk;
  if (typeof pk === 'string' || typeof pk === 'number') {
    const part = String(pk).split('_')[0];
    return part || String(pk);
  }
  const id = node.id;
  if (typeof id === 'string') {
    return id.split('_')[0] || id;
  }
  return undefined;
}

/**
 * Normalize an Instagram timeline / polaris / web_info media node into API v2 status.
 * Polaris product media (yt-dlp `_extract_product`) uses `code`, `user`, `media_type`,
 * `video_versions`, and `display_uri` rather than GraphQL `shortcode` / `owner` / `is_video`.
 */
export function instagramNodeToStatus(
  node: Record<string, unknown>,
  ownerFallback: { id: string; username: string; fullName?: string; pic?: string | null }
): APIInstagramStatus | null {
  const shortcode =
    (typeof node.shortcode === 'string' && node.shortcode) ||
    (typeof node.code === 'string' && node.code) ||
    '';
  if (!shortcode) return null;
  const owner =
    (node.user as Record<string, unknown> | undefined) ??
    (node.owner as Record<string, unknown> | undefined) ??
    {};
  const oid = String(owner.pk ?? owner.id ?? ownerFallback.id);
  const ouser = String(owner.username ?? ownerFallback.username);
  const oname = typeof owner.full_name === 'string' ? owner.full_name : ownerFallback.fullName;
  const opic =
    pickString(owner.profile_pic_url, owner.profile_image_uri) || (ownerFallback.pic ?? null);
  const author = stubAuthorFromIg(oid, ouser, oname, opic || null, Boolean(owner.is_verified));
  const takenRaw = pickInt(
    node.taken_at_timestamp,
    node.taken_at,
    (node as { device_timestamp?: number }).device_timestamp
  );
  const taken = takenRaw > 0 ? takenRaw : 0;
  const likes = pickInt(
    (node.edge_liked_by as { count?: number } | undefined)?.count,
    (node.edge_media_preview_like as { count?: number } | undefined)?.count,
    node.like_count
  );
  const replies = pickInt(
    (node.edge_media_to_comment as { count?: number } | undefined)?.count,
    node.comment_count
  );
  const text = captionFromMedia(node);
  const dims = (node.dimensions as { width?: number; height?: number } | undefined) ?? {};
  const w = pickInt(dims.width, node.original_width);
  const h = pickInt(dims.height, node.original_height);
  const photos: APIPhoto[] = [];
  const videos: APIVideo[] = [];
  const all: (APIPhoto | APIVideo)[] = [];
  const carousel = node.carousel_media;
  if (Array.isArray(carousel) && carousel.length > 0) {
    for (const slide of carousel) {
      if (!slide || typeof slide !== 'object') continue;
      const s = slide as Record<string, unknown>;
      if (isVideoNode(s)) {
        const best = pickBestVideoVersion(
          s.video_versions as { url?: string; width?: number; height?: number; type?: number }[]
        );
        const url = pickString(s.video_url, best?.url);
        if (url) {
          const v = buildVideo(
            url,
            pickInt(s.original_width, best?.width, w),
            pickInt(s.original_height, best?.height, h),
            videoDurationSec(s),
            displayImageUrl(s) || undefined
          );
          videos.push(v);
          all.push(v);
        }
      } else {
        const img = displayImageUrl(s);
        if (img) {
          const p = buildPhoto(img, pickInt(s.original_width, w), pickInt(s.original_height, h));
          photos.push(p);
          all.push(p);
        }
      }
    }
  } else if (isVideoNode(node)) {
    const best = pickBestVideoVersion(
      node.video_versions as { url?: string; width?: number; height?: number; type?: number }[]
    );
    const url = pickString(node.video_url, best?.url);
    if (url) {
      const thumb = displayImageUrl(node) || undefined;
      const v = buildVideo(
        url,
        pickInt(best?.width, w),
        pickInt(best?.height, h),
        videoDurationSec(node),
        thumb
      );
      // When polaris omits version dimensions, fall back to original_* / image candidate size.
      if ((v.width <= 1 || v.height <= 1) && (w > 0 || h > 0)) {
        v.width = w || v.width;
        v.height = h || v.height;
        if (v.formats[0]) {
          v.formats[0].width = v.width || undefined;
          v.formats[0].height = v.height || undefined;
        }
      }
      videos.push(v);
      all.push(v);
    }
  } else {
    const img = displayImageUrl(node);
    const cand = (
      node.image_versions2 as
        { candidates?: { url?: string; width?: number; height?: number }[] } | undefined
    )?.candidates?.[0];
    if (img) {
      const p = buildPhoto(img, pickInt(cand?.width, w), pickInt(cand?.height, h));
      photos.push(p);
      all.push(p);
    }
  }
  const mediaPk = mediaPkFromNode(node);
  return {
    type: 'status',
    id: shortcode,
    url: permalinkForNode(node, shortcode),
    text,
    created_at: isoFromUnix(taken),
    created_timestamp: taken,
    likes,
    reposts: 0,
    replies,
    author,
    media: {
      photos: photos.length ? photos : undefined,
      videos: videos.length ? videos : undefined,
      all: all.length ? all : undefined
    },
    raw_text: { text, facets: [] },
    lang: null,
    possibly_sensitive: false,
    replying_to: null,
    source: 'instagram',
    embed_card: 'player',
    provider: 'instagram',
    media_pk: mediaPk
  };
}

export function edgeNodeToStatus(
  edge: unknown,
  ownerFallback: { id: string; username: string; fullName?: string; pic?: string | null }
): APIInstagramStatus | null {
  if (!edge || typeof edge !== 'object') return null;
  const n = (edge as { node?: unknown }).node;
  if (!n || typeof n !== 'object') return null;
  return instagramNodeToStatus(n as Record<string, unknown>, ownerFallback);
}

export function commentRecordToSubstatus(
  node: Record<string, unknown>,
  parentShortcode: string,
  parentAuthorScreenName: string
): APISubstatus | null {
  const pk = String(node.pk ?? node.id ?? '');
  if (!pk) return null;
  const user = (node.user as Record<string, unknown> | undefined) ?? {};
  const uid = String(user.pk ?? user.id ?? '');
  const uname = String(user.username ?? 'unknown');
  const text = typeof node.text === 'string' ? node.text : '';
  const created = pickInt(node.created_at, node.created_at_utc);
  const createdTs = created > 0 ? created : 0;
  const likes = pickInt(
    (node.edge_liked_by as { count?: number } | undefined)?.count,
    node.comment_like_count
  );
  const author = stubAuthorFromIg(
    uid,
    uname,
    typeof user.full_name === 'string' ? user.full_name : undefined,
    typeof user.profile_pic_url === 'string' ? user.profile_pic_url : null,
    Boolean(user.is_verified)
  );
  const url = `https://www.instagram.com/p/${encodeURIComponent(parentShortcode)}/c/${encodeURIComponent(pk)}/`;
  return {
    type: 'substatus',
    parent_id: parentShortcode,
    id: pk,
    url,
    text,
    created_at: isoFromUnix(createdTs),
    created_timestamp: createdTs,
    likes,
    reposts: 0,
    replies: 0,
    author,
    raw_text: { text, facets: [] },
    lang: null,
    possibly_sensitive: false,
    replying_to: {
      screen_name: parentAuthorScreenName,
      status: parentShortcode,
      url: `https://www.instagram.com/p/${encodeURIComponent(parentShortcode)}/`
    },
    source: 'instagram',
    provider: 'instagram'
  };
}

export function mapCommentEdges(
  edges: unknown[] | undefined,
  parentShortcode: string,
  parentAuthorScreenName: string
): APISubstatus[] {
  if (!edges?.length) return [];
  const out: APISubstatus[] = [];
  for (const e of edges) {
    if (!e || typeof e !== 'object') continue;
    const n = (e as { node?: unknown }).node;
    if (!n || typeof n !== 'object') continue;
    const s = commentRecordToSubstatus(
      n as Record<string, unknown>,
      parentShortcode,
      parentAuthorScreenName
    );
    if (s) out.push(s);
  }
  return out;
}

/** Parse `data` from GraphQL comment pagination (`PolarisPostCommentsPaginationQuery`). */
export function extractCommentsFromGraphqlJson(json: unknown): {
  edges: unknown[];
  page_info: { has_next_page?: boolean; end_cursor?: string | null };
} | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const buckets: unknown[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    const r = o as Record<string, unknown>;
    if ('edges' in r && 'page_info' in r && Array.isArray(r.edges)) {
      buckets.push(o);
    }
    for (const v of Object.values(r)) walk(v);
  };
  walk(data);
  for (const b of buckets) {
    const o = b as { edges: unknown[]; page_info: Record<string, unknown> };
    if (o.edges.some(e => e && typeof e === 'object' && 'node' in (e as object))) {
      const pi = o.page_info ?? {};
      return {
        edges: o.edges,
        page_info: {
          has_next_page: Boolean(pi.has_next_page),
          end_cursor: typeof pi.end_cursor === 'string' ? pi.end_cursor : null
        }
      };
    }
  }
  return null;
}
