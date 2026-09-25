import { getBlueskyProviderEnv } from '../bluesky-runtime.js';
import type {
  APIBlueskyStatus,
  APIRepostedBy,
  APIGroupedSearchResultsBluesky,
  APISearchResultsBluesky,
  TimelineEntryBluesky,
  TimelineThreadBluesky
} from '../../types/api-schemas.js';
import { buildAPIBlueskyPost } from './processor.js';
import { fetchActorLikes, fetchAuthorFeed } from './client.js';
import { rkeyFromPostAtUri } from './uris.js';
import type { BlueskyBuildHost } from './build-host.js';

const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost';

function repostedByFromFeedReason(reason: unknown): APIRepostedBy | undefined {
  if (!reason || typeof reason !== 'object') return undefined;
  const r = reason as BlueskyFeedReasonRepost;
  if (r.$type !== REASON_REPOST || !r.by) return undefined;
  const b = r.by;
  const handle = b.handle || b.did;
  return {
    id: handle,
    name: (b.displayName?.trim() || handle) as string,
    screen_name: handle,
    avatar_url: b.avatar ?? null,
    url: `${getBlueskyProviderEnv().webRoot}/profile/${handle}`
  };
}

function normalizePostView(post: BlueskyPost): BlueskyPost {
  return {
    ...post,
    labels: post.labels ?? [],
    likeCount: post.likeCount ?? 0,
    repostCount: post.repostCount ?? 0,
    indexedAt: post.indexedAt ?? ''
  };
}

async function buildStatusFromFeedItem(
  host: BlueskyBuildHost,
  item: BlueskyFeedViewPost,
  language?: string
): Promise<APIBlueskyStatus | null> {
  const raw = item.post;
  if (!raw?.uri || !raw.cid) return null;
  const post = normalizePostView(raw);
  try {
    const status = await buildAPIBlueskyPost(host, post, language);
    const rb = repostedByFromFeedReason(item.reason);
    return (rb ? { ...status, reposted_by: rb } : status) as APIBlueskyStatus;
  } catch (err) {
    console.error('Error building Bluesky profile timeline post', err);
    return null;
  }
}

/** Consecutive rows where each post replies to the previous (same author), feed order newest-first. */
export function groupConsecutiveSelfReplies(feed: BlueskyFeedViewPost[]): BlueskyFeedViewPost[][] {
  const groups: BlueskyFeedViewPost[][] = [];
  let i = 0;
  while (i < feed.length) {
    if (feed[i].reason) {
      groups.push([feed[i]]);
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < feed.length && !feed[j + 1].reason) {
      const newer = feed[j];
      const older = feed[j + 1];
      const newerDid = newer.post?.author?.did;
      const olderDid = older.post?.author?.did;
      if (!newerDid || newerDid !== olderDid) break;
      const rec = newer.post?.record as { reply?: { parent?: { uri?: string } } } | undefined;
      const parentUri = rec?.reply?.parent?.uri;
      if (parentUri !== older.post?.uri) break;
      j++;
    }
    if (j > i) {
      groups.push(feed.slice(i, j + 1));
      i = j + 1;
    } else {
      groups.push([feed[i]]);
      i++;
    }
  }
  return groups;
}

async function feedViewPostsToGroupedTimeline(
  host: BlueskyBuildHost,
  feed: BlueskyFeedViewPost[],
  language?: string
): Promise<TimelineEntryBluesky[]> {
  const groups = groupConsecutiveSelfReplies(feed);
  const out: TimelineEntryBluesky[] = [];

  for (const g of groups) {
    if (g.length === 1) {
      const s = await buildStatusFromFeedItem(host, g[0], language);
      if (s) out.push(s);
      continue;
    }
    const built = (
      await Promise.all(g.map(item => buildStatusFromFeedItem(host, item, language)))
    ).filter((s): s is APIBlueskyStatus => s !== null);
    if (built.length === 0) continue;
    if (built.length === 1) {
      out.push(built[0]);
      continue;
    }
    const newestRec = g[0].post?.record as { reply?: { root?: { uri?: string } } } | undefined;
    const rootUri = newestRec?.reply?.root?.uri;
    const conversation_id = rkeyFromPostAtUri(rootUri) ?? built[built.length - 1].id;
    const chronological = [...built].reverse();
    out.push({
      type: 'thread',
      conversation_id,
      statuses: chronological,
      truncated: false
    });
  }
  return out;
}

