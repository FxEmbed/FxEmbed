/* Types for various Twitter API objects.
   Note that a lot of these are not actually complete types. Many unused values may be missing.*/

type TimelineContent = {
  item?: {
    content?: {
      tombstone?: {
        timestoneInfo: {
          richText: {
            text: string;
          };
        };
      };
    };
  };
};

type TimelineInstruction = {
  addEntries?: {
    entries: {
      content: TimelineContent;
      entryId: string;
    }[];
  };
};

type TwitterAPIError = {
  code: number;
  message: string;
};

type TimelineBlobPartial = {
  globalObjects: {
    tweets: {
      [tweetId: string]: TweetPartial;
    };
    users: {
      [userId: string]: UserPartial;
    };
  };
  timeline: {
    instructions: TimelineInstruction[];
  };
  errors?: TwitterAPIError[];
  guestToken?: string;
};

type TweetMediaSize = {
  w: number;
  h: number;
  resize: 'crop' | 'fit';
};

type TweetMediaVariant = {
  bitrate: number;
  content_type: string;
  url: string;
};

type TcoExpansion = {
  display_url: string;
  expanded_url: string;
  indices: [number, number];
  url: string;
};

type TweetMedia = {
  additional_media_info: { monetizable: boolean };
  display_url: string;
  expanded_url: string;
  ext_media_color?: {
    palette?: MediaPlaceholderColor[];
  };
  ext_alt_text?: string;
  id_str: string;
  indices: [number, number];
  media_key: string;
  media_url: string;
  media_url_https: string;
  original_info: { width: number; height: number };
  sizes: {
    thumb: TweetMediaSize;
    large: TweetMediaSize;
    medium: TweetMediaSize;
    small: TweetMediaSize;
  };
  type: 'photo' | 'video' | 'animated_gif';
  url: string;
  video_info?: {
    aspect_ratio: [number, number];
    duration_millis: number;
    variants: TweetMediaVariant[];
  };
};

type CardValue = {
  type: 'BOOLEAN' | 'STRING';
  boolean_value: boolean;
  string_value: string;
};

type TweetCardBindingValues = {
  card_url: CardValue;
  choice1_count?: CardValue;
  choice2_count?: CardValue;
  choice3_count?: CardValue;
  choice4_count?: CardValue;
  choice1_label?: CardValue;
  choice2_label?: CardValue;
  choice3_label?: CardValue;
  choice4_label?: CardValue;
  counts_are_final?: CardValue;
  duration_minutes?: CardValue;
  end_datetime_utc?: CardValue;

  player_url?: CardValue;
  player_width?: CardValue;
  player_height?: CardValue;
  title?: CardValue;
};

type TweetCard = {
  binding_values: TweetCardBindingValues;
  name: string;
};

type TweetEntities = {
  urls?: TcoExpansion[];
  media?: TweetMedia[];
};

/* TODO: Are there more states for ext_views?
   Legacy Tweets use Enabled but have no count, while newer tweets have EnabledWithCount
   and count is populated with a string. */
type ExtViews = {
  state: 'Enabled' | 'EnabledWithCount';
  count?: string;
};

type TweetPartial = {
  card?: TweetCard;
  conversation_id_str: string;
  created_at: string; // date string
  display_text_range: [number, number];
  entities: TweetEntities;
  extended_entities: TweetEntities;
  ext_views?: ExtViews;
  favorite_count: number;
  in_reply_to_screen_name?: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  id_str: string;
  lang: string;
  possibly_sensitive: boolean;
  possibly_sensitive_editable: boolean;
  retweet_count: number;
  quote_count: number;
  quoted_status_id_str: string;
  reply_count: number;
  source: string;
  full_text: string;
  user_id_str: string;
  retweeted_status_id: number;
  retweeted_status_id_str: string;
  user?: UserPartial;
};

type UserPartial = {
  id_str: string;
  name: string;
  screen_name: string;
  profile_image_url_https: string;
  profile_banner_url: string;
  profile_image_extensions_media_color?: {
    palette?: MediaPlaceholderColor[];
  };
};

type MediaPlaceholderColor = {
  rgb: {
    red: number;
    green: number;
    blue: number;
  };
};

