import { createRoute, z } from '@hono/zod-openapi';
import { TWITTER_NUMERIC_STATUS_ID_PATTERN } from '../../helpers/utils';
import {
  PUBLIC_EXPLORE_TIMELINE_KINDS,
  type PublicExploreTimelineKind
} from '@fxembed/atmosphere/providers/twitter/trends';
import {
  formatSearchQueryTooLongMessage,
  TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH
} from '@fxembed/atmosphere/providers/twitter/searchErrors';
import {
  APIProfileRelationshipListSchema,
  APIUserListResultsSchema,
  APISearchResultsSchema,
  APIGroupedSearchResultsSchema,
  APITypeaheadResponseSchema,
  APITrendsResponseSchema,
  ApiQueryErrorSchema,
  SocialConversationSchema,
  SocialThreadSchema,
  UserAPIResponseSchema,
  ProfileAboutAPIResponseSchema
} from './schemas';

/** X search treats underscores as non-content for empty-query behavior; require another character after stripping `_` and whitespace. */
const twitterSearchQueryHasEffectiveContent = (raw: string): boolean =>
  raw.replace(/_/g, '').trim().length > 0;

const twitterSearchQueryString = (openapiMeta: {
  description: string;
  example: string;
  maxLength?: number;
}) => {
  const maxLength = openapiMeta.maxLength;
  return z
    .string()
    .refine(twitterSearchQueryHasEffectiveContent, {
      message: 'Search query must not be empty'
    })
    .superRefine((value, ctx) => {
      if (maxLength !== undefined && value.length > maxLength) {
        ctx.addIssue({
          code: 'custom',
          message: formatSearchQueryTooLongMessage(value.length)
        });
      }
    })
    .openapi(openapiMeta);
};

const aboutAccountQuery = z.object({
  about_account: z.string().optional().openapi({
    description: 'If truthy, include `about_account` on author when available',
    example: '1'
  }),
  aboutAccount: z.string().optional().openapi({
    description: 'Alias for about_account'
  })
});

const langQuery = z.object({
  lang: z.string().optional().openapi({
    description:
      'Target language (ISO 639-1 or 639-5, e.g. `en`, `es`, `zh-cn`) for inline X translations when available; falls back to translation API if missing',
    example: 'es'
  })
});

const twitterStatusIdParam = z
  .string()
  .regex(TWITTER_NUMERIC_STATUS_ID_PATTERN, 'tweet ID must be a numeric snowflake')
  .openapi({ description: 'Tweet/post snowflake ID (numeric string)', example: '20' });

export const statusV2Route = createRoute({
  method: 'get',
  path: '/2/status/{id}',
  summary: 'Get post',
  description:
    'Returns one X/Twitter post by snowflake ID. Optional `about_account` / `aboutAccount` adds account metadata when present.',
  request: {
    params: z.object({
      id: twitterStatusIdParam
    }),
    query: aboutAccountQuery.merge(langQuery)
  },
  responses: {
    200: {
      description: 'Post payload (check `code` for upstream errors mirrored as HTTP status)',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Private or unavailable post',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialThreadSchema } }
    }
  }
});

