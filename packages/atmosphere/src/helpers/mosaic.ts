import { DataProvider } from '../types/data-provider.js';
import type { APIPhoto, APIMosaicPhoto } from '../types/api-schemas.js';

export type MosaicDomainConfig = {
  /** Domains used for Twitter and Mastodon mosaics */
  twitterLikeDomains: string[];
  /** Domains used for Bluesky mosaics */
  blueskyDomains: string[];
};

const pickDomain = (
  id: string,
  provider: DataProvider,
  config: MosaicDomainConfig
): string | null => {
  let mosaicDomains: string[] = [];
  if (provider === DataProvider.Twitter || provider === DataProvider.Mastodon) {
    mosaicDomains = config.twitterLikeDomains;
  } else if (provider === DataProvider.Bluesky) {
    mosaicDomains = config.blueskyDomains;
  }

  if (mosaicDomains.length === 0) {
    return null;
  }

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }
  return mosaicDomains[Math.abs(hash) % mosaicDomains.length];
};

export const handleMosaic = async (
  mediaList: APIPhoto[],
  id: string,
  provider: DataProvider,
  config: MosaicDomainConfig
): Promise<APIMosaicPhoto | null> => {
  const selectedDomain: string | null = pickDomain(id, provider, config);

  if (selectedDomain === null) {
    return null;
  }
  let mosaicMedia: string[] = [];
  if (provider === DataProvider.Twitter) {
    mosaicMedia = mediaList.map(
      media => media.url?.match(/(?<=\/media\/)[\w-]+(?=[.?])/g)?.[0] || ''
    );
  } else if (provider === DataProvider.Bluesky) {
    mosaicMedia = mediaList.map(media =>
      (media.url?.match(/did:plc:[\w/]+/g)?.[0] || '').replace('/', '_')
    );
  } else if (provider === DataProvider.Mastodon) {
    mosaicMedia = mediaList.map(media => {
      const u = media.url || '';
      let h = 0;
      for (let i = 0; i < u.length; i++) {
        h = (h << 5) - h + u.charCodeAt(i);
      }
      return `m${Math.abs(h).toString(36)}`;
    });
  }
  const baseUrl = `https://${selectedDomain}/`;
  let path = '';

  for (let j = 0; j < 4; j++) {
    if (typeof mosaicMedia[j] === 'string') {
      path += `/${mosaicMedia[j]}`;
    }
  }

  return {
    type: 'mosaic_photo',
    formats: {
      jpeg: `${baseUrl}jpeg/${id}${path}`,
      webp: `${baseUrl}webp/${id}${path}`
    }
  };
};
