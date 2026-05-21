/**
 * Zod + OpenAPI schemas for FxTwitter API v2 JSON responses.
 * Exported `z.infer` types are the canonical shapes for shared API fields (including `APITwitterStatus`).
 */
import { z } from '@hono/zod-openapi';

const indicesTuple = z
  .tuple([z.number(), z.number()])
  .openapi({ description: 'Start and end UTF-16 indices' });

export const APIFacetSchema = z.object({
  type: z.string().openapi({
    description:
      'Facet kind: e.g. url, mention, hashtag, bold, media, custom_emoji (Mastodon custom emoji image)'
  }),
  indices: indicesTuple,
  original: z.string().optional(),
  replacement: z.string().optional(),
  display: z.string().optional(),
  id: z.string().optional()
});

export const APITranslateSchema = z.object({
  text: z.string(),
  source_lang: z.string(),
  source_lang_en: z.string(),
  target_lang: z.string(),
  provider: z.string()
});

export const APIPollChoiceSchema = z.object({
  label: z.string(),
  count: z.number(),
  percentage: z.number()
});

export const APIPollSchema = z.object({
  choices: z.array(APIPollChoiceSchema),
  total_votes: z.number(),
  ends_at: z.string(),
  time_left_en: z.string()
});

/** Parent post / account context when this status is a reply (FxTwitter, FxBluesky, Mastodon APIs). */
export const APIReplyingToSchema = z
  .object({
    screen_name: z
      .string()
      .openapi({ description: 'Handle or account id used in permalinks (@user on X).' }),
    status: z
      .string()
      .openapi({ description: 'Parent post id (X: snowflake; Bluesky: record key).' }),
    url: z.string().optional().openapi({ description: 'Permalink to the parent post when known.' }),
    profile_url: z
      .string()
      .optional()
      .openapi({ description: 'Permalink to the parent author profile when known.' }),
    display_name: z
      .string()
      .optional()
      .openapi({ description: 'Display name of the parent author when known.' })
  })
  .openapi('APIReplyingTo');

export type APIReplyingTo = z.infer<typeof APIReplyingToSchema>;

export const TweetMediaVariantSchema = z.object({
  bitrate: z.number(),
  content_type: z.string(),
  url: z.string()
});

export const APIVideoFormatSchema = z.object({
  container: z.enum(['mp4', 'webm', 'm3u8']).optional(),
  codec: z.enum(['h264', 'hevc', 'vp9', 'av1']).optional(),
  bitrate: z.number().optional(),
  url: z.string(),
  size: z.number().optional(),
  height: z.number().optional(),
  width: z.number().optional()
});

/** Twitter photo size variant (`?name=` on pbs.twimg.com). */
export const APIPhotoFormatSchema = z.object({
  name: z.string(),
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional()
});

export const APIMediaBaseSchema = z.object({
  id: z.string().optional(),
  format: z.string().optional(),
  type: z.enum(['photo', 'video', 'gif', 'mosaic_photo']),
  url: z.string(),
  transcode_url: z.string().optional().nullable(),
  width: z.number(),
  height: z.number()
});

export const APIPhotoSchema = z.object({
  id: z.string().optional(),
  format: z.string().optional(),
  type: z.enum(['photo', 'gif']),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  transcode_url: z.string().optional().nullable(),
  altText: z.string().optional(),
  formats: z.array(APIPhotoFormatSchema).optional()
});

/** Same shape as `APIUser.about_account` (X “About this account” metadata). */
export const APIAboutAccountSchema = z
  .object({
    based_in: z.string().nullable().optional(),
    location_accurate: z.boolean().optional(),
    created_country_accurate: z.boolean().nullable().optional(),
    source: z.string().nullable().optional(),
    username_changes: z
      .object({
        count: z.number(),
        last_changed_at: z.string().nullable()
      })
      .optional()
  })
  .openapi('APIAboutAccount');

export const APIUserSchema = z
  .object({
    type: z
      .literal('profile')
      .openapi({ description: 'Discriminator: full user profile (API v2).' }),
    id: z.string(),
    name: z.string(),
    screen_name: z.string(),
    avatar_url: z.string().nullable(),
    banner_url: z.string().nullable(),
    description: z.string(),
    raw_description: z.object({
      text: z.string(),
      facets: z.array(APIFacetSchema)
    }),
    location: z.string(),
    url: z.string(),
    protected: z.boolean(),
    followers: z.number(),
    following: z.number(),
    statuses: z.number(),
    media_count: z.number(),
    likes: z.number(),
    joined: z.string(),
    website: z
      .object({
        url: z.string(),
        display_url: z.string()
      })
      .nullable(),
    birthday: z
      .object({
        day: z.number().optional(),
        month: z.number().optional(),
        year: z.number().optional()
      })
      .nullable()
      .optional(),
    verification: z
      .object({
        verified: z.boolean(),
        type: z.enum(['organization', 'government', 'individual']).nullable(),
        verified_at: z.string().nullable().optional(),
        identity_verified: z.boolean().optional(),
        /** Bluesky: issuer handle (`bsky.app`), issuer DID, or `trusted_verifier` when upstream omits `verifications`. */
        verified_by: z.string().optional()
      })
      .optional(),
    about_account: APIAboutAccountSchema.optional(),
    /** True when this user object came from a post/thread author stub (no full counts, banner, or bio). Clients should fetch `/profile` for rich UI. */
    profile_embed: z.boolean().optional()
  })
  .openapi('APIUser');