type TranslationPartial = {
  id_str: string;
  translationState: 'Success'; // TODO: figure out other values
  sourceLanguage: string;
  localizedSourceLanguage: string;
  destinationLanguage: string;
  translationSource: 'Google';
  translation: string;
  entities: TweetEntities;
};

type GraphQLUserResponse = {
  data: {
    user: {
      result: GraphQLUser;
    };
  };
};

type UserResultByScreenNameQueryResponse = {
  data: {
    user_result: {
      result: GraphQLUser;
    };
  };
};

type UserResultByScreenNameResponse = {
  data: {
    user_results: {
      result: GraphQLUser;
    };
  };
};

type GraphQLUser = {
  __typename: 'User';
  id: string; // "VXNlcjo3ODMyMTQ="
  rest_id: string; // "783214",
  action_counts: {
    favorites_count: number; // 5962
  };
  affiliates_highlighted_label: {
    label?: {
      badge?: {
        url?: string; // "https://pbs.twimg.com/semantic_core_img/1290392753013002240/mWq1iE5L?format=png&name=orig"
      };
      description?: string; // "United States government organization"
      url?: {
        url?: string; // "https://help.twitter.com/rules-and-policies/state-affiliated"
        urlType: string; // "DeepLink"
      };
    };
  };
  avatar?: {
    image_url: string; // "https://pbs.twimg.com/profile_images/1891737564417347584/E3hSpDqx_normal.jpg"
  };
  banner?: {
    image_url: string; // "https://pbs.twimg.com/profile_banners/783214/1690175171"
  };
  business_account?: {
    affiliates_count: number; // 9
  };
  core?: {
    created_at: string; // "Tue Feb 20 14:35:54 +0000 2007",
    name: string; // "Twitter",
    screen_name: string; // "twitter"
  };
  creator_subscriptions_count?: number; // 0
  dm_permissions?: {
    can_dm: boolean; // true
  };
  legacy?: {
    can_dm?: boolean; // false,
    can_media_tag?: boolean; // false,
    created_at?: string; // "Tue Feb 20 14:35:54 +0000 2007",
    default_profile: boolean; // false,
    default_profile_image: boolean; // false,
    description: string; // "What's happening?!",
    entities: {
      description?: {
        urls?: TcoExpansion[];
      };
      url?: {
        urls?: {
          display_url: string; // "about.twitter.com",
          expanded_url: string; // "https://about.twitter.com/",
          url: string; // "https://t.co/DAtOo6uuHk",
          indices: [0, 23];
        }[];
      };
    };
    fast_followers_count: 0;
    favourites_count: number; // 126708,
    followers_count: number; // 4996,
    friends_count: number; // 2125,
    has_custom_timelines: boolean; // true,
    is_translator: boolean; // false,
    listed_count: number; // 88165,
    location: string; // "everywhere",
    media_count: number; // 20839,
    name: string; // "Twitter",
    normal_followers_count: number; // 65669107,
    pinned_tweet_ids_str: string[]; // Array of tweet ids, usually one. Empty if no pinned tweet
    possibly_sensitive: boolean; // false,
    profile_banner_url: string; // "https://pbs.twimg.com/profile_banners/783214/1646075315",
    profile_image_url_https?: string; // "https://pbs.twimg.com/profile_images/1488548719062654976/u6qfBBkF_normal.jpg",
    profile_interstitial_type: string; // "",
    protected?: boolean; // false
    screen_name: string; // "Twitter",
    statuses_count: number; // 15047
    translator_type: string; // "regular"
    want_retweets: boolean; // false
    verified?: boolean; // false
    verified_type?: 'Business' | 'Government';
    withheld_in_countries: string[];
  };
  legacy_extended_profile: {
    birthdate?: {
      day: number; // 7,
      month: number; // 1,
      visibility: string; // "Public"
      year: number; // 2000
      year_visibility: string; // "Public"
    };
    profile_image_shape: string; // "Circle",
    rest_id: string; // "783214",
  };
  highlights_info?: {
    can_highlight_tweets: boolean; // true
    highlighted_tweets: string; // "0"
  };
  is_profile_translatable: false;
  is_blue_verified: boolean; // false,
  location?: {
    location: string; // "Palo Alto, CA"
  };
  media_permissions?: {
    can_media_tag: boolean; // true
  };
  parody_commentary_fan_label?: string; // "None",
  privacy?: {
    protected: boolean; // false
  };
  professional: {
    rest_id: string; // "1503055759638159366",
    professional_type: string; // "Creator",
    category: [
      {
        id: number; // 354,
        name: string; // "Community",
        icon_name: string; // "IconBriefcaseStroke"
      }
    ];
  };
  profile_bio: {
    description: string; // "what's happening?!",
    entities: {
      url?: {
        urls: TcoExpansion[];
      };
    };
  };
  profile_image_shape: 'Circle' | 'Square' | 'Hexagon'; // "Circle",
  relationship_counts?: {
    following: number; // 0
    followers: number; // 0
  };
  relationship_perspectives?: {
    following: boolean; // false
  };
  tweet_counts: {
    media_tweets: number; // 2465
    tweets: number; // 15605
  };
  verification?: {
    is_blue_verified?: boolean; // false,
    verified: boolean; // false
    verified_type?: 'Business' | 'Government' | null;
  };
  verification_info: {
    is_identity_verified: boolean; // false,
    reason: {
      description: {
        entities: {
          from_index: number; // 98,
          ref: {
            url: string; // "https://help.twitter.com/managing-your-account/about-twitter-verified-accounts",
            url_type: string; // "ExternalUrl"
          };
          to_index: number; // 108
        }[];
        text?: string; // "This account is verified because it's an official organization on X. Learn more"
      };
    };
    verified_since_msec: string; // "1744528442487"
  };
  user_seed_tweet_count: number; // 0
};

