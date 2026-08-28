import { DataProvider } from '../../types/data-provider.js';
import type { APIPhoto, APIUser, APIVideo, APIVideoFormat } from '../../types/api-schemas.js';
import type { APITikTokStatus } from '../../types/api-status.js';

import { TIKTOK_WEB_HOST } from './constants.js';

const TIKTOK_ROOT = TIKTOK_WEB_HOST;

/**
 * Type guard to check if video data is from web API (TikTokItemInfo)
 * Note: createTime can be either a number or string depending on TikTok's A/B testing
 */
const isWebApiData = (video: TikTokItemInfo | TikTokAwemeDetail): video is TikTokItemInfo => {
  return 'createTime' in video && video.createTime !== undefined;
};

/**
 * Type guard to check if video data is from mobile API (TikTokAwemeDetail)
 */
const isMobileApiData = (video: TikTokItemInfo | TikTokAwemeDetail): video is TikTokAwemeDetail => {
  return 'create_time' in video || 'aweme_id' in video;
};

/**
 * Score a URL for reliability (higher is better)
 * - Regional CDNs (.us., .eu., useast, uswest) are most reliable
 * - API URLs (aweme/v1) are less reliable and may get blocked
 * - Maliva CDN often 403s for non-browser requests
 */
const scoreVideoUrl = (url: string): number => {
  let score = 0;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // Regional CDNs are preferred (most reliable)
    if (
      hostname.includes('.us.') ||
      hostname.includes('.eu.') ||
      hostname.includes('useast') ||
      hostname.includes('uswest')
    ) {
      score += 10;
    }

    // aweme URLs are less reliable
    if (pathname.includes('aweme/v1')) {
      score -= 5;
    }

    // Maliva CDN often 403s
    if (hostname.includes('maliva')) {
      score -= 8;
    }

    // Prefer webapp URLs
    if (hostname.includes('webapp')) {
      score += 3;
    }

    // v16/v19 CDNs are generally good
    if (hostname.match(/v\d+-webapp/)) {
      score += 5;
    }
  } catch {
    score = -100;
  }

  return score;
};

/**
 * Video variant with metadata
 */
interface VideoVariant extends APIVideoFormat {
  url: string;
  score: number; // Reliability score
}

/**
 * Extract all available video variants with metadata
 * Returns an array of variants sorted by reliability score (highest first)
 */