export const statusRepostsV2Route = createRoute({
  method: 'get',
  path: '/2/status/{id}/reposts',
  summary: 'List reposters of a post',
  description:
    'Returns users who reposted the given status. Use `cursor.bottom` from the prior response to fetch the next page.',
  request: {
    params: z.object({
      id: twitterStatusIdParam
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response' })
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
      description: 'Timeline unavailable or empty',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const statusQuotesV2Route = createRoute({
  method: 'get',
  path: '/2/status/{id}/quotes',
  summary: 'List quotes of post',
  description:
    'Returns posts whose text quotes the given post (X search operator `quoted_tweet_id`). Uses the Latest search tab. Use `cursor.bottom` from the prior response to fetch the next page.',
  request: {
    params: z.object({
      id: twitterStatusIdParam
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 20)',
        default: 20
      }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor from prior response' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Quote posts page (same shape as `/2/search`)',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No results or timeline unavailable',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    }
  }
});

export const threadV2Route = createRoute({
  method: 'get',
  path: '/2/thread/{id}',
  summary: 'Get unrolled thread',
  description:
    'Same as `/2/status/{id}` but includes the conversation thread when available. Supports `about_account` / `aboutAccount`.',
  request: {
    params: z.object({
      id: twitterStatusIdParam
    }),
    query: aboutAccountQuery.merge(langQuery)
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
    401: {
      description: 'Private or unavailable',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialThreadSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialThreadSchema } }
    }
  }
});

export const conversationV2Route = createRoute({
  method: 'get',
  path: '/2/conversation/{id}',
  summary: 'Get unrolled thread and replies',
  description:
    'Returns a post, its full thread chain (walking all the way to the root), and replies from other users. Replies are sorted by the chosen ranking mode (default: Likes). Use the returned bottom cursor to paginate through more replies.',
  request: {
    params: z.object({
      id: twitterStatusIdParam
    }),
    query: z.object({
      ranking_mode: z.enum(['likes', 'recency']).optional().openapi({
        description: 'How replies are ranked (default: likes)',
        default: 'likes'
      }),
      cursor: z.string().optional().openapi({
        description: 'Pagination cursor from a prior response'
      }),
      ...aboutAccountQuery.shape,
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Conversation payload with thread, replies, and pagination cursor',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    401: {
      description: 'Private or unavailable post',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: SocialConversationSchema } }
    },
    500: {
      description: 'Server or upstream failure',
      content: { 'application/json': { schema: SocialConversationSchema } }
    }
  }
});

export const profileV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}',
  summary: 'Get user profile',
  description:
    'Returns profile fields for a user. Optional `about_account` / `aboutAccount` (truthy) adds `about_account` on the user when available.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.',
        example: 'X'
      })
    }),
    query: aboutAccountQuery
  },
  responses: {
    200: {
      description: 'Profile (check `code`)',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    },
    400: {
      description: 'Invalid path or query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description:
        'User not found, suspended (`reason`: `suspended`, `message`: User is suspended), or unavailable',
      content: { 'application/json': { schema: UserAPIResponseSchema } }
    }
  }
});

export const profileAboutV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/about',
  summary: 'Get About Account stats',
  description:
    'Returns the same `about_account` object as `/2/profile/{handle}` with `about_account` / `aboutAccount` enabled, without fetching the full profile.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.',
        example: 'X'
      })
    })
  },
  responses: {
    200: {
      description: 'About metadata (check `code`); `about_account` omitted when upstream has none',
      content: { 'application/json': { schema: ProfileAboutAPIResponseSchema } }
    },
    400: {
      description: 'Invalid path parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'User not found',
      content: { 'application/json': { schema: ProfileAboutAPIResponseSchema } }
    }
  }
});

export const profileStatusesV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/statuses',
  summary: 'List user statuses',
  description:
    'Optional `since` (Unix time): when used without `cursor`, returns **204 No Content** if no posts in the page are newer than that instant; otherwise returns the normal JSON timeline. Values ≥ 1e12 are treated as milliseconds; smaller values as seconds.',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.'
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
        .openapi({ description: 'Pagination cursor from prior response' }),
      since: z.coerce.number().finite().min(0).optional().openapi({
        description:
          'Unix timestamp (seconds, or ms if ≥ 1e12). Without `cursor`, 204 if no post is strictly newer than this time.'
      }),
      with_replies: z.string().optional().openapi({
        description:
          'If truthy (`1`, `true`, `yes`, `on`, or empty), include replies using alternate upstream timelines'
      }),
      groupthreads: z.string().optional().openapi({
        description:
          'If truthy (`1`, `true`, etc.), return `results` as a mix of `type: "status"` and `type: "thread"` entries (grouped conversation rows).'
      }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Timeline page (flat or grouped when `groupthreads` is set)',
      content: {
        'application/json': {
          schema: z.union([APISearchResultsSchema, APIGroupedSearchResultsSchema])
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
      description: 'User not found or empty timeline',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    }
  }
});

export const profileArticlesV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/articles',
  summary: 'List user articles',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.'
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
        .openapi({ description: 'Pagination cursor from prior response' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Articles timeline page',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'User not found or empty timeline',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    }
  }
});

export const profileMediaV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/media',
  summary: 'List user posts with media',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.'
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
        .openapi({ description: 'Pagination cursor from prior response' }),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Media timeline page',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    400: {
      description: 'Invalid path or query parameters (e.g. `count` out of range)',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'User not found or empty timeline',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    }
  }
});

