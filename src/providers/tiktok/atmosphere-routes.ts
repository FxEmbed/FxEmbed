import { createRoute, z } from '@hono/zod-openapi';
import {
  APISearchResultsTikTokSchema,
  APITikTokCollectionResultsSchema,
  ApiQueryErrorSchema,
  SocialThreadTikTokSchema,
  UserAPIResponseSchema
} from '../../realms/api/schemas';
import { TIKTOK_EMBED_PAGE_SIZE } from '@fxembed/atmosphere/providers/tiktok/constants';

/**
 * Every route here is served from TikTok's public, server-rendered web surfaces — the post and
 * profile pages plus the `/embed/…` player pages. TikTok's app API is signature-gated and its web
 * `/api/…` endpoints need `X-Bogus`/`msToken`, so anything those alone can answer (comments,
 * likers, follow lists, keyword search, typeahead, trends) has no route here rather than a route
 * that can only fail. See `providers/tiktok/constants.ts` for the details.
 */
const PAGE_LIMIT_NOTE =
  `TikTok server-renders at most ${TIKTOK_EMBED_PAGE_SIZE} posts per playlist page and accepts no ` +
  'cursor, so `cursor.bottom` is always null and this is a single-page endpoint.';

const countQuery = z.object({
  count: z.coerce
    .number()
    .int()
    .min(1)
    .max(TIKTOK_EMBED_PAGE_SIZE)
    .default(TIKTOK_EMBED_PAGE_SIZE)
    .openapi({ default: TIKTOK_EMBED_PAGE_SIZE, description: PAGE_LIMIT_NOTE })
});

export const tiktokStatusV2Route = createRoute({
  method: 'get',
  path: '/2/tiktok/status/{id}',
  summary: 'Get a single TikTok post',
  description:
    'Accepts a numeric video id, a `/t/…` or `vm.tiktok.com` short code, or a full post URL ' +
    '(`/video/…` and `/photo/…` both work). Read from the post page, with the app API and the ' +
    '`/embed/v2` player page as fallbacks.',
  request: {
    params: z.object({
      id: z.string().openapi({
        description: 'Numeric video id, short code, or post URL',
        example: '7571171661639175454'
      })
    })
  },
  responses: {
    200: {
      description: 'Post',
      content: { 'application/json': { schema: SocialThreadTikTokSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadTikTokSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: SocialThreadTikTokSchema } }
    }
  }
});

export const tiktokProfileV2Route = createRoute({
  method: 'get',
  path: '/2/tiktok/profile/{handle}',
  summary: 'Get TikTok profile',
  description:
    'Read from the server-rendered `tiktok.com/@handle` page, which carries exact follower / ' +
    'like / video counts and the account creation date.',
  request: {
    params: z.object({
      handle: z
        .string()
        .openapi({ description: 'Handle, with or without the leading `@`', example: 'tiktok' })
    })
  },
  responses: {
    200: {
      description: 'Profile',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    400: {
      description: 'Invalid handle',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    }
  }
});

export const tiktokProfileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/tiktok/profile/{handle}/statuses',
  summary: "List a creator's recent posts",
  description:
    `Recent posts for one creator. ${PAGE_LIMIT_NOTE} Rows come from the creator embed, which ` +
    'carries the play count and a playable video URL but not the like / comment / share counters, ' +
    'and no timestamp — `created_at` is derived from the id, so it can run a few seconds ahead of ' +
    "the post's real publish time.",
  request: {
    params: z.object({ handle: z.string().openapi({ example: 'tiktok' }) }),
    query: countQuery
  },
  responses: {
    200: {
      description: 'Recent posts',
      content: { 'application/json': { schema: APISearchResultsTikTokSchema } }
    },
    400: {
      description: 'Invalid handle',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsTikTokSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsTikTokSchema } }
    }
  }
});

export const tiktokHashtagV2Route = createRoute({
  method: 'get',
  path: '/2/tiktok/hashtag/{hashtag}',
  summary: 'Get a hashtag and its recent posts',
  description:
    `Hashtag header (total views and post count) plus recent posts. ${PAGE_LIMIT_NOTE} This is ` +
    "the closest thing TikTok exposes publicly to X's search — keyword search itself is gated.",
  request: {
    params: z.object({
      hashtag: z
        .string()
        .openapi({ description: 'Hashtag, with or without the leading `#`', example: 'cats' })
    }),
    query: countQuery
  },
  responses: {
    200: {
      description: 'Hashtag with posts',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    },
    400: {
      description: 'Invalid hashtag',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    }
  }
});

export const tiktokMusicV2Route = createRoute({
  method: 'get',
  path: '/2/tiktok/music/{id}',
  summary: 'Get a sound and its recent posts',
  description:
    `Sound header plus recent posts using it. ${PAGE_LIMIT_NOTE} Accepts the bare music id or a ` +
    '`slug-id` path fragment from a `tiktok.com/music/…` URL.',
  request: {
    params: z.object({
      id: z.string().openapi({
        description: 'Music id, or the `slug-id` fragment of a sound URL',
        example: '7571176808381467422'
      })
    }),
    query: countQuery
  },
  responses: {
    200: {
      description: 'Sound with posts',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    },
    400: {
      description: 'Invalid music id',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APITikTokCollectionResultsSchema } }
    }
  }
});