const extractVideoVariants = (video: TikTokItemInfo | TikTokAwemeDetail): VideoVariant[] => {
  let variants: VideoVariant[] = [];

  if (isWebApiData(video)) {
    // Check bitrateInfo for additional URLs with quality info
    if (video.video?.bitrateInfo) {
      for (const format of video.video.bitrateInfo) {
        if (format.PlayAddr?.UrlList) {
          variants.push({
            url: format.PlayAddr.UrlList[0],
            bitrate: format.Bitrate,
            size: parseInt(format.PlayAddr.DataSize, 10) ?? undefined,
            container: format.Format,
            codec: format.CodecType === 'h265_hvc1' ? 'hevc' : 'h264',
            width: format.PlayAddr.Width,
            height: format.PlayAddr.Height,
            score: scoreVideoUrl(format.PlayAddr.UrlList[0])
          });
        }
      }
    }
    // Only add the playAddr and downloadAddr if they are not in the bitrateInfo array
    if (video.video?.playAddr) {
      variants.push({
        url: video.video.playAddr,
        container: video.video.format as 'mp4' | 'webm' | 'm3u8' | undefined,
        codec: video.video.codecType === 'h265_hvc1' ? 'hevc' : 'h264',
        bitrate: video.video.bitrate,
        size: parseInt(video.video.size || '0', 10) ?? undefined,
        width: video.video.width,
        height: video.video.height,
        score: scoreVideoUrl(video.video.playAddr)
      });
    }
    if (video.video?.downloadAddr) {
      variants.push({
        url: video.video.downloadAddr,
        container: video.video.format as 'mp4' | 'webm' | 'm3u8' | undefined,
        codec: video.video.codecType === 'h265_hvc1' ? 'hevc' : 'h264',
        bitrate: video.video.bitrate,
        size: parseInt(video.video.size || '0', 10) ?? undefined,
        width: video.video.width,
        height: video.video.height,
        score: scoreVideoUrl(video.video.downloadAddr)
      });
    }
    // Deduplicate based on url
    variants = variants.filter(
      (variant, index, self) => index === self.findIndex(v => v.url === variant.url)
    );
  } else if (isMobileApiData(video)) {
    // Mobile API format - collect all URLs from bit_rate variants
    const bitRates = video.video?.bit_rate;
    if (bitRates && bitRates.length > 0) {
      for (const rate of bitRates) {
        if (rate?.play_addr?.url_list) {
          for (const url of rate.play_addr.url_list) {
            variants.push({
              url: url,
              size: rate.play_addr.data_size,
              // TODO: Check API manually to see if we can get the container and codec
              container: 'mp4',
              codec: 'h264',
              bitrate: rate.bit_rate,
              width: rate.play_addr.width,
              height: rate.play_addr.height,
              score: scoreVideoUrl(url)
            });
          }
        }
      }
    }
    // Also check standard play/download addresses
    if (video.video?.play_addr?.url_list) {
      for (const url of video.video.play_addr.url_list) {
        variants.push({
          url: url,
          size: video.video.play_addr.data_size,
          container: 'mp4',
          codec: 'h264',
          width: video.video.play_addr.width,
          height: video.video.play_addr.height,
          score: scoreVideoUrl(url)
        });
      }
    }
    if (video.video?.download_addr?.url_list) {
      for (const url of video.video.download_addr.url_list) {
        variants.push({
          url: url,
          size: video.video.download_addr.data_size,
          container: 'mp4',
          codec: 'h264',
          width: video.video.download_addr.width,
          height: video.video.download_addr.height,
          score: scoreVideoUrl(url)
        });
      }
    }
  }

  // Remove duplicates based on URL
  const uniqueVariants = variants.filter(
    (variant, index, self) => index === self.findIndex(v => v.url === variant.url)
  );

  // Sort by score (highest first)
  return uniqueVariants.sort((a, b) => b.score - a.score);
};

/**
 * Select the best video variant for a given context
 * @param variants - Array of video variants
 * @param maxFilesize - Maximum file size in bytes (e.g., 20MB for Telegram)
 * @returns The best variant that fits the constraints
 */
const selectBestVariant = (variants: VideoVariant[], maxFilesize?: number): VideoVariant | null => {
  if (variants.length === 0) return null;

  // If no size constraint, return the highest scored variant
  if (!maxFilesize) {
    return variants[0];
  }

  // Filter variants that fit within the size limit
  const fittingVariants = variants.filter(v => !v.size || v.size <= maxFilesize);

  if (fittingVariants.length === 0) {
    // No variants fit, return the smallest one we have
    const withSize = variants.filter(v => v.size);
    if (withSize.length > 0) {
      return withSize.sort((a, b) => (a.size || 0) - (b.size || 0))[0];
    }
    // Fallback to highest scored variant
    return variants[0];
  }

  // Among fitting variants, prefer highest quality (by bitrate or dimensions)
  return fittingVariants.sort((a, b) => {
    // First compare by bitrate if available
    if (a.bitrate && b.bitrate) {
      return b.bitrate - a.bitrate;
    }
    // Then by resolution
    if (a.width && b.width && a.height && b.height) {
      return b.width * b.height - a.width * a.height;
    }
    // Finally by score
    return b.score - a.score;
  })[0];
};

/**
 * Extract thumbnail URL from video data
 */
