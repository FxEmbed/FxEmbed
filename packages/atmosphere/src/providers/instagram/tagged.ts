import type { APIInstagramStatus, APISearchResultsInstagram } from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { decodeMaxIdCursor, encodeMaxIdCursor, sameInstagramHandle } from './cursors.js';
import { fetchPrivateUserTaggedFeed } from './private-api.js';
import { mediaItemsFromPrivateFeed, nextMaxIdFromPrivateResponse } from './private-processor.js';
import { instagramNodeToStatus } from './processor.js';
import { resolveInstagramUser } from './resolve-user.js';

const empty = (code: number): APISearchResultsInstagram => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Posts an account is tagged in (`usertags/{pk}/feed/`) — the closest analogue to X's
 * `/profile/{handle}/media` for a third-party grid. Logged-in only, so this needs the account proxy.
 */
export async function constructInstagramProfileTagged(
  username: string,
  options: { count: number; cursor: string | null; ctx?: InstagramRequestContext }
): Promise<APISearchResultsInstagram> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  let userId: string;
  let maxId: string | null = null;
  if (options.cursor) {
    const decoded = decodeMaxIdCursor(options.cursor);
    if (!decoded || decoded.k !== 'tagged' || !sameInstagramHandle(decoded.u, username)) {
      return empty(400);
    }
    userId = decoded.id;
    maxId = decoded.m;
  } else {
    const resolved = await resolveInstagramUser(username, options.ctx, { accounts });
    if (resolved.code !== 200 || !resolved.user) {
      return empty(resolved.code);
    }
    userId = resolved.user.id;
  }

  const res = await fetchPrivateUserTaggedFeed(userId, options.ctx, {
    accounts,
    count,
    maxId,
    username
  });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const ownerFallback = { id: userId, username };
  const results: APIInstagramStatus[] = [];
  for (const item of mediaItemsFromPrivateFeed(res.json).slice(0, count)) {
    const status = instagramNodeToStatus(item, ownerFallback, {
      userAgent: options.ctx?.userAgent
    });
    if (status) results.push(status);
  }

  const nextMaxId = nextMaxIdFromPrivateResponse(res.json);
  const bottom = nextMaxId
    ? encodeMaxIdCursor({ v: 1, k: 'tagged', id: userId, u: username, m: nextMaxId, c: count })
    : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}
