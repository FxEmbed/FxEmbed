type ATProtoLabel = {
  cid: string; // id
  cts: string; // date
  src: string; // did source
  uri: string; // at:// url
  val: string; // value
};

declare type BlueskyImage = {
  alt: string;
  aspectRatio: {
    height: number;
    width: number;
  };
  fullsize: string;
  thumb: string;
};

declare type BlueskyExternalEmbed = {
  uri: string;
  title: string;
  description: string;
  thumb: {
    ref: {
      $link: string;
    };
    mimeType: string;
    size: number;
  };
};

declare type BlueskyVideo = {
  $type: 'app.bsky.embed.video#view';
  ref: {
    $link: string;
  };
  mimeType: 'video/mp4';
  size: number;
};

declare type BlueskyMedia = {
  $type: string;
  external: BlueskyExternalEmbed;
  images: BlueskyImage[];
  thumbnail: string;
  mimeType?: string;
  playlist: string;
  aspectRatio: {
    height: number;
    width: number;
  };
  ref?: {
    $link: string;
  };
  video?: BlueskyVideo;
};

/** `app.bsky.embed.record#viewRecord` and variants from AppView (forward-decl for BlueskyEmbed). */
declare type BlueskyEmbedViewRecord = {
  $type?: string;
  /** e.g. `app.bsky.embed.record#viewDetached` */
  detached?: boolean;
  uri?: string;
  cid?: string;
  notFound?: boolean;
  blocked?: boolean;
  author?: BlueskyAuthor;
  value?: BlueskyRecord;
  record?: BlueskyRecord;
  /** Fully hydrated quoted post (nested post view). */
  embed?: BlueskyEmbed;
  embeds?: BlueskyEmbed[];
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  indexedAt?: string;
};

/** Hydrated `app.bsky.embed.gallery#viewImage` from AppView. */
declare type BlueskyGalleryViewImage = {
  $type?: string;
  thumbnail?: string;
  fullsize?: string;
  alt?: string;
  aspectRatio?: {
    height: number;
    width: number;
  };
};

declare type BlueskyEmbed = {
  $type?: string;
  images?: BlueskyImage[];
  /** `app.bsky.embed.gallery#view` items (carousel / multi-image posts with 5+ images). */
  items?: BlueskyGalleryViewImage[];
  video?: BlueskyVideo;
  media?: BlueskyMedia;
  external?: BlueskyExternalEmbed;
  /** Quote / record embed view from AppView. */
  record?: BlueskyEmbedViewRecord & {
    /** Legacy nested shape from some responses. */
    record?: BlueskyPost | BlueskyEmbedViewRecord;
    value?: BlueskyPost;
  };
  aspectRatio?: {
    height: number;
    width: number;
  };
  playlist?: string;
  thumbnail?: string;
};
declare type BlueskyAuthor = {
  associated: {
    chat: {
      allowIncoming: 'all'; // TODO: figure out other values
    };
  };
  avatar: string;
  createdAt: string;
  did: string;
  displayName: string;
  handle: string;
  labels: ATProtoLabel[];
  verification?: {
    verifiedStatus?: string;
    trustedVerifierStatus?: string;
    verifications?: { issuer?: string; isValid?: boolean }[];
  };
};

declare type BlueskyReply = {
  parent: {
    cid: string;
    uri: string;
  };
  root: {
    cid: string;
    uri: string;
  };
};

declare type BlueskyPost = {
  author?: BlueskyAuthor;
  cid: string;
  embed?: BlueskyEmbed;
  indexedAt: string;
  labels: ATProtoLabel[];
  likeCount: number;
  record?: BlueskyRecord;
  value?: BlueskyRecord;
  repostCount: number;
  uri: string;
  embeds?: BlueskyEmbed[];
  /** Present on `app.bsky.feed.defs#postView`. */
  replyCount?: number;
  quoteCount?: number;
};

declare type BlueskyRecord = {
  $type?: string;
  createdAt?: string;
  embed?: BlueskyEmbed;
  langs?: string[];
  text?: string;
  reply?: BlueskyReply;
  facets?: BlueskyFacet[];
};

declare type BlueskyFacetFeature = {
  $type: string;
  uri?: string;
  did?: string;
  tag?: string;
  /** Synthetic mention handle when DID is unknown (detected profile description). */
  handle?: string;
};

declare type BlueskyFacet = {
  features: BlueskyFacetFeature[];
  index: {
    byteStart: number;
    byteEnd: number;
  };
};

