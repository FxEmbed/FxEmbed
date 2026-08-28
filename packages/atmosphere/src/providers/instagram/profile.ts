import type {
  APIInstagramStatus,
  APISearchResultsInstagram,
  UserAPIResponse
} from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import {
  fetchInstagramCsrfToken,
  fetchTimelineGraphqlPage,
  fetchWebProfileInfo
} from './client.js';
import {
  decodeMaxIdCursor,
  decodeProfileCursor,
  encodeMaxIdCursor,
  encodeProfileCursor,
  sameInstagramHandle,
  type InstagramProfileCursorV1
} from './cursors.js';
import { fetchPrivateUserFeed } from './private-api.js';
import { mediaItemsFromPrivateFeed, nextMaxIdFromPrivateResponse } from './private-processor.js';
import { edgeNodeToStatus, instagramNodeToStatus } from './processor.js';
import { resolveInstagramUser } from './resolve-user.js';

function getWebProfileUser(json: unknown): Record<string, unknown> | null {
  const root = json as { data?: { user?: unknown } };
  const u = root?.data?.user;
  if (u && typeof u === 'object') return u as Record<string, unknown>;
  return null;
}

function connection(
  user: Record<string, unknown>,
  key: 'edge_owner_to_timeline_media' | 'edge_felix_video_timeline'
): {
  edges: unknown[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
} {
  const raw = user[key] as { edges?: unknown[]; page_info?: Record<string, unknown> } | undefined;
  const edges = raw?.edges ?? [];
  const pi = raw?.page_info;
  return {
    edges,
    page_info: {
      has_next_page: Boolean(pi?.has_next_page),
      end_cursor: typeof pi?.end_cursor === 'string' ? pi.end_cursor : null
    }
  };
}

function ownerFallbackFromUser(user: Record<string, unknown>): {
  id: string;
  username: string;
  fullName?: string;
  pic?: string | null;
} {
  return {
    id: String(user.id ?? user.pk ?? ''),
    username: String(user.username ?? ''),
    fullName: typeof user.full_name === 'string' ? user.full_name : undefined,
    pic:
      typeof user.profile_pic_url_hd === 'string'
        ? user.profile_pic_url_hd
        : typeof user.profile_pic_url === 'string'
          ? user.profile_pic_url
          : null
  };
}

function parseTimelineGraphql(json: unknown): {
  edges: unknown[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
} {
  const media = (
    json as {
      data?: {
        user?: {
          edge_owner_to_timeline_media?: { edges?: unknown[]; page_info?: Record<string, unknown> };
        };
      };
    }
  )?.data?.user?.edge_owner_to_timeline_media;
  if (!media) {
    return { edges: [], page_info: { has_next_page: false, end_cursor: null } };
  }
  const pi = media.page_info;
  return {
    edges: media.edges ?? [],
    page_info: {
      has_next_page: Boolean(pi?.has_next_page),
      end_cursor: typeof pi?.end_cursor === 'string' ? pi.end_cursor : null
    }
  };
}

function nodeShowsVideoInGrid(n: Record<string, unknown> | null | undefined): boolean {
  if (!n) return false;
  if (
    n.is_video ||
    n.product_type === 'clips' ||
    n.__typename === 'GraphVideo' ||
    n.media_type === 2
  ) {
    return true;
  }
  const carousel = n.carousel_media;
  if (Array.isArray(carousel)) {
    for (const c of carousel) {
      if (c && typeof c === 'object' && nodeShowsVideoInGrid(c as Record<string, unknown>)) {
        return true;
      }
    }
  }
  const edgeSide = n.edge_sidecar_to_children as { edges?: unknown[] } | undefined;
  if (Array.isArray(edgeSide?.edges)) {
    for (const e of edgeSide.edges) {
      const nodeCh = (e as { node?: unknown })?.node;
      if (
        nodeCh &&
        typeof nodeCh === 'object' &&
        nodeShowsVideoInGrid(nodeCh as Record<string, unknown>)
      ) {
        return true;
      }
    }
  }
  const ch = n.children;
  if (Array.isArray(ch)) {
    for (const c of ch) {
      if (c && typeof c === 'object' && nodeShowsVideoInGrid(c as Record<string, unknown>)) {
        return true;
      }
    }
  }
  return false;
}

function parseFelixGraphql(json: unknown): {
  edges: unknown[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
} {
  const media = (
    json as {
      data?: {
        user?: {
          edge_felix_video_timeline?: { edges?: unknown[]; page_info?: Record<string, unknown> };
        };
      };
    }
  )?.data?.user?.edge_felix_video_timeline;
  if (!media) {
    return { edges: [], page_info: { has_next_page: false, end_cursor: null } };
  }
  const pi = media.page_info;
  return {
    edges: media.edges ?? [],
    page_info: {
      has_next_page: Boolean(pi?.has_next_page),
      end_cursor: typeof pi?.end_cursor === 'string' ? pi.end_cursor : null
    }
  };
}

export async function constructInstagramProfile(
  username: string,
  userAgent: string | undefined,
  options: { credentialKey?: string } = {}
): Promise<UserAPIResponse> {
  const ctx: InstagramRequestContext = { userAgent, credentialKey: options.credentialKey };
  const resolved = await resolveInstagramUser(username, ctx);
  if (resolved.code === 404) return { code: 404, message: 'User not found' };
  if (resolved.code !== 200 || !resolved.user) {
    return { code: 500, message: 'Instagram profile request failed' };
  }
  return { code: 200, message: 'OK', user: resolved.user };
}

/**
 * One page of a profile's own posts through the account proxy (`feed/user/{pk}/`).
 * `videosOnly` filters the page after the fact — Instagram has no logged-in reels-tab REST
 * endpoint, so a page can come back with fewer than `count` results while still paginating.
 */
async function privateFeedPage(params: {
  userId: string;
  username: string;
  count: number;
  maxId: string | null;
  videosOnly: boolean;
  ctx: InstagramRequestContext;
  accounts: Awaited<ReturnType<typeof resolveInstagramAccounts>>;
}): Promise<APISearchResultsInstagram> {
  const res = await fetchPrivateUserFeed(params.userId, params.ctx, {
    accounts: params.accounts,
    count: params.count,
    maxId: params.maxId,
    username: params.username
  });
  if (!res.ok) {
    return {
      code: res.status === 404 ? 404 : 500,
      results: [],
      cursor: { top: null, bottom: null }
    };
  }

  const ownerFallback = { id: params.userId, username: params.username };
  const results: APIInstagramStatus[] = [];
  for (const item of mediaItemsFromPrivateFeed(res.json)) {
    if (results.length >= params.count) break;
    if (params.videosOnly && !nodeShowsVideoInGrid(item)) continue;
    const status = instagramNodeToStatus(item, ownerFallback, {
      userAgent: params.ctx.userAgent
    });
    if (status) results.push(status);
  }

  const nextMaxId = nextMaxIdFromPrivateResponse(res.json);
  const bottom = nextMaxId
    ? encodeMaxIdCursor({
        v: 1,
        k: 'feed',
        id: params.userId,
        u: params.username,
        m: nextMaxId,
        c: params.count
      })
    : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}

async function timelinePageFromGraphql(
  cur: InstagramProfileCursorV1,
  userAgent: string | undefined
): Promise<APISearchResultsInstagram> {
  const csrf = await fetchInstagramCsrfToken(userAgent);
  const gql = await fetchTimelineGraphqlPage({
    userId: cur.uid,
    first: cur.c,
    after: cur.a,
    userAgent,
    refererUsername: cur.u,
    csrfToken: csrf
  });
  if (!gql.ok || !gql.json) {
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }
  let parsed = cur.k === 'r' ? parseFelixGraphql(gql.json) : parseTimelineGraphql(gql.json);
  if (cur.k === 'r' && parsed.edges.length === 0) {
    const fallback = parseTimelineGraphql(gql.json);
    parsed = {
      edges: fallback.edges.filter(e => {
        const n = (e as { node?: Record<string, unknown> }).node;
        return nodeShowsVideoInGrid(n ?? null);
      }),
      page_info: fallback.page_info
    };
  }
  const ownerFb: {
    id: string;
    username: string;
    fullName?: string;
    pic?: string | null;
  } = {
    id: cur.uid,
    username: cur.u
  };
  const results: APIInstagramStatus[] = [];
  for (const e of parsed.edges) {
    const s = edgeNodeToStatus(e, ownerFb);
    if (s) results.push(s);
  }
  const bottom =
    parsed.page_info.has_next_page && parsed.page_info.end_cursor
      ? encodeProfileCursor({
          v: 1,
          k: cur.k,
          uid: cur.uid,
          u: cur.u,
          a: parsed.page_info.end_cursor,
          c: cur.c
        })
      : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}

/**
 * Shared account-proxy entry for the profile grid / reels tab. Returns `null` when the request
 * should fall through to the logged-out web path (no proxy, or the cursor belongs to it).
 */
async function tryPrivateProfileFeed(
  username: string,
  videosOnly: boolean,
  options: { count: number; cursor: string | null; userAgent?: string; credentialKey?: string }
): Promise<APISearchResultsInstagram | null> {
  const ctx: InstagramRequestContext = {
    userAgent: options.userAgent,
    credentialKey: options.credentialKey
  };
  const accounts = await resolveInstagramAccounts(ctx);
  if (!accounts.length) return null;

  if (options.cursor) {
    const decoded = decodeMaxIdCursor(options.cursor);
    // A profile cursor from the logged-out path is still valid; let the caller handle it.
    if (!decoded || decoded.k !== 'feed' || !sameInstagramHandle(decoded.u, username)) return null;
    return privateFeedPage({
      userId: decoded.id,
      username,
      count: decoded.c,
      maxId: decoded.m,
      videosOnly,
      ctx,
      accounts
    });
  }

  const resolved = await resolveInstagramUser(username, ctx, { accounts });
  if (resolved.code === 404) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }
  if (resolved.code !== 200 || !resolved.user) return null;

  const page = await privateFeedPage({
    userId: resolved.user.id,
    username,
    count: Math.min(100, Math.max(1, Math.floor(options.count))),
    maxId: null,
    videosOnly,
    ctx,
    accounts
  });
  return page.code === 200 ? page : null;
}

export async function constructInstagramProfileStatuses(
  username: string,
  options: { count: number; cursor: string | null; userAgent?: string; credentialKey?: string }
): Promise<APISearchResultsInstagram> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const proxied = await tryPrivateProfileFeed(username, false, options);
  if (proxied) return proxied;
  if (options.cursor) {
    const decoded = decodeProfileCursor(options.cursor);
    if (!decoded || decoded.k !== 't') {
      return { code: 400, results: [], cursor: { top: null, bottom: null } };
    }
    return timelinePageFromGraphql(decoded, options.userAgent);
  }
  const res = await fetchWebProfileInfo(username, options.userAgent);
  if (!res.ok) {
    if (res.status === 404) return { code: 404, results: [], cursor: { top: null, bottom: null } };
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }
  const user = getWebProfileUser(res.json);
  if (!user) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }
  const ownerFb = ownerFallbackFromUser(user);
  const conn = connection(user, 'edge_owner_to_timeline_media');
  const results: APIInstagramStatus[] = [];
  for (const e of conn.edges.slice(0, count)) {
    const s = edgeNodeToStatus(e, ownerFb);
    if (s) results.push(s);
  }
  const truncated = conn.edges.length > count;
  const bottom =
    !truncated && conn.page_info.has_next_page && conn.page_info.end_cursor
      ? encodeProfileCursor({
          v: 1,
          k: 't',
          uid: ownerFb.id,
          u: username,
          a: conn.page_info.end_cursor,
          c: count
        })
      : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}