export const APIVideoSchema = z.object({
  id: z.string().optional(),
  format: z.string().optional(),
  type: z.enum(['video', 'gif']),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  thumbnail_url: z.string().optional().nullable(),
  transcode_url: z.string().optional().nullable(),
  duration: z.number(),
  filesize: z.number().optional(),
  formats: z.array(APIVideoFormatSchema),
  publisher: APIUserSchema.optional().nullable()
});

export const APIExternalMediaSchema = z.object({
  type: z.literal('video'),
  url: z.string(),
  thumbnail_url: z.string().optional(),
  height: z.number().optional(),
  width: z.number().optional()
});

export const APIMosaicPhotoSchema = z.object({
  id: z.string().optional(),
  format: z.string().optional(),
  type: z.literal('mosaic_photo'),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  formats: z.object({
    webp: z.string(),
    jpeg: z.string()
  })
});

/** Link preview from Twitter GraphQL (`summary_large_image`, `summary`, etc.). Exposed as `card` on `APITwitterStatus`. */
export const APICardSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  domain: z.string().optional(),
  card_name: z.string().optional(),
  image: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      url: z.string().optional(),
      alt: z.string().optional()
    })
    .optional()
});

export const APIBroadcastSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
  state: z.enum(['LIVE', 'ENDED']),
  broadcaster: z.object({
    username: z.string(),
    display_name: z.string(),
    id: z.string()
  }),
  stream: z.object({ url: z.string() }).optional(),
  title: z.string(),
  source: z.string(),
  orientation: z.enum(['landscape', 'portrait']),
  broadcast_id: z.string(),
  media_id: z.string(),
  media_key: z.string(),
  is_high_latency: z.boolean(),
  thumbnail: z.object({
    original: z.object({ url: z.string() }),
    small: z.object({ url: z.string() }).optional(),
    medium: z.object({ url: z.string() }).optional(),
    large: z.object({ url: z.string() }).optional(),
    x_large: z.object({ url: z.string() }).optional()
  })
});

export const APIMediaContainerSchema = z.object({
  external: APIExternalMediaSchema.optional(),
  photos: z.array(APIPhotoSchema).optional(),
  videos: z.array(APIVideoSchema).optional(),
  all: z
    .array(
      z.union([
        APIPhotoSchema,
        APIVideoSchema,
        APIMosaicPhotoSchema,
        z.object({
          id: z.string().optional(),
          format: z.string().optional(),
          type: z.string(),
          url: z.string(),
          width: z.number(),
          height: z.number()
        })
      ])
    )
    .optional(),
  mosaic: APIMosaicPhotoSchema.optional(),
  broadcast: APIBroadcastSchema.optional()
});

/** User who reposted/retweeted this status (outer wrapper); null when the payload is the original post. */
export const APIRepostedBySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    screen_name: z.string(),
    avatar_url: z.string().nullable().optional(),
    url: z.string().optional()
  })
  .openapi('APIRepostedBy');

export const APITwitterCommunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  created_at: z.string(),
  search_tags: z.array(z.string()),
  is_nsfw: z.boolean(),
  topic: z.string().nullable(),
  admin: APIUserSchema.nullable().optional(),
  creator: APIUserSchema.nullable().optional(),
  join_policy: z.enum(['Open', 'Closed']),
  invites_policy: z.enum(['MemberInvitesAllowed', 'MemberInvitesDisabled']),
  is_pinned: z.boolean()
});

/** Legacy Twitter API / embed (`legacyAPI`): Birdwatch subtitle entities (`TimelineUrl`, indices, etc.). */
export const APITwitterCommunityNoteLegacySchema = z.object({
  text: z.string(),
  entities: z.array(z.record(z.string(), z.unknown()))
});

/** FxTwitter API v2: community note rich text as `APIFacet` (same model as `raw_text.facets`). */
export const APITwitterCommunityNoteSchema = z.object({
  text: z.string(),
  facets: z.array(APIFacetSchema)
});

/** Twitter GraphQL media entity — shape varies; kept loose for OpenAPI. */
export const TwitterApiMediaLooseSchema = z.record(z.string(), z.unknown());

/** Draft.js-style article body block (Twitter `content_state.blocks`). */
export const TwitterArticleContentBlockSchema = z.object({
  key: z.string(),
  data: z.record(z.string(), z.unknown()),
  entityRanges: z.array(
    z.object({
      key: z.number(),
      length: z.number(),
      offset: z.number()
    })
  ),
  inlineStyleRanges: z.array(
    z.object({
      length: z.number(),
      offset: z.number(),
      style: z.string()
    })
  ),
  text: z.string(),
  type: z.string()
});

const TwitterArticleEntityMarkdownSchema = z.object({
  key: z.string(),
  value: z.object({
    type: z.literal('MARKDOWN'),
    mutability: z.literal('Mutable'),
    data: z.object({
      entityKey: z.string(),
      markdown: z.string()
    })
  })
});

