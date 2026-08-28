import { createRoute, z } from '@hono/zod-openapi';
import {
  APIProfileRelationshipListSchema,
  APITypeaheadResponseSchema,
  APIUserListResultsSchema,
  ApiQueryErrorSchema,
  APISearchResultsBlueskySchema,
  APIGroupedSearchResultsBlueskySchema,
  APITrendsResponseSchema,
  SocialConversationSchema,
  UserAPIResponseSchema,
  SocialThreadSchema
} from '../api/schemas';
import {
  BLUESKY_TRENDS_FEED_KINDS,
  type BlueskyTrendsFeedKind
} from '@fxembed/atmosphere/providers/bluesky/trends';

const langQuery = z.object({
  lang: z.string().optional().openapi({
    description: 'Target language (ISO 639-1 or BCP 47) for inline translation when available',
    example: 'es'
  })
});

/** FxTwitter-aligned: `_` and whitespace alone are not a valid search query */
const blueskySearchQueryHasEffectiveContent = (raw: string): boolean =>
  raw.replace(/_/g, '').trim().length > 0;

const blueskySearchQueryString = (openapiMeta: { description: string; example: string }) =>
  z
    .string()
    .refine(blueskySearchQueryHasEffectiveContent, {
      message: 'Search query must not be empty'
    })
    .openapi(openapiMeta);

export const blueskyStatusV2Route = createRoute({
  method: 'get',
  path: '/2/status/{handle}/{rkey}',
  summary: 'Get post',
  description:
    'Returns one Bluesky post by handle and record key (rkey), in the same envelope as FxTwitter API v2 (`code`, `status`, `thread`, `author`).',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`)',
        example: 'bsky.app'
      }),
      rkey: z.string().openapi({
        description: 'Post record key from the `at://` URI',
        example: '3l6xyz'
      })
    }),
    query: langQuery
  },
  responses: {
    200: {
      description: 'Thread payload (check `code` for upstream errors mirrored as HTTP status)',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    503: {
      description: 'Bluesky upstream timeout or error (post may still exist)',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialThreadSchema } }
    }
  }
});

