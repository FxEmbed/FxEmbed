import type { SocialThread } from '../../types/api-status.js';
import { fetchThreadsPostPage, fetchThreadsSession } from './client.js';
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

export async function constructThreadsPost(
  rawId: string,
  userAgent: string | undefined
): Promise<SocialThread> {
  const shortcode = normalizeThreadsPostId(rawId);
  let mediaId: string;
  try {
    mediaId = threadsShortcodeToMediaId(shortcode);
  } catch {
    return { code: 400, status: null, thread: null, author: null };
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
  if (!edges.length) {
    return { code: 404, status: null, thread: null, author: null };
  }

  const focalNode = edges[0]?.node;
  if (!focalNode) {
    return { code: 404, status: null, thread: null, author: null };
  }

  const items = (focalNode.thread_items as unknown[]) ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return { code: 404, status: null, thread: null, author: null };
  }

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
      code: 404,
      status: buildThreadsTombstone('unavailable', { id: shortcode }),
      thread: null,
      author: null
    };
  }

  const status = chainStatuses[chainStatuses.length - 1]!;
  const threadPrefix =
    chainStatuses.length > 1 ? chainStatuses.slice(0, -1) : ([] as typeof chainStatuses);

  return {
    code: 200,
    status,
    thread: threadPrefix.length ? threadPrefix : [status],
    author: status.author
  };
}
