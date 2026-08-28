import { expect, test } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

const ATMOSPHERE = 'https://api.atmosphere.tools';

const get = (path: string) =>
  app.request(new Request(`${ATMOSPHERE}${path}`, { headers: botHeaders }), undefined, harness);

/**
 * Threads gates these behind a login, and the proxy borrows the Instagram credential pool. Tests
 * run with no `CREDENTIAL_KEY`, so each must answer 501 — an empty 200 would read as "this account
 * has no replies/followers/likers".
 */
const PROXY_ONLY_PATHS = [
  '/2/threads/status/DXhZAMkljvS/likes',
  '/2/threads/profile/zuck/replies',
  '/2/threads/profile/zuck/reposts',
  '/2/threads/profile/zuck/media',
  '/2/threads/profile/zuck/followers',
  '/2/threads/profile/zuck/following',
  '/2/threads/search?q=meta',
  '/2/threads/search/users?q=meta',
  '/2/threads/trends',
  '/2/threads/typeahead?query=meta'
];

test.each(PROXY_ONLY_PATHS)('%s reports 501 with no account proxy', async path => {
  const res = await get(path);
  expect(res.status).toBe(501);
  const body = (await res.json()) as { code: number };
  expect(body.code).toBe(501);
});

test('proxy-gated list routes still return a well-formed envelope', async () => {
  const res = await get('/2/threads/profile/zuck/replies');
  const body = (await res.json()) as {
    results: unknown[];
    cursor: { top: string | null; bottom: string | null };
  };
  expect(body.results).toEqual([]);
  expect(body.cursor).toEqual({ top: null, bottom: null });
});

test('trends keeps its timeline_type even when unavailable', async () => {
  const res = await get('/2/threads/trends');
  const body = (await res.json()) as { timeline_type: string; trends: unknown[] };
  expect(body.timeline_type).toBe('threads');
  expect(body.trends).toEqual([]);
});

test('search rejects a missing query before touching Threads', async () => {
  const res = await get('/2/threads/search');
  expect(res.status).toBe(400);
});

test('typeahead echoes the query back even when unavailable', async () => {
  const res = await get('/2/threads/typeahead?query=meta');
  const body = (await res.json()) as { query: string; users: unknown[]; events: unknown[] };
  expect(body.query).toBe('meta');
  expect(body.users).toEqual([]);
  expect(body.events).toEqual([]);
});

test('Atmosphere OpenAPI documents the new Threads routes', async () => {
  const res = await get('/2/openapi.json');
  expect(res.status).toBe(200);
  const doc = (await res.json()) as { paths: Record<string, Record<string, unknown>> };
  for (const path of [
    '/2/threads/status/{id}/likes',
    '/2/threads/profile/{username}/replies',
    '/2/threads/profile/{username}/reposts',
    '/2/threads/profile/{username}/media',
    '/2/threads/profile/{username}/followers',
    '/2/threads/profile/{username}/following',
    '/2/threads/search',
    '/2/threads/search/users',
    '/2/threads/trends',
    '/2/threads/typeahead'
  ]) {
    expect(doc.paths[path], `${path} missing from OpenAPI`).toBeDefined();
    expect(doc.paths[path]?.get).toBeDefined();
  }
});
