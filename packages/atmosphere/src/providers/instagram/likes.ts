import type { APIUserListResults } from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { fetchPrivateMediaLikers } from './private-api.js';
import { usersFromPrivateList } from './private-processor.js';
import { instagramShortcodeToPk } from './shortcode.js';

const empty = (code: number): APIUserListResults => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Accounts that liked a post — Instagram's closest analogue to X's repost/quote lists.
 *
 * Requires the account proxy (`media/{pk}/likers/` is logged-in only) and returns a single
 * un-paginated page, which is all Instagram serves for this surface.
 */
export async function constructInstagramStatusLikes(
  shortcode: string,
  options: { count: number; ctx?: InstagramRequestContext }
): Promise<APIUserListResults> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  let mediaId: string;
  try {
    mediaId = String(instagramShortcodeToPk(shortcode));
  } catch {
    return empty(400);
  }

  const res = await fetchPrivateMediaLikers(mediaId, options.ctx, { accounts, shortcode });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }
  return {
    code: 200,
    results: usersFromPrivateList(res.json).slice(0, count),
    cursor: { top: null, bottom: null }
  };
}
