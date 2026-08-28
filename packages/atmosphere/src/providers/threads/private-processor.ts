import type { APIThreadsStatus, APIUser } from '../../types/api-schemas.js';
import { threadsPostToStatus } from './processor.js';

/**
 * Normalizers for the Threads slice of `i.instagram.com/api/v1`.
 *
 * The `post` records these endpoints return are the same objects the logged-out `threads.com`
 * GraphQL wraps (`xdt_api__v1__text_feed__…` is a thin proxy over exactly these routes), so
 * {@link threadsPostToStatus} already understands them. Only the envelope — how rows are nested and
 * how pages are chained — differs, and that is what lives here.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Rows arrive under a handful of keys depending on the surface: `items` on profile tabs,
 * `reply_threads` on a post's replies, `media` on search. Each row is either a thread
 * (`{ thread_items: [{ post }] }`) or a bare post.
 */
function feedRows(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) return [];
  for (const key of ['items', 'reply_threads', 'media', 'results', 'threads']) {
    const value = json[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

/**
 * The post a row should be represented by. A thread row carries the whole chain in `thread_items`;
 * the last item is the one the app renders as the row (earlier items are the "show more" context),
 * matching how the logged-out timeline path already picks its status.
 */
function postFromRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const items = row.thread_items;
  if (Array.isArray(items) && items.length > 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (isRecord(item) && isRecord(item.post)) return item.post;
    }
    return null;
  }
  if (isRecord(row.post)) return row.post;
  if (isRecord(row.media)) return row.media;
  // Search rows can be bare media objects.
  return typeof row.code === 'string' || typeof row.pk === 'string' || typeof row.pk === 'number'
    ? row
    : null;
}

/** Every `post` in a thread row, oldest first — the self-reply chain above a focal post. */
export function threadChainFromRow(row: Record<string, unknown>): Record<string, unknown>[] {
  const items = row.thread_items;
  if (!Array.isArray(items)) {
    const single = postFromRow(row);
    return single ? [single] : [];
  }
  const out: Record<string, unknown>[] = [];
  for (const item of items) {
    if (isRecord(item) && isRecord(item.post)) out.push(item.post);
  }
  return out;
}

/** Map a private-API Threads feed page to statuses, dropping rows that can't be rendered. */
export function statusesFromThreadsFeed(
  json: unknown,
  ownerFallback: { id: string; username: string; fullName?: string; pic?: string | null }
): APIThreadsStatus[] {
  const out: APIThreadsStatus[] = [];
  for (const row of feedRows(json)) {
    const post = postFromRow(row);
    if (!post) continue;
    const status = threadsPostToStatus(post, ownerFallback);
    if (status) out.push(status);
  }
  return out;
}

/** Thread rows with their chains intact, for surfaces that render context above the row. */
export function threadRowsFromThreadsFeed(json: unknown): Record<string, unknown>[][] {
  return feedRows(json)
    .map(threadChainFromRow)
    .filter(chain => chain.length > 0);
}

/**
 * Next-page token for a Threads feed.
 *
 * Profile tabs and reply lists paginate with `paging_tokens.downwards`; the shared Instagram feed
 * routes still answer with `next_max_id`; search uses `page_token`. `has_more: false` (or
 * `more_available: false`) ends the walk even when a token is echoed back.
 */
export function nextTokenFromThreadsFeed(json: unknown): string | null {
  if (!isRecord(json)) return null;
  if (json.has_more === false) return null;
  if (json.more_available === false) return null;
  const pagingTokens = json.paging_tokens;
  if (isRecord(pagingTokens)) {
    const down = pagingTokens.downwards;
    if (typeof down === 'string' && down.length > 0) return down;
  }
  for (const key of ['next_max_id', 'page_token', 'next_page_token', 'paging_token']) {
    const raw = json[key];
    if (typeof raw === 'string' && raw.length > 0) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  }
  return null;
}

/** `rank_token` echoed by search, which the app replays on every subsequent page. */
export function rankTokenFromThreadsSearch(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const raw = json.rank_token;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Users out of a Threads-flavoured list. These records are Instagram user records with the extra
 * `is_active_on_text_post_app` / `has_onboarded_to_text_post_app` flags, so profile URLs point at
 * `threads.com` rather than `instagram.com`.
 */
export function usersFromThreadsList(
  json: unknown,
  options: { threadsOnly?: boolean } = {}
): APIUser[] {
  if (!isRecord(json)) return [];
  const users = json.users;
  if (!Array.isArray(users)) return [];
  const out: APIUser[] = [];
  for (const raw of users) {
    if (!isRecord(raw)) continue;
    if (options.threadsOnly && !isThreadsUser(raw)) continue;
    const mapped = threadsUserFromPrivateRecord(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Whether an Instagram user record belongs to someone who actually uses Threads. */
export function isThreadsUser(rec: Record<string, unknown>): boolean {
  return Boolean(rec.is_active_on_text_post_app) || Boolean(rec.has_onboarded_to_text_post_app);
}

const num = (...vals: unknown[]): number => {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return 0;
};

const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
};

/** Map one private-API user record to an {@link APIUser} pointing at Threads. */
export function threadsUserFromPrivateRecord(rec: Record<string, unknown>): APIUser | null {
  const id = str(rec.pk_id, typeof rec.pk === 'number' ? String(rec.pk) : rec.pk, rec.id);
  const username = str(rec.username);
  if (!id || !username) return null;
  const bio = typeof rec.biography === 'string' ? rec.biography : '';
  const isVerified = Boolean(rec.is_verified);
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
    location: '',
    url: `https://www.threads.com/@${encodeURIComponent(username)}/`,
    // Threads privacy is its own flag; `is_private` is the Instagram account's.
    protected: Boolean(rec.text_post_app_is_private ?? rec.is_private),
    followers: num(rec.follower_count),
    following: num(rec.following_count),
    statuses: 0,
    media_count: 0,
    likes: 0,
    joined: '1970-01-01T00:00:00.000Z',
    website: externalUrl
      ? { url: externalUrl, display_url: externalUrl.replace(/^https?:\/\//, '') }
      : null,
    profile_embed: true,
    verification: {
      verified: isVerified,
      type: isVerified ? 'individual' : null
    }
  };
}

/**
 * The focal post's own chain out of a `single_thread` / `replies` response.
 *
 * Both routes wrap the post being viewed in `containing_thread`; older payloads put it first in
 * `items` instead, so that is the fallback.
 */
export function containingThreadChain(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) return [];
  const containing = json.containing_thread;
  if (isRecord(containing)) {
    const chain = threadChainFromRow(containing);
    if (chain.length) return chain;
  }
  const rows = feedRows(json);
  return rows.length ? threadChainFromRow(rows[0]!) : [];
}

/** Reply thread rows out of a `text_feed/{post_id}/replies/` response, newest page first. */
export function replyRowsFromThreadsReplies(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) return [];
  const replies = json.reply_threads;
  if (Array.isArray(replies)) return replies.filter(isRecord);
  // Some payloads fold the focal post into `items` and list replies after it.
  const rows = feedRows(json);
  return rows.length > 1 ? rows.slice(1) : [];
}
