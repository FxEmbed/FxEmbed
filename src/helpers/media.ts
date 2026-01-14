import { Context } from 'hono';
import { APIPhoto, APIVideo, APIVideoFormat } from '../types/types';
import { Constants } from '../constants';
import { getGIFTranscodeDomain, shouldTranscodeGif } from './giftranscode';
import { formatImageUrl } from './utils';
import { TweetMediaVariant, TweetMedia } from '../types/vendor/twitter';

/**
 * Convert Twitter's TweetMediaVariant to our APIVideoFormat
 */
const convertVariantToFormat = (variant: TweetMediaVariant): APIVideoFormat => {
  const url = variant.url;
  let container: 'mp4' | 'webm' | 'm3u8' | undefined;
  let codec: 'h264' | 'hevc' | 'vp9' | 'av1' | undefined;

  // Detect container from URL
  if (url.includes('.m3u8')) {
    container = 'm3u8';
  } else if (url.includes('.webm')) {
    container = 'webm';
  } else if (url.includes('.mp4')) {
    container = 'mp4';
  }
  // Detect codec from URL or content type
  if (url.includes('hevc')) {
    codec = 'hevc';
  } else if (url.includes('vp9')) {
    codec = 'vp9';
  } else if (url.includes('av1')) {
    codec = 'av1';
  } else if (container === 'mp4' || variant.content_type?.includes('mp4') || url.includes('avc1')) {
    codec = 'h264'; // Default for MP4
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
  // Determine content type from container/codec
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

/* Help populate API response for media */
export const processMedia = (c: Context, media: TweetMedia): APIPhoto | APIVideo | null => {
  const shouldTranscodeGifs = shouldTranscodeGif(c);
  if (media.type === 'photo') {
    return {
      type: 'photo',
      id: media.id_str,
      url: formatImageUrl(media.media_url_https),
      width: media.original_info?.width,
      height: media.original_info?.height,
      altText: media.ext_alt_text
    };
  } else if (media.type === 'video' || media.type === 'animated_gif') {
    // Convert Twitter variants to our formats
    const formats: APIVideoFormat[] = media.video_info?.variants?.map(convertVariantToFormat) ?? [];

    /* Find the format with the highest bitrate */
    const bestFormat = formats
      .filter(format => {
        if (c.req.header('user-agent')?.includes('TelegramBot') && format.bitrate) {
          /* Telegram doesn't support videos over 20 MB, so we need to filter them out */
          const bitrate = format.bitrate || 0;
          const length = (media.video_info?.duration_millis || 0) / 1000;
          /* Calculate file size in bytes */
          const fileSizeBytes: number = (bitrate * length) / 8;
          /* Convert file size to megabytes (MB) */
          const fileSizeMB: number = fileSizeBytes / (1024 * 1024);

          console.log(
            `Estimated file size: ${fileSizeMB.toFixed(2)} MB for bitrate ${bitrate / 1000} kbps`
          );
          return (
            fileSizeMB < 30
          ); /* Currently this calculation is off, so we'll just do it if it's way over */
        }
        return !format.url.includes('hevc');
      })
      .reduce?.((a, b) => ((a.bitrate ?? 0) > (b.bitrate ?? 0) ? a : b));

    if (media.type === 'animated_gif' && shouldTranscodeGifs) {
      return {
        type: 'gif',
        id: media.id_str,
        url: media.media_url_https,
        width: media.original_info?.width,
        height: media.original_info?.height,
        transcode_url: bestFormat?.url
          .replace(Constants.TWITTER_VIDEO_BASE, `https://${getGIFTranscodeDomain(media.id_str)}`)
          .replace('.mp4', '.gif'),
        altText: media.ext_alt_text
      };
    }

    // Determine content type from best format
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
      formats: formats
    };
  }
  return null;
};
