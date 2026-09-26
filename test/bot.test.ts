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
import { shouldTranscodeGif } from '../src/helpers/giftranscode';

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
    const contextFor = (userAgent: string) =>
      ({
        req: {
          header: () => userAgent,
          url: 'https://api.fxtwitter.com/user/status/1'
        }
      }) as unknown as Parameters<typeof shouldTranscodeGif>[0];
    const host = {
      request: { url: 'https://api.fxtwitter.com/user/status/1', userAgent: 'Fluxerbot/1.0' },
      shouldTranscodeGif: () => shouldTranscodeGif(contextFor('Fluxerbot/1.0')),
      useWebpInsteadOfGifForKitchensink: () => true
    } as unknown as Parameters<typeof processMedia>[0];
    const result = processMedia(host, media);
    expect(isWebpGifUserAgent('Discordbot/2.0')).toBe(true);
    expect(isWebpGifUserAgent('Fluxerbot/1.0')).toBe(true);
    expect(isWebpGifUserAgent('TelegramBot')).toBe(false);
    expect(shouldTranscodeGif(contextFor('Discordbot/2.0'))).toBe(false);
    expect(result && 'transcode_url' in result ? result.transcode_url : undefined).toBe(
      'https://gif.example/gif.webp'
    );
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