type GraphQLTwitterStatusLegacy = {
  id_str: string; // "1674824189176590336"
  created_at: string; // "Tue Sep 14 20:00:00 +0000 2021"
  conversation_id_str: string; // "1674824189176590336"
  bookmark_count: number; // 0
  bookmarked: boolean; // false
  favorite_count: number; // 28
  full_text: string; // "This is a test tweet"
  in_reply_to_screen_name: string; // "username"
  in_reply_to_status_id_str: string; // "1674824189176590336"
  in_reply_to_user_id_str: string; // "783214"
  is_quote_status: boolean; // false
  quote_count: number; // 39
  quoted_status_id_str: string; // "1674824189176590336"
  quoted_status_permalink: {
    url: string; // "https://t.co/aBcDeFgHiJ"
    expanded: string; // "https://twitter.com/username/status/1674824189176590336"
    display: string; // "twitter.com/username/statu…"
  };
  reply_count: number; // 1
  retweet_count: number; // 4
  retweeted_status_result?: {
    result: GraphQLTwitterStatus;
  };
  lang: string; // "en"
  possibly_sensitive: boolean; // false
  possibly_sensitive_editable: boolean; // false
  entities: {
    media: {
      display_url: string; // "pic.twitter.com/1X2X3X4X5X"
      expanded_url: string; // "https://twitter.com/username/status/1674824189176590336/photo/1" "https://twitter.com/username/status/1674824189176590336/video/1"
      id_str: string; // "1674824189176590336"
      indices: [number, number]; // [number, number]
      media_url_https: string; // "https://pbs.twimg.com/media/FAKESCREENSHOT.jpg" With videos appears to be the thumbnail
      type: string; // "photo" Seems to be photo even with videos
    }[];
    user_mentions: MentionEntity[];
    urls: TcoExpansion[];
    hashtags: TagEntity[];
    symbols: TagEntity[];
  };
  extended_entities: {
    media: TweetMedia[];
  };
};

type TagEntity = {
  indices: [number, number];
  text: string;
};

type MentionEntity = {
  indices: [number, number];
  name: string;
  screen_name: string;
  id_str: string;
};

type InlineMedia = {
  index: number;
  media_id: string;
};

type BirdwatchEntity = {
  fromIndex: number; // 119
  toIndex: number; // 154
  ref: {
    type: 'TimelineUrl';
    url: string; // https://t.co/jxvVatCVCz
    urlType: 'ExternalUrl';
  };
};