const TwitterArticleEntityMediaSchema = z.object({
  key: z.string(),
  value: z.object({
    type: z.literal('MEDIA'),
    mutability: z.literal('Immutable'),
    data: z.object({
      entityKey: z.string(),
      mediaItems: z.array(
        z.object({
          localMediaId: z.string(),
          mediaCategory: z.string(),
          mediaId: z.string()
        })
      )
    })
  })
});

const TwitterArticleEntityTweetSchema = z.object({
  key: z.string(),
  value: z.object({
    type: z.literal('TWEET'),
    mutability: z.literal('Immutable'),
    data: z.object({
      tweetId: z.string()
    })
  })
});

export const TwitterApiImageSchema = z.object({
  __typename: z.literal('ApiImage'),
  original_img_height: z.number(),
  original_img_width: z.number(),
  original_img_url: z.string(),
  color_info: z.object({
    palette: z.array(
      z.object({
        percentage: z.number(),
        rgb: z.object({ red: z.number(), green: z.number(), blue: z.number() })
      })
    )
  })
});

export const TwitterApiVideoSchema = z.object({
  __typename: z.union([z.literal('ApiVideo'), z.literal('ApiGif')]),
  type: z.union([z.literal('video'), z.literal('animated_gif')]),
  id: z.string(),
  id_str: z.string(),
  ext_alt_text: z.string().nullable(),
  ext_media_color: z.object({
    palette: z.array(
      z.object({
        percentage: z.number(),
        rgb: z.object({ red: z.number(), green: z.number(), blue: z.number() })
      })
    )
  }),
  media_url: z.string(),
  media_url_https: z.string(),
  url: z.string(),
  display_url: z.string(),
  expanded_url: z.string(),
  original_info: z.object({
    height: z.number(),
    width: z.number()
  }),
  sizes: z.object({
    original: z.object({
      h: z.number(),
      resize: z.literal('fit'),
      w: z.number()
    })
  }),
  video_info: z.object({
    aspect_ratio: z.tuple([z.number(), z.number()]),
    duration_millis: z.number(),
    variants: z.array(
      z.object({
        bitrate: z.number(),
        content_type: z.string(),
        url: z.string()
      })
    )
  })
});

const TwitterApiMediaSchema = z.object({
  id: z.string(),
  media_key: z.string(),
  media_id: z.string(),
  media_info: z.union([TwitterApiImageSchema, TwitterApiVideoSchema])
});

export const TwitterArticleEntityMapEntrySchema = z.union([
  TwitterArticleEntityMarkdownSchema,
  TwitterArticleEntityMediaSchema,
  TwitterArticleEntityTweetSchema
]);

/** Mirrors Twitter `content_state`. Empty fallbacks use `default([])` so `blocks` / `entityMap` are always arrays. */
export const TwitterArticleContentStateSchema = z.object({
  blocks: z.array(TwitterArticleContentBlockSchema).default([]),
  entityMap: z.array(TwitterArticleEntityMapEntrySchema).default([])
});

export type TwitterArticleContentBlock = z.infer<typeof TwitterArticleContentBlockSchema>;
export type TwitterArticleContentState = z.infer<typeof TwitterArticleContentStateSchema>;
export type TwitterArticleEntityMapEntry = z.infer<typeof TwitterArticleEntityMapEntrySchema>;

export const TwitterArticleSchema = z.object({
  created_at: z.string(),
  modified_at: z.string().optional(),
  id: z.string(),
  title: z.string(),
  preview_text: z.string(),
  cover_media: TwitterApiMediaSchema,
  content: TwitterArticleContentStateSchema,
  media_entities: z.array(TwitterApiMediaSchema)
});

export const APITombstoneReasonSchema = z
  .enum(['deleted', 'suspended', 'private', 'blocked', 'unavailable'])
  .openapi({ description: 'Why the post is unavailable' });

export type APITombstoneReason = z.infer<typeof APITombstoneReasonSchema>;

export const APIStatusTombstoneSchema = z
  .object({
    type: z
      .literal('tombstone')
      .openapi({ description: 'Placeholder for an unavailable post (quote/thread).' }),
    provider: z.enum(['twitter', 'bluesky', 'mastodon', 'tiktok', 'instagram', 'threads']),
    reason: APITombstoneReasonSchema,
    message: z.string(),
    id: z.string().optional(),
    url: z.string().optional(),
    author: APIUserSchema.partial().optional(),
    at_uri: z.string().optional(),
    cid: z.string().optional()
  })
  .openapi('APIStatusTombstone');

export type APIStatusTombstone = z.infer<typeof APIStatusTombstoneSchema>;

