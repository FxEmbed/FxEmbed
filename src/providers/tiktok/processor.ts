import { DataProvider } from '../../enum';
import { APIPhoto, APIVideo, APITikTokStatus, APIVideoFormat } from '../../types/types';

const TIKTOK_ROOT = 'https://www.tiktok.com';

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
const extractAuthor = (video: TikTokItemInfo | TikTokAwemeDetail) => {
  if (isWebApiData(video)) {
    const author = video.author;
    return {
      id: author?.id || author?.secUid || '',
      name: author?.nickname || author?.uniqueId || '',
      screen_name: author?.uniqueId || '',
      avatar_url: author?.avatarLarger || author?.avatarMedium || author?.avatarThumb || null,
      banner_url: null,
      description: author?.signature || '',
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
      }
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
      website: null
    };
  }
  return {
    id: '',
    name: '',
    screen_name: '',
    avatar_url: null,
    banner_url: null,
    description: '',
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
    website: null
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
    provider: DataProvider.TikTok
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