export const blueskyStatusRepostsV2Route = createRoute({
  method: 'get',
  path: '/2/status/{handle}/{rkey}/reposts',
  summary: 'List reposters of post',
  description:
    'Returns users who reposted the given post, in the same envelope as FxTwitter `GET /2/status/{id}/reposts` (`code`, `results`, `cursor`). Pagination uses Bluesky `app.bsky.feed.getRepostedBy`: pass the prior `cursor.bottom` as the `cursor` query param. `handle` may be a handle or DID (`did:plc:…`). `cursor.top` is always null.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      }),
      rkey: z.string().openapi({
        description: 'Post record key from the `at://` URI',
        example: '3l6xyz'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'User list page',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Post not found or list unavailable',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const blueskyStatusLikesV2Route = createRoute({
  method: 'get',
  path: '/2/status/{handle}/{rkey}/likes',
  summary: 'List likers of post',
  description:
    'Returns users who liked the given post, in the same envelope as FxTwitter-style user list results (`code`, `results`, `cursor`). Pagination uses Bluesky `app.bsky.feed.getLikes`: pass the prior `cursor.bottom` as the `cursor` query param. `handle` may be a handle or DID (`did:plc:…`). `cursor.top` is always null.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      }),
      rkey: z.string().openapi({
        description: 'Post record key from the `at://` URI',
        example: '3l6xyz'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'User list page',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Post not found or list unavailable',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const blueskyThreadV2Route = createRoute({
  method: 'get',
  path: '/2/thread/{handle}/{rkey}',
  summary: 'Get unrolled thread',
  description:
    'Returns the post chain for a Bluesky thread, matching the shape of FxTwitter `GET /2/thread/{id}`.',
  request: {
    params: z.object({
      handle: z.string().openapi({ description: 'Bluesky handle', example: 'bsky.app' }),
      rkey: z.string().openapi({ description: 'Post record key', example: '3l6xyz' })
    }),
    query: langQuery
  },
  responses: {
    200: {
      description: 'Thread payload',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    503: {
      description: 'Bluesky upstream timeout or error (post may still exist)',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialThreadSchema } }
    }
  }
});

export const blueskyConversationV2Route = createRoute({
  method: 'get',
  path: '/2/conversation/{handle}/{rkey}',
  summary: 'Get unrolled thread and replies',
  description:
    'Returns the focal post, ancestor chain and author self-thread (same as `/2/thread/{handle}/{rkey}` on the first page), plus **direct** replies from other participants. Replies are sorted by `ranking_mode` (default likes). Pagination uses an opaque `cursor` query param (`cursor.bottom` from the prior response); Bluesky `getPostThread` has no native reply cursor, so each page refetches the thread slice. Optional `count` (1–100, default 20) sets the reply page size. Very large reply lists still require a large upstream payload when loading direct replies.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      }),
      rkey: z.string().openapi({ description: 'Post record key', example: '3l6xyz' })
    }),
    query: z.object({
      ranking_mode: z.enum(['likes', 'recency']).optional().openapi({
        description:
          'How direct replies are ranked (default: likes). Ignored when `cursor` is set; the cursor carries the mode used for the session.',
        default: 'likes'
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Opaque pagination cursor from prior response (`cursor.bottom`)' }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description:
          'Reply page size for the first request (default 20). Subsequent pages use the size embedded in `cursor`.',
        default: 20
      }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Conversation payload with thread, replies, and pagination cursor',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    400: {
      description: 'Invalid path, query parameters, or cursor',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    503: {
      description: 'Bluesky upstream timeout or error (post may still exist)',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialConversationSchema } }
    }
  }
});

export const blueskySearchV2Route = createRoute({
  method: 'get',
  path: '/2/search',
  summary: 'Search posts by query',
  description:
    'Search posts via Bluesky `app.bsky.feed.searchPosts`. Response shape matches FxTwitter `GET /2/search` (`code`, `results`, `cursor`). `cursor.top` is always null; pass `cursor.bottom` as the `cursor` query param. `feed=latest` and `feed=top` map to Bluesky `sort`. `feed=media` uses `sort=latest` then keeps posts with image, video, or external link embeds (may return fewer hits than `count`). `lang` is used for inline translation only, not the upstream post-language filter.',
  request: {
    query: z.object({
      q: blueskySearchQueryString({
        description: 'Search query (non-empty)',
        example: 'puppies'
      }),
      feed: z.enum(['latest', 'top', 'media']).optional().openapi({
        description:
          'Search tab (default latest). `media` is a client-side filter on the current result page (no native Bluesky media tab).',
        default: 'latest'
      }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 30)',
        default: 30
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    400: {
      description: 'Invalid `q` parameter',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No results or search unavailable',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    }
  }
});

export const blueskySearchUsersV2Route = createRoute({
  method: 'get',
  path: '/2/search/users',
  summary: 'Search people',
  description:
    'Search accounts via Bluesky `app.bsky.actor.searchActors`. Same envelope as `/2/profile/{handle}/followers` (`code`, `results`, `cursor`); pass `cursor.bottom` back as `cursor` for the next page. Rows come from `#profileView`, which carries no counts, so `followers`, `following`, and `statuses` are 0 — fetch `/2/profile/{handle}` for a full profile.',
  request: {
    query: z.object({
      q: blueskySearchQueryString({
        description: 'Search query (non-empty)',
        example: 'jay'
      }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 30)',
        default: 30
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'Matching accounts',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid `q` parameter',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No results or search unavailable',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const blueskyTypeaheadV2Route = createRoute({
  method: 'get',
  path: '/2/typeahead',
  summary: 'Search typeahead suggestions',
  description:
    'Account autocomplete via Bluesky `app.bsky.actor.searchActorsTypeahead`, in the same envelope as FxTwitter `GET /2/typeahead`. Bluesky indexes only accounts for autocomplete, so `topics` and `events` are always empty. Unpaginated by design — use `/2/search/users` for a full, cursored people search.',
  request: {
    query: z.object({
      q: blueskySearchQueryString({
        description: 'Prefix or query string',
        example: 'jac'
      }),
      count: z.coerce.number().int().min(1).max(50).optional().openapi({
        description: 'Maximum suggestions (default 8)',
        default: 8
      })
    })
  },
  responses: {
    200: {
      description: 'Typeahead payload',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    400: {
      description: 'Invalid `q` parameter',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No suggestions or upstream returned an error payload',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    }
  }
});

const blueskyTrendsTypeDescription = `Trend list. \`trending\` returns Bluesky live topics first, then suggested topic feeds to fill \`count\`. \`suggested\` returns only suggested feeds. Upstream: \`app.bsky.unspecced.getTrendingTopics\` (max 25 rows per request).`;

export const blueskyTrendsV2Route = createRoute({
  method: 'get',
  path: '/2/trends',
  summary: 'Trending topics (Bluesky)',
  description:
    'Returns trending topic labels and suggested topic feeds from the Bluesky public AppView, in the same envelope as FxTwitter `GET /2/trends` (`code`, `timeline_type`, `trends`, `cursor`). Each trend’s `context` includes a bsky.app URL to the topic feed when the upstream provides a `link`.',
  request: {
    query: z.object({
      type: z
        .enum(BLUESKY_TRENDS_FEED_KINDS as [BlueskyTrendsFeedKind, ...BlueskyTrendsFeedKind[]])
        .optional()
        .openapi({
          description: blueskyTrendsTypeDescription,
          default: 'trending',
          example: 'trending'
        }),
      count: z.coerce.number().int().min(1).max(50).optional().openapi({
        description: 'Number of trends (default 20, max 50)',
        default: 20
      })
    })
  },
  responses: {
    200: {
      description: 'Trends payload',
      content: { 'application/json': { schema: APITrendsResponseSchema } }
    },
    400: {
      description: 'Invalid query parameters (e.g. `type` or `count` out of allowed range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Trends unavailable or empty upstream list',
      content: { 'application/json': { schema: APITrendsResponseSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APITrendsResponseSchema } }
    }
  }
});

export const blueskyProfileV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}',
  summary: 'Get profile',
  description:
    'Returns profile fields in the same envelope as FxTwitter `GET /2/profile/{handle}` (`code`, `message`, `user`). `handle` may be a handle (e.g. `user.bsky.social`) or a DID (`did:plc:…`).',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    })
  },
  responses: {
    200: {
      description: 'Profile (check `code`)',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    400: {
      description: 'Invalid path parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'User not found',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    }
  }
});

export const blueskyProfileFollowersV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/followers',
  summary: 'List followers of user',
  description:
    'Returns a page in the same shape as FxTwitter `GET /2/profile/{handle}/followers` (`code`, `results`, `cursor`). `handle` may be a handle or DID. Pagination uses Bluesky `app.bsky.graph.getFollowers`: pass the prior `cursor.bottom` as the `cursor` query param. `cursor.top` is always null.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'Followers page',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Actor not found or list unavailable',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const blueskyProfileFollowingV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/following',
  summary: 'List following of user',
  description:
    'Returns a page in the same shape as FxTwitter `GET /2/profile/{handle}/following` (`code`, `results`, `cursor`). `handle` may be a handle or DID. Pagination uses Bluesky `app.bsky.graph.getFollows`: pass the prior `cursor.bottom` as the `cursor` query param. `cursor.top` is always null.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' })
    })
  },
  responses: {
    200: {
      description: 'Following page',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Actor not found or list unavailable',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const blueskyProfileMediaV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/media',
  summary: 'List posts with media for an actor',
  description:
    'Returns a timeline page in the same shape as FxTwitter `GET /2/profile/{handle}/media` (`code`, `results`, `cursor`). `handle` may be a handle or DID. Pagination uses Bluesky `app.bsky.feed.getAuthorFeed` with `filter=posts_with_media`: `cursor.bottom` is the opaque next-page token (pass as `cursor` query param). `cursor.top` is always null.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Media timeline page',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Actor not found',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    }
  }
});

export const blueskyProfileLikesV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/likes',
  summary: 'List posts liked by an actor',
  description:
    'Returns a timeline page in the same shape as other FxBluesky profile timelines (`code`, `results`, `cursor`). `handle` may be a handle or DID. Pagination uses Bluesky `app.bsky.feed.getActorLikes`: pass the prior `cursor.bottom` as the `cursor` query param. `cursor.top` is always null. **Note:** Bluesky’s lexicon states this method requires authentication and that `actor` must be the requesting account; the public AppView may return **401** or errors for unauthenticated or cross-actor access—callers should handle `code` 401 accordingly.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Likes timeline page',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Upstream rejected the request (e.g. unauthenticated access to likes)',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    404: {
      description: 'Actor not found or list unavailable',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    }
  }
});

