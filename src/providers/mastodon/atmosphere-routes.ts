import { createRoute, z } from '@hono/zod-openapi';
import {
  APIProfileRelationshipListSchema,
  APIUserListResultsSchema,
  ApiQueryErrorSchema,
  APISearchResultsMastodonSchema,
  SocialConversationMastodonSchema,
  SocialStatusMastodonSchema,
  SocialThreadMastodonSchema,
  UserAPIResponseSchema
} from '../../realms/api/schemas';

const langQuery = z.object({
  lang: z.string().optional().openapi({
    description: 'Target language (ISO 639-1 or BCP 47) for inline translation when available',
    example: 'es'
  })
});

const domainParam = z.object({
  domain: z.string().openapi({
    description: 'Mastodon instance hostname (e.g. `mastodon.social`)',
    example: 'mastodon.social'
  })
});

const mastodonSearchQueryHasEffectiveContent = (raw: string): boolean =>
  raw.replace(/_/g, '').trim().length > 0;

const mastodonSearchQueryString = (openapiMeta: { description: string; example: string }) =>
  z
    .string()
    .refine(mastodonSearchQueryHasEffectiveContent, {
      message: 'Search query must not be empty'
    })
    .openapi(openapiMeta);

export const mastodonStatusV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/status/{id}',
  summary: 'Get a single Mastodon status',
  description:
    'Returns one public status by numeric id on the given instance (`code`, `status`, `author` only — no `thread`, matching FxTwitter `GET /2/status/{id}`). Use `GET /2/mastodon/{domain}/thread/{id}` for the focal status plus ancestor/self-reply chain.',
  request: {
    params: domainParam.extend({
      id: z.string().openapi({ description: 'Mastodon status id', example: '109327927044751780' })
    }),
    query: langQuery
  },
  responses: {
    200: {
      description: 'Single status',
      content: { 'application/json': { schema: SocialStatusMastodonSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialStatusMastodonSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialStatusMastodonSchema } }
    }
  }
});

export const mastodonStatusRepostsV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/status/{id}/reposts',
  summary: 'List accounts that boosted a status',
  description:
    'Uses Mastodon `GET /api/v1/statuses/:id/reblogged_by`. Some instances require authentication; callers may receive `code` 401.',
  request: {
    params: domainParam.extend({
      id: z.string().openapi({ description: 'Mastodon status id' })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional().openapi({ description: 'Pagination cursor (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'User list page',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Upstream requires authentication',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const mastodonStatusLikesV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/status/{id}/likes',
  summary: 'List accounts that favourited a status',
  description:
    'Uses Mastodon `GET /api/v1/statuses/:id/favourited_by`. Some instances require authentication; callers may receive `code` 401.',
  request: {
    params: domainParam.extend({
      id: z.string().openapi({ description: 'Mastodon status id' })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional().openapi({ description: 'Pagination cursor (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'User list page',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Upstream requires authentication',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const mastodonThreadV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/thread/{id}',
  summary: 'Get a Mastodon thread',
  description:
    'Ancestors, focal status, and author self-replies (from context), matching FxTwitter `GET /2/thread/{id}` semantics where applicable.',
  request: {
    params: domainParam.extend({
      id: z.string().openapi({ description: 'Mastodon status id' })
    }),
    query: langQuery
  },
  responses: {
    200: {
      description: 'Thread payload',
      content: { 'application/json': { schema: SocialThreadMastodonSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadMastodonSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialThreadMastodonSchema } }
    }
  }
});

export const mastodonConversationV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/conversation/{id}',
  summary: 'Get a Mastodon status with thread and paginated replies',
  request: {
    params: domainParam.extend({
      id: z.string().openapi({ description: 'Mastodon status id' })
    }),
    query: z.object({
      ranking_mode: z.enum(['likes', 'recency']).optional().openapi({ default: 'likes' }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Opaque pagination cursor (`cursor.bottom`)' }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Conversation payload',
      content: { 'application/json': { schema: SocialConversationMastodonSchema } }
    },
    400: {
      description: 'Invalid parameters or cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialConversationMastodonSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialConversationMastodonSchema } }
    }
  }
});

export const mastodonSearchV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/search',
  summary: 'Search statuses on an instance',
  description:
    'Uses Mastodon `GET /api/v2/search?type=statuses`. Full-text search may be limited without instance Elasticsearch; `feed=top` is treated like latest (no native relevance API).',
  request: {
    params: domainParam,
    query: z.object({
      q: mastodonSearchQueryString({ description: 'Search query', example: 'mastodon' }),
      feed: z.enum(['latest', 'top', 'media']).optional().openapi({ default: 'latest' }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 30 }),
      cursor: z.string().optional().openapi({ description: 'Pagination cursor (`cursor.bottom`)' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    400: {
      description: 'Invalid query',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Upstream requires authentication',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    404: {
      description: 'No results',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    }
  }
});

export const mastodonSearchUsersV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/search/users',
  summary: 'Search accounts on an instance',
  description:
    'Uses Mastodon `GET /api/v2/search?type=accounts`, which (unlike the statuses half of the same endpoint) is served to unauthenticated callers. Same envelope as `/2/mastodon/{domain}/profile/{handle}/followers` (`code`, `results`, `cursor`). There is no cross-instance account index, so results are whatever `{domain}` has already federated — a large instance is a much larger corpus than a small one. Single page: Mastodon rejects any paginated search from an anonymous caller, so `cursor.bottom` is always null.',
  request: {
    params: domainParam,
    query: z.object({
      q: mastodonSearchQueryString({ description: 'Search query', example: 'gargron' }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 30 })
    })
  },
  responses: {
    200: {
      description: 'Matching accounts',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid query',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Upstream requires authentication',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    404: {
      description: 'No results',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const mastodonProfileV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/profile/{handle}',
  summary: 'Get Mastodon account profile',
  description:
    'Resolves `handle` via `GET /api/v1/accounts/lookup`. Use local username or full `user@domain` acct.',
  request: {
    params: domainParam.extend({
      handle: z.string().openapi({ description: 'Username or acct', example: 'Gargron' })
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
      description: 'User not found',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    }
  }
});

export const mastodonProfileFollowersV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/profile/{handle}/followers',
  request: {
    params: domainParam.extend({ handle: z.string() }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Followers page',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const mastodonProfileFollowingV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/profile/{handle}/following',
  request: {
    params: domainParam.extend({ handle: z.string() }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Following page',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const mastodonProfileMediaV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/profile/{handle}/media',
  request: {
    params: domainParam.extend({ handle: z.string() }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional(),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Media timeline',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    }
  }
});

export const mastodonProfileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/mastodon/{domain}/profile/{handle}/statuses',
  request: {
    params: domainParam.extend({ handle: z.string() }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      cursor: z.string().optional(),
      since: z.coerce.number().finite().min(0).optional().openapi({
        description:
          'Unix timestamp (seconds, or ms if ≥ 1e12). Without `cursor`, 204 if no post is strictly newer than this time.'
      }),
      with_replies: z.string().optional().openapi({
        description: 'If truthy, include replies in the timeline'
      }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Timeline page',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    204: {
      description: 'No posts newer than `since` when applicable'
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsMastodonSchema } }
    }
  }
});
