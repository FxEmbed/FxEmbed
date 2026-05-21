import type { APIPhoto } from '../types/api-schemas.js';

const TELEGRAM_UA = 'TelegramBot';
const TELEGRAM_EXCLUDED_NAMES = new Set(['orig', 'thumb']);

const photoFormatArea = (format: { width?: number; height?: number }): number =>
  (format.width ?? 0) * (format.height ?? 0);

/** Pick embed image URL: `orig` by default; largest non-orig size for Telegram. */
export const pickPhotoEmbedUrl = (photo: APIPhoto, userAgent?: string): string => {
  if (!userAgent?.includes(TELEGRAM_UA) || !photo.formats?.length) {
    return photo.url;
  }

  const candidates = photo.formats.filter(f => !TELEGRAM_EXCLUDED_NAMES.has(f.name));
  if (!candidates.length) {
    return photo.url;
  }

  return candidates.reduce((best, current) =>
    photoFormatArea(current) > photoFormatArea(best) ? current : best
  ).url;
};
