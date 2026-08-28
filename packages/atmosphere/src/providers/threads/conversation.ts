import type { SocialConversation } from '../../types/api-status.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { fetchThreadsPostPage, fetchThreadsSession, type ThreadsSession } from './client.js';
import { decodeThreadsConversationCursor, encodeThreadsConversationCursor } from './cursors.js';
import { fetchThreadsPostReplies } from './private-api.js';
import {
  containingThreadChain,
  nextTokenFromThreadsFeed,
  replyRowsFromThreadsReplies
} from './private-processor.js';
import {
  buildThreadsTombstone,
  threadsPostToStatus,
  xdtThreadEdgeToSubstatus
} from './processor.js';
import { normalizeThreadsPostId, threadsShortcodeToMediaId } from './shortcode.js';

function extractPostPage(json: unknown): {
  edges: { node?: Record<string, unknown>; cursor?: string }[];
  page_info: { has_next_page?: boolean; end_cursor?: string | null };
} {
  const data = (json as { data?: { data?: Record<string, unknown> } })?.data?.data;
  if (!data || typeof data !== 'object') {
    return { edges: [], page_info: {} };
  }
  const edges = Array.isArray(data.edges)
    ? (data.edges as { node?: Record<string, unknown>; cursor?: string }[])
    : [];
  const pi = data.page_info as Record<string, unknown> | undefined;
  return {
    edges,
    page_info: {
      has_next_page: Boolean(pi?.has_next_page),
      end_cursor: typeof pi?.end_cursor === 'string' ? pi.end_cursor : null
    }
  };
}

export type ThreadsConversationResult =
  | { ok: true; data: SocialConversation }
  | { ok: false; message: string; data?: SocialConversation };

const conversationError = (code: number): SocialConversation => ({
  code,
  status: null,
  thread: null,
  replies: null,
  author: null,
  cursor: null
});

/**
 * Replies through the account proxy (`text_feed/{post_id}/replies/`), which is what the Threads app
 * itself calls. Logged-out `threads.com` truncates reply threads hard, so this is the better source
 * whenever credentials exist. Returns `null` when the proxy isn't configured or the call failed, so
 * the caller can fall back to the logged-out Relay connection.
 */
async function proxiedConversation(params: {
  mediaId: string;
  shortcode: string;
  count: number;
  sortOrder: 'top' | 'recent';
  pagingToken: string | null;
  ctx: ThreadsRequestContext;
}): Promise<SocialConversation | null> {
  const accounts = await resolveThreadsAccounts(params.ctx);
  if (!accounts.length) return null;

  const sortOrder = params.sortOrder === 'recent' ? 'all' : 'top';
  const res = await fetchThreadsPostReplies(params.mediaId, params.ctx, {
    accounts,
    sortOrder,
    count: params.count,
    pagingToken: params.pagingToken,
    shortcode: params.shortcode
  });
  if (!res.ok) {
    return res.status === 404 ? conversationError(404) : null;
  }

  const chain = containingThreadChain(res.json);
  if (!chain.length) return null;

  const owner = chain[0]?.user as Record<string, unknown> | undefined;
  const ownerFb = {
    id: String(owner?.pk ?? owner?.id ?? ''),
    username: String(owner?.username ?? ''),
    fullName: typeof owner?.full_name === 'string' ? owner.full_name : undefined,
    pic: typeof owner?.profile_pic_url === 'string' ? owner.profile_pic_url : null
  };

  const chainStatuses = chain
    .map(post => threadsPostToStatus(post, ownerFb))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (!chainStatuses.length) {
    return {
      ...conversationError(404),
      status: buildThreadsTombstone('unavailable', { id: params.shortcode })
    };
  }

  const status = chainStatuses[chainStatuses.length - 1]!;
  const threadPrefix = chainStatuses.length > 1 ? chainStatuses.slice(0, -1) : [];

  const replies = replyRowsFromThreadsReplies(res.json)
    .slice(0, params.count)
    .map(row => xdtThreadEdgeToSubstatus({ node: row }, params.shortcode, ownerFb.username))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const nextToken = nextTokenFromThreadsFeed(res.json);
  const bottom = nextToken
    ? encodeThreadsConversationCursor({
        v: 1,
        postId: params.mediaId,
        shortcode: params.shortcode,
        sort: params.sortOrder === 'recent' ? 'RECENT' : 'TOP',
        after: nextToken,
        count: params.count,
        src: 'proxy'
      })
    : null;

  return {
    code: 200,
    status,
    thread: threadPrefix.length ? threadPrefix : [status],
    replies,
    author: status.author,
    cursor: { bottom }
  };
}