/** Explicit recursive output type so consumers are not stuck with `unknown` from `z.ZodTypeAny` + `z.lazy`. */
export type APITwitterStatus = {
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  quotes: number;
  replies: number;
  quote?: APITwitterStatus | APIStatusTombstone;
  poll?: z.infer<typeof APIPollSchema>;
  author: z.infer<typeof APIUserSchema>;
  media: z.infer<typeof APIMediaContainerSchema>;
  raw_text: {
    text: string;
    display_text_range: [number, number];
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  translation?: z.infer<typeof APITranslateSchema>;
  possibly_sensitive: boolean;
  replying_to: APIReplyingTo | null;
  source: string | null;
  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'twitter';
  views?: number | null;
  bookmarks?: number | null;
  community?: z.infer<typeof APITwitterCommunitySchema>;
  article?: z.infer<typeof TwitterArticleSchema>;
  is_note_tweet: boolean;
  community_note:
    | z.infer<typeof APITwitterCommunityNoteSchema>
    | z.infer<typeof APITwitterCommunityNoteLegacySchema>
    | null;
  reposted_by: z.infer<typeof APIRepostedBySchema> | null;
  card?: z.infer<typeof APICardSchema>;
  type: 'status';
};

/* Self-referential `z.lazy` needs `z.ZodType<APITwitterStatus>` so output is not widened to `unknown`.
 * `.openapi` must live on the inner object so discriminated unions (e.g. TimelineEntryTwitter) emit a real
 * `type` discriminator mapping; on the lazy wrapper, zod-openapi produced `"undefined"` and broke doc prerender. */
export const APITwitterStatusSchema: z.ZodType<APITwitterStatus> = z.lazy(() =>
  z
    .object({
      type: z
        .literal('status')
        .openapi({ description: 'Discriminator: single post/status (API v2).' }),
      id: z.string(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      quotes: z.number(),
      replies: z.number(),
      quote: z.union([APITwitterStatusSchema, APIStatusTombstoneSchema]).optional(),
      poll: APIPollSchema.optional(),
      author: APIUserSchema,
      media: APIMediaContainerSchema,
      raw_text: z.object({
        text: z.string(),
        display_text_range: z.tuple([z.number(), z.number()]),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      translation: APITranslateSchema.optional(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']),
      provider: z.literal('twitter'),
      views: z.number().nullable().optional(),
      bookmarks: z.number().nullable().optional(),
      community: APITwitterCommunitySchema.optional(),
      article: TwitterArticleSchema.optional(),
      is_note_tweet: z.boolean(),
      community_note: APITwitterCommunityNoteSchema.nullable(),
      reposted_by: APIRepostedBySchema.nullable(),
      card: APICardSchema.optional()
    })
    .openapi('APITwitterStatus')
);

/** Bluesky normalized post (API v2–shaped; omits Twitter-only fields). */
export type APIBlueskyStatus = {
  id: string;
  cid?: string;
  at_uri?: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  quotes?: number;
  replies: number;
  quote?: APIBlueskyStatus | APIStatusTombstone;
  poll?: z.infer<typeof APIPollSchema>;
  author: z.infer<typeof APIUserSchema>;
  media: z.infer<typeof APIMediaContainerSchema>;
  raw_text: {
    text: string;
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  translation?: z.infer<typeof APITranslateSchema>;
  possibly_sensitive: boolean;
  replying_to: APIReplyingTo | null;
  source: string | null;
  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'bluesky';
  /** Present when this row is a repost (`reasonRepost` in author feed). */
  reposted_by?: z.infer<typeof APIRepostedBySchema>;
  type: 'status';
};

export const APIBlueskyStatusSchema: z.ZodType<APIBlueskyStatus> = z.lazy(() =>
  z
    .object({
      type: z.literal('status').openapi({ description: 'Discriminator: single status' }),
      id: z.string(),
      cid: z.string().optional(),
      at_uri: z.string().optional(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      quotes: z.number().optional(),
      replies: z.number(),
      quote: z.union([APIBlueskyStatusSchema, APIStatusTombstoneSchema]).optional(),
      poll: APIPollSchema.optional(),
      author: APIUserSchema,
      media: APIMediaContainerSchema,
      raw_text: z.object({
        text: z.string(),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      translation: APITranslateSchema.optional(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']),
      provider: z.literal('bluesky'),
      reposted_by: APIRepostedBySchema.optional()
    })
    .openapi('APIBlueskyStatus')
);

export const UserAPIResponseSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    user: APIUserSchema.optional(),
    /** Present when the account exists on X but is suspended (`code` 404). */
    reason: z.literal('suspended').optional().openapi({
      description: 'Set to `suspended` when the user is suspended; omitted for plain not found.'
    }),
    /** X `rest_id` when known (e.g. from `user_results.rest_id` on suspended lookups). */
    id: z
      .string()
      .optional()
      .openapi({ description: 'Numeric user id when the upstream payload includes it.' })
  })
  .openapi('UserAPIResponse');

export const ProfileAboutAPIResponseSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    about_account: APIAboutAccountSchema.optional()
  })
  .openapi('ProfileAboutAPIResponse');

export const SearchCursorSchema = z.object({
  top: z.string().nullable(),
  bottom: z.string().nullable()
});

export const APISearchResultsSchema = z
  .object({
    code: z.number(),
    results: z.array(APITwitterStatusSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APISearchResults');

export const APISearchResultsBlueskySchema = z
  .object({
    code: z.number(),
    results: z.array(APIBlueskyStatusSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APISearchResultsBluesky');

/** Normalized `app.bsky.notification.listNotifications` reason (unknown values map to `unknown`). */
export const APIBlueskyNotificationReasonSchema = z.enum([
  'like',
  'repost',
  'follow',
  'mention',
  'reply',
  'quote',
  'starterpack-joined',
  'verified',
  'unverified',
  'unknown'
]);

export const APIBlueskyNotificationSchema = z
  .object({
    id: z.string().openapi({ description: 'Notification record CID' }),
    at_uri: z.string(),
    reason: APIBlueskyNotificationReasonSchema,
    reason_subject: z
      .string()
      .optional()
      .openapi({ description: 'AT-URI the reason refers to (e.g. liked post)' }),
    actor: APIUserSchema,
    is_read: z.boolean(),
    created_at: z.string(),
    created_timestamp: z.number(),
    subject_status: APIBlueskyStatusSchema.optional()
  })
  .openapi('APIBlueskyNotification');

export const APIBlueskyNotificationsResultsSchema = z
  .object({
    code: z.number(),
    results: z.array(APIBlueskyNotificationSchema),
    cursor: SearchCursorSchema,
    unread_count: z.number().optional(),
    seen_at: z.string().optional().openapi({
      description: 'Opaque cursor / seen marker for pagination when upstream supports it'
    })
  })
  .openapi('APIBlueskyNotificationsResults');

/** Grouped thread snippet in a profile/search-style timeline (`?groupthreads=1`). */
export const TimelineThreadTwitterSchema = z
  .object({
    type: z.literal('thread').openapi({
      description: 'Discriminator: grouped conversation snippet in a timeline (API v2).'
    }),
    conversation_id: z.string(),
    statuses: z.array(APITwitterStatusSchema),
    all_status_ids: z.array(z.string()).optional(),
    truncated: z.boolean().openapi({
      description:
        'True when the conversation has more posts than listed in `statuses` (Twitter: `allTweetIds` length vs visible). False when counts match or upstream did not provide `allTweetIds`.'
    })
  })
  .openapi('TimelineThreadTwitter');
export const TimelineEntryTwitterSchema = z
  .discriminatedUnion(
    'type',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.lazy + zod 4 discriminatedUnion typing
    [APITwitterStatusSchema, TimelineThreadTwitterSchema] as any
  )
  .openapi('TimelineEntryTwitter');

export const APIGroupedSearchResultsSchema = z
  .object({
    code: z.number(),
    results: z.array(TimelineEntryTwitterSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APIGroupedSearchResults');

export const TimelineThreadBlueskySchema = z
  .object({
    type: z.literal('thread').openapi({
      description: 'Discriminator: grouped conversation snippet in a timeline (API v2).'
    }),
    conversation_id: z.string(),
    statuses: z.array(APIBlueskyStatusSchema),
    all_status_ids: z.array(z.string()).optional(),
    truncated: z.boolean().openapi({
      description:
        'Always false for Bluesky grouped timelines (no native full-thread id list on feed rows).'
    })
  })
  .openapi('TimelineThreadBluesky');

export const TimelineEntryBlueskySchema = z
  .discriminatedUnion(
    'type',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.lazy + zod 4 discriminatedUnion typing
    [APIBlueskyStatusSchema, TimelineThreadBlueskySchema] as any
  )
  .openapi('TimelineEntryBluesky');

export const APIGroupedSearchResultsBlueskySchema = z
  .object({
    code: z.number(),
    results: z.array(TimelineEntryBlueskySchema),
    cursor: SearchCursorSchema
  })
  .openapi('APIGroupedSearchResultsBluesky');

/** Mastodon / ActivityPub normalized post (same baseline as Bluesky API v2). */
export type APIMastodonStatus = {
  type: 'status';
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  quotes?: number;
  replies: number;
  quote?: APIMastodonStatus | APIStatusTombstone;
  poll?: z.infer<typeof APIPollSchema>;
  author: z.infer<typeof APIUserSchema>;
  media: z.infer<typeof APIMediaContainerSchema>;
  raw_text: {
    text: string;
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  translation?: z.infer<typeof APITranslateSchema>;
  possibly_sensitive: boolean;
  replying_to: APIReplyingTo | null;
  source: string | null;
  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'mastodon';
  reposted_by?: z.infer<typeof APIRepostedBySchema>;
};

export const APIMastodonStatusSchema: z.ZodType<APIMastodonStatus> = z.lazy(() =>
  z
    .object({
      type: z
        .literal('status')
        .openapi({ description: 'Discriminator: single post/status (API v2).' }),
      id: z.string(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      quotes: z.number().optional(),
      replies: z.number(),
      quote: z.union([APIMastodonStatusSchema, APIStatusTombstoneSchema]).optional(),
      poll: APIPollSchema.optional(),
      author: APIUserSchema,
      media: APIMediaContainerSchema,
      raw_text: z.object({
        text: z.string(),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      translation: APITranslateSchema.optional(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']),
      provider: z.literal('mastodon'),
      reposted_by: APIRepostedBySchema.optional()
    })
    .openapi('APIMastodonStatus')
);

/** Mastodon `GET /2/mastodon/{domain}/status/{id}` — matches FxTwitter `GET /2/status/{id}` (no `thread`). */
export const SocialStatusMastodonSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: APIMastodonStatusSchema.nullable(),
    author: APIUserSchema.nullable()
  })
  .openapi('SocialStatusMastodon');

export type SocialStatusMastodon = z.infer<typeof SocialStatusMastodonSchema>;

export const SocialThreadMastodonSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: APIMastodonStatusSchema.nullable(),
    thread: z.array(z.union([APIMastodonStatusSchema, APIStatusTombstoneSchema])).nullable(),
    author: APIUserSchema.nullable()
  })
  .openapi('SocialThreadMastodon');

export type SocialThreadMastodon = z.infer<typeof SocialThreadMastodonSchema>;

export const SocialConversationMastodonSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: APIMastodonStatusSchema.nullable(),
    thread: z.array(z.union([APIMastodonStatusSchema, APIStatusTombstoneSchema])).nullable(),
    replies: z.array(APIMastodonStatusSchema).nullable(),
    author: APIUserSchema.nullable(),
    cursor: z
      .object({
        bottom: z.string().nullable()
      })
      .nullable()
  })
  .openapi('SocialConversationMastodon');

export type SocialConversationMastodon = z.infer<typeof SocialConversationMastodonSchema>;

/**
 * Dependent row (e.g. comment) derived from a parent status; not a standalone timeline post.
 * Reusable across providers (Instagram comments today, TikTok comments later).
 */
export type APISubstatus = {
  type: 'substatus';
  parent_id: string;
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  replies: number;
  author: z.infer<typeof APIUserSchema>;
  media?: z.infer<typeof APIMediaContainerSchema> | null;
  raw_text: {
    text: string;
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  possibly_sensitive: boolean;
  replying_to?: APIReplyingTo | null;
  source: string | null;
  embed_card?: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'instagram' | 'tiktok' | 'threads';
  /** Provider-native media / comment pk when `id` is a public shortcode or other surface id. */
  media_pk?: string;
};

export const APISubstatusSchema: z.ZodType<APISubstatus> = z.lazy(() =>
  z
    .object({
      type: z
        .literal('substatus')
        .openapi({ description: 'Discriminator: child of a parent status (e.g. comment).' }),
      parent_id: z
        .string()
        .openapi({ description: 'Parent post id (e.g. Instagram shortcode / media key).' }),
      id: z.string(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      replies: z.number(),
      author: APIUserSchema,
      media: APIMediaContainerSchema.nullable().optional(),
      raw_text: z.object({
        text: z.string(),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable().optional(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']).optional(),
      provider: z.enum(['instagram', 'tiktok', 'threads']),
      media_pk: z.string().optional().openapi({
        description:
          'Underlying media or comment pk from the provider when `id` is a shortcode or other canonical surface id.'
      })
    })
    .openapi('APISubstatus')
);

/** Instagram web-normalized post (API v2 baseline). */
export type APIInstagramStatus = {
  type: 'status';
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  quotes?: number;
  replies: number;
  quote?: APIInstagramStatus | APIStatusTombstone;
  poll?: z.infer<typeof APIPollSchema>;
  author: z.infer<typeof APIUserSchema>;
  media: z.infer<typeof APIMediaContainerSchema>;
  raw_text: {
    text: string;
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  translation?: z.infer<typeof APITranslateSchema>;
  possibly_sensitive: boolean;
  replying_to: APIReplyingTo | null;
  source: string | null;
  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'instagram';
  reposted_by?: z.infer<typeof APIRepostedBySchema>;
  /** Instagram numeric media pk when known (for comment pagination). */
  media_pk?: string;
};

export const APIInstagramStatusSchema: z.ZodType<APIInstagramStatus> = z.lazy(() =>
  z
    .object({
      type: z.literal('status').openapi({ description: 'Discriminator: single Instagram post.' }),
      id: z.string(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      quotes: z.number().optional(),
      replies: z.number(),
      quote: z.union([APIInstagramStatusSchema, APIStatusTombstoneSchema]).optional(),
      poll: APIPollSchema.optional(),
      author: APIUserSchema,
      media: APIMediaContainerSchema,
      raw_text: z.object({
        text: z.string(),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      translation: APITranslateSchema.optional(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']),
      provider: z.literal('instagram'),
      reposted_by: APIRepostedBySchema.optional(),
      media_pk: z.string().optional()
    })
    .openapi('APIInstagramStatus')
);

/** Threads web-normalized post (same baseline as Instagram API v2). */
export type APIThreadsStatus = {
  type: 'status';
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;
  likes: number;
  reposts: number;
  quotes?: number;
  replies: number;
  quote?: APIThreadsStatus | APIStatusTombstone;
  poll?: z.infer<typeof APIPollSchema>;
  author: z.infer<typeof APIUserSchema>;
  media: z.infer<typeof APIMediaContainerSchema>;
  raw_text: {
    text: string;
    facets: z.infer<typeof APIFacetSchema>[];
  };
  lang: string | null;
  translation?: z.infer<typeof APITranslateSchema>;
  possibly_sensitive: boolean;
  replying_to: APIReplyingTo | null;
  source: string | null;
  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: 'threads';
  reposted_by?: z.infer<typeof APIRepostedBySchema>;
  /** Numeric media pk (before `_userId` in `id`) for upstream pagination. */
  media_pk?: string;
};

export const APIThreadsStatusSchema: z.ZodType<APIThreadsStatus> = z.lazy(() =>
  z
    .object({
      type: z.literal('status').openapi({ description: 'Discriminator: single Threads post.' }),
      id: z.string(),
      url: z.string(),
      text: z.string(),
      created_at: z.string(),
      created_timestamp: z.number(),
      likes: z.number(),
      reposts: z.number(),
      quotes: z.number().optional(),
      replies: z.number(),
      quote: z.union([APIThreadsStatusSchema, APIStatusTombstoneSchema]).optional(),
      poll: APIPollSchema.optional(),
      author: APIUserSchema,
      media: APIMediaContainerSchema,
      raw_text: z.object({
        text: z.string(),
        facets: z.array(APIFacetSchema)
      }),
      lang: z.string().nullable(),
      translation: APITranslateSchema.optional(),
      possibly_sensitive: z.boolean(),
      replying_to: APIReplyingToSchema.nullable(),
      source: z.string().nullable(),
      embed_card: z.enum(['tweet', 'summary', 'summary_large_image', 'player']),
      provider: z.literal('threads'),
      reposted_by: APIRepostedBySchema.optional(),
      media_pk: z.string().optional()
    })
    .openapi('APIThreadsStatus')
);

export const APISearchResultsThreadsSchema = z
  .object({
    code: z.number(),
    results: z.array(APIThreadsStatusSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APISearchResultsThreads');

export type APISearchResultsThreads = z.infer<typeof APISearchResultsThreadsSchema>;

/** Status or tombstone row allowed in shared `SocialThread` / `SocialConversation` parents. */
export const SocialThreadStatusItemSchema = z.union([
  APITwitterStatusSchema,
  APIBlueskyStatusSchema,
  APIMastodonStatusSchema,
  APIInstagramStatusSchema,
  APIThreadsStatusSchema,
  APIStatusTombstoneSchema
]);

export type SocialThreadStatusItem = z.infer<typeof SocialThreadStatusItemSchema>;

export const SocialConversationReplyItemSchema = z.union([
  SocialThreadStatusItemSchema,
  APISubstatusSchema
]);

export const SocialThreadSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: SocialThreadStatusItemSchema.nullable().openapi({
      description: 'Focal post, or a tombstone when the post is unavailable'
    }),
    thread: z.array(SocialThreadStatusItemSchema).nullable(),
    author: APIUserSchema.nullable()
  })
  .openapi('SocialThread');

export const SocialConversationSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: SocialThreadStatusItemSchema.nullable(),
    thread: z.array(SocialThreadStatusItemSchema).nullable(),
    replies: z.array(SocialConversationReplyItemSchema).nullable(),
    author: APIUserSchema.nullable(),
    cursor: z
      .object({
        bottom: z.string().nullable()
      })
      .nullable()
  })
  .openapi('SocialConversation');

export const SocialThreadInstagramSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: APIInstagramStatusSchema.nullable(),
    thread: z.array(z.union([APIInstagramStatusSchema, APIStatusTombstoneSchema])).nullable(),
    author: APIUserSchema.nullable()
  })
  .openapi('SocialThreadInstagram');

export type SocialThreadInstagram = z.infer<typeof SocialThreadInstagramSchema>;

export const SocialConversationInstagramSchema = z
  .object({
    code: z.number().openapi({ description: 'HTTP-style status; mirrors response status code' }),
    status: APIInstagramStatusSchema.nullable(),
    thread: z.array(z.union([APIInstagramStatusSchema, APIStatusTombstoneSchema])).nullable(),
    replies: z.array(APISubstatusSchema).nullable(),
    author: APIUserSchema.nullable(),
    cursor: z
      .object({
        bottom: z.string().nullable()
      })
      .nullable()
  })
  .openapi('SocialConversationInstagram');

export type SocialConversationInstagram = z.infer<typeof SocialConversationInstagramSchema>;

export const APISearchResultsInstagramSchema = z
  .object({
    code: z.number(),
    results: z.array(APIInstagramStatusSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APISearchResultsInstagram');

export type APISearchResultsInstagram = z.infer<typeof APISearchResultsInstagramSchema>;

export const APISearchResultsMastodonSchema = z
  .object({
    code: z.number(),
    results: z.array(APIMastodonStatusSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APISearchResultsMastodon');

export const APIUserListResultsSchema = z
  .object({
    code: z.number(),
    results: z.array(APIUserSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APIUserListResults');

export const APIProfileRelationshipListSchema = z
  .object({
    code: z.number(),
    results: z.array(APIUserSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APIProfileRelationshipList');

export const APITrendGroupedTopicSchema = z.object({
  name: z.string()
});

export const APITrendSchema = z.object({
  name: z.string(),
  rank: z.string().nullable(),
  context: z.string().nullable(),
  grouped_topics: z.array(APITrendGroupedTopicSchema).optional()
});

export const APITrendsResponseSchema = z
  .object({
    code: z.number(),
    message: z.string().optional(),
    timeline_type: z.string(),
    trends: z.array(APITrendSchema),
    cursor: SearchCursorSchema
  })
  .openapi('APITrendsResponse');

export const APITypeaheadTopicResultContextTypeSchema = z.object({
  type: z.string()
});

export const APITypeaheadTopicResultContextSchema = z.object({
  display_string: z.string().optional(),
  redirect_url: z.string().optional(),
  types: z.array(APITypeaheadTopicResultContextTypeSchema).optional()
});

export const APITypeaheadTopicSchema = z
  .object({
    topic: z.string(),
    result_context: APITypeaheadTopicResultContextSchema.optional()
  })
  .openapi('APITypeaheadTopic');

export const APITypeaheadEventImageSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional()
});

export const APITypeaheadEventSchema = z
  .object({
    topic: z.string(),
    url: z.string().optional(),
    supporting_text: z.string().optional(),
    primary_image: APITypeaheadEventImageSchema.optional()
  })
  .openapi('APITypeaheadEvent');

export const APITypeaheadResponseSchema = z
  .object({
    code: z.number(),
    query: z.string(),
    num_results: z.number(),
    users: z.array(APIUserSchema),
    topics: z.array(APITypeaheadTopicSchema),
    events: z.array(APITypeaheadEventSchema)
  })
  .openapi('APITypeaheadResponse');

export const ApiQueryErrorSchema = z
  .object({
    code: z.literal(400),
    message: z.string()
  })
  .openapi('ApiQueryError');

export type APIFacet = z.infer<typeof APIFacetSchema>;
export type APITranslate = z.infer<typeof APITranslateSchema>;
export type APIPollChoice = z.infer<typeof APIPollChoiceSchema>;
export type APIPoll = z.infer<typeof APIPollSchema>;
export type APIVideoFormat = z.infer<typeof APIVideoFormatSchema>;
export type APIPhotoFormat = z.infer<typeof APIPhotoFormatSchema>;
export type APIMedia = z.infer<typeof APIMediaBaseSchema>;
export type APIPhoto = z.infer<typeof APIPhotoSchema>;
export type APIVideo = z.infer<typeof APIVideoSchema>;
export type APIExternalMedia = z.infer<typeof APIExternalMediaSchema>;
export type APIMosaicPhoto = z.infer<typeof APIMosaicPhotoSchema>;
export type APIBroadcast = z.infer<typeof APIBroadcastSchema>;
export type APIUser = z.infer<typeof APIUserSchema>;
export type APIRepostedBy = z.infer<typeof APIRepostedBySchema>;
export type APITwitterCommunityNoteLegacy = z.infer<typeof APITwitterCommunityNoteLegacySchema>;
export type APITwitterCommunityNote = z.infer<typeof APITwitterCommunityNoteSchema>;
export type APITwitterCommunity = z.infer<typeof APITwitterCommunitySchema>;
export type UserAPIResponse = z.infer<typeof UserAPIResponseSchema>;
export type ProfileAboutAPIResponse = z.infer<typeof ProfileAboutAPIResponseSchema>;
export type SearchCursor = z.infer<typeof SearchCursorSchema>;
export type APISearchResults = z.infer<typeof APISearchResultsSchema>;
export type APISearchResultsBluesky = z.infer<typeof APISearchResultsBlueskySchema>;
export type APIBlueskyNotificationReason = z.infer<typeof APIBlueskyNotificationReasonSchema>;
export type APIBlueskyNotification = z.infer<typeof APIBlueskyNotificationSchema>;
export type APIBlueskyNotificationsResults = z.infer<typeof APIBlueskyNotificationsResultsSchema>;
export type TimelineThreadTwitter = z.infer<typeof TimelineThreadTwitterSchema>;
export type TimelineEntryTwitter = z.infer<typeof TimelineEntryTwitterSchema>;
export type APIGroupedSearchResults = z.infer<typeof APIGroupedSearchResultsSchema>;
export type TimelineThreadBluesky = z.infer<typeof TimelineThreadBlueskySchema>;
export type TimelineEntryBluesky = z.infer<typeof TimelineEntryBlueskySchema>;
export type APIGroupedSearchResultsBluesky = z.infer<typeof APIGroupedSearchResultsBlueskySchema>;
export type APISearchResultsMastodon = z.infer<typeof APISearchResultsMastodonSchema>;
export type APIProfileRelationshipList = z.infer<typeof APIProfileRelationshipListSchema>;
export type APIUserListResults = z.infer<typeof APIUserListResultsSchema>;
export type APITrendGroupedTopic = z.infer<typeof APITrendGroupedTopicSchema>;
export type APITrend = z.infer<typeof APITrendSchema>;
export type APITrendsResponse = z.infer<typeof APITrendsResponseSchema>;
export type APITypeaheadTopic = z.infer<typeof APITypeaheadTopicSchema>;
export type APITypeaheadEvent = z.infer<typeof APITypeaheadEventSchema>;
export type APITypeaheadResponse = z.infer<typeof APITypeaheadResponseSchema>;
export type ApiQueryError = z.infer<typeof ApiQueryErrorSchema>;
