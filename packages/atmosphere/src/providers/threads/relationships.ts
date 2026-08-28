import type { APIProfileRelationshipList } from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import {
  decodeThreadsTokenCursor,
  encodeThreadsTokenCursor,
  sameThreadsHandle
} from './cursors.js';
import { fetchThreadsFollowers, fetchThreadsFollowing } from './private-api.js';
import { nextTokenFromThreadsFeed, usersFromThreadsList } from './private-processor.js';
import { resolveThreadsUser } from './resolve-user.js';

export type ThreadsRelationshipKind = 'followers' | 'following';

const empty = (code: number): APIProfileRelationshipList => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Follower / following lists. Threads shares Instagram's social graph, so these come from
 * `friendships/{pk}/…` — a logged-in surface, hence the account proxy and a 501 without one.
 *
 * Results are *not* filtered to Threads-active accounts: the counts a Threads profile shows are
 * the Instagram follower counts, so filtering would make the list disagree with the profile.
 */
export async function constructThreadsRelationshipList(
  username: string,
  kind: ThreadsRelationshipKind,
  options: { count: number; cursor: string | null; ctx?: ThreadsRequestContext }
): Promise<APIProfileRelationshipList> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  const handle = username.replace(/^@/, '');
  let userId: string;
  let maxId: string | null = null;

  if (options.cursor) {
    const decoded = decodeThreadsTokenCursor(options.cursor, kind);
    if (!decoded || !sameThreadsHandle(decoded.u, handle)) {
      return empty(400);
    }
    userId = decoded.id;
    maxId = decoded.t;
  } else {
    const resolved = await resolveThreadsUser(handle, options.ctx, { accounts });
    if (resolved.code !== 200 || !resolved.user) {
      return empty(resolved.code);
    }
    userId = resolved.user.id;
  }

  const fetcher = kind === 'followers' ? fetchThreadsFollowers : fetchThreadsFollowing;
  const res = await fetcher(userId, options.ctx, { accounts, count, maxId, username: handle });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const results = usersFromThreadsList(res.json).slice(0, count);
  const nextToken = nextTokenFromThreadsFeed(res.json);
  const bottom = nextToken
    ? encodeThreadsTokenCursor({ v: 1, k: kind, id: userId, u: handle, t: nextToken, c: count })
    : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}
