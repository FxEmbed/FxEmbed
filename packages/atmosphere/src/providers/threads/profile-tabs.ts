import type { APISearchResultsThreads } from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import {
  decodeThreadsTokenCursor,
  encodeThreadsTokenCursor,
  sameThreadsHandle
} from './cursors.js';
import { fetchThreadsProfileFeed, type ThreadsProfileTab } from './private-api.js';
import { nextTokenFromThreadsFeed, statusesFromThreadsFeed } from './private-processor.js';
import { resolveThreadsUser } from './resolve-user.js';

export type { ThreadsProfileTab };

const empty = (code: number): APISearchResultsThreads => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * A profile's Replies / Reposts / Media tab.
 *
 * Logged-out `threads.com` only serves the main Threads tab, so these need the account proxy;
 * without one they report 501 rather than pretending the tab is empty. The main tab keeps its
 * logged-out path — see `constructThreadsProfileStatuses` in `profile.ts`.
 */
export async function constructThreadsProfileTab(
  username: string,
  tab: ThreadsProfileTab,
  options: { count: number; cursor: string | null; ctx?: ThreadsRequestContext }
): Promise<APISearchResultsThreads> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  const handle = username.replace(/^@/, '');
  let userId: string;
  let maxId: string | null = null;

  if (options.cursor) {
    const decoded = decodeThreadsTokenCursor(options.cursor, tab);
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

  const res = await fetchThreadsProfileFeed(userId, tab, options.ctx, {
    accounts,
    maxId,
    username: handle
  });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const results = statusesFromThreadsFeed(res.json, {
    id: userId,
    username: handle,
    pic: null
  }).slice(0, count);

  const nextToken = nextTokenFromThreadsFeed(res.json);
  const bottom = nextToken
    ? encodeThreadsTokenCursor({ v: 1, k: tab, id: userId, u: handle, t: nextToken, c: count })
    : null;

  return { code: 200, results, cursor: { top: null, bottom } };
}