async function feedViewPostsToTimeline(
  host: BlueskyBuildHost,
  feed: BlueskyFeedViewPost[],
  language?: string
): Promise<APIBlueskyStatus[]> {
  const built = await Promise.all(feed.map(item => buildStatusFromFeedItem(host, item, language)));
  return built.filter((s): s is APIBlueskyStatus => s !== null);
}

async function blueskyAuthorFeedSearchPage(
  actor: string,
  options: {
    count: number;
    cursor: string | null;
    filter: BlueskyAuthorFeedFilter;
    language?: string;
    groupThreads?: boolean;
  },
  host: BlueskyBuildHost
): Promise<APISearchResultsBluesky | APIGroupedSearchResultsBluesky> {
  const result = await fetchAuthorFeed(
    {
      actor,
      limit: options.count,
      cursor: options.cursor ?? undefined,
      filter: options.filter
    },
    { credentialKey: host.credentialKey }
  );

  if (!result.ok) {
    if (result.status === 400 || result.status === 404) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const feed = result.data.feed ?? [];
  const nextCursor = result.data.cursor ?? null;
  const results = options.groupThreads
    ? await feedViewPostsToGroupedTimeline(host, feed, options.language)
    : await feedViewPostsToTimeline(host, feed, options.language);

  return {
    code: 200,
    results,
    cursor: { top: null, bottom: nextCursor }
  };
}

export const blueskyProfileStatusesAPI = async (
  actor: string,
  options: {
    count: number;
    cursor: string | null;
    withReplies: boolean;
    language?: string;
    groupThreads?: boolean;
  },
  host: BlueskyBuildHost
): Promise<APISearchResultsBluesky | APIGroupedSearchResultsBluesky> => {
  const filter: BlueskyAuthorFeedFilter = options.withReplies
    ? 'posts_with_replies'
    : 'posts_no_replies';

  return blueskyAuthorFeedSearchPage(
    actor,
    {
      count: options.count,
      cursor: options.cursor,
      filter,
      language: options.language,
      groupThreads: options.groupThreads
    },
    host
  );
};

export const blueskyProfileMediaAPI = async (
  actor: string,
  options: { count: number; cursor: string | null; language?: string },
  host: BlueskyBuildHost
): Promise<APISearchResultsBluesky> =>
  blueskyAuthorFeedSearchPage(
    actor,
    {
      count: options.count,
      cursor: options.cursor,
      filter: 'posts_with_media',
      language: options.language
    },
    host
  );

/** Max author-feed pages to merge for RSS (aligns with Twitter profile feed pagination). */
const BLUESKY_PROFILE_FEED_MAX_PAGES = 10;

const BLUESKY_PROFILE_FEED_PER_PAGE = 100;

const BLUESKY_PROFILE_FEED_TARGET_CAP = 100;

function isBlueskyFlatStatus(r: APIBlueskyStatus | TimelineThreadBluesky): r is APIBlueskyStatus {
  return r.type === 'status';
}

/**
 * Fetches up to `maxTotal` posts (cap 100) by walking `cursor.bottom` across
 * multiple `blueskyProfileStatusesAPI` calls. Dedupes by post `id`. Uses a flat
 * timeline (`groupThreads: false`).
 */
export const blueskyProfileStatusesAPIPaginated = async (
  actor: string,
  maxTotal: number,
  host: BlueskyBuildHost,
  withReplies = false,
  language?: string
): Promise<APISearchResultsBluesky> => {
  const target = Math.min(BLUESKY_PROFILE_FEED_TARGET_CAP, Math.max(1, maxTotal));
  const merged: APIBlueskyStatus[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let lastCursors: APISearchResultsBluesky['cursor'] = { top: null, bottom: null };
  let pages = 0;
  let anySuccessfulPage = false;

  while (merged.length < target && pages < BLUESKY_PROFILE_FEED_MAX_PAGES) {
    pages += 1;
    const page = await blueskyProfileStatusesAPI(
      actor,
      {
        count: BLUESKY_PROFILE_FEED_PER_PAGE,
        cursor,
        withReplies,
        language,
        groupThreads: false
      },
      host
    );

    if (page.code === 404) {
      if (merged.length === 0) {
        return { code: 404, results: [], cursor: { top: null, bottom: null } };
      }
      break;
    }

    if (page.code !== 200) {
      if (merged.length === 0) {
        return { code: page.code, results: [], cursor: { top: null, bottom: null } };
      }
      break;
    }

    anySuccessfulPage = true;
    lastCursors = page.cursor;

    if (page.results.length === 0) {
      break;
    }

    for (const r of page.results as TimelineEntryBluesky[]) {
      if (!isBlueskyFlatStatus(r)) continue;
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      merged.push(r);
      if (merged.length >= target) break;
    }

    if (merged.length >= target) break;

    const bottom = page.cursor.bottom;
    if (!bottom || bottom === cursor) break;
    cursor = bottom;
  }

  if (merged.length === 0) {
    if (anySuccessfulPage) {
      return { code: 200, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  return {
    code: 200,
    results: merged.slice(0, target),
    cursor: lastCursors
  };
};

/**
 * Same pagination strategy as `blueskyProfileStatusesAPIPaginated`, for the
 * profile media filter (`posts_with_media`).
 */
export const blueskyProfileMediaAPIPaginated = async (
  actor: string,
  maxTotal: number,
  host: BlueskyBuildHost,
  withReplies = false,
  language?: string
): Promise<APISearchResultsBluesky> => {
  const target = Math.min(BLUESKY_PROFILE_FEED_TARGET_CAP, Math.max(1, maxTotal));
  const merged: APIBlueskyStatus[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let lastCursors: APISearchResultsBluesky['cursor'] = { top: null, bottom: null };
  let pages = 0;
  let anySuccessfulPage = false;

  while (merged.length < target && pages < BLUESKY_PROFILE_FEED_MAX_PAGES) {
    pages += 1;
    const page = await blueskyProfileMediaAPI(
      actor,
      { count: BLUESKY_PROFILE_FEED_PER_PAGE, cursor, language },
      host
    );

    if (page.code === 404) {
      if (merged.length === 0) {
        return { code: 404, results: [], cursor: { top: null, bottom: null } };
      }
      break;
    }

    if (page.code !== 200) {
      if (merged.length === 0) {
        return { code: page.code, results: [], cursor: { top: null, bottom: null } };
      }
      break;
    }

    anySuccessfulPage = true;
    lastCursors = page.cursor;

    if (page.results.length === 0) {
      break;
    }

    for (const r of page.results) {
      if (!withReplies && r.replying_to) continue;
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      merged.push(r);
      if (merged.length >= target) break;
    }

    if (merged.length >= target) break;

    const bottom = page.cursor.bottom;
    if (!bottom || bottom === cursor) break;
    cursor = bottom;
  }

  if (merged.length === 0) {
    if (anySuccessfulPage) {
      return { code: 200, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  return {
    code: 200,
    results: merged.slice(0, target),
    cursor: lastCursors
  };
};

export const blueskyProfileLikesAPI = async (
  actor: string,
  options: { count: number; cursor: string | null; language?: string },
  host: BlueskyBuildHost
): Promise<APISearchResultsBluesky> => {
  const result = await fetchActorLikes(
    {
      actor,
      limit: options.count,
      cursor: options.cursor ?? undefined
    },
    { credentialKey: host.credentialKey }
  );

  if (!result.ok) {
    if (result.status === 400 || result.status === 404) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    if (result.status === 401) {
      return { code: 401, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const feed = result.data.feed ?? [];
  const nextCursor = result.data.cursor ?? null;
  const results = await feedViewPostsToTimeline(host, feed, options.language);

  return {
    code: 200,
    results,
    cursor: { top: null, bottom: nextCursor }
  };
};
