import { createRoute, z } from '@hono/zod-openapi';
import {
  ApiQueryErrorSchema,
  APIProfileRelationshipListSchema,
  APISearchResultsInstagramSchema,
  APITypeaheadResponseSchema,
  APIUserListResultsSchema,
  SocialConversationInstagramSchema,
  SocialThreadInstagramSchema,
  UserAPIResponseSchema
} from '../../realms/api/schemas';

/**
 * Instagram gates follower lists, likers, search, tagged posts and stories behind a login. Those
 * routes answer 501 when the deployment has no Instagram account proxy configured, rather than
 * returning an empty list that reads as "this account has none".
 */
const PROXY_ONLY_NOTE =
  'Requires an Instagram account proxy (`CREDENTIAL_KEY` + bundled `instagram.accounts`); returns 501 without one.';

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

const NO_PROXY_DESCRIPTION = 'No Instagram account proxy configured on this deployment';

export const instagramStatusLikesV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/status/{id}/likes',
  summary: 'List accounts that liked an Instagram post',
  description: `Instagram's closest analogue to X's repost/quote lists. Instagram serves one un-paginated page, so \`cursor.bottom\` is always null. ${PROXY_ONLY_NOTE}`,
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Post shortcode or permalink fragment', example: 'DXeh-kYiIge' })
    }),
    query: z.object({
      count: z.coerce.number().int().min(1).max(100).default(20).openapi({ default: 20 })
    })
  },
  responses: {
    200: {
      description: 'Likers',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid shortcode',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    501: {
      description: NO_PROXY_DESCRIPTION,
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

const relationshipRequest = {
  params: z.object({ username: z.string().openapi({ example: 'cristiano' }) }),
  query: z.object({
    count: z.coerce.number().int().min(1).max(100).default(20).openapi({ default: 20 }),
    cursor: z
      .string()
      .optional()
      .openapi({ description: 'Opaque pagination cursor (`cursor.bottom`)' })
  })
};

const relationshipResponses = {
  200: {
    description: 'Relationship page',
    content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
  },
  400: {
    description: 'Invalid cursor',
    content: { 'application/json': { schema: ApiQueryErrorSchema } }
  },
  404: {
    description: 'Not found',
    content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
  },
  500: {
    description: 'Upstream error',
    content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
  },
  501: {
    description: NO_PROXY_DESCRIPTION,
    content: { 'application/json': { schema: APIProfileRelationshipListSchema } }
  }
};

export const instagramProfileFollowersV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/followers',
  summary: 'List an Instagram account’s followers',
  description: PROXY_ONLY_NOTE,
  request: relationshipRequest,
  responses: relationshipResponses
});

export const instagramProfileFollowingV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/following',
  summary: 'List the accounts an Instagram account follows',
  description: PROXY_ONLY_NOTE,
  request: relationshipRequest,
  responses: relationshipResponses
});

export const instagramProfileTaggedV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/tagged',
  summary: 'List posts an Instagram account is tagged in',
  description: `The tagged grid, Instagram's nearest equivalent to X's \`/profile/{handle}/media\`. ${PROXY_ONLY_NOTE}`,
  request: {
    params: z.object({ username: z.string().openapi({ example: 'cristiano' }) }),
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
      description: 'Tagged page',
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
    },
    501: {
      description: NO_PROXY_DESCRIPTION,
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    }
  }
});

export const instagramProfileStoriesV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/profile/{username}/stories',
  summary: 'List an Instagram account’s active stories',
  description: `Stories expire after 24 hours and are not paginated. ${PROXY_ONLY_NOTE}`,
  request: {
    params: z.object({ username: z.string().openapi({ example: 'cristiano' }) })
  },
  responses: {
    200: {
      description: 'Active stories',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    },
    501: {
      description: NO_PROXY_DESCRIPTION,
      content: { 'application/json': { schema: APISearchResultsInstagramSchema } }
    }
  }
});

export const instagramSearchUsersV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/search/users',
  summary: 'Search Instagram accounts',
  description: `Instagram returns one ranked page with no cursor, so \`cursor.bottom\` is always null. ${PROXY_ONLY_NOTE}`,
  request: {
    query: z.object({
      query: z.string().min(1).max(50).openapi({ example: 'cristiano' }),
      count: z.coerce.number().int().min(1).max(50).default(20).openapi({ default: 20 })
    })
  },
  responses: {
    200: {
      description: 'Matching accounts',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    },
    501: {
      description: NO_PROXY_DESCRIPTION,
      content: { 'application/json': { schema: APIUserListResultsSchema } }
    }
  }
});

export const instagramTypeaheadV2Route = createRoute({
  method: 'get',
  path: '/2/instagram/typeahead',
  summary: 'Instagram blended typeahead',
  description: `Accounts, hashtags and places. Hashtags and places both land in \`topics\` (tagged via \`result_context.types\`); \`events\` is always empty, as Instagram has no equivalent. ${PROXY_ONLY_NOTE}`,
  request: {
    query: z.object({
      query: z.string().min(1).max(50).openapi({ example: 'cristiano' }),
      count: z.coerce.number().int().min(1).max(50).optional()
    })
  },
  responses: {
    200: {
      description: 'Typeahead results',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    400: {
      description: 'Invalid parameters',
      content: { 'application/json': { schema: ApiQueryErrorSchema } }
    },
    500: {
      description: 'Upstream error',
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    },
    501: {
      description: NO_PROXY_DESCRIPTION,
      content: { 'application/json': { schema: APITypeaheadResponseSchema } }
    }
  }
});
