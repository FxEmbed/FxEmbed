import { createRoute, z } from '@hono/zod-openapi';
import {
  ApiQueryErrorSchema,
  APISearchResultsThreadsSchema,
  SocialConversationSchema,
  SocialThreadSchema,
  UserAPIResponseSchema
} from '../../realms/api/schemas';

export const threadsStatusV2Route = createRoute({
  method: 'get',
  path: '/2/threads/status/{id}',
  summary: 'Get a single Threads post',
  description:
    'Resolves a post by shortcode or Threads permalink. Data is sourced from logged-out `threads.com` GraphQL.',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Shortcode or full Threads post URL', example: 'DXhZAMkljvS' })
    })
  },
  responses: {
    200: {
      description: 'Post thread',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    400: {
      description: 'Invalid id',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: SocialThreadSchema } }
    }
  }
});

export const threadsProfileV2Route = createRoute({
  method: 'get',
  path: '/2/threads/profile/{username}',
  summary: 'Get Threads profile',
  request: {
    params: z.object({
      username: z.string().openapi({ example: 'zuck' })
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

export const threadsProfileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/threads/profile/{username}/statuses',
  summary: 'List Threads profile posts',
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
      content: { 'application/json': { schema: APISearchResultsThreadsSchema } }
    },
    400: {
      description: 'Invalid cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsThreadsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsThreadsSchema } }
    }
  }
});

export const threadsConversationV2Route = createRoute({
  method: 'get',
  path: '/2/threads/conversation/{id}',
  summary: 'Threads post with replies',
  description:
    'Returns the focal post plus direct replies as `substatus` rows (`type: substatus`, `provider: threads`).',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Post shortcode or permalink fragment', example: 'DXhZAMkljvS' })
    }),
    query: z.object({
      sort_order: z.enum(['top', 'recent']).default('top').openapi({ default: 'top' }),
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
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    400: {
      description: 'Invalid cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: SocialConversationSchema } }
    }
  }
});
