/**
 * ClientTransaction index extraction against saved x.com fixtures.
 *
 * Fixtures under fixtures/xweb/ are the logged-out x.com home page and its x-web
 * chunks, fetched anonymously (no credentials, no API calls) on 2026-11-05. The
 * middleware and registry chunks are trimmed to the regions around their
 * `client-transaction-id` markers; the entry and generator chunks are whole.
 *
 * Logged-out x.com no longer inlines ondemand.s, so `getIndices` falls through to
 * `indicesFromXWebSign`. Since October 2026 x.com serves opaque hashed chunk names
 * (assets/BmFofgsP.js style, no "sign.o-" prefix), which is the layout the happy-path
 * test exercises end to end (entry -> middleware chunk -> generator chunk).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClientTransaction } from '../packages/atmosphere/src/providers/twitter/proxy/transaction/transaction.js';
import homeHtml from './fixtures/xweb/home.html?raw';
import currentEntryJs from './fixtures/xweb/entry-client-logged-out-DoPLEsOO.js?raw';
import middlewareChunk from './fixtures/xweb/DY5yQU7B.trimmed.js?raw';
import registryChunk from './fixtures/xweb/DFhr1Vbc.trimmed.js?raw';
import generatorChunk from './fixtures/xweb/BmFofgsP.js?raw';

const HOME_URL = 'https://x.com/home';
const ENTRY_NAME = 'entry-client-logged-out-DoPLEsOO.js';
const XWEB_BASE = 'https://abs.twimg.com/x-web/x-web/';
const ENTRY_URL = `${XWEB_BASE}${ENTRY_NAME}`;
const ASSET = (name: string) => `${XWEB_BASE}assets/${name}`;

type FixtureMap = Record<string, string>;

/** home.html with the entry script name swapped, keeping the real meta/SVG content */
const withEntry = (name: string) => homeHtml.split(ENTRY_NAME).join(name);

/** Minimal sign.o-*.js chunk body whose indices decode to [rowIndex, ...keyIndices] */
const signChunkFor = (rowIndex: number, keyIndices: number[]) =>
  `!function(){const e=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];` +
  `console.log(${[rowIndex, ...keyIndices].map(i => `(e[${i}],16)`).join(',')})}();`;

const stubFetch = (fixtures: FixtureMap) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = fixtures[url];
    if (body === undefined) {
      return new Response('', { status: 404 });
    }
    return new Response(body, { headers: { 'content-type': 'text/javascript' } });
  });

const serve = (fixtures: FixtureMap) => vi.stubGlobal('fetch', stubFetch(fixtures));

describe('ClientTransaction indices extraction', () => {
  let consoleLogs: string[];

  beforeEach(async () => {
    consoleLogs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLogs.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
    });
    // cachedFetch stores responses in the Workers cache keyed by URL; the home page URL
    // is shared across scenarios, so drop it before each one
    await caches.default.delete(HOME_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('extracts key-byte indices from hashed chunks (current logged-out x.com layout)', async () => {
    serve({
      [HOME_URL]: homeHtml,
      [ENTRY_URL]: currentEntryJs,
      [ASSET('DY5yQU7B.js')]: middlewareChunk,
      [ASSET('DFhr1Vbc.js')]: registryChunk,
      [ASSET('BmFofgsP.js')]: generatorChunk
    });

    const tx = await ClientTransaction.create();
    // deterministic for the saved fixtures: pins the full init chain (indices -> animation key)
    expect(consoleLogs).toContain('Indices: 0,13,31,41');
    expect(consoleLogs.find(l => l.startsWith('Animation key: '))).toBe(
      'Animation key: 838a540f5c28f5c28f5c0428f5c28f5c290428f5c28f5c290f5c28f5c28f5c00'
    );

    const id = await tx.generateTransactionId('GET', '/i/api/graphql/xxxx/SearchTimeline');
    // 48 key bytes + 4 time bytes + 16 hash bytes + 1 constant + 1 random xor byte
    expect(atob(id).length).toBe(70);
  });

  test('still reads sign.o-*.js referenced directly from the entry (older layout)', async () => {
    const entryName = 'entry-client-legacy-direct-AAAAAA.js';
    serve({
      [HOME_URL]: withEntry(entryName),
      // the entry also statically imports a marker-carrying hashed chunk: a passing
      // assertion here proves the legacy lookup wins BEFORE the hashed-chunk scan
      [`${XWEB_BASE}${entryName}`]:
        'import"./assets/DY5yQU7B.js";const e={signChunk:"sign.o-AAAAAA.js"};',
      [ASSET('DY5yQU7B.js')]: middlewareChunk,
      [ASSET('BmFofgsP.js')]: generatorChunk,
      [ASSET('sign.o-AAAAAA.js')]: signChunkFor(2, [5, 9])
    });

    await ClientTransaction.create();
    expect(consoleLogs).toContain('Indices: 2,5,9');
  });

  test('falls back to the hashed-chunk scan when the legacy sign chunk is unparseable', async () => {
    const entryName = 'entry-client-sign-unparseable-DDDDDD.js';
    serve({
      [HOME_URL]: withEntry(entryName),
      [`${XWEB_BASE}${entryName}`]: 'import"./assets/DY5yQU7B.js";const s="sign.o-DDDDDD.js";',
      [ASSET('DY5yQU7B.js')]: middlewareChunk,
      [ASSET('BmFofgsP.js')]: generatorChunk,
      [ASSET('sign.o-DDDDDD.js')]: ''
    });

    await ClientTransaction.create();
    expect(consoleLogs).toContain('Indices: 0,13,31,41');
  });

  test('still reads sign.o-*.js via the sentry-filter chunk (older layout)', async () => {
    const entryName = 'entry-client-legacy-sentry-BBBBBB.js';
    serve({
      [HOME_URL]: withEntry(entryName),
      [`${XWEB_BASE}${entryName}`]: 'import("./assets/sentry-filter-BBBBBB.js");',
      [ASSET('sentry-filter-BBBBBB.js')]: 'const s="sign.o-BBBBBB.js";',
      [ASSET('sign.o-BBBBBB.js')]: signChunkFor(1, [7, 11])
    });

    await ClientTransaction.create();
    expect(consoleLogs).toContain('Indices: 1,7,11');
  });

  test('throws when no layout provides the on-demand file index', async () => {
    const entryName = 'entry-client-legacy-none-CCCCCC.js';
    serve({
      [HOME_URL]: withEntry(entryName),
      [`${XWEB_BASE}${entryName}`]: 'const e={other:"assets/util-CCCCCC.js"};'
    });

    await expect(ClientTransaction.create()).rejects.toThrow("Couldn't get on-demand file index");
  });
});