const extractThumbnailUrl = (video: TikTokItemInfo | TikTokAwemeDetail): string => {
  if (isWebApiData(video)) {
    return video.video?.originCover || video.video?.cover || video.video?.dynamicCover || '';
  } else if (isMobileApiData(video)) {
    return (
      video.video?.origin_cover?.url_list?.[0] ||
      video.video?.cover?.url_list?.[0] ||
      video.video?.dynamic_cover?.url_list?.[0] ||
      ''
    );
  }
  return '';
};

/**
 * Extract video dimensions
 */
const extractVideoDimensions = (
  video: TikTokItemInfo | TikTokAwemeDetail
): { width: number; height: number } => {
  if (isWebApiData(video)) {
    return {
      width: video.video?.width || 720,
      height: video.video?.height || 1280
    };
  } else if (isMobileApiData(video)) {
    return {
      width: video.video?.width || 720,
      height: video.video?.height || 1280
    };
  }
  return { width: 720, height: 1280 };
};

/**
 * Extract video duration in seconds
 */
const extractDuration = (video: TikTokItemInfo | TikTokAwemeDetail): number => {
  if (isWebApiData(video)) {
    return video.video?.duration || 0;
  } else if (isMobileApiData(video)) {
    // Mobile API duration is in milliseconds
    return Math.floor((video.video?.duration || 0) / 1000);
  }
  return 0;
};

/**
 * Extract author information
 */
const extractAuthor = (video: TikTokItemInfo | TikTokAwemeDetail): APIUser => {
  if (isWebApiData(video)) {
    const author = video.author;
    return {
      id: author?.id || author?.secUid || '',
      name: author?.nickname || author?.uniqueId || '',
      screen_name: author?.uniqueId || '',
      avatar_url: author?.avatarLarger || author?.avatarMedium || author?.avatarThumb || null,
      banner_url: null,
      description: author?.signature || '',
      raw_description: { text: author?.signature || '', facets: [] },
      location: '',
      followers: video.authorStats?.followerCount || 0,
      following: video.authorStats?.followingCount || 0,
      media_count: video.authorStats?.videoCount || 0,
      likes: video.authorStats?.heartCount || 0,
      url: `${TIKTOK_ROOT}/@${author?.uniqueId || ''}`,
      protected: author?.privateAccount || false,
      statuses: video.authorStats?.videoCount || 0,
      // Doesn't work with webapp.reflow.video.detail
      joined: author?.createTime ? new Date(author.createTime * 1000).toISOString() : '',
      birthday: null,
      website: null,
      verification: {
        verified: author?.verified || false,
        type: null,
        verified_at: null,
        identity_verified: false
      },
      type: 'profile'
    };
  } else if (isMobileApiData(video)) {
    const author = video.author;
    return {
      id: author?.uid || author?.sec_uid || '',
      name: author?.nickname || author?.unique_id || '',
      screen_name: author?.unique_id || '',
      avatar_url:
        author?.avatar_larger?.url_list?.[0] ||
        author?.avatar_medium?.url_list?.[0] ||
        author?.avatar_thumb?.url_list?.[0] ||
        null,
      banner_url: null,
      description: author?.signature || '',
      raw_description: { text: author?.signature || '', facets: [] },
      location: '',
      followers: author?.follower_count || 0,
      following: author?.following_count || 0,
      media_count: author?.aweme_count || 0,
      likes: author?.total_favorited || 0,
      url: `${TIKTOK_ROOT}/@${author?.unique_id || ''}`,
      protected: false,
      statuses: author?.aweme_count || 0,
      joined: '',
      birthday: null,
      website: null,
      type: 'profile'
    };
  }
  return {
    id: '',
    name: '',
    screen_name: '',
    avatar_url: null,
    banner_url: null,
    description: '',
    raw_description: { text: '', facets: [] },
    location: '',
    followers: 0,
    following: 0,
    media_count: 0,
    likes: 0,
    url: '',
    protected: false,
    statuses: 0,
    joined: '',
    birthday: { day: 0, month: 0, year: 0 },
    website: null,
    type: 'profile'
  };
};

/**
 * Extract statistics
 */
