import type { SocialConversationInstagram } from '../../types/api-schemas.js';
import { fetchCommentPageGraphql, fetchInstagramCsrfToken } from './client.js';
import { decodeCommentCursor, encodeCommentCursor } from './cursors.js';
import { extractCommentsConnection, extractLsdFromHtml } from './extractors.js';
import { fetchInstagramPageWithWebInfo } from './fetch-shortcode-page.js';
import {
  extractCommentsFromGraphqlJson,
  instagramNodeToStatus,
  mapCommentEdges
} from './processor.js';

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
  }
): Promise<InstagramConversationResult> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const page = await fetchInstagramPageWithWebInfo(shortcode, options.userAgent);
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
  const status = instagramNodeToStatus(item, fb);
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
            count
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
  if (!decoded || decoded.shortcode !== shortcode || decoded.mediaId !== mediaPk) {
    return { ok: false, message: 'Invalid cursor' };
  }

  const csrf = await fetchInstagramCsrfToken(options.userAgent);
  const lsd = extractLsdFromHtml(htmlBody) ?? 'a';
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
          count: decoded.count
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