type GraphQLTwitterStatus = {
  // Workaround
  result: GraphQLTwitterStatus;
  __typename: 'Tweet' | 'TweetWithVisibilityResults' | 'TweetUnavailable';
  reason: string; // used for errors
  rest_id: string; // "1674824189176590336",
  has_birdwatch_notes: boolean;
  birdwatch_pivot: {
    destinationUrl: string; // https://twitter.com/i/birdwatch/n/1784594925926973714
    note: {
      rest_id: string; // 1784594925926973714
    };
    subtitle: {
      text: string; // "This screenshot is from Sonic 1\n\ninfo.sonicretro.org/Sonic_the_Hedg…"
      entities: BirdwatchEntity[];
    };
  };
  core: {
    user_results?: {
      result: GraphQLUser;
    };
    user_result?: {
      result: GraphQLUser;
    };
  };
  tweet?: {
    quoted_status_result?: GraphQLTwitterStatus;
    legacy: GraphQLTwitterStatusLegacy;
    views?: {
      count: string; // "562"
      state: string; // "EnabledWithCount"
    };
    view_count_info?: {
      count: string; // "562"
      state: string; // "EnabledWithCount"
    };
    core: {
      user_results?: {
        result: GraphQLUser;
      };
      user_result?: {
        result: GraphQLUser;
      };
    };
  };
  edit_control: {
    edit_tweet_ids: string[];
    editable_until_msecs: string;
    edits_remaining: string;
    is_edit_eligible: boolean;
  };
  edit_perspective?: unknown;
  is_translatable: boolean;
  views?: {
    count: string; // "562"
    state: string; // "EnabledWithCount"
  };
  view_count_info?: {
    count: string; // "562"
    state: string; // "EnabledWithCount"
  };
  source: string; // "<a href=\"https://mobile.twitter.com\" rel=\"nofollow\">Twitter Web App</a>"
  quoted_status_result?: GraphQLTwitterStatus;
  legacy: GraphQLTwitterStatusLegacy;
  note_tweet: {
    is_expandable: boolean;
    note_tweet_results: {
      result: {
        entity_set: {
          hashtags: TagEntity[];
          symbols: TagEntity[];
          urls: TcoExpansion[];
          user_mentions: MentionEntity[];
        };
        media: {
          inline_media: InlineMedia[];
        };
        richtext: {
          richtext_tags: {
            from_index: number;
            to_index: number;
            richtext_types: string[];
          }[];
        };
        text: string;
      };
    };
  };
  card: GraphQLTwitterCard;
  tweet_card: {
    legacy: GraphQLTwitterCard;
  };
  community_results?: {
    result?: {
      __typename: 'Community';
      id_str: string;
    };
  };
  community_relationship?: {
    id: string;
    rest_id: string;
    moderation_state: unknown;
    actions: unknown;
  };
  author_community_relationship?: {
    community_results?: {
      result?: {
        __typename: 'Community';
        id_str: string;
        name: string;
        description: string;
        created_at: number;
        search_tags: string[];
        is_nsfw: boolean;
        primary_community_topic?: {
          topic_id: string;
          topic_name: string;
        };
        actions: unknown;
        admin_results?: {
          result?: GraphQLUser;
        };
        creator_results?: {
          result?: GraphQLUser;
        };
        join_policy: 'Open'; // TODO: What other values are there?
        invites_policy: 'MemberInvitesAllowed'; // TODO: What other values are there?
        is_pinned: boolean;
      };
    };
  };
  article?: {
    article_results?: {
      result?: TwitterArticleEntity;
    };
  };
};

type GraphQLTwitterCard = {
  rest_id: string; // "card://1674824189176590336",
  legacy: {
    binding_values: {
      key:
        | `choice${1 | 2 | 3 | 4}_label`
        | 'counts_are_final'
        | `choice${1 | 2 | 3 | 4}_count`
        | 'last_updated_datetime_utc'
        | 'duration_minutes'
        | 'api'
        | 'card_url'
        | 'unified_card'
        | 'broadcast_url'
        | 'broadcast_width'
        | 'broadcast_height'
        | 'broadcast_state'
        | 'broadcast_title'
        | 'broadcast_source'
        | 'broadcast_orientation'
        | 'broadcast_id'
        | 'broadcast_media_id'
        | 'broadcast_media_key'
        | 'broadcast_is_high_latency'
        | 'broadcaster_username'
        | 'broadcaster_display_name'
        | 'broadcast_thumbnail'
        | 'broadcast_thumbnail_small'
        | 'broadcast_thumbnail_large'
        | 'broadcast_thumbnail_x_large'
        | 'broadcast_thumbnail_original'
        | 'broadcast_thumbnail_color'
        | 'broadcaster_twitter_id';
      value:
        | {
            string_value: string; // "Option text"
            type: 'STRING';
          }
        | {
            boolean_value: boolean; // true
            type: 'BOOLEAN';
          };
    }[];
  };
};