const extractStats = (video: TikTokItemInfo | TikTokAwemeDetail) => {
  if (isWebApiData(video)) {
    return {
      likes: video.stats?.diggCount || 0,
      reposts: video.stats?.shareCount || 0,
      replies: video.stats?.commentCount || 0,
      views: video.stats?.playCount || 0
    };
  } else if (isMobileApiData(video)) {
    return {
      likes: video.statistics?.digg_count || 0,
      reposts: video.statistics?.share_count || 0,
      replies: video.statistics?.comment_count || 0,
      views: video.statistics?.play_count || 0
    };
  }
  return { likes: 0, reposts: 0, replies: 0, views: 0 };
};

/**
 * Extract video ID
 */
const extractVideoId = (video: TikTokItemInfo | TikTokAwemeDetail): string => {
  if (isWebApiData(video)) {
    return video.id || '';
  } else if (isMobileApiData(video)) {
    return video.aweme_id || '';
  }
  return '';
};

/**
 * Extract description/text
 */
const extractDescription = (video: TikTokItemInfo | TikTokAwemeDetail): string => {
  if (isWebApiData(video)) {
    // Check for contents array first (newer format)
    if (video.contents && video.contents.length > 0) {
      return video.contents.map(c => c.desc).join(' ');
    }
    return video.desc || '';
  } else if (isMobileApiData(video)) {
    return video.desc || '';
  }
  return '';
};

/**
 * Extract creation timestamp
 */
const extractCreatedAt = (video: TikTokItemInfo | TikTokAwemeDetail): number => {
  if (isWebApiData(video)) {
    // createTime can be a number or string
    const ct = video.createTime;
    return typeof ct === 'string' ? parseInt(ct, 10) || 0 : ct || 0;
  } else if (isMobileApiData(video)) {
    return video.create_time || 0;
  }
  return 0;
};

/**
 * Check if this is an image slideshow post
 */
const isImagePost = (video: TikTokItemInfo | TikTokAwemeDetail): boolean => {
  if (isWebApiData(video)) {
    return !!(video.imagePost?.images && video.imagePost.images.length > 0);
  } else if (isMobileApiData(video)) {
    return !!(video.image_post_info?.images && video.image_post_info.images.length > 0);
  }
  return false;
};

/**
 * Extract images from slideshow post
 */
const extractImages = (video: TikTokItemInfo | TikTokAwemeDetail): APIPhoto[] => {
  if (isWebApiData(video) && video.imagePost?.images) {
    return video.imagePost.images.map(img => ({
      type: 'photo' as const,
      url: img.imageURL?.urlList?.[0] || '',
      width: img.imageWidth || 0,
      height: img.imageHeight || 0
    }));
  } else if (isMobileApiData(video) && video.image_post_info?.images) {
    return video.image_post_info.images.map(img => ({
      type: 'photo' as const,
      url: img.display_image?.url_list?.[0] || '',
      width: img.display_image?.width || 0,
      height: img.display_image?.height || 0
    }));
  }
  return [];
};

/**
 * Extract music/audio information
 */
const extractMusic = (
  video: TikTokItemInfo | TikTokAwemeDetail
): { title: string; author: string } | null => {
  if (isWebApiData(video) && video.music) {
    return {
      title: video.music.title || '',
      author: video.music.authorName || ''
    };
  } else if (isMobileApiData(video) && video.music) {
    return {
      title: video.music.title || '',
      author: video.music.author || ''
    };
  }
  return null;
};

/**
 * Generate a proxy URL for TikTok videos
 * This routes videos through our worker to add proper headers/cookies
 */
const generateProxyUrl = (
  videoUrl: string,
  cookies: string | null,
  proxyBase: string,
  videoId: string
): string => {
  const params = new URLSearchParams({ url: videoUrl });
  if (cookies) {
    params.set('cookies', cookies);
  }
  // Include videoId so proxy can fetch fresh data if URL fails
  if (videoId) {
    params.set('videoId', videoId);
  }
  return `${proxyBase}/proxy?${params.toString()}`;
};

