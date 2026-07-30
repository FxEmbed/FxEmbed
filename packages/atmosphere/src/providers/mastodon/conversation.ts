import type {
  APIMastodonStatus,
  SocialConversationMastodon,
  SocialStatusMastodon,
  SocialThreadMastodon
} from '../../types/api-schemas.js';
import { fetchStatus, fetchStatusContext } from './client.js';
import { buildAPIMastodonPost } from './processor.js';
import type { MastodonBuildHost } from './build-host.js';

const CURSOR_V = 1 as const;
type ConversationCursorPayload = {
  v: typeof CURSOR_V;
  focalId: string;
  mode: 'likes' | 'recency';
  skip: number;
  count: number;
};

const encodeConversationCursor = (payload: ConversationCursorPayload): string => {
  const json = JSON.stringify(payload);
  const b64 = btoa(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decodeConversationCursor = (raw: string): ConversationCursorPayload | null => {
  try {
    let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = atob(b64);
    const o = JSON.parse(json) as Partial<ConversationCursorPayload>;
    if (o.v !== CURSOR_V || typeof o.focalId !== 'string') return null;
    if (o.mode !== 'likes' && o.mode !== 'recency') return null;
    if (typeof o.skip !== 'number' || !Number.isFinite(o.skip) || o.skip < 0) return null;
    if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 1 || o.count > 100) {
      return null;
    }
    return {
      v: CURSOR_V,
      focalId: o.focalId,
      mode: o.mode,
      skip: o.skip,
      count: o.count
    };
  } catch {
    return null;
  }
};

const unwrapCore = (s: MastodonStatus): MastodonStatus => (s.reblog ? s.reblog : s);

const collectSelfChainFromDescendants = (
  focal: MastodonStatus,
  descendants: MastodonStatus[]
): MastodonStatus[] => {
  const focalCore = unwrapCore(focal);
  const authorId = focalCore.account.id;
  let currentId = focalCore.id;
  const chain: MastodonStatus[] = [];
  const pool = [...descendants];

  while (true) {
    const candidates = pool
      .filter(
        d => d.in_reply_to_id === currentId && unwrapCore(d).account.id === authorId && !d.reblog
      )
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const next = candidates[0];
    if (!next) break;
    chain.push(next);
    currentId = next.id;
  }
  return chain;
};

const findSelfBranchFirstReplyChild = (
  focalCore: MastodonStatus,
  descendants: MastodonStatus[]
): MastodonStatus | undefined => {
  const direct = descendants.filter(d => d.in_reply_to_id === focalCore.id);
  return direct.find(d => unwrapCore(d).account.id === focalCore.account.id && !d.reblog);
};

const collectDirectReplyPosts = (
  focalCore: MastodonStatus,
  descendants: MastodonStatus[]
): MastodonStatus[] => {
  const selfChild = findSelfBranchFirstReplyChild(focalCore, descendants);
  const selfId = selfChild?.id;
  return descendants.filter(d => {
    if (d.in_reply_to_id !== focalCore.id) return false;
    if (selfId && d.id === selfId) return false;
    return true;
  });
};

const sortDirectReplies = (
  posts: MastodonStatus[],
  mode: 'likes' | 'recency'
): MastodonStatus[] => {
  const sorted = [...posts];
  if (mode === 'recency') {
    sorted.sort((a, b) => {
      const tb = b.created_at.localeCompare(a.created_at);
      if (tb !== 0) return tb;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  } else {
    sorted.sort((a, b) => {
      const lb = (b.favourites_count ?? 0) - (a.favourites_count ?? 0);
      if (lb !== 0) return lb;
      const tb = b.created_at.localeCompare(a.created_at);
      if (tb !== 0) return tb;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  }
  return sorted;
};

export const constructMastodonThread = async (
  id: string,
  domain: string,
  processThread: boolean,
  host: MastodonBuildHost,
  language: string | undefined
): Promise<SocialStatusMastodon | SocialThreadMastodon> => {
  const st = await fetchStatus(domain, id);
  if (!st.ok || !st.data) {
    if (!processThread) {
      return { code: 404, status: null, author: null };
    }
    return { code: 404, status: null, thread: null, author: null };
  }

  const focal = st.data;
  const focalCore = unwrapCore(focal);

  if (!processThread) {
    const consumed = (await buildAPIMastodonPost(
      host,
      focal,
      domain,
      language
    )) as APIMastodonStatus;
    return {
      code: 200,
      status: consumed,
      author: consumed.author
    };
  }

  const ctx = await fetchStatusContext(domain, focalCore.id);
  if (!ctx.ok || !ctx.data) {
    const consumed = (await buildAPIMastodonPost(
      host,
      focal,
      domain,
      language
    )) as APIMastodonStatus;
    return {
      code: 200,
      status: consumed,
      thread: [consumed],
      author: consumed.author
    };
  }

  const ancestors = ctx.data.ancestors ?? [];
  const descendants = ctx.data.descendants ?? [];
  const selfChain = collectSelfChainFromDescendants(focalCore, descendants);
  const chain: MastodonStatus[] = [...ancestors, focal, ...selfChain];

  const consumedPosts = (await Promise.all(
    chain.map(s => buildAPIMastodonPost(host, s, domain, language))
  )) as APIMastodonStatus[];

  const focalIndex = ancestors.length;
  const focalConsumed = consumedPosts[focalIndex]!;

  return {
    code: 200,
    status: focalConsumed,
    thread: consumedPosts,
    author: focalConsumed.author
  };
};

export type MastodonConversationResult =
  { ok: true; data: SocialConversationMastodon } | { ok: false; message: string };

export const constructMastodonConversation = async (
  id: string,
  domain: string,
  host: MastodonBuildHost,
  options: {
    rankingMode: 'likes' | 'recency';
    cursor: string | null;
    count: number;
    language?: string;
  }
): Promise<MastodonConversationResult> => {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  let focalId: string;
  let mode: 'likes' | 'recency';
  let skip: number;
  let pageCount: number;

  if (options.cursor) {
    const decoded = decodeConversationCursor(options.cursor);
    if (!decoded) {
      return { ok: false, message: 'Invalid cursor' };
    }
    focalId = decoded.focalId;
    mode = decoded.mode;
    skip = decoded.skip;
    pageCount = decoded.count;
  } else {
    focalId = id;
    mode = options.rankingMode;
    skip = 0;
    pageCount = count;
  }

  const st = await fetchStatus(domain, focalId);
  if (!st.ok || !st.data) {
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

  const focal = st.data;
  const focalCore = unwrapCore(focal);

  const ctx = await fetchStatusContext(domain, focalCore.id);
  if (!ctx.ok || !ctx.data) {
    const consumed = (await buildAPIMastodonPost(
      host,
      focal,
      domain,
      options.language
    )) as APIMastodonStatus;
    return {
      ok: true,
      data: {
        code: 200,
        status: consumed,
        thread: [consumed],
        replies: [],
        author: consumed.author,
        cursor: { bottom: null }
      }
    };
  }

  const ancestors = ctx.data.ancestors ?? [];
  const descendants = ctx.data.descendants ?? [];
  const selfChain = collectSelfChainFromDescendants(focalCore, descendants);
  const threadStatuses: MastodonStatus[] = [...ancestors, focal, ...selfChain];

  const direct = collectDirectReplyPosts(focalCore, descendants);
  const sorted = sortDirectReplies(direct, mode);
  const pageSlice = sorted.slice(skip, skip + pageCount);

  const threadApi = (await Promise.all(
    threadStatuses.map(s => buildAPIMastodonPost(host, s, domain, options.language))
  )) as APIMastodonStatus[];

  const repliesApi = (await Promise.all(
    pageSlice.map(s => buildAPIMastodonPost(host, s, domain, options.language))
  )) as APIMastodonStatus[];

  const focalIndex = ancestors.length;
  const consumedStatus =
    threadApi[focalIndex] ?? (await buildAPIMastodonPost(host, focal, domain, options.language));

  const nextSkip = skip + pageSlice.length;
  const hasMore = nextSkip < sorted.length;
  const bottomCursor = hasMore
    ? encodeConversationCursor({
        v: CURSOR_V,
        focalId: focalCore.id,
        mode,
        skip: nextSkip,
        count: pageCount
      })
    : null;

  return {
    ok: true,
    data: {
      code: 200,
      status: consumedStatus as APIMastodonStatus,
      thread: threadApi,
      replies: repliesApi,
      author: (consumedStatus as APIMastodonStatus).author,
      cursor: { bottom: bottomCursor }
    }
  };
};
