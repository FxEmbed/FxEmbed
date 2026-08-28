/* TikTok API types */

declare interface TikTokAuthor {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarThumb: string;
  avatarMedium: string;
  avatarLarger: string;
  signature: string;
  createTime: number;
  verified: boolean;
  secUid: string;
  openFavorite: boolean;
  relation: number;
  followingCount?: number;
  followerCount?: number;
  heartCount?: number;
  videoCount?: number;
  diggCount?: number;
  privateAccount?: boolean;
  /** Link in the profile bio, when the account has one. */
  bioLink?: {
    link: string;
    risk: number;
  };
  /** Set when the account is a business / commerce account. */
  commerceUserInfo?: {
    commerceUser?: boolean;
    category?: string;
    categoryButton?: boolean;
  };
  ttSeller?: boolean;
  isOrganization?: number;
  region?: string;
  language?: string;
}

declare interface TikTokMusic {
  id: string;
  title: string;
  playUrl: string;
  coverThumb: string;
  coverMedium: string;
  coverLarge: string;
  authorName: string;
  original: boolean;
  duration: number;
  album: string;
}

declare interface TikTokVideoFormat {
  Bitrate: number;
  QualityType: number;
  BitrateFPS: number;
  GearName: string;
  Format: 'mp4';
  CodecType: 'h264' | 'h265_hvc1';
  PlayAddr: {
    DataSize: string;
    Width: number;
    Height: number;
    Uri: string;
    UrlList: string[];
    UrlKey: string;
    FileHash: string;
    FileCs: string;
  };
}

declare interface TikTokVideo {
  id: string;
  height: number;
  width: number;
  duration: number;
  ratio: string;
  cover: string;
  originCover: string;
  dynamicCover: string;
  playAddr: string;
  downloadAddr: string;
  shareCover: string[];
  reflowCover: string;
  bitrate: number;
  encodedType: string;
  format: string;
  videoQuality: string;
  encodeUserTag: string;
  codecType: string;
  definition: string;
  size?: string;
  bitrateInfo?: TikTokVideoFormat[];
}
declare interface TikTokVideoStatsV2 {
  /**
   * TikTok uses "digg" to describe likes for some reason
   */
  diggCount: string;
  shareCount: string;
  commentCount: string;
  playCount: string;
  collectCount: string;
  repostCount: string;
}

declare interface TikTokAuthorStats {
  followerCount: number;
  followingCount: number;
  heartCount: number;
  videoCount: number;
  diggCount: number;
  friendCount: number;
}

declare interface TikTokAuthorStatsV2 {
  followerCount: string;
  followingCount: string;
  heart: string;
  heartCount: string;
  videoCount: string;
  diggCount: string;
  friendCount: string;
}

declare interface TikTokImagePost {
  images: TikTokImage[];
  title?: string;
}

declare interface TikTokImage {
  imageURL: {
    urlList: string[];
  };
  imageWidth: number;
  imageHeight: number;
}

declare interface TikTokStatistics {
  /**
   * TikTok uses "digg" to describe likes for some reason
   */
  diggCount: number;
  shareCount: number;
  commentCount: number;
  playCount: number;
  collectCount: number;
}

declare interface TikTokItemInfo {
  id: string;
  desc: string;
  createTime: number | string; // Can be either depending on TikTok's response
  video: TikTokVideo;
  author: TikTokAuthor;
  music: TikTokMusic;
  duetEnabled: boolean;
  stitchEnabled: boolean;
  shareEnabled: boolean;
  isAd: boolean;
  itemCommentStatus: number;
  locationCreated: string;
  poi?: {
    name: string;
    address: string;
  };
  contents?: TikTokContent[];
  imagePost?: TikTokImagePost;
  textExtra?: TikTokTextExtra[];
  statsV2: TikTokVideoStatsV2;
  stats: TikTokStatistics;
  authorStatsV2: TikTokAuthorStatsV2;
  authorStats: TikTokAuthorStats;
}

declare interface TikTokContent {
  desc: string;
  textExtra?: TikTokTextExtra[];
}

declare interface TikTokTextExtra {
  awemeId: string;
  start: number;
  end: number;
  hashtagId?: string;
  hashtagName?: string;
  type: number;
  subType: number;
  userId?: string;
  isCommerce?: boolean;
  userUniqueId?: string;
  secUid?: string;
}

