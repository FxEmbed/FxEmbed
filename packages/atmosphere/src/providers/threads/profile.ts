import type { APISearchResultsThreads, UserAPIResponse } from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import {
  fetchThreadsProfilePage,
  fetchThreadsProfileTimeline,
  fetchThreadsSession,
  fetchThreadsUserByUsername
} from './client.js';
import {
  decodeThreadsProfileTimelineCursor,
  decodeThreadsTokenCursor,
  encodeThreadsProfileTimelineCursor
} from './cursors.js';
import { constructThreadsProfileTab } from './profile-tabs.js';
import { threadsPostToStatus, userFromThreadsProfilePayload } from './processor.js';
import { resolveThreadsUser } from './resolve-user.js';

function userIdFromHovercard(json: unknown): string | null {
  const u = (json as { data?: { user?: Record<string, unknown> } })?.data?.user;
  if (!u || typeof u !== 'object') return null;
  return String(u.pk ?? u.id ?? '') || null;
}

function profileUserFromPage(json: unknown): Record<string, unknown> | null {
  const u = (json as { data?: { user?: Record<string, unknown> } })?.data?.user;
  if (!u || typeof u !== 'object') return null;
  return u;
}

function parseProfileTimeline(json: unknown): {
  edges: unknown[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
} {
  const md = (json as { data?: { mediaData?: Record<string, unknown> } })?.data?.mediaData;
  if (!md || typeof md !== 'object') {
    return { edges: [], page_info: { has_next_page: false, end_cursor: null } };
  }
  const edges = Array.isArray(md.edges) ? md.edges : [];
  const pi = md.page_info as Record<string, unknown> | undefined;
  return {
    edges,
    page_info: {
      has_next_page: Boolean(pi?.has_next_page),
      end_cursor: typeof pi?.end_cursor === 'string' ? pi.end_cursor : null
    }
  };
}

function postFromTimelineEdge(edge: unknown): Record<string, unknown> | null {
  const n = (edge as { node?: Record<string, unknown> })?.node;
  const items = n?.thread_items as unknown[] | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  const last = items[items.length - 1] as { post?: Record<string, unknown> };
  return last.post ?? null;
}

function cursorFromTimelineEdge(edge: unknown): string | null {
  const c = (edge as { cursor?: unknown })?.cursor;
  return typeof c === 'string' && c.length > 0 ? c : null;
}

/** Build up to `count` statuses and the Relay `after` cursor for the next page (no skipped edges). */
function profileTimelinePage(
  edges: unknown[],
  count: number,
  ownerFb: { id: string; username: string; pic: string | null },
  pageInfo: { has_next_page: boolean; end_cursor: string | null }
): {
  results: NonNullable<ReturnType<typeof threadsPostToStatus>>[];
  nextAfter: string | null;
} {
  const results: NonNullable<ReturnType<typeof threadsPostToStatus>>[] = [];
  let filledToCount = false;
  let innerAfter: string | null = null;

  for (const e of edges) {
    const post = postFromTimelineEdge(e);
    if (!post) continue;
    const s = threadsPostToStatus(post, ownerFb);
    if (!s) continue;
    results.push(s);
    if (results.length === count) {
      filledToCount = true;
      innerAfter = cursorFromTimelineEdge(e);
      break;
    }
  }

  let nextAfter: string | null = null;
  if (pageInfo.has_next_page && pageInfo.end_cursor) {
    if (filledToCount && innerAfter) {
      nextAfter = innerAfter;
    } else {
      nextAfter = pageInfo.end_cursor;
    }
  }

  return { results, nextAfter };
}

/**
 * Resolve a profile. With an account proxy configured this reads `users/{username}/usernameinfo/`,
 * which also covers accounts logged-out `threads.com` will not show; otherwise it falls back to the
 * logged-out hovercard + profile-page pair.
 */
export async function constructThreadsProfile(
  username: string,
  userAgent: string | undefined,
  ctx?: ThreadsRequestContext
): Promise<UserAPIResponse> {
  const requestCtx: ThreadsRequestContext = { ...ctx, userAgent: ctx?.userAgent ?? userAgent };
  const accounts = await resolveThreadsAccounts(requestCtx);
  if (accounts.length) {
    const resolved = await resolveThreadsUser(username, requestCtx, { accounts });
    if (resolved.code === 200 && resolved.user) {
      return { code: 200, message: 'OK', user: resolved.user };
    }
    if (resolved.code === 404) {
      return { code: 404, message: 'User not found' };
    }
  }

  const session = await fetchThreadsSession(userAgent);
  if (!session) {
    return { code: 500, message: 'Threads session failed' };
  }

  const hover = await fetchThreadsUserByUsername({
    username: username.replace(/^@/, ''),
    session,
    userAgent
  });
  if (!hover.ok || hover.json == null) {
    if (hover.status === 404) return { code: 404, message: 'User not found' };
    return { code: 500, message: 'Threads profile lookup failed' };
  }

  const userId = userIdFromHovercard(hover.json);
  if (!userId) {
    return { code: 404, message: 'User not found' };
  }

  const page = await fetchThreadsProfilePage({ userId, session, userAgent });
  if (!page.ok || page.json == null) {
    if (page.status === 404) return { code: 404, message: 'User not found' };
    return { code: 500, message: 'Threads profile page failed' };
  }

  const rec = profileUserFromPage(page.json);
  if (!rec) {
    return { code: 404, message: 'User not found' };
  }

  const user = userFromThreadsProfilePayload(rec);
  if (!user) {
    return { code: 404, message: 'User not found' };
  }
  return { code: 200, message: 'OK', user };
}

/**
 * A profile's main Threads tab.
 *
 * Prefers the account proxy, which serves the same rows the app sees; falls back to the logged-out
 * Relay connection. The two mint different cursors, so a page walk stays on whichever source
 * started it — a proxy cursor decodes only as a token cursor, and vice versa.
 */
export async function constructThreadsProfileStatuses(
  username: string,
  options: { count: number; cursor: string | null; userAgent?: string; ctx?: ThreadsRequestContext }
): Promise<APISearchResultsThreads> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const requestCtx: ThreadsRequestContext = {
    ...options.ctx,
    userAgent: options.ctx?.userAgent ?? options.userAgent
  };
  const isProxyCursor =
    options.cursor != null && decodeThreadsTokenCursor(options.cursor, 'threads') != null;
  if (options.cursor == null || isProxyCursor) {
    const proxied = await constructThreadsProfileTab(username, 'threads', {
      count,
      cursor: options.cursor,
      ctx: requestCtx
    });
    if (isProxyCursor) {
      // A proxy cursor means nothing to the logged-out connection, so this page walk is over
      // either way — 501 (proxy since removed) becomes a plain bad cursor.
      return proxied.code === 501
        ? { code: 400, results: [], cursor: { top: null, bottom: null } }
        : proxied;
    }
    // Fresh request: fall through to the logged-out path only when the proxy couldn't answer.
    if (proxied.code !== 501 && proxied.code !== 500) {
      return proxied;
    }
  }

  const session = await fetchThreadsSession(options.userAgent);
  if (!session) {
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  let userId: string;
  let after: string | null = null;
  let uname = username.replace(/^@/, '');

  if (options.cursor) {
    const cur = decodeThreadsProfileTimelineCursor(options.cursor);
    if (!cur) {
      return { code: 400, results: [], cursor: { top: null, bottom: null } };
    }
    userId = cur.userId;
    after = cur.after;
    uname = cur.username;
  } else {
    const hover = await fetchThreadsUserByUsername({
      username: uname,
      session,
      userAgent: options.userAgent
    });
    if (!hover.ok || hover.json == null) {
      if (hover.status === 404)
        return { code: 404, results: [], cursor: { top: null, bottom: null } };
      return { code: 500, results: [], cursor: { top: null, bottom: null } };
    }
    const id = userIdFromHovercard(hover.json);
    if (!id) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    userId = id;
  }

  const ownerFb = { id: userId, username: uname, pic: null as string | null };
  const tl = await fetchThreadsProfileTimeline({
    userId,
    first: count,
    after,
    session,
    userAgent: options.userAgent
  });
  if (!tl.ok || tl.json == null) {
    if (tl.status === 404) return { code: 404, results: [], cursor: { top: null, bottom: null } };
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const { edges, page_info } = parseProfileTimeline(tl.json);
  const { results, nextAfter } = profileTimelinePage(edges, count, ownerFb, page_info);

  const bottom =
    nextAfter != null
      ? encodeThreadsProfileTimelineCursor({
          v: 1,
          userId,
          username: uname,
          after: nextAfter,
          count
        })
      : null;

  return { code: 200, results, cursor: { top: null, bottom } };
}
