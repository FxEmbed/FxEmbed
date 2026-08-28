/**
 * Hand-written status / thread shapes (provider variants).
 * Twitter API v2 tweet payloads use `APITwitterStatus` from Zod in `api-schemas.ts`.
 */
import { DataProvider } from './data-provider.js';
import type {
  APIBlueskyNotification,
  APIBlueskyStatus,
  APIBroadcast,
  APIExternalMedia,
  APIFacet,
  APIPhoto,
  APIPoll,
  APIReplyingTo,
  APIInstagramStatus,
  APIThreadsStatus,
  APITikTokStatus,
  APISubstatus,
  APITranslate,
  APITwitterStatus,
  APIUser,
  APIVideo,
  APIMosaicPhoto,
  APIStatusTombstone
} from './api-schemas.js';

export type { APIStatusTombstone };

export interface APIStatus {
  id: string;
  url: string;
  text: string;
  created_at: string;
  created_timestamp: number;

  likes: number;
  reposts: number;
  quotes?: number;
  replies: number;

  quote?: APIStatus | APIStatusTombstone;
  poll?: APIPoll;
  author: APIUser;

  media: {
    external?: APIExternalMedia;
    photos?: APIPhoto[];
    videos?: APIVideo[];
    all?: (APIPhoto | APIVideo)[];
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

  replying_to: APIReplyingTo | null;

  source: string | null;

  embed_card: 'tweet' | 'summary' | 'summary_large_image' | 'player';
  provider: DataProvider;

  /** ATProto commit CID (Bluesky only); `id` is the public web record key (rkey). */
  cid?: string;
  /** `at://…/app.bsky.feed.post/…` (Bluesky only). */
  at_uri?: string;
  /** Discriminator: single post/status (non-Twitter providers; Twitter uses `APITwitterStatus`). */
  type: 'status';
}

export type {
  APIBlueskyNotification,
  APIInstagramStatus,
  APIThreadsStatus,
  APITikTokStatus,
  APISubstatus
};

export interface SocialPost {
  status: APIStatus | APITwitterStatus | null;
  author: APIUser | null;
}

export type ThreadOrStatusItem =
  | APIStatus
  | APIInstagramStatus
  | APIThreadsStatus
  | APITikTokStatus
  | APITwitterStatus
  | APIStatusTombstone
  | APIBlueskyStatus;

/** Used by Twitter v2 API, embed pipeline, Bluesky/TikTok conversations (broader than OpenAPI `SocialThreadSchema`). */
export interface SocialThread {
  status: ThreadOrStatusItem | null;
  thread: ThreadOrStatusItem[] | null;
  author: APIUser | null;
  code: number;
}

/** Thread + replies with cursor-based pagination for the conversation endpoint. */
export interface SocialConversation extends SocialThread {
  replies: (APIStatus | APITwitterStatus | APIThreadsStatus | APISubstatus)[] | null;
  cursor: {
    bottom: string | null;
  } | null;
}