export const blueskyProfileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/statuses',
  summary: 'List user statuses',
  description:
    'Returns a timeline page in the same shape as FxTwitter `GET /2/profile/{handle}/statuses` (`code`, `results`, `cursor`). `handle` may be a handle or DID. Pagination uses Bluesky `app.bsky.feed.getAuthorFeed`: `cursor.bottom` is the opaque next-page token (pass as `cursor` query param). `cursor.top` is always null—there is no reverse cursor on this upstream endpoint. Optional `since` (Unix time): when used without `cursor`, returns **204 No Content** if no posts are strictly newer than that instant. Values ≥ 1e12 are treated as milliseconds.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description: 'Bluesky handle (e.g. `user.bsky.social`) or DID (`did:plc:…`)',
        example: 'bsky.app'
      })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response (`cursor.bottom`)' }),
      since: z.coerce.number().finite().min(0).optional().openapi({
        description:
          'Unix timestamp (seconds, or ms if ≥ 1e12). Without `cursor`, 204 if no post is strictly newer than this time.'
      }),
      with_replies: z.string().optional().openapi({
        description:
          'If truthy (`1`, `true`, `yes`, `on`, or empty), include replies (`posts_with_replies` upstream); otherwise `posts_no_replies`.'
      }),
      groupthreads: z.string().optional().openapi({
        description:
          'If truthy, return `results` as a mix of `type: "status"` and `type: "thread"` entries (consecutive self-reply chains grouped).'
      }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Timeline page (flat or grouped when `groupthreads` is set)',
      content: {
        'application/json': {
          schema: z.union([APISearchResultsBlueskySchema, APIGroupedSearchResultsBlueskySchema])
        }
      }
    },
    204: {
      description:
        'No posts newer than `since` (only when `since` is set and `cursor` is omitted; same conditions as 200 otherwise)'
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Actor not found',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsBlueskySchema } }
    }
  }
});