/**
 * Build API status object from TikTok video data
 * @param video - The TikTok video data
 * @param cookies - Cookies captured from TikTok page (for video proxy)
 * @param proxyBase - Base URL for the proxy endpoint (e.g., https://fxtwitter.com)
 * @param userAgent - User agent string to detect Telegram and apply size limits
 */
export const buildAPITikTokStatus = async (
  video: TikTokItemInfo | TikTokAwemeDetail,
  cookies: string | null = null,
  proxyBase: string | null = null,
  userAgent?: string
): Promise<APITikTokStatus> => {
  const videoId = extractVideoId(video);
  const author = extractAuthor(video);
  const stats = extractStats(video);
  const description = extractDescription(video);
  const createdAt = extractCreatedAt(video);
  const music = extractMusic(video);

  const apiStatus: APITikTokStatus = {
    id: videoId,
    url: `${TIKTOK_ROOT}/@${author.screen_name}/video/${videoId}`,
    text: description,
    created_at: new Date(createdAt * 1000).toISOString(),
    created_timestamp: createdAt,
    likes: stats.likes,
    reposts: stats.reposts,
    replies: stats.replies,
    views: stats.views,
    author: author,
    media: {},
    raw_text: {
      text: description,
      facets: []
    },
    lang: null, // TikTok doesn't provide language info directly
    possibly_sensitive: false,
    replying_to: null,
    source: music ? `♪ ${music.title} - ${music.author}` : 'TikTok',
    embed_card: 'tweet',
    provider: DataProvider.TikTok,
    type: 'status'
  };

  // Handle video posts first (prioritize videos over images)
  if (!isImagePost(video)) {
    // Regular video post
    const thumbnailUrl = extractThumbnailUrl(video);
    const dimensions = extractVideoDimensions(video);
    const duration = extractDuration(video);

    // Extract all available video variants
    const allVariants = extractVideoVariants(video);

    if (allVariants.length > 0) {
      // Telegram has a 20 MiB size limit so we should try to find the best video within that size limit
      // TODO: Maybe limit non-Telegram/Discord to only h264 and 20 MiB?
      const isTelegram = userAgent?.toLowerCase().includes('telegram') || false;
      const TELEGRAM_MAX_SIZE = 20 * 1024 * 1024; // 20 MB in bytes

      // Select the best variant based on constraints
      const selectedVariant = selectBestVariant(
        allVariants,
        isTelegram ? TELEGRAM_MAX_SIZE : undefined
      );

      if (selectedVariant) {
        let videoUrl = selectedVariant.url;

        // Route through our proxy if a proxy base is provided
        // This ensures proper headers/cookies are sent to TikTok's CDN
        if (proxyBase) {
          videoUrl = generateProxyUrl(videoUrl, cookies, proxyBase, videoId);
        }

        // Build formats array with proxied URLs
        const formats: APIVideoFormat[] = allVariants.map(v => ({
          url: proxyBase ? generateProxyUrl(v.url, cookies, proxyBase, videoId) : v.url,
          bitrate: v.bitrate,
          container: v.container,
          codec: v.codec,
          size: v.size,
          width: v.width,
          height: v.height
        }));

        const videoMedia: APIVideo = {
          type: 'video',
          url: videoUrl,
          thumbnail_url: thumbnailUrl,
          width: selectedVariant.width || dimensions.width,
          height: selectedVariant.height || dimensions.height,
          duration: duration,
          format: 'video/mp4',
          filesize: selectedVariant.size,
          formats: formats
        };

        if (isTelegram && selectedVariant.size) {
          console.log(
            `Selected Telegram-friendly variant`,
            JSON.stringify(selectedVariant, null, 2)
          );
        }

        apiStatus.media.videos = [videoMedia];
        apiStatus.media.all = [videoMedia];
        apiStatus.embed_card = 'player';
      }
    }
  } else {
    // Image slideshow posts (only if no video)
    const images = extractImages(video);
    if (images.length > 0) {
      apiStatus.media.photos = images;
      apiStatus.media.all = images;
      apiStatus.embed_card = 'summary_large_image';
    }
  }

  return apiStatus;
};