export const profileFollowersV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/followers',
  summary: 'List followers of a user',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.'
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
        .openapi({ description: 'Pagination cursor from prior response' })
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
      description: 'User not found or list unavailable',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const profileFollowingV2Route = createRoute({
  method: 'get',
  path: '/2/profile/{handle}/following',
  summary: 'List following of user',
  request: {
    params: z.object({
      handle: z.string().openapi({
        description:
          'Username without @, or numeric user id as `id:<rest_id>` (e.g. `id:783214`). Case-insensitive `id:` prefix.'
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
        .openapi({ description: 'Pagination cursor from prior response' })
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
      description: 'User not found or list unavailable',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
    }
  }
});

export const searchV2Route = createRoute({
  method: 'get',
  path: '/2/search',
  summary: 'Search posts',
  request: {
    query: z.object({
      q: twitterSearchQueryString({
        description: `Search query (non-empty, max ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH} characters)`,
        example: 'puppies',
        maxLength: TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH
      }),
      feed: z.enum(['latest', 'top', 'media']).optional().openapi({
        description: 'Search tab (default latest)',
        default: 'latest'
      }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 30)',
        default: 30
      }),
      cursor: z.string().optional(),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    400: {
      description: `Invalid \`q\` parameter (empty or longer than ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH} characters)`,
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No results or timeline unavailable',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APISearchResultsSchema } }
    }
  }
});

export const searchUsersV2Route = createRoute({
  method: 'get',
  path: '/2/search/users',
  summary: 'Search people',
  description:
    'Search accounts using the People tab of X search. Same envelope as `/2/profile/{handle}/followers` (`code`, `results`, `cursor`). Pass `cursor.bottom` back as `cursor` for the next page. `/2/typeahead` is the lighter, unpaginated autocomplete over the same corpus.',
  request: {
    query: z.object({
      q: twitterSearchQueryString({
        description: `Search query (non-empty, max ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH} characters)`,
        example: 'jack',
        maxLength: TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH
      }),
      count: z.coerce.number().int().min(1).max(100).optional().openapi({
        description: 'Page size (default 30)',
        default: 30
      }),
      cursor: z.string().optional(),
      ...langQuery.shape
    })
  },
  responses: {
    200: {
      description: 'Matching accounts',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: `Invalid \`q\` parameter (empty or longer than ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH} characters)`,
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'No results or timeline unavailable',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

const trendsTypeDescription = `Explore timeline kind. Supported: ${PUBLIC_EXPLORE_TIMELINE_KINDS.join(', ')}`;

const typeaheadResultTypeDescription =
  'Comma-separated suggestion kinds to request from X: `events`, `users`, `topics` (default: all three). Other values are ignored. Hashtag-style hits appear under `topics`.';

export const typeaheadV2Route = createRoute({
  method: 'get',
  path: '/2/typeahead',
  summary: 'Search typeahead suggestions',
  description: 'Autocomplete suggestions from X/Twitter search',
  request: {
    query: z.object({
      q: twitterSearchQueryString({
        description: 'Prefix or query string',
        example: 'example'
      }),
      result_type: z.string().optional().openapi({
        description: typeaheadResultTypeDescription,
        example: 'events,users,topics'
      }),
      src: z.string().optional().openapi({
        description: 'Upstream `src` hint (default: search_box)',
        example: 'search_box'
      })
    })
  },
  responses: {
    200: {
      description: 'Typeahead payload',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    400: {
      description: 'Invalid query parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    404: {
      description: 'Upstream returned an error payload for this query',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    }
  }
});

export const trendsV2Route = createRoute({
  method: 'get',
  path: '/2/trends',
  summary: 'Get trending topics',
  request: {
    query: z.object({
      type: z
        .enum(
          PUBLIC_EXPLORE_TIMELINE_KINDS as [
            PublicExploreTimelineKind,
            ...PublicExploreTimelineKind[]
          ]
        )
        .optional()
        .openapi({
          description: trendsTypeDescription,
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
      description: 'Trends unavailable',
      content: { 'application/json': { schema: APITrendsResponseSchema } }
    },
    500: {
      description: 'Upstream or processing error',
      content: { 'application/json': { schema: APITrendsResponseSchema } }
    }
  }
});
