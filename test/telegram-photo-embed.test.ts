import { expect, test } from 'vitest';
import { app } from '../src/worker';
import harness from './helpers/harness';

const telegramHeaders = { 'User-Agent': 'TelegramBot (like TwitterBot)' };

test('Telegram Instant View uses large photo in article body', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/SpaceX/status/1848831595014459513', {
      method: 'GET',
      headers: telegramHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const html = await result.text();
  expect(html).toMatch(/<img src="[^"]*name=large/);
  expect(html).not.toMatch(/<img src="[^"]*name=orig/);
});

test('Telegram embed uses large photo instead of orig', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/SpaceX/status/1848831595014459513/photo/1', {
      method: 'GET',
      headers: telegramHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const html = await result.text();
  expect(html).toMatch(/property="og:image" content="[^"]*name=large/);
  expect(html).not.toMatch(/property="og:image" content="[^"]*name=orig/);
});

test('Telegram direct media redirect uses large photo', async () => {
  const result = await app.request(
    new Request('https://d.fxtwitter.com/SpaceX/status/1848831595014459513.jpg', {
      method: 'GET',
      headers: telegramHeaders,
      redirect: 'manual'
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(302);
  const location = result.headers.get('location') ?? '';
  expect(location).toContain('name=large');
  expect(location).not.toContain('name=orig');
});
