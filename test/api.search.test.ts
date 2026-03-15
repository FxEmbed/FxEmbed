import { test, expect } from 'vitest';
import { APISearchResults, APITwitterStatus } from '../src/types/types';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

test('API search returns results for query "neo"', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/search?q=neo', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.results).toBeDefined();
  expect(Array.isArray(response.results)).toBe(true);
  expect(response.cursor).toBeDefined();
  expect(response.cursor.top).toBeTruthy();
  expect(response.cursor.bottom).toBeTruthy();
  expect(typeof response.cursor.top).toBe('string');
  expect(typeof response.cursor.bottom).toBe('string');
  expect(response.results.length).toBeGreaterThan(0);

  const firstTweet = response.results[0] as APITwitterStatus;
  expect(firstTweet).toBeTruthy();
  expect(firstTweet.id).toBeTruthy();
  expect(firstTweet.text).toBeTruthy();
  expect(firstTweet.url).toContain(twitterBaseUrl);
  expect(firstTweet.url).toContain('/status/');
  expect(firstTweet.author).toBeTruthy();
  expect(firstTweet.author.screen_name).toBeTruthy();
  expect(firstTweet.author.name).toBeTruthy();
  expect(firstTweet.author.avatar_url).toBeTruthy();
  expect(firstTweet.created_at).toBeTruthy();
  expect(typeof firstTweet.created_timestamp).toBe('number');
});

test('API search accepts feed parameter', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/search?q=neo&feed=top', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(200);
  expect(response.results).toBeDefined();
});

test('API search accepts count parameter', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/search?q=neo&count=10', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(200);
});

test('API search returns 400 when query parameter is missing', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/search', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(400);
  const response = (await result.json()) as { code: number; message: string };
  expect(response.code).toEqual(400);
  expect(response.message).toContain('q');
});