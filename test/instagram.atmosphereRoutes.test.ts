import { expect, test } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

const ATMOSPHERE = 'https://api.atmosphere.tools';

const get = (path: string) =>
  app.request(new Request(`${ATMOSPHERE}${path}`, { headers: botHeaders }), undefined, harness);

/**
 * The proxy-gated Instagram routes need a logged-in session. Tests run with no `CREDENTIAL_KEY`, so
 * each must answer 501 — an empty 200 would read as "this account has no followers/likers".
 */
const PROXY_ONLY_PATHS = [
  '/2/instagram/status/DXeh-kYiIge/likes',
  '/2/instagram/profile/cristiano/followers',
  '/2/instagram/profile/cristiano/following',
  '/2/instagram/profile/cristiano/tagged',
  '/2/instagram/profile/cristiano/stories',
  '/2/instagram/search/users?query=cristiano',
  '/2/instagram/typeahead?query=cristiano'
];

test.each(PROXY_ONLY_PATHS)('%s reports 501 with no Instagram account proxy', async path => {
  const res = await get(path);
  expect(res.status).toBe(501);
  const body = (await res.json()) as { code: number };
  expect(body.code).toBe(501);
});

test('proxy-gated list routes still return a well-formed envelope', async () => {
  const res = await get('/2/instagram/profile/cristiano/followers');
  const body = (await res.json()) as {
    code: number;
    results: unknown[];
    cursor: { top: string | null; bottom: string | null };
  };
  expect(body.results).toEqual([]);
  expect(body.cursor).toEqual({ top: null, bottom: null });
});

test('typeahead echoes the query back even when unavailable', async () => {
  const res = await get('/2/instagram/typeahead?query=cristiano');
  const body = (await res.json()) as { query: string; users: unknown[]; events: unknown[] };
  expect(body.query).toBe('cristiano');
  expect(body.users).toEqual([]);
  expect(body.events).toEqual([]);
});

test('search/users rejects a missing query before touching Instagram', async () => {
  const res = await get('/2/instagram/search/users');
  expect(res.status).toBe(400);
});

test('Atmosphere OpenAPI documents the new Instagram routes', async () => {
  const res = await get('/2/openapi.json');
  expect(res.status).toBe(200);
  const doc = (await res.json()) as { paths: Record<string, Record<string, unknown>> };
  for (const path of [
    '/2/instagram/status/{id}',
    '/2/instagram/status/{id}/likes',
    '/2/instagram/conversation/{id}',
    '/2/instagram/profile/{username}',
    '/2/instagram/profile/{username}/statuses',
    '/2/instagram/profile/{username}/videos',
    '/2/instagram/profile/{username}/followers',
    '/2/instagram/profile/{username}/following',
    '/2/instagram/profile/{username}/tagged',
    '/2/instagram/profile/{username}/stories',
    '/2/instagram/search/users',
    '/2/instagram/typeahead'
  ]) {
    expect(doc.paths[path], `missing OpenAPI path ${path}`).toBeDefined();
  }

  // The 501 is part of the contract, not an undocumented surprise.
  const followers = doc.paths['/2/instagram/profile/{username}/followers'] as {
    get: { responses: Record<string, unknown> };
  };
  expect(followers.get.responses['501']).toBeDefined();
});
