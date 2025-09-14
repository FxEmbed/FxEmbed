import { Context } from 'hono';
import { APIPhoto, APIVideo } from '../types/types';
import { Constants } from '../constants';
import { getGIFTranscodeDomain, shouldTranscodeGif } from './giftranscode';
import { formatImageUrl } from './utils';

/* Help populate API response for media */
export const processMedia = (c: Context, media: TweetMedia): APIPhoto | APIVideo | null => {
  const shouldTranscodeGifs = shouldTranscodeGif(c);
  if (media.type === 'photo') {
    return {
      type: 'photo',
      url: formatImageUrl(media.media_url_https, 'orig'),
      width: media.original_info?.width,
      height: media.original_info?.height,
      altText: media.ext_alt_text
    };
  } else if (media.type === 'video' || media.type === 'animated_gif') {
    /* Find the variant with the highest bitrate */
    const bestVariant = media.video_info?.variants
      ?.filter?.(format => {
        if (c.req.header('user-agent')?.includes('Telegram') && format.bitrate) {
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
        url: media.media_url_https,
        width: media.original_info?.width,
        height: media.original_info?.height,
        transcode_url: bestVariant?.url
          .replace(Constants.TWITTER_VIDEO_BASE, `https://${getGIFTranscodeDomain(media.id_str)}`)
          .replace('.mp4', '.gif'),
        altText: media.ext_alt_text
      };
    }
    return {
      url: bestVariant?.url || '',
      thumbnail_url: media.media_url_https,
      duration: (media.video_info?.duration_millis || 0) / 1000,
      width: media.original_info?.width,
      height: media.original_info?.height,
      format: bestVariant?.content_type || '',
      type: media.type === 'animated_gif' ? 'gif' : 'video',
      variants: media.video_info?.variants ?? []
    };
  }
  return null;
};
