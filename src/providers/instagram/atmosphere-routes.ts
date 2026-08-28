import { createRoute, z } from '@hono/zod-openapi';
import {
  ApiQueryErrorSchema,
  APISearchResultsInstagramSchema,
  SocialConversationInstagramSchema,
  SocialThreadInstagramSchema,
  UserAPIResponseSchema
} from '../../realms/api/schemas';

export const instagramStatusV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/status/{id}',
  summary: 'Get a single Instagram post',
  description:
    'Resolves a post by shortcode or Instagram permalink fragment. Data is sourced from logged-out web payloads.',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Shortcode or full Instagram post URL', example: 'DXeh-kYiIge' })
    })
  },
  responses: {
    200: {
      description: 'Post thread',
      content: { 'application/json': { schema: SocialThreadInstagramSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadInstagramSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: SocialThreadInstagramSchema } }
    }
  }
});

export const instagramProfileV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}',
  summary: 'Get Instagram profile',
  request: {
    params: z.object({
      username: z.string().openapi({ example: 'cristiano' })
    })
  },
  responses: {
    200: {
      description: 'Profile',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    400: {
      description: 'Invalid parameters',
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

export const instagramProfileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/statuses',
  summary: 'List Instagram profile posts (mixed grid)',
  request: {
    params: z.object({
      username: z.string()
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).default(20).openapi({ default: 20 }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Opaque pagination cursor (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'Timeline page',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    400: {
      description: 'Invalid cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    }
  }
});

export const instagramProfileVideosV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/videos',
  summary: 'List Instagram reels / video tab',
  request: {
    params: z.object({
      username: z.string()
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).default(20).openapi({ default: 20 }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Opaque pagination cursor (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'Reels page',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    400: {
      description: 'Invalid cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    }
  }
});

export const instagramConversationV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/conversation/{id}',
  summary: 'Instagram post with paginated comments',
  description:
    'Returns the focal post plus top-level comments as `substatus` rows (`type: substatus`, `parent_id` = post shortcode). Uses embedded HTML for the first page; further pages call Instagram GraphQL when available.',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Post shortcode or permalink fragment', example: 'DXeh-kYiIge' })
    }),
    query: z.object({
      sort_order: z.enum(['popular', 'recent']).default('popular').openapi({ default: 'popular' }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Opaque pagination cursor (`cursor.bottom`)' }),
      count: z.coerce.number().int().min(1).max(100).default(20).openapi({ default: 20 })
    })
  },
  responses: {
    200: {
      description: 'Conversation payload',
      content: { 'application/json': { schema: SocialConversationInstagramSchema } }
    },
    400: {
      description: 'Invalid cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialConversationInstagramSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: SocialConversationInstagramSchema } }
    }
  }
});
