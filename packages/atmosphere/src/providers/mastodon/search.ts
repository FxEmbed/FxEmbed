import type {
  APIMastodonStatus,
  APISearchResultsMastodon,
  APIUserListResults
} from '../../types/api-schemas.js';
import {
  assertSafeMastodonDomain,
  nextMaxIdFromLinkHeader,
  searchAccounts,
  searchStatuses
} from './client.js';
import { buildAPIMastodonPost, mastodonAccountToApiUser } from './processor.js';
import type { MastodonBuildHost } from './build-host.js';

const decodeCursor = (cursor: string | null): { max_id?: string; offset?: number } | undefined => {
  if (!cursor) return undefined;
  try {
    let b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const o = JSON.parse(atob(b64)) as {
      v?: number;
      max_id?: string;
      offset?: number;
    };
    if (o.v !== 1) return undefined;
    return { max_id: o.max_id, offset: o.offset };
  } catch {
    return undefined;
  }
};

const encodeCursor = (maxId: string | null, offset: number | null): string | null => {
  if (maxId) {
    const json = JSON.stringify({ v: 1, max_id: maxId });
    const b64 = btoa(json);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  if (offset !== null && offset > 0) {
    const json = JSON.stringify({ v: 1, offset });
    const b64 = btoa(json);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return null;
};

export type MastodonSearchFeed = 'latest' | 'top' | 'media';

function postHasVisualMedia(s: APIMastodonStatus): boolean {
  const photos = s.media.photos?.length ?? 0;
  const videos = s.media.videos?.length ?? 0;
  return photos > 0 || videos > 0;
}

export const mastodonSearchAPI = async (
  domain: string,
  host: MastodonBuildHost,
  options: {
    q: string;
    feed: MastodonSearchFeed;
    count: number;
    cursor: string | null;
    language?: string;
  }
): Promise<APISearchResultsMastodon> => {
  try {
    assertSafeMastodonDomain(domain);
  } catch {
    return { code: 400, results: [], cursor: { top: null, bottom: null } };
  }

  const decoded = decodeCursor(options.cursor);
  const result = await searchStatuses(domain, options.q, {
    limit: options.count,
    max_id: decoded?.max_id,
    offset: decoded?.offset
  });

  if (!result.ok) {
    if (result.status === 401) {
      return { code: 401, results: [], cursor: { top: null, bottom: null } };
    }
    if (result.status === 404 || result.status === 400) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const statuses = result.data.statuses ?? [];
  const built = await Promise.all(
    statuses.map(async raw => {
      try {
        return (await buildAPIMastodonPost(
          host,
          raw,
          domain,
          options.language
        )) as APIMastodonStatus;
      } catch (e) {
        console.error('mastodon search build', e);
        return null;
      }
    })
  );

  let results = built.filter((s): s is APIMastodonStatus => s !== null);

  if (options.feed === 'media') {
    results = results.filter(postHasVisualMedia);
  }

  const nextMax = nextMaxIdFromLinkHeader(result.link);
  let bottom: string | null = null;
  if (nextMax && statuses.length > 0) {
    bottom = encodeCursor(nextMax, null);
  } else if (statuses.length >= options.count) {
    const nextOffset = (decoded?.offset ?? 0) + options.count;
    bottom = encodeCursor(null, nextOffset);
  }

  return {
    code: 200,
    results,
    cursor: { top: null, bottom }
  };
};

/**
 * People search via `GET /api/v2/search?type=accounts`.
 *
 * Mastodon has no cross-instance account index, so results are whatever the queried instance has
 * already federated. A large, well-connected instance therefore finds far more accounts than a
 * small one — the domain the caller picks is the search corpus, not just the transport.
 *
 * Single page by design: Mastodon serves the first page of search to anonymous callers but
 * answers any `offset` with 401 ("Search queries pagination is not supported without
 * authentication"), and Atmosphere talks to instances unauthenticated. Emitting a cursor here
 * would only hand the caller a "load more" that always fails, so `cursor.bottom` stays null.
 */
export const mastodonSearchUsersAPI = async (
  domain: string,
  options: {
    q: string;
    count: number;
  }
): Promise<APIUserListResults> => {
  try {
    assertSafeMastodonDomain(domain);
  } catch {
    return { code: 400, results: [], cursor: { top: null, bottom: null } };
  }

  const result = await searchAccounts(domain, options.q, { limit: options.count });

  if (!result.ok) {
    if (result.status === 401) {
      return { code: 401, results: [], cursor: { top: null, bottom: null } };
    }
    if (result.status === 404 || result.status === 400) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  return {
    code: 200,
    results: (result.data.accounts ?? []).map(a => mastodonAccountToApiUser(a, domain)),
    cursor: { top: null, bottom: null }
  };
};
