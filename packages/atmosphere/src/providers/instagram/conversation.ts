import type { APISubstatus, SocialConversationInstagram } from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { fetchCommentPageGraphql, fetchInstagramCsrfToken } from './client.js';
import { decodeCommentCursor, encodeCommentCursor } from './cursors.js';
import { extractCommentsConnection } from './extractors.js';
import { fetchInstagramPageWithWebInfo } from './fetch-shortcode-page.js';
import { fetchPrivateMediaComments } from './private-api.js';
import { nextMaxIdFromPrivateResponse } from './private-processor.js';
import {
  commentRecordToSubstatus,
  extractCommentsFromGraphqlJson,
  instagramNodeToStatus,
  mapCommentEdges
} from './processor.js';

/** `media/{pk}/comments/` returns a flat `comments` array rather than GraphQL edges. */
function substatusesFromPrivateComments(
  json: unknown,
  shortcode: string,
  parentAuthor: string,
  limit: number
): APISubstatus[] {
  if (!json || typeof json !== 'object') return [];
  const comments = (json as { comments?: unknown }).comments;
  if (!Array.isArray(comments)) return [];
  const out: APISubstatus[] = [];
  for (const comment of comments) {
    if (out.length >= limit) break;
    if (!comment || typeof comment !== 'object') continue;
    const mapped = commentRecordToSubstatus(
      comment as Record<string, unknown>,
      shortcode,
      parentAuthor
    );
    if (mapped) out.push(mapped);
  }
  return out;
}

export type InstagramConversationResult =
  | { ok: true; data: SocialConversationInstagram }
  | { ok: false; message: string; data?: SocialConversationInstagram };