declare interface TikTokSigiState {
  ItemModule?: {
    [key: string]: TikTokItemInfo;
  };
  UserModule?: {
    users?: {
      [key: string]: TikTokAuthor;
    };
  };
  SEOState?: {
    metaParams?: {
      title?: string;
      description?: string;
      canonicalHref?: string;
    };
  };
  AppContext?: {
    appContext?: {
      language?: string;
      region?: string;
    };
  };
}

declare interface TikTokUserDetail {
  userInfo?: {
    user?: TikTokAuthor;
    stats?: TikTokAuthorStats;
    statsV2?: TikTokAuthorStatsV2;
  };
  shareMeta?: {
    title?: string;
    desc?: string;
  };
  statusCode?: number;
  statusMsg?: string;
}

/** A/B variant of `webapp.video-detail`; the item struct has been seen at three depths. */
declare interface TikTokReflowVideoDetail {
  itemInfo?: {
    itemStruct?: TikTokItemInfo;
  };
  videoDetail?: {
    itemInfo?: {
      itemStruct?: TikTokItemInfo;
    };
  };
  itemStruct?: TikTokItemInfo;
}

declare interface TikTokUniversalData {
  'webapp.video-detail'?: {
    itemInfo?: {
      itemStruct?: TikTokItemInfo;
    };
    statusCode?: number;
  };
  'webapp.reflow.video.detail'?: TikTokReflowVideoDetail;
  'webapp.user-detail'?: TikTokUserDetail;
  '__DEFAULT_SCOPE__'?: TikTokUniversalData;
}

/* `/embed/…` pages (Frontity app). Server-rendered, unsigned, and keyed by request path. */

declare interface TikTokFrontityState {
  source?: {
    data?: Record<string, TikTokEmbedRouteData | unknown>;
  };
}

declare interface TikTokEmbedRouteData {
  route?: string;
  link?: string;
  page?: number;
  isError?: boolean;
  errorCode?: number;
  errorStatus?: number;
  pageName?: string;
  playlistType?: string;
  playlistId?: string;
  /** `/embed/v2/:id` and `/embed/:id`. */
  videoData?: TikTokEmbedVideoData;
  /** `/embed/@handle`. */
  userInfo?: TikTokEmbedUserInfo;
  /** `/embed/tag/:tag` and `/embed/music/:id`. */
  embedInfo?: TikTokEmbedPlaylistInfo;
  /** Present on every playlist-shaped embed route. */
  videoList?: TikTokEmbedItem[];
}

declare interface TikTokEmbedVideoData {
  itemInfos?: {
    id: string;
    text: string;
    /** Unix seconds, as a decimal string. */
    createTime: string;
    authorId: string;
    musicId: string;
    covers?: string[];
    coversOrigin?: string[];
    coversDynamic?: string[];
    video?: {
      urls?: string[];
      videoMeta?: {
        width?: number;
        height?: number;
        ratio?: string;
        duration?: number;
      };
    };
    diggCount?: number;
    shareCount?: number;
    commentCount?: number;
    playCount?: number;
    isAd?: boolean;
    locationCreated?: string;
  };
  authorInfos?: {
    userId?: string;
    secUid?: string;
    uniqueId?: string;
    nickName?: string;
    covers?: string[];
    verified?: boolean;
    signature?: string;
  };
  authorStats?: {
    followingCount?: number;
    followerCount?: number;
    /** Sometimes a string, sometimes a number, depending on magnitude. */
    heartCount?: number | string;
    videoCount?: number;
    diggCount?: number;
  };
  musicInfos?: {
    musicId?: string;
    musicName?: string;
    authorName?: string;
    original?: boolean;
    playUrl?: string[];
  };
  /** Hashtags used by the post; `textExtra` carries their offsets in `itemInfos.text`. */
  challengeInfoList?: {
    challengeId?: string;
    challengeName?: string;
  }[];
  textExtra?: {
    Start?: number;
    End?: number;
    Type?: number;
    HashtagName?: string;
    HashtagId?: string;
    AwemeId?: string;
  }[];
  imagePostInfo?: {
    images?: {
      imageURL?: { urlList?: string[] };
      imageWidth?: number;
      imageHeight?: number;
    }[];
    title?: string;
  } | null;
}

declare interface TikTokEmbedUserInfo {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarThumbUrl?: string;
  verified?: boolean;
  signature?: string;
  privateAccount?: boolean;
  followingCount?: number;
  followerCount?: number;
  heartCount?: number;
  code?: number;
  customErrorCode?: number;
}

