import { vi, test, expect } from 'vitest';
import type { APISearchResults } from '../src/realms/api/schemas';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

// X search is switched off by default (see Experiment.TWITTER_SEARCH); exercise the live code path here.
vi.mock('../src/experiments', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/experiments')>();
  return {
    ...actual,
    experimentCheck: (experiment: import('../src/experiments').Experiment, condition = true) =>
      experiment === actual.Experiment.TWITTER_SEARCH
        ? condition
        : actual.experimentCheck(experiment, condition)
  };
});

test('API status quotes returns posts and cursor envelope for a known post', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/20/quotes', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect([200, 404, 500]).toContain(result.status);
  const response = (await result.json()) as APISearchResults;
  expect(response).toBeTruthy();
  expect(typeof response.code).toBe('number');
  expect(Array.isArray(response.results)).toBe(true);
  expect(response.cursor).toBeDefined();
  expect(response.cursor).toHaveProperty('top');
  expect(response.cursor).toHaveProperty('bottom');

  if (response.code === 200 && response.results.length > 0) {
    const s = response.results[0];
    expect(s.text).toBeDefined();
    expect(s.author?.screen_name).toBeTruthy();
    expect(s.url).toContain(twitterBaseUrl);
  }
});

test('API status quotes accepts count query param', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/20/quotes?count=5', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect([200, 404, 500]).toContain(result.status);
  const response = (await result.json()) as APISearchResults;
  expect(Array.isArray(response.results)).toBe(true);
});
