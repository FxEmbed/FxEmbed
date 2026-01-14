/* This file contains types relevant to FxEmbed and the FxTwitter API
   For Twitter API types, see twitterTypes.d.ts */

import { Context } from 'hono';
import { DataProvider } from '../enum';
import {
  BirdwatchEntity,
  TweetMediaVariant,
  TwitterApiMedia,
  TwitterArticleContentState
} from './vendor/twitter';

declare type InputFlags = {
  standard?: boolean;
  direct?: boolean;
  api?: boolean;
  textOnly?: boolean;
  isXDomain?: boolean;
  forceInstantView?: boolean;
  instantViewUnrollThreads?: boolean;
  archive?: boolean;
  gallery?: boolean;
  forceMosaic?: boolean;
  name?: string;
  noActivity?: boolean;
};

declare interface StatusResponse {
  text?: string;
  response?: Response;
  cacheControl?: string | null;
}

declare interface ResponseInstructions {
  addHeaders: string[];
  authorText?: string;
  siteName?: string;
  engagementText?: string;
  text?: string;
}

declare interface RenderProperties {
  context: Context;
  status: APIStatus;
  thread?: SocialThread;
  siteText?: string;
  authorText?: string;
  engagementText?: string;
  isOverrideMedia?: boolean;
  userAgent?: string;
  text?: string;
  flags?: InputFlags;
  targetLanguage?: string;
}

declare interface TweetAPIResponse {
  code: number;
  message: string;
  tweet?: APITwitterStatus;
}

declare interface StatusAPIResponse {
  code: number;
  message: string;
  status?: APITwitterStatus;
}

declare interface UserAPIResponse {
  code: number;
  message: string;
  user?: APIUser;
}

declare interface APITranslate {
  text: string;
  source_lang: string;
  source_lang_en: string;
  target_lang: string;
  provider: string;
}

declare interface APIExternalMedia {
  type: 'video';
  url: string;
  thumbnail_url?: string;
  height?: number;
  width?: number;
}

declare interface APIBroadcast {
  url: string;
  width: number;
  height: number;
  state: 'LIVE' | 'ENDED';
  broadcaster: {
    username: string;
    display_name: string;
    id: string;
  };
  stream?: {
    url: string;
  };
  title: string;
  source: 'Producer' | string; // are there other ones?
  orientation: 'landscape' | 'portrait'; // in twitter api 0 = landscape, presumably 1 = portrait but i'll want to verify this
  broadcast_id: string; // THis lets us query the actual broadcast information
  media_id: string; // This is part of the Twitter broadcast URL
  media_key: string; // We can query more info about a livestream with this. Not sure if we need it though
  is_high_latency: boolean; // Whether the broadcast is high latency
  thumbnail: {
    original: {
      url: string;
    };
    small?: {
      url: string;
    };
    medium?: {
      url: string;
    };
    large?: {
      url: string;
    };
    x_large?: {
      url: string;
    };
  };
}

declare interface APIPollChoice {
  label: string;
  count: number;
  percentage: number;
}

declare interface APIPoll {
  choices: APIPollChoice[];
  total_votes: number;
  ends_at: string;
  time_left_en: string;
}

declare interface APIMedia {
  id?: string;
  format?: string;
  type: string;
  url: string;
  width: number;
  height: number;
}

declare interface APIPhoto extends APIMedia {
  type: 'photo' | 'gif';
  transcode_url?: string;
  altText?: string;
}

declare interface APIVideo extends APIMedia {
  type: 'video' | 'gif';
  thumbnail_url: string;
  duration: number;
  filesize?: number; // File size in bytes (when available, e.g., from TikTok)
  variants?: TweetMediaVariant[]; // Legacy API only - use formats internally
  formats: APIVideoFormat[];
}

type APIVideoFormat = {
  container?: 'mp4' | 'webm' | 'm3u8';
  codec?: 'h264' | 'hevc' | 'vp9' | 'av1';
  bitrate?: number;
  url: string;
  size?: number; // File size in bytes (when available, e.g., from TikTok)
  height?: number;
  width?: number;
};

declare interface APIMosaicPhoto extends APIMedia {
  type: 'mosaic_photo';
  formats: {
    webp: string;
    jpeg: string;
  };
}

declare interface APIStatus {
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;

  likes: number;
  reposts: number;
  replies: number;

  quote?: APIStatus;
  poll?: APIPoll;
  author: APIUser;

  media: {
    external?: APIExternalMedia;
    photos?: APIPhoto[];
    videos?: APIVideo[];
    all?: APIMedia[];
    mosaic?: APIMosaicPhoto;
    broadcast?: APIBroadcast;
  };

  raw_text: {
    text: string;
    facets: APIFacet[];
  };

  lang: string | null;
  translation?: APITranslate;

  possibly_sensitive: boolean;

  replying_to: {
    screen_name: string;
    post: string;
  } | null;