export async function constructInstagramProfileVideos(
  username: string,
  options: { count: number; cursor: string | null; userAgent?: string; credentialKey?: string }
): Promise<APISearchResultsInstagram> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const proxied = await tryPrivateProfileFeed(username, true, options);
  if (proxied) return proxied;
  if (options.cursor) {
    const decoded = decodeProfileCursor(options.cursor);
    if (!decoded || decoded.k !== 'r') {
      return { code: 400, results: [], cursor: { top: null, bottom: null } };
    }
    return timelinePageFromGraphql(decoded, options.userAgent);
  }
  const res = await fetchWebProfileInfo(username, options.userAgent);
  if (!res.ok) {
    if (res.status === 404) return { code: 404, results: [], cursor: { top: null, bottom: null } };
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }
  const user = getWebProfileUser(res.json);
  if (!user) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }
  const ownerFb = ownerFallbackFromUser(user);
  const felix = connection(user, 'edge_felix_video_timeline');
  const results: APIInstagramStatus[] = [];
  let conn: ReturnType<typeof connection>;
  let truncated: boolean;
  if (felix.edges.length > 0) {
    conn = felix;
    for (const e of conn.edges.slice(0, count)) {
      const s = edgeNodeToStatus(e, ownerFb);
      if (s) results.push(s);
    }
    truncated = conn.edges.length > count;
  } else {
    conn = connection(user, 'edge_owner_to_timeline_media');
    let moreOnPage = false;
    for (const e of conn.edges) {
      if (results.length >= count) {
        moreOnPage = true;
        break;
      }
      const n = (e as { node?: Record<string, unknown> }).node;
      if (!nodeShowsVideoInGrid(n ?? null)) continue;
      const s = edgeNodeToStatus(e, ownerFb);
      if (s) results.push(s);
    }
    truncated = moreOnPage;
  }
  const bottom =
    !truncated && conn.page_info.has_next_page && conn.page_info.end_cursor
      ? encodeProfileCursor({
          v: 1,
          k: 'r',
          uid: ownerFb.id,
          u: username,
          a: conn.page_info.end_cursor,
          c: count
        })
      : null;
  return { code: 200, results, cursor: { top: null, bottom } };
}
