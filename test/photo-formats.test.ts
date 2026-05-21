import { describe, expect, test } from 'vitest';
import {
  buildTwitterPhotoFormats,
  pickPhotoEmbedUrl,
  type APIPhoto
} from '@fxembed/atmosphere';

const sampleMedia = {
  type: 'photo',
  id_str: '1848831473606135809',
  media_url_https: 'https://pbs.twimg.com/media/GahebgHbEAEevTU.jpg',
  original_info: { width: 4096, height: 2304 },
  sizes: {
    large: { w: 2048, h: 1152, resize: 'fit' },
    medium: { w: 1200, h: 675, resize: 'fit' },
    small: { w: 680, h: 383, resize: 'fit' },
    thumb: { w: 150, h: 150, resize: 'crop' }
  }
} as TweetMedia;

describe('buildTwitterPhotoFormats', () => {
  test('includes named sizes and orig', () => {
    const formats = buildTwitterPhotoFormats(sampleMedia);
    expect(formats.map(f => f.name)).toEqual(['thumb', 'small', 'medium', 'large', 'orig']);
    expect(formats.find(f => f.name === 'large')?.url).toContain('name=large');
    expect(formats.find(f => f.name === 'orig')?.url).toContain('name=orig');
    expect(formats.find(f => f.name === 'large')).toMatchObject({ width: 2048, height: 1152 });
  });

  test('includes x_large when present in raw sizes', () => {
    const withXLarge = {
      ...sampleMedia,
      sizes: {
        ...sampleMedia.sizes,
        x_large: { w: 3000, h: 1688, resize: 'fit' }
      }
    } as TweetMedia;
    const formats = buildTwitterPhotoFormats(withXLarge);
    expect(formats.map(f => f.name)).toContain('x_large');
    expect(formats.find(f => f.name === 'x_large')?.url).toContain('name=x_large');
  });
});

describe('pickPhotoEmbedUrl', () => {
  const photo: APIPhoto = {
    type: 'photo',
    url: 'https://pbs.twimg.com/media/test.jpg?name=orig',
    width: 4096,
    height: 2304,
    formats: buildTwitterPhotoFormats(sampleMedia)
  };

  test('returns orig url for non-Telegram user agents', () => {
    expect(pickPhotoEmbedUrl(photo, 'Discordbot/2.0')).toBe(photo.url);
    expect(pickPhotoEmbedUrl(photo)).toBe(photo.url);
  });

  test('returns largest non-orig size for TelegramBot', () => {
    const url = pickPhotoEmbedUrl(photo, 'TelegramBot (like TwitterBot)');
    expect(url).toContain('name=large');
    expect(url).not.toContain('name=orig');
  });

  test('prefers x_large over large for TelegramBot when available', () => {
    const withXLarge: APIPhoto = {
      ...photo,
      formats: buildTwitterPhotoFormats({
        ...sampleMedia,
        sizes: {
          ...sampleMedia.sizes,
          x_large: { w: 3000, h: 1688, resize: 'fit' }
        }
      } as TweetMedia)
    };
    const url = pickPhotoEmbedUrl(withXLarge, 'TelegramBot/1.0');
    expect(url).toContain('name=x_large');
  });

  test('falls back to url when formats are missing', () => {
    const bare: APIPhoto = {
      type: 'photo',
      url: 'https://pbs.twimg.com/media/test.jpg?name=orig',
      width: 1,
      height: 1
    };
    expect(pickPhotoEmbedUrl(bare, 'TelegramBot/1.0')).toBe(bare.url);
  });
});
