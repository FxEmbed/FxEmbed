import type { TwitterBuildHost } from '../providers/twitter/build-host.js';
import { getGIFTranscodeDomain } from './gif-transcode.js';
import { getTwitterProviderEnv } from '../providers/twitter-runtime.js';
import { formatImageUrl, isParamTruthy } from './format-image-url.js';
import { convertToApiUser } from '../providers/twitter/profile.js';
import type { APIPhoto, APIPhotoFormat, APIVideo, APIVideoFormat } from '../types/api-schemas.js';

const TWITTER_PHOTO_SIZE_NAMES = ['thumb', 'small', 'medium', 'large', 'x_large'] as const;

/** Build size variants from Twitter `TweetMedia.sizes` for API v2 photo `formats`. */
export const buildTwitterPhotoFormats = (media: TweetMedia): APIPhotoFormat[] => {
  const base = media.media_url_https;
  const formats: APIPhotoFormat[] = [];
  const sizes = media.sizes as Record<string, TweetMediaSize | undefined>;

  for (const name of TWITTER_PHOTO_SIZE_NAMES) {
    const size = sizes[name];
    if (size) {
      formats.push({
        name,
        url: formatImageUrl(base, name),
        width: size.w,
        height: size.h
      });
    }
  }

  formats.push({
    name: 'orig',
    url: formatImageUrl(base, 'orig'),
    width: media.original_info?.width,
    height: media.original_info?.height
  });

  return formats;
};

/**
 * Convert Twitter's TweetMediaVariant to our APIVideoFormat
 */
const convertVariantToFormat = (variant: TweetMediaVariant): APIVideoFormat => {
  const url = variant.url;
  let container: 'mp4' | 'webm' | 'm3u8' | undefined;
  let codec: 'h264' | 'hevc' | 'vp9' | 'av1' | undefined;

  if (url.includes('.m3u8')) {
    container = 'm3u8';
  } else if (url.includes('.webm')) {
    container = 'webm';
  } else if (url.includes('.mp4')) {
    container = 'mp4';
  }
  if (url.includes('hevc')) {
    codec = 'hevc';
  } else if (url.includes('vp9')) {
    codec = 'vp9';
  } else if (url.includes('av1')) {
    codec = 'av1';
  } else if (container === 'mp4' || variant.content_type?.includes('mp4') || url.includes('avc1')) {
    codec = 'h264';
  }

  return {
    url: variant.url,
    bitrate: variant.bitrate,
    container,
    codec
  };
};

/**
 * Convert APIVideoFormat back to TweetMediaVariant for legacy API compatibility
 */
export const convertFormatToVariant = (format: APIVideoFormat): TweetMediaVariant => {
  let content_type = 'video/mp4';
  if (format.container === 'webm') {
    content_type = 'video/webm';
  } else if (format.container === 'm3u8') {
    content_type = 'application/x-mpegURL';
  }

  return {
    url: format.url,
    bitrate: format.bitrate ?? 0,
    content_type
  };
};

const defaultShouldTranscodeGifs = (): boolean => false;
const defaultKitchensink = (): boolean => false;

/* Help populate API response for media */
export const processMedia = (
  host: TwitterBuildHost,
  media: TweetMedia
): APIPhoto | APIVideo | null => {
  const shouldTranscodeGifs = host.shouldTranscodeGif?.() ?? defaultShouldTranscodeGifs();
  const userAgent = host.request?.userAgent ?? '';
  const requestUrl = host.request?.url ?? 'https://localhost/';
  const env = getTwitterProviderEnv();

  if (media.type === 'photo') {
    return {
      type: 'photo',
      id: media.id_str,
      url: formatImageUrl(media.media_url_https, 'orig'),
      width: media.original_info?.width,
      height: media.original_info?.height,
      altText: media.ext_alt_text,
      formats: buildTwitterPhotoFormats(media)
    };
  } else if (media.type === 'video' || media.type === 'animated_gif') {
    const formats: APIVideoFormat[] = media.video_info?.variants?.map(convertVariantToFormat) ?? [];

    const bestFormat = formats
      .filter(format => {
        if (userAgent.includes('TelegramBot') && format.bitrate) {
          const bitrate = format.bitrate || 0;
          const length = (media.video_info?.duration_millis || 0) / 1000;
          const fileSizeBytes: number = (bitrate * length) / 8;
          const fileSizeMB: number = fileSizeBytes / (1024 * 1024);

          console.log(
            `Estimated file size: ${fileSizeMB.toFixed(2)} MB for bitrate ${bitrate / 1000} kbps`
          );
          return fileSizeMB < 30;
        }
        return !format.url.includes('hevc');
      })
      .reduce?.((a, b) => ((a.bitrate ?? 0) > (b.bitrate ?? 0) ? a : b));

    if (media.type === 'animated_gif' && shouldTranscodeGifs) {
      let extension = '.gif';
      if (
        (host.useWebpInsteadOfGifForKitchensink?.() ?? defaultKitchensink()) &&
        userAgent.includes('Discordbot')
      ) {
        const url = new URL(requestUrl);
        if (!isParamTruthy(url.searchParams.get('gif') ?? undefined)) {
          extension = '.webp';
        }
      }
      const transcodeHost = getGIFTranscodeDomain(media.id_str, env.gifTranscodeDomainList);
      const transcodeBase = transcodeHost ? `https://${transcodeHost}` : null;
      return {
        type: 'gif',
        id: media.id_str,
        url: media.media_url_https,
        width: media.original_info?.width,
        height: media.original_info?.height,
        transcode_url:
          bestFormat?.url && transcodeBase
            ? bestFormat.url.replace(env.videoBase, transcodeBase).replace('.mp4', extension)
            : undefined,
        altText: media.ext_alt_text
      };
    }

    let content_type = 'video/mp4';
    if (bestFormat?.container === 'webm') {
      content_type = 'video/webm';
    } else if (bestFormat?.container === 'm3u8') {
      content_type = 'application/x-mpegURL';
    }

    return {
      id: media.id_str,
      url: bestFormat?.url || '',
      thumbnail_url: media.media_url_https,
      duration: (media.video_info?.duration_millis || 0) / 1000,
      width: media.original_info?.width,
      height: media.original_info?.height,
      format: content_type,
      type: media.type === 'animated_gif' ? 'gif' : 'video',
      formats: formats,
      publisher: media.additional_media_info?.source_user
        ? convertToApiUser(media.additional_media_info.source_user.user_results?.result, false)
        : null
    };
  }
  return null;
};