type TweetTombstone = {
  __typename: 'TweetTombstone';
  tombstone: {
    __typename: 'TextTombstone';
    text: {
      rtl: boolean; // false;
      text: string; // "You’re unable to view this Tweet because this account owner limits who can view their Tweets. Learn more"
      entities: unknown[];
    };
  };
};

type GraphQLTimelineTweet = {
  item: 'TimelineTweet';
  __typename: 'TimelineTweet';
  tweet_results: {
    result: GraphQLTwitterStatus | TweetTombstone;
  };
};

type GraphQLTimelineCursor = {
  cursorType: 'Top' | 'Bottom' | 'ShowMoreThreadsPrompt' | 'ShowMore';
  itemType: 'TimelineTimelineCursor';
  value: string;
  __typename: 'TimelineTimelineCursor';
};

interface GraphQLBaseTimeline {
  entryType: string;
  __typename: string;
}

type GraphQLTimelineItem = GraphQLBaseTimeline & {
  entryType: 'TimelineTimelineItem';
  __typename: 'TimelineTimelineItem';
  itemContent: GraphQLTimelineTweet | GraphQLTimelineCursor;
};

type GraphQLTimelineModule = GraphQLBaseTimeline & {
  entryType: 'TimelineTimelineModule';
  __typename: 'TimelineTimelineModule';
  items: {
    entryId: `conversationthread-${number}-tweet-${number}`;
    item: GraphQLTimelineItem;
  }[];
};

type GraphQLTimelineTweetEntry = {
  /** The entryID contains the tweet ID */
  entryId: `tweet-${number}`; // "tweet-1674824189176590336"
  sortIndex: string;
  content: GraphQLTimelineItem;
};

type GraphQLModuleTweetEntry = {
  /** The entryID contains the tweet ID */
  sortIndex: string;
  item: GraphQLTimelineItem | GraphQLTimelineModule;
};

type GraphQLConversationThread = {
  entryId: `conversationthread-${number}`; // "conversationthread-1674824189176590336"
  sortIndex: string;
  content: GraphQLTimelineModule;
};

type GraphQLTimelineEntry = GraphQLTimelineTweetEntry | GraphQLConversationThread | unknown;

type ThreadInstruction =
  | TimelineAddEntriesInstruction
  | TimelineTerminateTimelineInstruction
  | TimelineAddModulesInstruction;

type TimelineAddEntriesInstruction = {
  type: 'TimelineAddEntries';
  entries: GraphQLTimelineEntry[];
};

type TimelineAddModulesInstruction = {
  type: 'TimelineAddToModule';
  moduleItems: GraphQLTimelineEntry[];
};

type TimelineTerminateTimelineInstruction = {
  type: 'TimelineTerminateTimeline';
  direction: 'Top';
};
type GraphQLTwitterStatusNotFoundResponse = {
  errors: [
    {
      message: string; // "_Missing: No status found with that ID"
      locations: unknown[];
      path: string[]; // ["threaded_conversation_with_injections_v2"]
      extensions: {
        name: string; // "GenericError"
        source: string; // "Server"
        code: number; // 144
        kind: string; // "NonFatal"
        tracing: {
          trace_id: string; // "2e39ff747de237db"
        };
      };
      code: number; // 144
      kind: string; // "NonFatal"
      name: string; // "GenericError"
      source: string; // "Server"
      tracing: {
        trace_id: string; // "2e39ff747de237db"
      };
    }
  ];
  data: Record<string, never>;
};
type TweetDetailResponse = {
  errors?: unknown[];
  data: {
    threaded_conversation_with_injections_v2: {
      instructions: ThreadInstruction[];
    };
  };
};
type TweetResultByRestIdResponse = {
  guestToken?: string;
  errors?: unknown[];
  data: {
    tweetResult?: {
      result?: TweetStub | GraphQLTwitterStatus;
    };
  };
};
type TweetResultsByRestIdsResponse = {
  guestToken?: string;
  errors?: unknown[];
  data: {
    tweetResult?: {
      result?: TweetStub | GraphQLTwitterStatus;
    }[];
  };
};
type TweetResultsByIdsResponse = {
  guestToken?: string;
  errors?: unknown[];
  data: {
    tweet_results?: {
      result?: TweetStub | GraphQLTwitterStatus;
    }[];
  };
};
type TweetResultByIdResponse = {
  guestToken?: string;
  errors?: unknown[];
  data: {
    tweet_result?: {
      result?: TweetStub | GraphQLTwitterStatus;
    };
  };
};

