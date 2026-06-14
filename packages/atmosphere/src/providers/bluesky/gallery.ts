import type { APIPhoto } from '../../types/api-schemas.js';

/** Hydrated `app.bsky.embed.gallery#viewImage` from AppView. */
export type BlueskyGalleryViewImage = {
  $type?: string;
  thumbnail?: string;
  fullsize?: string;
  alt?: string;
  aspectRatio?: {
    width: number;
    height: number;
  };
};

export const isBlueskyGalleryEmbed = (embed: BlueskyEmbed | undefined): boolean => {
  if (!embed || typeof embed !== 'object') return false;
  if (embed.$type?.includes('gallery')) return true;
  return Array.isArray(embed.items) && embed.items.length > 0;
};

export const blueskyGalleryItemsToPhotos = (
  items: BlueskyGalleryViewImage[] | undefined
): APIPhoto[] => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const photos: APIPhoto[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const url = item.fullsize ?? item.thumbnail;
    if (!url) continue;
    photos.push({
      type: 'photo',
      width: item.aspectRatio?.width ?? 0,
      height: item.aspectRatio?.height ?? 0,
      url,
      altText: item.alt
    });
  }
  return photos;
};

export const blueskyPhotosFromEmbed = (embed: BlueskyEmbed | undefined): APIPhoto[] => {
  if (!embed) return [];

  if (isBlueskyGalleryEmbed(embed)) {
    return blueskyGalleryItemsToPhotos(embed.items as BlueskyGalleryViewImage[]);
  }

  const images =
    embed.images ??
    embed.media?.images;

  if (!Array.isArray(images) || images.length === 0) return [];

  return images.map(image => ({
    type: 'photo' as const,
    width: image.aspectRatio?.width ?? 0,
    height: image.aspectRatio?.height ?? 0,
    url: image.fullsize,
    altText: image.alt
  }));
};