/**
 * Hashtag (`/embed/tag`) or sound (`/embed/music`) header block.
 *
 * The two routes do not return the same fields: hashtags carry `viewCount` / `description` and
 * send both counters as decimal strings; sounds carry `artist` and send `videoCount` as a number.
 */
declare interface TikTokEmbedPlaylistInfo {
  id?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  viewCount?: string | number;
  videoCount?: string | number;
  /** Sound pages only: the account that uploaded the audio. */
  artist?: string;
  statusCode?: number;
  code?: number;
}

/** One row of an embed `videoList`. Flatter than `TikTokItemInfo` — no author stats, no formats. */
declare interface TikTokEmbedItem {
  id: string;
  desc: string;
  height?: number;
  width?: number;
  ratio?: string;
  coverUrl?: string;
  originCoverUrl?: string;
  dynamicCoverUrl?: string;
  playAddr?: string;
  playCount?: number;
  privateItem?: boolean;
  authorUniqueId?: string;
  createTime?: number | string;
}

declare interface TikTokOEmbedResponse {
  version: string;
  type: string;
  title: string;
  author_url: string;
  author_name: string;
  width: string;
  height: string;
  html: string;
  thumbnail_width: number;
  thumbnail_height: number;
  thumbnail_url: string;
  provider_url: string;
  provider_name: string;
}

declare interface TikTokApiResponse {
  statusCode: number;
  itemInfo?: {
    itemStruct?: TikTokItemInfo;
  };
  status_code?: number;
  aweme_detail?: TikTokAwemeDetail;
}

/* Mobile API types (aweme) */
declare interface TikTokAwemeDetail {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: TikTokAwemeAuthor;
  music: TikTokAwemeMusic;
  video: TikTokAwemeVideo;
  statistics: TikTokAwemeStatistics;
  image_post_info?: TikTokAwemeImagePost;
  text_extra?: TikTokTextExtra[];
}

declare interface TikTokAwemeAuthor {
  uid: string;
  unique_id: string;
  nickname: string;
  avatar_thumb: {
    url_list: string[];
  };
  avatar_medium: {
    url_list: string[];
  };
  avatar_larger: {
    url_list: string[];
  };
  signature: string;
  verified: boolean;
  sec_uid: string;
  follower_count?: number;
  following_count?: number;
  aweme_count?: number;
  favoriting_count?: number;
  total_favorited?: number;
}

declare interface TikTokAwemeMusic {
  id: string;
  title: string;
  play_url: {
    url_list: string[];
  };
  cover_thumb: {
    url_list: string[];
  };
  author: string;
  original: boolean;
  duration: number;
  album: string;
}

declare interface TikTokAwemeVideo {
  play_addr: {
    url_list: string[];
    width: number;
    height: number;
    data_size: number;
  };
  download_addr: {
    url_list: string[];
    width: number;
    height: number;
    data_size: number;
  };
  cover: {
    url_list: string[];
  };
  origin_cover: {
    url_list: string[];
  };
  dynamic_cover: {
    url_list: string[];
  };
  duration: number;
  width: number;
  height: number;
  ratio: string;
  bit_rate: TikTokAwemeBitRate[];
}

declare interface TikTokAwemeBitRate {
  gear_name: string;
  quality_type: number;
  bit_rate: number;
  play_addr: {
    url_list: string[];
    width: number;
    height: number;
    data_size: number;
  };
}

declare interface TikTokAwemeStatistics {
  /**
   * TikTok uses "digg" to describe likes for some reason
   */
  digg_count: number;
  share_count: number;
  comment_count: number;
  play_count: number;
  collect_count: number;
  download_count: number;
}

declare interface TikTokAwemeImagePost {
  images: TikTokAwemeImage[];
  title?: string;
}

declare interface TikTokAwemeImage {
  display_image: {
    url_list: string[];
    width: number;
    height: number;
  };
  owner_watermark_image?: {
    url_list: string[];
    width: number;
    height: number;
  };
}

declare interface TikTokThread {
  video: TikTokItemInfo | TikTokAwemeDetail | null;
  /** Set instead of `video` when only the `/embed/v2/:id` player page answered. */
  embed?: TikTokEmbedVideoData | null;
  author: TikTokAuthor | TikTokAwemeAuthor | null;
  cookies: string | null;
  code: number;
}
