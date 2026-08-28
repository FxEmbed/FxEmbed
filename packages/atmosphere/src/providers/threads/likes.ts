import type { APIUserListResults } from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { fetchThreadsMediaLikers } from './private-api.js';
import { usersFromThreadsList } from './private-processor.js';
import { normalizeThreadsPostId, threadsShortcodeToMediaId } from './shortcode.js';

const empty = (code: number): APIUserListResults => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Accounts that liked a post — Threads' analogue of X's like list.
 *
 * `media/{pk}/likers/` is logged-in only, so this needs the account proxy and returns a single
 * un-paginated page, which is all the endpoint serves.
 */
export async function constructThreadsStatusLikes(
  rawId: string,
  options: { count: number; ctx?: ThreadsRequestContext }
): Promise<APIUserListResults> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  const shortcode = normalizeThreadsPostId(rawId);
  let mediaId: string;
  try {
    mediaId = threadsShortcodeToMediaId(shortcode);
  } catch {
    return empty(400);
  }

  const res = await fetchThreadsMediaLikers(mediaId, options.ctx, { accounts, shortcode });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }
  return {
    code: 200,
    results: usersFromThreadsList(res.json).slice(0, count),
    cursor: { top: null, bottom: null }
  };
}
