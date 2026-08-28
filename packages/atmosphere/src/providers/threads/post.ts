import type { SocialThread } from '../../types/api-status.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { fetchThreadsPostPage, fetchThreadsSession } from './client.js';
import { fetchThreadsSingleThread } from './private-api.js';
import { containingThreadChain } from './private-processor.js';
import { buildThreadsTombstone, threadsPostToStatus } from './processor.js';
import { normalizeThreadsPostId, threadsShortcodeToMediaId } from './shortcode.js';

function extractPostPageEdges(json: unknown): {
  edges: { node?: Record<string, unknown>; cursor?: string }[];
} {
  const root = json as { data?: { data?: { edges?: unknown[] } } };
  const edges = root?.data?.data?.edges;
  if (!Array.isArray(edges)) return { edges: [] };
  return { edges: edges as { node?: Record<string, unknown>; cursor?: string }[] };
}

const notFound = (): SocialThread => ({ code: 404, status: null, thread: null, author: null });

/** Owner details to fall back on for posts whose `user` block is trimmed down. */
function ownerFallbackFrom(chain: Record<string, unknown>[]): {
  id: string;
  username: string;
  fullName?: string;
  pic: string | null;
} {
  const owner = chain[0]?.user as Record<string, unknown> | undefined;
  return {
    id: String(owner?.pk ?? owner?.id ?? ''),
    username: String(owner?.username ?? ''),
    fullName: typeof owner?.full_name === 'string' ? owner.full_name : undefined,
    pic: typeof owner?.profile_pic_url === 'string' ? owner.profile_pic_url : null
  };
}

/**
 * A post's own self-reply chain becomes `thread`, with the last entry as the focal `status` —
 * the same convention the logged-out path has always used.
 */
function threadFromChain(chain: Record<string, unknown>[], shortcode: string): SocialThread {
  const ownerFb = ownerFallbackFrom(chain);
  const statuses = chain
    .map(post => threadsPostToStatus(post, ownerFb))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!statuses.length) {
    return {
      code: 404,
      status: buildThreadsTombstone('unavailable', { id: shortcode }),
      thread: null,
      author: null
    };
  }

  const status = statuses[statuses.length - 1]!;
  const prefix = statuses.length > 1 ? statuses.slice(0, -1) : [];
  return {
    code: 200,
    status,
    thread: prefix.length ? prefix : [status],
    author: status.author
  };
}

/**
 * Resolve a single Threads post.
 *
 * With an account proxy configured this reads `text_feed/{post_id}/single_thread/`, which the
 * Threads app itself uses and which serves posts logged-out `threads.com` withholds (age-gated
 * accounts, limited-audience posts). Otherwise — and whenever that call fails — it falls back to
 * the logged-out Relay query, so a deployment without credentials behaves exactly as before.
 */
export async function constructThreadsPost(
  rawId: string,
  userAgent: string | undefined,
  ctx?: ThreadsRequestContext
): Promise<SocialThread> {
  const shortcode = normalizeThreadsPostId(rawId);
  let mediaId: string;
  try {
    mediaId = threadsShortcodeToMediaId(shortcode);
  } catch {
    return { code: 400, status: null, thread: null, author: null };
  }

  const requestCtx: ThreadsRequestContext = { ...ctx, userAgent: ctx?.userAgent ?? userAgent };
  const accounts = await resolveThreadsAccounts(requestCtx);
  if (accounts.length) {
    const proxied = await fetchThreadsSingleThread(mediaId, requestCtx, { accounts });
    if (proxied.ok) {
      const chain = containingThreadChain(proxied.json);
      if (chain.length) {
        return threadFromChain(chain, shortcode);
      }
    }
    if (proxied.status === 404) {
      return notFound();
    }
  }

  const session = await fetchThreadsSession(userAgent);
  if (!session) {
    return { code: 500, status: null, thread: null, author: null };
  }

  const res = await fetchThreadsPostPage({
    mediaId,
    sortOrder: 'TOP',
    after: null,
    first: null,
    session,
    userAgent
  });
  if (!res.ok || res.json == null) {
    return { code: res.status === 404 ? 404 : 500, status: null, thread: null, author: null };
  }

  const { edges } = extractPostPageEdges(res.json);
  const focalNode = edges[0]?.node;
  if (!focalNode) {
    return notFound();
  }

  const items = focalNode.thread_items;
  if (!Array.isArray(items) || items.length === 0) {
    return notFound();
  }

  const chain = items
    .map(it => (it as { post?: Record<string, unknown> })?.post)
    .filter((p): p is Record<string, unknown> => Boolean(p));
  if (!chain.length) {
    return notFound();
  }

  return threadFromChain(chain, shortcode);
}