export async function constructInstagramConversation(
  shortcode: string,
  options: {
    cursor: string | null;
    count: number;
    sortOrder: 'popular' | 'recent';
    userAgent?: string;
    credentialKey?: string;
  }
): Promise<InstagramConversationResult> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const ctx: InstagramRequestContext = {
    userAgent: options.userAgent,
    credentialKey: options.credentialKey
  };
  const accounts = await resolveInstagramAccounts(ctx);
  const page = await fetchInstagramPageWithWebInfo(shortcode, options.userAgent, ctx);
  if (!page.ok) {
    return {
      ok: true,
      data: {
        code: page.status === 404 ? 404 : 500,
        status: null,
        thread: null,
        replies: null,
        author: null,
        cursor: null
      }
    };
  }
  const item = page.item;
  const htmlBody = page.html;
  const refererForGraphql = page.pathUsed ?? `/p/${encodeURIComponent(shortcode)}/`;
  const owner =
    (item.user as Record<string, unknown> | undefined) ??
    (item.owner as Record<string, unknown> | undefined);
  const fb = {
    id: String(owner?.pk ?? owner?.id ?? ''),
    username: String(owner?.username ?? ''),
    fullName: typeof owner?.full_name === 'string' ? owner.full_name : undefined,
    pic:
      (typeof owner?.profile_pic_url === 'string' && owner.profile_pic_url) ||
      (typeof owner?.profile_image_uri === 'string' && owner.profile_image_uri) ||
      null
  };
  const status = instagramNodeToStatus(item, fb, { userAgent: options.userAgent });
  if (!status) {
    return {
      ok: true,
      data: { code: 404, status: null, thread: null, replies: null, author: null, cursor: null }
    };
  }
  const mediaPk =
    status.media_pk ??
    (typeof item.pk === 'string' || typeof item.pk === 'number'
      ? String(item.pk).split('_')[0]
      : '');
  /*
   * With an account proxy, comments come from `media/{pk}/comments/`: it paginates past the ~24
   * comments the embedded page carries and works on posts whose logged-out page has no comment
   * connection at all. Falls through to the logged-out GraphQL path if the call fails.
   */
  if (accounts.length && mediaPk) {
    let maxId: string | null = null;
    if (options.cursor) {
      const decoded = decodeCommentCursor(options.cursor);
      if (
        !decoded ||
        decoded.shortcode !== shortcode ||
        decoded.mediaId !== mediaPk ||
        decoded.src !== 'proxy'
      ) {
        return { ok: false, message: 'Invalid cursor' };
      }
      maxId = decoded.after;
    }
    const res = await fetchPrivateMediaComments(mediaPk, ctx, {
      accounts,
      maxId,
      count,
      sortOrder: options.sortOrder,
      shortcode
    });
    if (res.ok) {
      const replies = substatusesFromPrivateComments(res.json, shortcode, fb.username, count);
      const nextMaxId = nextMaxIdFromPrivateResponse(res.json);
      const bottom = nextMaxId
        ? encodeCommentCursor({
            v: 1,
            mediaId: mediaPk,
            shortcode,
            sort: options.sortOrder,
            after: nextMaxId,
            count,
            src: 'proxy'
          })
        : null;
      return {
        ok: true,
        data: {
          code: 200,
          status,
          thread: [status],
          replies,
          author: status.author,
          cursor: { bottom }
        }
      };
    }
  }

  const conn = page.comments ?? extractCommentsConnection(htmlBody);
  const pageInfo = conn?.page_info ?? {};
  const hasNext =
    Boolean((pageInfo as { has_next_page?: boolean }).has_next_page) ||
    Boolean((pageInfo as { hasNextPage?: boolean }).hasNextPage);
  const endCursor =
    (typeof (pageInfo as { end_cursor?: string }).end_cursor === 'string'
      ? (pageInfo as { end_cursor: string }).end_cursor
      : null) ??
    (typeof (pageInfo as { endCursor?: string }).endCursor === 'string'
      ? (pageInfo as { endCursor: string }).endCursor
      : null);

  if (!options.cursor) {
    const edges = conn?.edges ?? [];
    const slicedEdges = edges.slice(0, count);
    const replies = mapCommentEdges(slicedEdges, shortcode, fb.username);
    const truncated = edges.length > count;
    const bottom =
      !truncated && mediaPk && hasNext && endCursor
        ? encodeCommentCursor({
            v: 1,
            mediaId: mediaPk,
            shortcode,
            sort: options.sortOrder,
            after: endCursor,
            count,
            src: 'gql'
          })
        : null;
    return {
      ok: true,
      data: {
        code: 200,
        status,
        thread: [status],
        replies,
        author: status.author,
        cursor: { bottom }
      }
    };
  }

  const decoded = decodeCommentCursor(options.cursor);
  if (
    !decoded ||
    decoded.shortcode !== shortcode ||
    decoded.mediaId !== mediaPk ||
    decoded.src === 'proxy'
  ) {
    return { ok: false, message: 'Invalid cursor' };
  }

  // Prefer LSD preserved on the page result (required for polaris-graphql, which has empty HTML).
  const lsd = page.lsd;
  if (!lsd) {
    return {
      ok: false,
      message: 'Instagram comment fetch failed',
      data: {
        code: 500,
        status,
        thread: [status],
        replies: [],
        author: status.author,
        cursor: { bottom: options.cursor }
      }
    };
  }
  const csrf = await fetchInstagramCsrfToken(options.userAgent);
  const gql = await fetchCommentPageGraphql({
    mediaId: decoded.mediaId,
    after: decoded.after,
    first: decoded.count,
    sortOrder: decoded.sort,
    refererPath: refererForGraphql,
    userAgent: options.userAgent,
    csrfToken: csrf,
    lsd
  });

  if (!gql.ok || !gql.json) {
    console.error('[instagram] constructInstagramConversation comment GraphQL failed', {
      shortcode,
      gqlStatus: gql.status,
      gqlOk: gql.ok
    });
    return {
      ok: false,
      message: 'Instagram comment fetch failed',
      data: {
        code: 500,
        status,
        thread: [status],
        replies: [],
        author: status.author,
        cursor: { bottom: options.cursor }
      }
    };
  }

  const parsed = extractCommentsFromGraphqlJson(gql.json);
  if (!parsed) {
    console.error(
      '[instagram] constructInstagramConversation comment GraphQL response parse failed',
      { shortcode, sort: decoded.sort, after: decoded.after, count: decoded.count }
    );
    return {
      ok: false,
      message: 'Instagram comment response parse failed',
      data: {
        code: 500,
        status,
        thread: [status],
        replies: [],
        author: status.author,
        cursor: { bottom: options.cursor }
      }
    };
  }

  const replies = mapCommentEdges(parsed.edges, shortcode, fb.username);
  const pi = parsed.page_info;
  const nextBottom =
    pi?.has_next_page && pi.end_cursor
      ? encodeCommentCursor({
          v: 1,
          mediaId: decoded.mediaId,
          shortcode,
          sort: decoded.sort,
          after: pi.end_cursor,
          count: decoded.count,
          src: 'gql'
        })
      : null;

  return {
    ok: true,
    data: {
      code: 200,
      status,
      thread: [status],
      replies,
      author: status.author,
      cursor: { bottom: nextBottom }
    }
  };
}
