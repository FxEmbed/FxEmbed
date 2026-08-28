import type {
  APISearchResultsThreads,
  APITypeaheadResponse,
  APITypeaheadTopic,
  APIUserListResults
} from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { decodeThreadsSearchCursor, encodeThreadsSearchCursor } from './cursors.js';
import {
  fetchThreadsKeywordSearch,
  fetchThreadsSearchSerp,
  fetchThreadsUserSearch
} from './private-api.js';
import {
  nextTokenFromThreadsFeed,
  rankTokenFromThreadsSearch,
  statusesFromThreadsFeed,
  usersFromThreadsList
} from './private-processor.js';

const emptySearch = (code: number): APISearchResultsThreads => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

const emptyUserList = (code: number): APIUserListResults => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/**
 * Post search (`fbsearch/text_app/serp/`) — the closest Threads analogue to X's `/2/search`.
 *
 * Logged-out `threads.com` puts search behind a login wall, so this needs the account proxy;
 * without one it reports 501. `sortOrder` maps onto the app's two SERP tabs, which rank
 * differently and mint incompatible page tokens, so it is pinned into the cursor.
 */
export async function constructThreadsSearch(
  query: string,
  options: {
    count: number;
    cursor: string | null;
    sortOrder?: 'top' | 'recent';
    ctx?: ThreadsRequestContext;
  }
): Promise<APISearchResultsThreads> {
  const count = Math.min(100, Math.max(1, Math.floor(options.count)));
  const q = query.trim();
  if (!q) {
    return emptySearch(400);
  }
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return emptySearch(501);
  }

  let recent = options.sortOrder === 'recent';
  let pageToken: string | null = null;
  let rankToken: string | null = null;
  let pageNum = 0;
  let searchQuery = q;

  if (options.cursor) {
    const decoded = decodeThreadsSearchCursor(options.cursor);
    if (!decoded || decoded.q !== q) {
      return emptySearch(400);
    }
    recent = decoded.r;
    pageToken = decoded.t;
    rankToken = decoded.rt;
    pageNum = decoded.p;
    searchQuery = decoded.q;
  }

  const res = await fetchThreadsSearchSerp(searchQuery, options.ctx, {
    accounts,
    recent,
    pageToken,
    rankToken,
    pageNum: pageNum > 0 ? pageNum : undefined
  });
  if (!res.ok) {
    return emptySearch(res.status === 404 ? 404 : 500);
  }

  const results = statusesFromThreadsFeed(res.json, { id: '', username: '', pic: null }).slice(
    0,
    count
  );

  const nextToken = nextTokenFromThreadsFeed(res.json);
  const bottom = nextToken
    ? encodeThreadsSearchCursor({
        v: 1,
        q: searchQuery,
        r: recent,
        t: nextToken,
        rt: rankTokenFromThreadsSearch(res.json) ?? rankToken,
        p: pageNum + 1,
        c: count
      })
    : null;

  return { code: 200, results, cursor: { top: null, bottom } };
}

/**
 * User search. `users/search/` is the Instagram-wide index, so results are filtered to accounts
 * that are actually on Threads — an Instagram-only account has no Threads profile to link to.
 *
 * The endpoint returns one ranked page and no cursor, so `cursor.bottom` is always null.
 */
export async function constructThreadsUserSearch(
  query: string,
  options: { count: number; ctx?: ThreadsRequestContext }
): Promise<APIUserListResults> {
  const count = Math.min(50, Math.max(1, Math.floor(options.count)));
  const q = query.trim();
  if (!q) {
    return emptyUserList(400);
  }
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return emptyUserList(501);
  }
  // Ask for extra rows because the Threads filter drops Instagram-only accounts.
  const res = await fetchThreadsUserSearch(q, options.ctx, { accounts, count: count * 2 });
  if (!res.ok) {
    return emptyUserList(500);
  }
  const results = usersFromThreadsList(res.json, { threadsOnly: true }).slice(0, count);
  return { code: 200, results, cursor: { top: null, bottom: null } };
}

const emptyTypeahead = (code: number, query: string): APITypeaheadResponse => ({
  code,
  query,
  num_results: 0,
  users: [],
  topics: [],
  events: []
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Keyword suggestions out of `fbsearch/text_app/keyword/search/`.
 *
 * The app renders these from `keywords[]`, where each row is either a bare keyword record or one
 * wrapped as `{ keyword: … }`. Anything that doesn't yield a name is skipped, so a shape change
 * upstream costs the topics half of typeahead rather than the whole response.
 */
function topicsFromKeywordSearch(json: unknown): APITypeaheadTopic[] {
  if (!isRecord(json)) return [];
  const rows = json.keywords ?? json.results ?? json.items;
  if (!Array.isArray(rows)) return [];
  const topics: APITypeaheadTopic[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const rec = isRecord(raw.keyword) ? raw.keyword : raw;
    const name =
      typeof rec.keyword_text === 'string'
        ? rec.keyword_text
        : typeof rec.name === 'string'
          ? rec.name
          : typeof rec.keyword === 'string'
            ? rec.keyword
            : '';
    if (!name) continue;
    const context =
      typeof rec.keyword_context === 'string'
        ? rec.keyword_context
        : typeof rec.search_result_subtitle === 'string'
          ? rec.search_result_subtitle
          : undefined;
    topics.push({
      topic: name,
      result_context: {
        ...(context ? { display_string: context } : {}),
        redirect_url: `https://www.threads.com/search?q=${encodeURIComponent(name)}`,
        types: [{ type: 'keyword' }]
      }
    });
  }
  return topics;
}

/**
 * Blended typeahead: accounts from `users/search/` (filtered to Threads) plus keyword suggestions,
 * matching the shape of `/2/instagram/typeahead` and X's `/2/typeahead`. `events` stays empty —
 * Threads has no equivalent.
 */
export async function constructThreadsTypeahead(
  query: string,
  options: { count?: number; ctx?: ThreadsRequestContext } = {}
): Promise<APITypeaheadResponse> {
  const q = query.trim();
  if (!q) {
    return emptyTypeahead(400, query);
  }
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return emptyTypeahead(501, q);
  }

  const [userRes, keywordRes] = await Promise.all([
    fetchThreadsUserSearch(q, options.ctx, { accounts, count: options.count }),
    fetchThreadsKeywordSearch(q, options.ctx, { accounts })
  ]);
  // Users are the half people actually navigate with, so only a failure there is fatal.
  if (!userRes.ok) {
    return emptyTypeahead(500, q);
  }

  const users = usersFromThreadsList(userRes.json, { threadsOnly: true });
  const topics = keywordRes.ok ? topicsFromKeywordSearch(keywordRes.json) : [];
  return {
    code: 200,
    query: q,
    num_results: users.length + topics.length,
    users,
    topics,
    events: []
  };
}