/** Missing post in a thread (AppView). */
declare type BlueskyFeedNotFoundPost = {
  $type?: string;
  uri: string;
  /** Present on AppView thread stubs when the post is missing. */
  notFound?: true;
  detached?: boolean;
};

/** Blocked post in a thread (AppView). */
declare type BlueskyFeedBlockedPost = {
  $type?: string;
  uri: string;
  /** Present on AppView thread stubs when the viewer is blocked from the post. */
  blocked?: true;
  author?: BlueskyAuthor;
  detached?: boolean;
};

declare type BlueskyThreadParent = BlueskyThread | BlueskyFeedNotFoundPost | BlueskyFeedBlockedPost;

declare type BlueskyThread = {
  $type?: string;
  parent?: BlueskyThreadParent;
  post: BlueskyPost;
  replies?: BlueskyThreadParent[];
};

declare type BlueskyThreadResponse = {
  thread: BlueskyThread;
};

/** `app.bsky.actor.defs#profileViewDetailed` subset from `app.bsky.actor.getProfile`. */
declare type BlueskyProfileViewDetailed = {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  descriptionFacets?: BlueskyFacet[];
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  indexedAt?: string;
  createdAt?: string;
  labels?: ATProtoLabel[];
  verification?: {
    verifiedStatus?: string;
    trustedVerifierStatus?: string;
    verifications?: { issuer?: string; isValid?: boolean; uri?: string; createdAt?: string }[];
  };
};

/** `app.bsky.actor.defs#profileView` subset from graph lists (`getFollowers`, etc.). */
declare type BlueskyProfileView = {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  indexedAt?: string;
  createdAt?: string;
  labels?: ATProtoLabel[];
  verification?: {
    verifiedStatus?: string;
    trustedVerifierStatus?: string;
    verifications?: { issuer?: string; isValid?: boolean; uri?: string; createdAt?: string }[];
  };
};

/** `app.bsky.graph.getFollowers` output (subset). */
declare type BlueskyGetFollowersResponse = {
  subject: BlueskyProfileView;
  followers: BlueskyProfileView[];
  cursor?: string;
};

/** `app.bsky.graph.getFollows` output (subset). */
declare type BlueskyGetFollowsResponse = {
  subject: BlueskyProfileView;
  follows: BlueskyProfileView[];
  cursor?: string;
};

/** `app.bsky.feed.getRepostedBy` output (subset). */
declare type BlueskyGetRepostedByResponse = {
  uri: string;
  cid?: string;
  repostedBy: BlueskyProfileView[];
  cursor?: string;
};

/** `app.bsky.feed.getLikes` output (subset). */
declare type BlueskyGetLikesLike = {
  indexedAt: string;
  createdAt: string;
  actor: BlueskyProfileView;
};

declare type BlueskyGetLikesResponse = {
  uri: string;
  cid?: string;
  likes: BlueskyGetLikesLike[];
  cursor?: string;
};

/** `app.bsky.actor.defs#profileViewBasic` (e.g. `reasonRepost.by`). */
declare type BlueskyProfileViewBasic = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

/** `app.bsky.feed.defs#reasonRepost` (subset). */
declare type BlueskyFeedReasonRepost = {
  $type?: string;
  by?: BlueskyProfileViewBasic;
};

declare type BlueskyFeedViewPost = {
  post?: BlueskyPost;
  reason?: BlueskyFeedReasonRepost;
};

declare type BlueskyAuthorFeedResponse = {
  cursor?: string;
  feed?: BlueskyFeedViewPost[];
};

/** `app.bsky.feed.getActorLikes` — same envelope as getAuthorFeed (`feed` + `cursor`). */
declare type BlueskyGetActorLikesResponse = BlueskyAuthorFeedResponse;

/** `app.bsky.feed.searchPosts` output (subset; `posts` are `#postView`). */
declare type BlueskySearchPostsResponse = {
  posts?: BlueskyPost[];
  cursor?: string;
  hitsTotal?: number;
};

/** `app.bsky.unspecced.getTrendingTopics` (subset; public AppView). */
declare type BlueskyTrendingTopicRow = {
  topic: string;
  link?: string;
};

declare type BlueskyGetTrendingTopicsResponse = {
  topics?: BlueskyTrendingTopicRow[];
  suggested?: BlueskyTrendingTopicRow[];
};

/** `app.bsky.feed.getAuthorFeed` `filter` lexicon values used by FxBluesky. */
declare type BlueskyAuthorFeedFilter =
  | 'posts_no_replies'
  | 'posts_with_replies'
  | 'posts_with_media';

interface BlueskyProcessBucket {
  posts: BlueskyPost[];
  allPosts: BlueskyPost[];
}
