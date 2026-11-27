import { describe, expect, test } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

type ProxyFetch = (request: string) => Promise<Response>;

const rateLimited = () =>
  new Response(JSON.stringify({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }), {
    status: 429
  });

/** Environment whose account proxy fails the way an exhausted or throttled account pool does. */
const failingEnv = (failFor: (graphqlMethod: string) => boolean, mode: 'throttled' | 'throws') => {
  const handle = harness.TwitterProxy.fetch as ProxyFetch;
  return {
    ...harness,
    TwitterProxy: {
      fetch: async (request: string) => {
        const method = new URL(request).pathname.split('/').filter(Boolean).pop() ?? '';
        if (!failFor(method)) {
          return handle(request);
        }
        if (mode === 'throws') {
          throw new Error('Network connection lost');
        }
        return rateLimited();
      }
    }
  };
};

const get = (path: string, env: unknown) =>
  app.request(
    new Request(`https://api.fxtwitter.com${path}`, { method: 'GET', headers: botHeaders }),
    undefined,
    env
  );

const isUserLookup = (method: string) => method.includes('ByScreenName');
const isTimeline = (method: string) => method === 'ProfileTimeline' || method === 'UserTweets';

describe.each([
  ['the account pool is rate limited', 'throttled'],
  ['the request to X fails outright', 'throws']
] as const)('when %s', (_label, mode) => {
  test('GET /2/profile/{handle} answers 503 with Retry-After, not 404', async () => {
    const result = await get('/2/profile/x', failingEnv(isUserLookup, mode));
    expect(result.status).toEqual(503);
    expect(result.headers.get('Retry-After')).toEqual('5');
    const response = (await result.json()) as { code: number; message: string; user?: unknown };
    expect(response.code).toEqual(503);
    expect(response.message).toEqual('Upstream unavailable, try again shortly');
    expect(response.user).toBeUndefined();
  });

  test('GET /2/profile/{handle}/statuses answers 503 when the user lookup fails', async () => {
    const result = await get('/2/profile/x/statuses', failingEnv(isUserLookup, mode));
    expect(result.status).toEqual(503);
    expect(result.headers.get('Retry-After')).toEqual('5');
    const response = (await result.json()) as { code: number; message: string; results: unknown[] };
    expect(response.code).toEqual(503);
    expect(response.message).toEqual('Upstream unavailable, try again shortly');
    expect(response.results).toEqual([]);
  });

  test('GET /2/profile/{handle}/statuses answers 503 when the timeline fetch fails', async () => {
    const result = await get('/2/profile/x/statuses', failingEnv(isTimeline, mode));
    expect(result.status).toEqual(503);
    expect(result.headers.get('Retry-After')).toEqual('5');
    expect(((await result.json()) as { code: number }).code).toEqual(503);
  });
});

describe('a user that does not exist', () => {
  test('GET /2/profile/{handle} stays 404 without Retry-After', async () => {
    const result = await get('/2/profile/thisaccountdoesnotexist', harness);
    expect(result.status).toEqual(404);
    expect(result.headers.get('Retry-After')).toBeNull();
    expect(((await result.json()) as { message: string }).message).toEqual('User not found');
  });

  test('GET /2/profile/{handle}/statuses stays 404 without Retry-After', async () => {
    const result = await get('/2/profile/thisaccountdoesnotexist/statuses', harness);
    expect(result.status).toEqual(404);
    expect(result.headers.get('Retry-After')).toBeNull();
  });

  test('a rate limit on top of an empty answer is still treated as a failure', async () => {
    const env = {
      ...harness,
      TwitterProxy: {
        fetch: async () =>
          new Response(
            JSON.stringify({ data: {}, errors: [{ code: 88, message: 'Rate limit exceeded' }] })
          )
      }
    };
    const result = await get('/2/profile/thisaccountdoesnotexist', env);
    expect(result.status).toEqual(503);
  });
});
