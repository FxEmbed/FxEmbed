import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { botHeaders, humanHeaders } from './helpers/data';
import harness from './helpers/harness';

test('Instagram realm redirects humans from /p/ to Instagram', async () => {
  const res = await app.request(
    new Request('https://67instagram.com/p/CexampleShort/', {
      method: 'GET',
      headers: humanHeaders
    }),
    undefined,
    harness
  );
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://www.instagram.com/p/CexampleShort/');
});

test('Instagram realm redirects humans from /reel/ to Instagram', async () => {
  const res = await app.request(
    new Request('https://67instagram.com/reel/CexampleReel/', {
      method: 'GET',
      headers: humanHeaders
    }),
    undefined,
    harness
  );
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://www.instagram.com/reel/CexampleReel/');
});

test('Instagram realm serves oembed', async () => {
  const res = await app.request(
    new Request(
      'https://67instagram.com/owoembed?text=hello&status=CexampleShort&author=demo',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    author_name: string;
    author_url: string;
    provider_name: string;
  };
  expect(data.author_name).toBe('hello');
  expect(data.author_url).toBe('https://www.instagram.com/demo/');
  expect(data.provider_name).toBe('FxInstagram');
});

test('Instagram realm unknown paths redirect to Instagram home', async () => {
  const res = await app.request(
    new Request('https://67instagram.com/someuser/', {
      method: 'GET',
      headers: humanHeaders
    }),
    undefined,
    harness
  );
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://www.instagram.com');
});
