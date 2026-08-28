import type { APIUser } from '../../types/api-schemas.js';

/**
 * Normalizers for `i.instagram.com/api/v1` payloads. Media items from the private API already match
 * the shape `instagramNodeToStatus` handles (`code`, `user`, `media_type`, `video_versions`,
 * `carousel_media`, `caption.text`, `taken_at`), so only users and pagination need their own mapping.
 */

function num(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return 0;
}

function str(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/**
 * Map one private-API user record to {@link APIUser}. Handles both the full record from
 * `usernameinfo` / `users/{pk}/info` and the trimmed record in follower / search lists (which omits
 * counts — those come back as 0 rather than being invented).
 */
export function userFromPrivateRecord(rec: Record<string, unknown>): APIUser | null {
  const id = str(rec.pk_id, typeof rec.pk === 'number' ? String(rec.pk) : rec.pk, rec.id);
  const username = str(rec.username);
  if (!id || !username) return null;
  const bio = typeof rec.biography === 'string' ? rec.biography : '';
  const isVerified = Boolean(rec.is_verified);
  const isPrivate = Boolean(rec.is_private);
  const externalUrl = str(rec.external_url);
  const hdProfilePic = (rec.hd_profile_pic_url_info as { url?: string } | undefined)?.url;
  return {
    type: 'profile',
    id,
    name: str(rec.full_name) || username,
    screen_name: username,
    avatar_url: str(hdProfilePic, rec.profile_pic_url, rec.profile_pic_url_hd) || null,
    banner_url: null,
    description: bio,
    raw_description: { text: bio, facets: [] },
    location: str(
      (rec.address_street as string | undefined) ?? undefined,
      (rec.city_name as string | undefined) ?? undefined
    ),
    url: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    protected: isPrivate,
    followers: num(rec.follower_count),
    following: num(rec.following_count),
    statuses: num(rec.media_count),
    media_count: num(rec.media_count),
    likes: 0,
    joined: '1970-01-01T00:00:00.000Z',
    website: externalUrl
      ? { url: externalUrl, display_url: externalUrl.replace(/^https?:\/\//, '') }
      : null,
    verification: {
      verified: isVerified,
      type: isVerified ? 'individual' : null
    }
  };
}

/** Pull `{ user: … }` out of `usernameinfo` / `users/{pk}/info` and map it. */
export function userFromPrivateUserResponse(json: unknown): APIUser | null {
  if (!json || typeof json !== 'object') return null;
  const user = (json as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  return userFromPrivateRecord(user as Record<string, unknown>);
}

/** Map a private-API `users` array (follower lists, `users/search/`) to {@link APIUser}s. */
export function usersFromPrivateList(json: unknown): APIUser[] {
  if (!json || typeof json !== 'object') return [];
  const users = (json as { users?: unknown }).users;
  if (!Array.isArray(users)) return [];
  const out: APIUser[] = [];
  for (const u of users) {
    if (!u || typeof u !== 'object') continue;
    const mapped = userFromPrivateRecord(u as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * The private API paginates with `next_max_id`, which is a string on feeds and (on some list
 * endpoints) a number or a `{ next_max_id }`-shaped object. `big_list: false` means "no more pages"
 * on friendship lists even when a cursor is echoed back.
 */
export function nextMaxIdFromPrivateResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  if (root.more_available === false) return null;
  if (root.big_list === false) return null;
  if (root.has_more_comments === false) return null;
  const raw = root.next_max_id;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (raw && typeof raw === 'object') {
    const nested = (raw as { next_max_id?: unknown }).next_max_id;
    if (typeof nested === 'string' && nested.length > 0) return nested;
    if (typeof nested === 'number' && Number.isFinite(nested)) return String(nested);
  }
  return null;
}

/** Media items from a private-API feed response (`items`), tolerating `{ media: … }` wrappers. */
export function mediaItemsFromPrivateFeed(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== 'object') return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    // `usertags/{pk}/feed/` wraps each entry as `{ media: … }`.
    const media = rec.media;
    if (media && typeof media === 'object' && !Array.isArray(media)) {
      out.push(media as Record<string, unknown>);
      continue;
    }
    out.push(rec);
  }
  return out;
}
