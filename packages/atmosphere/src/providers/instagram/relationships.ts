import type { APIProfileRelationshipList } from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { decodeMaxIdCursor, encodeMaxIdCursor, sameInstagramHandle } from './cursors.js';
import { fetchPrivateFollowers, fetchPrivateFollowing } from './private-api.js';
import { nextMaxIdFromPrivateResponse, usersFromPrivateList } from './private-processor.js';
import { resolveInstagramUser } from './resolve-user.js';

export type InstagramRelationshipKind = 'followers' | 'following';

const empty = (code: number): APIProfileRelationshipList => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Follower / following lists. Instagram only exposes these to a logged-in session, so this needs an
 * account proxy; without one it reports 501 rather than pretending the account has no followers.
 */
export async function constructInstagramRelationshipList(
  username: string,
  kind: InstagramRelationshipKind,
  options: { count: number; cursor: string | null; ctx?: InstagramRequestContext }
): Promise<APIProfileRelationshipList> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  let userId: string;
  let maxId: string | null = null;
  if (options.cursor) {
    const decoded = decodeMaxIdCursor(options.cursor);
    if (!decoded || decoded.k !== kind || !sameInstagramHandle(decoded.u, username)) {
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

  const fetcher = kind === 'followers' ? fetchPrivateFollowers : fetchPrivateFollowing;
  const res = await fetcher(userId, options.ctx, { accounts, count, maxId, username });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const results = usersFromPrivateList(res.json).slice(0, count);
  const nextMaxId = nextMaxIdFromPrivateResponse(res.json);
  const bottom = nextMaxId
    ? encodeMaxIdCursor({ v: 1, k: kind, id: userId, u: username, m: nextMaxId, c: count })
    : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}