  source: string | null;

  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: DataProvider;
}

declare interface APIFacet {
  type: string;
  indices: [start: number, end: number];
  original?: string;
  replacement?: string;
  display?: string;
  id?: string;
}

declare interface APITwitterCommunityNote {
  text: string;
  entities: BirdwatchEntity[];
}

declare interface APITwitterStatus extends APIStatus {
  views?: number | null;
  bookmarks?: number | null;
  community?: APITwitterCommunity;
  article?: {
    created_at: string;
    modified_at?: string;
    id: string;
    title: string;
    preview_text: string;
    cover_media: TwitterApiMedia;
    content: TwitterArticleContentState;
    media_entities: TwitterApiMedia[];
  };
  is_note_tweet: boolean;
  community_note: APITwitterCommunityNote | null;
  provider: DataProvider.Twitter;
}

declare interface APIBlueskyStatus extends APIStatus {
  provider: DataProvider.Bsky;
}

declare interface APITikTokStatus extends APIStatus {
  provider: DataProvider.TikTok;
  views?: number | null;
}

declare interface APIUser {
  id: string;
  name: string;
  screen_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  // verified: 'legacy' | 'blue'| 'business' | 'government';
  // verified_label: string;
  description: string;
  location: string;
  url: string;
  protected: boolean;
  followers: number;
  following: number;
  statuses: number;
  media_count: number;
  likes: number;
  joined: string;
  website: {
    url: string;
    display_url: string;
  } | null;
  birthday: {
    day?: number;
    month?: number;
    year?: number;
  };
  verification?: {
    verified: boolean;
    type: 'organization' | 'government' | 'individual' | null;
    verified_at?: string | null;
    identity_verified?: boolean;
  };
  about_account?: {
    based_in?: string | null;
    location_accurate?: boolean;
    created_country_accurate?: boolean | null;
    source?: string | null;
    username_changes?: {
      count: number;
      last_changed_at: string | null;
    };
  };
}

declare interface SocialPost {
  status: APIStatus | APITwitterStatus | null;
  author: APIUser | null;
}

declare interface SocialThread {
  status: APIStatus | APITwitterStatus | null;
  thread: (APIStatus | APITwitterStatus)[] | null;
  author: APIUser | null;
  code: number;
}

declare interface FetchResults {
  status: number;
}

declare interface OEmbed {
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  title?: string | null;
  type: 'link' | 'rich';
  version: '1.0';
}

// Mastodon API V1 Interfaces
export interface ActivityStatus {
  id: string;
  url: string;
  uri: string;
  created_at: string;
  edited_at: string | null;
  reblog: null;
  in_reply_to_id: string | undefined | null;
  in_reply_to_account_id: string | undefined | null;
  language: string | undefined | null;
  content: string;
  spoiler_text: string;
  visibility: 'public';
  application: {
    name: string | null;
    website: string | null;
  };
  media_attachments: ActivityMediaAttachment[];
  account: ActivityAccount;
  mentions: [];
  tags: [];
  emojis: [];
  card: null;
  poll: null;
}

export interface ActivityAccount {
  id: string;
  display_name: string;
  username: string;
  acct: string;
  url: string;
  uri: string;
  created_at: string;
  locked: boolean;
  bot: boolean;
  discoverable: boolean;
  indexable: boolean;
  group: boolean;
  avatar: string | undefined;
  avatar_static: string | undefined;
  header: string | undefined;
  header_static: string | undefined;
  followers_count: number | undefined;
  following_count: number | undefined;
  statuses_count: number | undefined;
  hide_collections: boolean;
  noindex: boolean;
  emojis: [];
  roles: [];
  fields: [];
}

export interface ActivityMediaAttachment {
  id: string;
  type: 'image' | 'video' | 'gifv' | 'audio' | string;
  url: string;
  preview_url: string | null;
  remote_url: string | null;
  preview_remote_url: string | null;
  text_url: string | null;
  description: string | null;
  meta: {
    original?: {
      width: number;
      height: number;
      size?: string;
      aspect?: number;
    };
    small?: {
      width: number;
      height: number;
      size?: string;
      aspect?: number;
    };
  };
}

type CFAITranslation = {
  translated_text: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

type PolyglotTranslation = {
  translated_text: string;
  provider: string;
  source_lang: string;
  target_lang: string;
};

type GrokTranslation = {
  result: {
    content_type: 'POST';
    text: string;
    entities: {
      [key: string]: string;
    };
  };
};

declare interface APITwitterCommunity {
  id: string;
  name: string;
  description: string;
  created_at: string;
  search_tags: string[];
  is_nsfw: boolean;
  topic: string | null;
  admin: APIUser | null;
  creator: APIUser | null;
  join_policy: 'Open' | 'Closed';
  invites_policy: 'MemberInvitesAllowed' | 'MemberInvitesDisabled';
  is_pinned: boolean;
}
