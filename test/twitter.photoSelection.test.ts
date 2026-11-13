import { describe, expect, test, vi } from 'vitest';
import { app } from '../src/worker';

const fixture = vi.hoisted(() => {
  const photos = Array.from({ length: 20 }, (_, i) => ({
    type: 'photo',
    id: String(i + 1),
    url: `https://pbs.twimg.com/media/photo${i + 1}.jpg?name=orig`,
    width: 1200,
    height: 1200
  }));

  return {
    photos,
    status: {
      type: 'status',
      provider: 'twitter',
      id: '2121054079027945763',
      url: 'https://x.com/example/status/2121054079027945763',
      text: 'A post with twenty photos',
      raw_text: { text: 'A post with twenty photos', facets: [] },
      author: {
        id: '42',
        name: 'Example',
        screen_name: 'example',
        avatar_url: 'https://pbs.twimg.com/profile_images/example.jpg'
      },
      lang: 'en',
      embed_card: 'summary_large_image',
      media: { all: photos, photos }
    }
  };
});

// Keep the real Worker, router and redirect handler; only replace upstream retrieval.
vi.mock('@fxembed/atmosphere/providers/twitter/conversation', () => ({
  constructTwitterThread: vi.fn(async () => ({
    code: 200,
    status: structuredClone(fixture.status),
    thread: null
  }))
}));

const base = '/example/status/2121054079027945763';
const headers = { 'User-Agent': 'Discordbot/2.0' };
const variants = [
  { name: 'plain', prefix: '', suffix: '' },
  { name: 'localized', prefix: '', suffix: '/en' },
  { name: 'dir', prefix: '/dir', suffix: '' },
  { name: 'localized dir', prefix: '/dir', suffix: '/en' },
  { name: 'dl', prefix: '/dl', suffix: '' },
  { name: 'localized dl', prefix: '/dl', suffix: '/en' }
];

describe.each(variants)('Twitter $name photo selection', ({ prefix, suffix }) => {
  test.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    'redirects /photo/%i to the corresponding photo',
    async n => {
      const response = await app.request(
        `https://d.fxtwitter.com${prefix}${base}/photo/${n}${suffix}`,
        { headers }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(fixture.photos[n - 1].url);
    }
  );

  test.each(['21', '9999999999999999999999999999999999999999'])(
    'keeps the first-photo fallback for unavailable index %s',
    async n => {
      const response = await app.request(
        `https://d.fxtwitter.com${prefix}${base}/photo/${n}${suffix}`,
        { headers }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(fixture.photos[0].url);
    }
  );
});

describe.each(['', '/en'])('Twitter invalid photo indices with suffix "%s"', suffix => {
  test.each(['0', '-1', '01', '1.5'])('keeps the first-photo fallback for %s', async n => {
    const response = await app.request(`https://d.fxtwitter.com${base}/photo/${n}${suffix}`, {
      headers
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(fixture.photos[0].url);
  });
});