export async function constructThreadsConversation(
  rawId: string,
  options: {
    cursor: string | null;
    count: number;
    sortOrder: 'top' | 'recent';
    userAgent?: string;
    ctx?: ThreadsRequestContext;
  }
): Promise<ThreadsConversationResult> {
  const shortcode = normalizeThreadsPostId(rawId);
  let mediaId: string;
  try {
    mediaId = threadsShortcodeToMediaId(shortcode);
  } catch {
    return { ok: false, message: 'Invalid post id' };
  }

  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const sortGraphql: 'TOP' | 'RECENT' = options.sortOrder === 'recent' ? 'RECENT' : 'TOP';

  const decodedCursor = options.cursor ? decodeThreadsConversationCursor(options.cursor) : null;
  if (options.cursor && (!decodedCursor || decodedCursor.shortcode !== shortcode)) {
    return { ok: false, message: 'Invalid cursor', data: conversationError(400) };
  }

  // A proxy cursor can only be replayed against the proxy, and vice versa.
  if (decodedCursor?.src !== 'gql') {
    const proxied = await proxiedConversation({
      mediaId,
      shortcode,
      count,
      sortOrder: options.sortOrder,
      pagingToken: decodedCursor?.after ?? null,
      ctx: { ...options.ctx, userAgent: options.ctx?.userAgent ?? options.userAgent }
    });
    if (proxied) {
      return { ok: true, data: proxied };
    }
    if (decodedCursor?.src === 'proxy') {
      // The cursor belongs to a source this request can no longer reach.
      return { ok: false, message: 'Invalid cursor', data: conversationError(400) };
    }
  }

  const session: ThreadsSession | null = await fetchThreadsSession(options.userAgent);
  if (!session) {
    return {
      ok: true,
      data: {
        code: 500,
        status: null,
        thread: null,
        replies: null,
        author: null,
        cursor: null
      }
    };
  }

  const after: string | null = decodedCursor?.after ?? null;

  const res = await fetchThreadsPostPage({
    mediaId,
    sortOrder: sortGraphql,
    after,
    first: count + 1,
    session,
    userAgent: options.userAgent
  });

  if (!res.ok || res.json == null) {
    return {
      ok: true,
      data: {
        code: res.status === 404 ? 404 : 500,
        status: null,
        thread: null,
        replies: null,
        author: null,
        cursor: null
      }
    };
  }

  const { edges, page_info } = extractPostPage(res.json);
  if (!edges.length) {
    return {
      ok: true,
      data: {
        code: 404,
        status: null,
        thread: null,
        replies: null,
        author: null,
        cursor: null
      }
    };
  }

  const focalNode = edges[0]?.node;
  const items = (focalNode?.thread_items as unknown[]) ?? [];
  const firstPost = (items[0] as { post?: Record<string, unknown> })?.post;
  const owner = firstPost?.user as Record<string, unknown> | undefined;
  const ownerFb = {
    id: String(owner?.pk ?? owner?.id ?? ''),
    username: String(owner?.username ?? ''),
    fullName: typeof owner?.full_name === 'string' ? owner.full_name : undefined,
    pic: typeof owner?.profile_pic_url === 'string' ? owner.profile_pic_url : null
  };

  const chainStatuses = items
    .map(it => {
      const p = (it as { post?: Record<string, unknown> }).post;
      return p ? threadsPostToStatus(p, ownerFb) : null;
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!chainStatuses.length) {
    return {
      ok: true,
      data: {
        code: 404,
        status: buildThreadsTombstone('unavailable', { id: shortcode }),
        thread: null,
        replies: null,
        author: null,
        cursor: null
      }
    };
  }

  const status = chainStatuses[chainStatuses.length - 1]!;
  const threadPrefix =
    chainStatuses.length > 1 ? chainStatuses.slice(0, -1) : ([] as typeof chainStatuses);

  const replyEdgesAll = edges.slice(1);
  const truncated = replyEdgesAll.length > count;
  const replyEdges = replyEdgesAll.slice(0, count);
  const replies = replyEdges
    .map(e => xdtThreadEdgeToSubstatus(e as Record<string, unknown>, shortcode, ownerFb.username))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const lastSurfacedEdge = replyEdges[replyEdges.length - 1];
  const lastSurfacedCursor =
    lastSurfacedEdge && typeof lastSurfacedEdge.cursor === 'string'
      ? lastSurfacedEdge.cursor
      : null;

  const hasNextPage = Boolean(page_info.has_next_page);
  let afterForBottom: string | null = null;
  if (hasNextPage) {
    if (!truncated && page_info.end_cursor) {
      afterForBottom = page_info.end_cursor;
    } else if (truncated && lastSurfacedCursor) {
      afterForBottom = lastSurfacedCursor;
    }
  }

  const bottom = afterForBottom
    ? encodeThreadsConversationCursor({
        v: 1,
        postId: mediaId,
        shortcode,
        sort: sortGraphql,
        after: afterForBottom,
        count,
        src: 'gql'
      })
    : null;

  return {
    ok: true,
    data: {
      code: 200,
      status,
      thread: threadPrefix.length ? threadPrefix : [status],
      replies,
      author: status.author,
      cursor: { bottom }
    }
  };
}
