import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

const telegramHeaders = { 'User-Agent': 'TelegramBot (like TwitterBot)' };

const fetchEmbed = async (url: string, headers: Record<string, string>) => {
  const result = await app.request(
    new Request(url, { method: 'GET', headers }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  return result.text();
};

const isInstantViewHtml = (html: string) =>
  html.includes('al:android:app_name" content="Medium"') &&
  html.includes('article:published_time') &&
  html.includes('<!-- Telegram Instant View -->');

test('Telegram Instant View is enabled for posts with multiple videos', async () => {
  const html = await fetchEmbed(
    'https://fxtwitter.com/DivineDropbear/status/991610',
    telegramHeaders
  );

  expect(isInstantViewHtml(html)).toBe(true);
  expect(html.match(/<video /g)?.length).toBeGreaterThanOrEqual(2);
  expect(html).toContain('og:site_name" content="FxTwitter - Video 1 / 2"');
});

test('Telegram Instant View is not enabled for a single video', async () => {
  const html = await fetchEmbed(
    'https://fxtwitter.com/DivineDropbear/status/1841206275088290279',
    telegramHeaders
  );

  expect(isInstantViewHtml(html)).toBe(false);
  expect(html).not.toContain('<video ');
  expect(html).toContain('twitter:card" content="player"');
});

test('Discord does not receive Instant View for multi-video posts', async () => {
  const html = await fetchEmbed('https://fxtwitter.com/DivineDropbear/status/991610', botHeaders);

  expect(isInstantViewHtml(html)).toBe(false);
  expect(html).not.toContain('<video ');
});

test('Telegram Instant View remains enabled for multi-photo mosaic posts', async () => {
  const html = await fetchEmbed(
    'https://fxtwitter.com/SpaceX/status/1848831595014459513',
    telegramHeaders
  );

  expect(isInstantViewHtml(html)).toBe(true);
  expect(html.match(/<img /g)?.length).toBeGreaterThanOrEqual(3);
});

test('i. prefix still forces Instant View for a single video', async () => {
  const html = await fetchEmbed(
    'https://i.fxtwitter.com/DivineDropbear/status/1841206275088290279',
    telegramHeaders
  );

  expect(isInstantViewHtml(html)).toBe(true);
  expect(html.match(/<video /g)?.length).toBeGreaterThanOrEqual(1);
});
