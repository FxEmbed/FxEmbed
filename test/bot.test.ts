import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { isWebpGifUserAgent, processMedia } from '@fxembed/atmosphere/helpers';
import {
  getTwitterProviderEnv,
  setTwitterProviderEnv
} from '@fxembed/atmosphere/providers/twitter-runtime';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import { decodeSnowcode } from '../src/helpers/snowcode';
import { twitterBuildHostFromContext } from '../src/providers/twitter/build-host-adapter';

test('Status response robot', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/jack/status/20', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
});

test('Status response robot (trailing slash/query string and extra characters)', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/jack/status/20||/?asdf=ghjk&klop;', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
});

test('Status response robot (Discord spoiler on translated URL)', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/jack/status/20/en||', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const text = await result.text();
  expect(text).not.toMatch(/Owie, you crashed/);
  expect(text).toMatch(/application\/activity\+json/);
});

test('Status response robot (percent-encoded Discord spoiler on translated URL)', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/jack/status/20/en%7C%7C', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const text = await result.text();
  expect(text).not.toMatch(/Owie, you crashed/);
  expect(text).toMatch(/application\/activity\+json/);
});

test('Fluxerbot gets WebP GIF transcoding', () => {
  const previousEnv = getTwitterProviderEnv();
  setTwitterProviderEnv({
    videoBase: 'https://video.twimg.com',
    gifTranscodeDomainList: ['gif.example']
  });
  try {
    const media = {
      type: 'animated_gif',
      id_str: '123',
      media_url_https: 'https://pbs.twimg.com/media/gif.jpg',
      video_info: {
        variants: [
          { url: 'https://video.twimg.com/gif.mp4', bitrate: 1, content_type: 'video/mp4' }
        ]
      }
    } as unknown as Parameters<typeof processMedia>[1];
    // Build the host through the production adapter, so the test covers the
    // user-agent and API-host gates rather than stubbing them.
    const hostFor = (userAgent: string) =>
      twitterBuildHostFromContext({
        req: {
          header: () => userAgent,
          url: 'https://api.fxtwitter.com/user/status/1',
          raw: {}
        },
        env: {}
      } as unknown as Parameters<typeof twitterBuildHostFromContext>[0]);

    expect(isWebpGifUserAgent('Discordbot/2.0')).toBe(true);
    expect(isWebpGifUserAgent('Fluxerbot/1.0')).toBe(true);
    expect(isWebpGifUserAgent('TelegramBot')).toBe(false);

    const fluxer = processMedia(hostFor('Fluxerbot/1.0'), media);
    expect(fluxer?.type).toBe('gif');
    expect(fluxer && 'transcode_url' in fluxer ? fluxer.transcode_url : undefined).toBe(
      'https://gif.example/gif.webp'
    );
    // Fluxer's unfurler only uses `transcode_url` for a `gif` item that also
    // carries `thumbnail_url` or `duration`; otherwise it embeds `url` as an image.
    expect(fluxer && 'thumbnail_url' in fluxer ? fluxer.thumbnail_url : undefined).toBe(
      'https://pbs.twimg.com/media/gif.jpg'
    );

    // Discord on the API host keeps the untranscoded video response.
    const discord = processMedia(hostFor('Discordbot/2.0'), media);
    expect(discord && 'transcode_url' in discord ? discord.transcode_url : undefined).toBe(
      undefined
    );
    expect(discord?.url).toBe('https://video.twimg.com/gif.mp4');
  } finally {
    setTwitterProviderEnv({
      videoBase: previousEnv.videoBase,
      gifTranscodeDomainList: previousEnv.gifTranscodeDomainList
    });
  }
});

test('Fluxerbot keeps an image GIF when no transcode is available', () => {
  const previousEnv = getTwitterProviderEnv();
  setTwitterProviderEnv({
    videoBase: 'https://video.twimg.com',
    gifTranscodeDomainList: []
  });
  try {
    const media = {
      type: 'animated_gif',
      id_str: '123',
      media_url_https: 'https://pbs.twimg.com/media/gif.jpg',
      video_info: {
        variants: [
          { url: 'https://video.twimg.com/gif.mp4', bitrate: 1, content_type: 'video/mp4' }
        ]
      }
    } as unknown as Parameters<typeof processMedia>[1];
    // Build the host through the production adapter, so the test covers the
    // user-agent and API-host gates rather than stubbing them.
    const hostFor = (userAgent: string) =>
      twitterBuildHostFromContext({
        req: {
          header: () => userAgent,
          url: 'https://api.fxtwitter.com/user/status/1',
          raw: {}
        },
        env: {}
      } as unknown as Parameters<typeof twitterBuildHostFromContext>[0]);

    const fluxer = processMedia(hostFor('Fluxerbot/1.0'), media);
    expect(fluxer?.type).toBe('gif');
    expect(fluxer && 'transcode_url' in fluxer ? fluxer.transcode_url : undefined).toBeUndefined();
    // Without a transcode, a thumbnail would make Fluxer play the poster JPEG as video.
    expect(fluxer && 'thumbnail_url' in fluxer ? fluxer.thumbnail_url : undefined).toBeUndefined();
  } finally {
    setTwitterProviderEnv({
      videoBase: previousEnv.videoBase,
      gifTranscodeDomainList: previousEnv.gifTranscodeDomainList
    });
  }
});

test('Status response robot (Discord spoiler keeps translation language in activity snowcode)', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/jack/status/20/zh-tw||', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const text = await result.text();
  expect(text).not.toMatch(/Owie, you crashed/);
  const match = text.match(/\/statuses\/(\d+)/);
  expect(match?.[1]).toBeTruthy();
  const decoded = decodeSnowcode(match?.[1] ?? '');
  expect(decoded.i).toEqual('20');
  expect(decoded.l).toEqual('zh-tw');
});
