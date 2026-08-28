import type {
  APITypeaheadResponse,
  APITypeaheadTopic,
  APIUser,
  APIUserListResults
} from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { fetchPrivateTypeahead, fetchPrivateUserSearch } from './private-api.js';
import { userFromPrivateRecord, usersFromPrivateList } from './private-processor.js';

const emptyUserList = (code: number): APIUserListResults => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

const emptyTypeahead = (code: number, query: string): APITypeaheadResponse => ({
  code,
  query,
  num_results: 0,
  users: [],
  topics: [],
  events: []
});

/**
 * User search (`users/search/`). Logged-out Instagram has no usable search surface, so this needs
 * the account proxy; without one it reports 501.
 *
 * The endpoint returns one ranked page and no cursor, so `cursor.bottom` is always null.
 */
export async function constructInstagramUserSearch(
  query: string,
  options: { count: number; ctx?: InstagramRequestContext }
): Promise<APIUserListResults> {
  const count = Math.min(50, Math.max(1, Math.floor(options.count)));
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return emptyUserList(501);
  }
  const res = await fetchPrivateUserSearch(query, options.ctx, { accounts, count });
  if (!res.ok) {
    return emptyUserList(500);
  }
  return {
    code: 200,
    results: usersFromPrivateList(res.json).slice(0, count),
    cursor: { top: null, bottom: null }
  };
}

type TypeaheadEntry = {
  user?: Record<string, unknown>;
  hashtag?: { name?: string; media_count?: number; formatted_media_count?: string };
  place?: {
    location?: { name?: string; city?: string; short_name?: string };
    title?: string;
    subtitle?: string;
  };
};

function typeaheadEntries(json: unknown): TypeaheadEntry[] {
  if (!json || typeof json !== 'object') return [];
  const list = (json as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is TypeaheadEntry => Boolean(e) && typeof e === 'object');
}

/**
 * Blended typeahead (`fbsearch/ig_typeahead/`). Instagram's mix is users / hashtags / places;
 * hashtags and places both land in `topics` since the API v2 shape has no separate place bucket.
 * `events` stays empty — Instagram has no equivalent.
 */
export async function constructInstagramTypeahead(
  query: string,
  options: { ctx?: InstagramRequestContext; count?: number } = {}
): Promise<APITypeaheadResponse> {
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return emptyTypeahead(501, query);
  }
  const res = await fetchPrivateTypeahead(query, options.ctx, { accounts, count: options.count });
  if (!res.ok) {
    return emptyTypeahead(500, query);
  }

  const users: APIUser[] = [];
  const topics: APITypeaheadTopic[] = [];
  for (const entry of typeaheadEntries(res.json)) {
    if (entry.user) {
      const mapped = userFromPrivateRecord(entry.user);
      if (mapped) users.push(mapped);
      continue;
    }
    const tag = entry.hashtag;
    const tagName = tag?.name;
    if (tagName) {
      topics.push({
        topic: `#${tagName}`,
        result_context: {
          display_string: tag?.formatted_media_count
            ? `${tag.formatted_media_count} posts`
            : undefined,
          redirect_url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tagName)}/`,
          types: [{ type: 'hashtag' }]
        }
      });
      continue;
    }
    const place = entry.place;
    const placeName = place?.location?.name ?? place?.title;
    if (placeName) {
      topics.push({
        topic: placeName,
        result_context: {
          display_string: place?.subtitle ?? place?.location?.city,
          types: [{ type: 'place' }]
        }
      });
    }
  }

  return {
    code: 200,
    query,
    num_results: users.length + topics.length,
    users,
    topics,
    events: []
  };
}
