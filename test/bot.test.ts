import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import { decodeSnowcode } from '../src/helpers/snowcode';

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
