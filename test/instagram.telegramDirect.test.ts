import { afterEach, expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

const telegramHeaders = { 'User-Agent': 'TelegramBot (like TwitterBot)' };
const VIDEO_URL = 'https://cdn.example/reel.mp4';
const IMAGE_URL = 'https://cdn.example/photo.jpg';

const author = {
  pk: '1',
  username: 'iguser',
  full_name: 'IG User',
  profile_pic_url: 'https://cdn.example/avatar.jpg'
};

const posts: Record<string, Record<string, unknown>> = {
  VidTest01: {
    code: 'VidTest01',
    pk: '1',
    media_type: 2,
    taken_at: 1700000000,
    caption: { text: 'a reel' },
    user: author,
    original_width: 720,
    original_height: 1280,
    video_duration: 5,
    video_versions: [{ url: VIDEO_URL, type: 101, width: 720, height: 1280 }],
    image_versions2: {
      candidates: [{ url: 'https://cdn.example/thumb.jpg', width: 720, height: 1280 }]
    }
  },
  ImgTest01: {
    code: 'ImgTest01',
    pk: '2',
    media_type: 1,
    taken_at: 1700000000,
    caption: { text: 'a photo' },
    user: author,
    image_versions2: {
      candidates: [{ url: IMAGE_URL, width: 1080, height: 1080 }]
    }
  }
};

function webInfoHtml(item: Record<string, unknown>): string {
  return `<!DOCTYPE html><html><body><script type="application/json" data-sjs>${JSON.stringify({
    xdt_api__v1__media__shortcode__web_info: { items: [item] }
  })}</script></body></html>`;
}

function installInstagramFetch() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    if (url.hostname !== 'www.instagram.com') {
      return new Response('not found', { status: 404 });
    }
    const shortcode = url.pathname.split('/').filter(Boolean).pop();
    const item = shortcode ? posts[shortcode] : undefined;
    if (!item) {
      return new Response('<html></html>', { status: 200 });
    }
    return new Response(webInfoHtml(item), {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('Telegram receives direct media for an Instagram video', async () => {
  installInstagramFetch();
  const res = await app.request(
    new Request('https://67instagram.com/reel/VidTest01', {
      method: 'GET',
      headers: telegramHeaders
    }),
    undefined,
    harness
  );

  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe(VIDEO_URL);
});

test('Discord keeps the embed pipeline for an Instagram video', async () => {
  installInstagramFetch();
  const res = await app.request(
    new Request('https://67instagram.com/p/VidTest01', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );

  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('application/activity+json');
  expect(html).not.toContain(`content="${VIDEO_URL}"`);
  expect(res.headers.get('location')).toBeNull();
});

test('Other non-Telegram clients keep the Instagram video embed', async () => {
  installInstagramFetch();
  const res = await app.request(
    new Request('https://67instagram.com/reel/VidTest01', {
      method: 'GET',
      headers: { 'User-Agent': 'WhatsApp/2.0' }
    }),
    undefined,
    harness
  );

  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('og:video');
  expect(html).toContain(VIDEO_URL);
  expect(html).toContain('twitter:card" content="player"');
});

test('Telegram keeps the embed pipeline for an Instagram image', async () => {
  installInstagramFetch();
  const res = await app.request(
    new Request('https://67instagram.com/p/ImgTest01', {
      method: 'GET',
      headers: telegramHeaders
    }),
    undefined,
    harness
  );

  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('og:image');
  expect(html).toContain(IMAGE_URL);
  expect(res.headers.get('location')).toBeNull();
});

test('Telegram keeps the embed pipeline for a non-Instagram video', async () => {
  const res = await app.request(
    new Request('https://fxtwitter.com/DivineDropbear/status/1841206275088290279', {
      method: 'GET',
      headers: telegramHeaders
    }),
    undefined,
    harness
  );

  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('twitter:card" content="player"');
  expect(html).not.toContain('<video ');
  expect(res.headers.get('location')).toBeNull();
});