type TweetStub = {
  __typename: 'TweetUnavailable';
  reason: 'NsfwLoggedOut' | 'Protected';
};

interface GraphQLProcessBucket {
  statuses: GraphQLTwitterStatus[];
  allStatuses: GraphQLTwitterStatus[];
  cursors: GraphQLTimelineCursor[];
}

interface AboutAccountQueryResponse {
  data?: {
    user_result_by_screen_name?: {
      result?: {
        about_profile?: {
          created_country_accurate?: boolean;
          account_based_in?: string;
          location_accurate?: boolean;
          source?: string;
          username_changes?: {
            count?: string; // returned as string for some reason
            last_changed_at_msec?: string;
          };
        };
      };
    };
  };
}

export type TwitterArticleEntity = {
  rest_id: string;
  id: string;
  title: string;
  preview_text: string;
  cover_media?: TwitterApiMedia; // Twitter API be consistent challenge (impossible)
  cover_media_results?: TwitterApiMedia;
  content_state?: TwitterArticleContentState;
  media_entities: TwitterApiMedia[];
  lifecycle_state?: {
    modified_at_secs: number;
  };
  metadata?: {
    first_published_at_secs: number;
  };
};

export type TwitterApiMedia = {
  id: string;
  media_key: string;
  media_id: string;
  media_info: TwitterApiImage | TwitterApiVideo;
};

export type TwitterApiImage = {
  __typename: 'ApiImage';
  original_img_height: number;
  original_img_width: number;
  original_img_url: string;
  color_info: {
    palette: Array<{
      percentage: number;
      rgb: { red: number; green: number; blue: number };
    }>;
  };
};

export type TwitterApiVideo = {
  __typename: 'ApiVideo' | 'ApiGif';
  type: 'video' | 'animated_gif';
  id: string;
  id_str: string;
  ext_alt_text: string | null;
  ext_media_color: {
    palette: Array<{
      percentage: number;
      rgb: { red: number; green: number; blue: number };
    }>;
  };
  media_url: string;
  media_url_https: string;
  url: string;
  display_url: string;
  expanded_url: string;
  original_info: {
    height: number;
    width: number;
  };
  sizes: {
    original: {
      h: number;
      resize: 'fit';
      w: number;
    };
  };
  video_info: {
    aspect_ratio: [number, number];
    duration_millis: number;
    variants: {
      bitrate: number;
      content_type: string;
      url: string;
    }[];
  };
};

export type TwitterArticleContentState = {
  blocks: TwitterArticleContentBlock[];
  entityMap: TwitterArticleEntityMapEntry[];
};

export type TwitterArticleContentBlock = {
  key: string;
  data: Record<string, unknown>;
  entityRanges: Array<{
    key: number;
    length: number;
    offset: number;
  }>;
  inlineStyleRanges: Array<{
    length: number;
    offset: number;
    style: string; // e.g. "Bold", "Italic"
  }>;
  text: string;
  type: string; // e.g. "header-one", "unstyled", "ordered-list-item", "atomic"
};

type TwitterArticleEntityMapEntry =
  | {
      key: string;
      value: {
        type: 'MARKDOWN';
        mutability: 'Mutable';
        data: {
          entityKey: string;
          markdown: string;
        };
      };
    }
  | {
      key: string;
      value: {
        type: 'MEDIA';
        mutability: 'Immutable';
        data: {
          entityKey: string;
          mediaItems: Array<{
            localMediaId: string;
            mediaCategory: string;
            mediaId: string;
          }>;
        };
      };
    }
  | {
      key: string;
      value: {
        type: 'TWEET';
        mutability: 'Immutable';
        data: {
          tweetId: string;
        };
      };
    };