/**
 * Unix seconds encoded in the top 32 bits of a TikTok item id.
 *
 * The id is minted when the upload starts, so this runs a few seconds ahead of the `create_time`
 * the API reports for the same post. Only used where the payload carries no timestamp of its own
 * (the `/embed/…` playlist rows).
 */
export const tiktokIdToTimestamp = (id: string): number => {
  if (!/^\d{6,25}$/.test(id)) return 0;
  const seconds = Number(BigInt(id) >> 32n);
  // Sanity-bound it to 2016 (TikTok's launch) through ~30 years out.
  return seconds > 1451606400 && seconds < 2500000000 ? seconds : 0;
};

/** Verification badge shape shared by the profile builders. */
const tiktokVerification = (verified: boolean | undefined, isOrganization?: number) => ({
  verified: Boolean(verified),
  /* TikTok's public payloads only say "verified"; `isOrganization` is the one hint at the kind. */
  type: verified && isOrganization ? ('organization' as const) : null,
  verified_at: null,
  identity_verified: false
});

const bioWebsite = (link: string | undefined): APIUser['website'] => {
  if (!link) return null;
  const url = /^https?:\/\//.test(link) ? link : `https://${link}`;
  return { url, display_url: link.replace(/^https?:\/\//, '') };
};

/**
 * Builds a full `APIUser` from a `webapp.user-detail` payload (the `www.tiktok.com/@handle` page).
 * `statsV2` carries exact counts as strings where `stats` has already been rounded for display, so
 * it wins whenever both are present.
 */
export const buildAPITikTokUser = (
  user: TikTokAuthor,
  stats?: TikTokAuthorStats,
  statsV2?: TikTokAuthorStatsV2
): APIUser => {
  const count = (exact: string | undefined, rounded: number | undefined): number => {
    const parsed = exact !== undefined ? parseInt(exact, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : (rounded ?? 0);
  };

  const followers = count(statsV2?.followerCount, stats?.followerCount ?? user.followerCount);
  const following = count(statsV2?.followingCount, stats?.followingCount ?? user.followingCount);
  const videos = count(statsV2?.videoCount, stats?.videoCount ?? user.videoCount);
  const hearts = count(statsV2?.heartCount, stats?.heartCount ?? user.heartCount);

  return {
    id: user.id || user.secUid || '',
    name: user.nickname || user.uniqueId || '',
    screen_name: user.uniqueId || '',
    avatar_url: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
    /* TikTok profiles have no banner image. */
    banner_url: null,
    description: user.signature || '',
    raw_description: { text: user.signature || '', facets: [] },
    location: '',
    followers,
    following,
    media_count: videos,
    statuses: videos,
    likes: hearts,
    url: `${TIKTOK_ROOT}/@${user.uniqueId || ''}`,
    protected: Boolean(user.privateAccount),
    joined: user.createTime ? new Date(user.createTime * 1000).toISOString() : '',
    birthday: null,
    website: bioWebsite(user.bioLink?.link),
    verification: tiktokVerification(user.verified, user.isOrganization),
    type: 'profile'
  };
};

/**
 * Builds an `APIUser` from an `/embed/@handle` header block. Thinner than
 * {@link buildAPITikTokUser} — the embed app omits `secUid`, the video count and the join date —
 * so it is marked `profile_embed` for clients that want to know to re-fetch.
 */
export const buildAPITikTokUserFromEmbed = (user: TikTokEmbedUserInfo): APIUser => ({
  id: user.id || '',
  name: user.nickname || user.uniqueId || '',
  screen_name: user.uniqueId || '',
  avatar_url: user.avatarThumbUrl || null,
  banner_url: null,
  description: user.signature || '',
  raw_description: { text: user.signature || '', facets: [] },
  location: '',
  followers: user.followerCount ?? 0,
  following: user.followingCount ?? 0,
  media_count: 0,
  statuses: 0,
  likes: user.heartCount ?? 0,
  url: `${TIKTOK_ROOT}/@${user.uniqueId || ''}`,
  protected: Boolean(user.privateAccount),
  joined: '',
  birthday: null,
  website: null,
  verification: tiktokVerification(user.verified),
  type: 'profile',
  profile_embed: true
});

/**
 * Handle-only author stub for embed rows whose poster is not the page owner — hashtag and sound
 * timelines mix creators, and the rows carry nothing but the handle.
 */
export const buildAPITikTokHandleAuthor = (handle: string): APIUser => ({
  id: '',
  name: handle,
  screen_name: handle,
  avatar_url: null,
  banner_url: null,
  description: '',
  raw_description: { text: '', facets: [] },
  location: '',
  followers: 0,
  following: 0,
  media_count: 0,
  statuses: 0,
  likes: 0,
  url: `${TIKTOK_ROOT}/@${handle}`,
  protected: false,
  joined: '',
  birthday: null,
  website: null,
  type: 'profile',
  profile_embed: true
});

/**
 * Builds a status from one row of an embed `videoList` (creator / hashtag / sound pages).
 *
 * These rows are deliberately thin: one `playAddr` with no bitrate ladder, a play count but no
 * like / comment / share counters, and no author object beyond the handle. Callers pass the author
 * they already resolved for the page.
 */
export const buildAPITikTokStatusFromEmbedItem = (
  item: TikTokEmbedItem,
  author: APIUser,
  proxyBase: string | null = null,
  cookies: string | null = null
): APITikTokStatus => {
  const explicitCreatedAt =
    typeof item.createTime === 'string'
      ? parseInt(item.createTime, 10) || 0
      : (item.createTime ?? 0);
  /* Embed rows carry no timestamp, so fall back to the one baked into the id. */
  const createdAt = explicitCreatedAt || tiktokIdToTimestamp(item.id);
  const handle = item.authorUniqueId || author.screen_name;
  /* Hashtag and sound pages mix creators, so only reuse the page author when it is theirs. */
  const rowAuthor =
    handle && handle !== author.screen_name ? buildAPITikTokHandleAuthor(handle) : author;

  const status: APITikTokStatus = {
    id: item.id,
    url: `${TIKTOK_ROOT}/@${handle}/video/${item.id}`,
    text: item.desc || '',
    created_at: createdAt ? new Date(createdAt * 1000).toISOString() : '',
    created_timestamp: createdAt,
    /* The embed rows carry views only; the other counters are simply absent, not zero. */
    likes: 0,
    reposts: 0,
    replies: 0,
    views: item.playCount ?? 0,
    author: rowAuthor,
    media: {},
    raw_text: { text: item.desc || '', facets: [] },
    lang: null,
    possibly_sensitive: false,
    replying_to: null,
    source: 'TikTok',
    embed_card: 'tweet',
    provider: DataProvider.TikTok,
    type: 'status'
  };

  if (item.playAddr) {
    /* CDN play URLs 403 without the cookies TikTok handed us, so route them through the proxy the
       same way single-status media is routed. */
    const url = proxyBase
      ? generateProxyUrl(item.playAddr, cookies, proxyBase, item.id)
      : item.playAddr;
    const video: APIVideo = {
      type: 'video',
      url,
      thumbnail_url: item.originCoverUrl || item.coverUrl || '',
      width: item.width || 720,
      height: item.height || 1280,
      duration: 0,
      format: 'video/mp4',
      formats: [
        {
          url,
          container: 'mp4',
          codec: 'h264',
          width: item.width || 720,
          height: item.height || 1280
        }
      ]
    };
    status.media.videos = [video];
    status.media.all = [video];
    status.embed_card = 'player';
  }

  return status;
};

/**
 * Builds a status from the `/embed/v2/:id` player page payload.
 *
 * The embed app renders from a different backend than `www.tiktok.com/@user/video/:id`, so this is
 * the fallback that covers posts whose main page serves an interstitial. It has the full counters,
 * the author (with `secUid` and stats) and hashtag offsets, but only a single video URL rather than
 * the bitrate ladder the main page carries.
 */
export const buildAPITikTokStatusFromEmbedVideo = (
  data: TikTokEmbedVideoData,
  cookies: string | null = null,
  proxyBase: string | null = null
): APITikTokStatus | null => {
  const item = data.itemInfos;
  if (!item?.id) return null;

  const a = data.authorInfos;
  const stats = data.authorStats;
  const heart =
    typeof stats?.heartCount === 'string'
      ? parseInt(stats.heartCount, 10) || 0
      : (stats?.heartCount ?? 0);

  const author: APIUser = {
    id: a?.userId || item.authorId || '',
    name: a?.nickName || a?.uniqueId || '',
    screen_name: a?.uniqueId || '',
    avatar_url: a?.covers?.[0] ?? null,
    banner_url: null,
    description: a?.signature || '',
    raw_description: { text: a?.signature || '', facets: [] },
    location: '',
    followers: stats?.followerCount ?? 0,
    following: stats?.followingCount ?? 0,
    media_count: stats?.videoCount ?? 0,
    statuses: stats?.videoCount ?? 0,
    likes: heart,
    url: `${TIKTOK_ROOT}/@${a?.uniqueId || ''}`,
    protected: false,
    joined: '',
    birthday: null,
    website: null,
    verification: {
      verified: Boolean(a?.verified),
      type: null,
      verified_at: null,
      identity_verified: false
    },
    type: 'profile'
  };

  const createdAt = parseInt(item.createTime, 10) || 0;
  const music = data.musicInfos;

  const status: APITikTokStatus = {
    id: item.id,
    url: `${TIKTOK_ROOT}/@${a?.uniqueId || ''}/video/${item.id}`,
    text: item.text || '',
    created_at: createdAt ? new Date(createdAt * 1000).toISOString() : '',
    created_timestamp: createdAt,
    likes: item.diggCount ?? 0,
    reposts: item.shareCount ?? 0,
    replies: item.commentCount ?? 0,
    views: item.playCount ?? 0,
    author,
    media: {},
    raw_text: { text: item.text || '', facets: [] },
    lang: null,
    possibly_sensitive: false,
    replying_to: null,
    source: music?.musicName ? `♪ ${music.musicName}` : 'TikTok',
    embed_card: 'tweet',
    provider: DataProvider.TikTok,
    type: 'status'
  };

  const images = data.imagePostInfo?.images ?? [];
  const playUrl = item.video?.urls?.[0];
  const meta = item.video?.videoMeta;

  if (playUrl) {
    const url = proxyBase ? generateProxyUrl(playUrl, cookies, proxyBase, item.id) : playUrl;
    const video: APIVideo = {
      type: 'video',
      url,
      thumbnail_url: item.coversOrigin?.[0] || item.covers?.[0] || '',
      width: meta?.width || 720,
      height: meta?.height || 1280,
      duration: meta?.duration || 0,
      format: 'video/mp4',
      formats: [
        {
          url,
          container: 'mp4',
          codec: 'h264',
          width: meta?.width || 720,
          height: meta?.height || 1280
        }
      ]
    };
    status.media.videos = [video];
    status.media.all = [video];
    status.embed_card = 'player';
  } else if (images.length > 0) {
    const photos: APIPhoto[] = images.map(img => ({
      type: 'photo' as const,
      url: img.imageURL?.urlList?.[0] || '',
      width: img.imageWidth || 0,
      height: img.imageHeight || 0
    }));
    status.media.photos = photos;
    status.media.all = photos;
    status.embed_card = 'summary_large_image';
  }

  return status;
};
