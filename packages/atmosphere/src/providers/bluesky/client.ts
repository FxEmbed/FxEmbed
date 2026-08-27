import { getBlueskyProviderEnv, getBlueskyProxyRuntime } from '../bluesky-runtime.js';
import { getBlueskyAccessJwt, invalidateBlueskySession } from './session.js';

/** Per-upstream request cap for public AppView (fail fast, then try proxy PDS). */
export const BLUESKY_UPSTREAM_TIMEOUT_MS = 3_000;
/** Authenticated PDS calls are often slower than bsky.app; use a higher cap so backup can succeed. */
export const BLUESKY_PROXY_UPSTREAM_TIMEOUT_MS = 3_000;

export type BlueskyFetchOpts = {
  credentialKey?: string;
  /** When set (e.g. from Discord activity snowcode), try proxy accounts on this PDS host first. */
  preferredProxyServiceHost?: string;
};

export type XrpcErrorBody = {
  error?: string;
  message?: string;
};

type BlueskyXrpcParams = Record<string, string | number | undefined | string[]>;

function trimBaseUrl(base: string): string {
  return base.replace(/\/$/, '');
}

function paramsToSearchString(params: BlueskyXrpcParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, String(item));
    } else {
      qs.set(k, String(v));
    }
  }
  return qs.toString();
}

function buildXrpcUrl(baseUrl: string, path: string, params: BlueskyXrpcParams): string {
  const qs = paramsToSearchString(params);
  return `${trimBaseUrl(baseUrl)}/xrpc/${path}?${qs}`;
}

type XrpcAttemptFail = {
  ok: false;
  status: number;
  body: string;
  aborted?: boolean;
};

type XrpcAttemptOk<T> = { ok: true; data: T };

async function fetchXrpcOnce<T>(
  baseUrl: string,
  path: string,
  params: BlueskyXrpcParams,
  options: { authorization?: string; timeoutMs: number }
): Promise<XrpcAttemptOk<T> | XrpcAttemptFail> {
  const url = buildXrpcUrl(baseUrl, path, params);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), options.timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.authorization) headers['Authorization'] = options.authorization;
    const res = await fetch(url, { signal: ac.signal, headers });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body };
    }
    try {
      return { ok: true, data: JSON.parse(body) as T };
    } catch {
      return { ok: false, status: 502, body: 'invalid JSON from Bluesky' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError');
    return { ok: false, status: 504, body: msg, aborted };
  } finally {
    clearTimeout(t);
  }
}

function isNotFoundError(status: number, body: string): boolean {
  if (status === 404) return true;
  try {
    const j = JSON.parse(body) as { error?: string };
    const err = j.error ?? '';
    if (err === 'NotFound' || err === 'RecordNotFound') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isFallbackEligible(status: number, body: string, aborted?: boolean): boolean {
  if (isNotFoundError(status, body)) return false;
  if (aborted) return true;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  if (status === 401) return true;
  return false;
}

async function executeBlueskyXrpc<T>(
  path: string,
  params: BlueskyXrpcParams,
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: T; proxyHostHint?: string } | { ok: false; status: number; body: string }
> {
  const credentialKey = opts?.credentialKey;
  const px = getBlueskyProxyRuntime();
  const publicBase = getBlueskyProviderEnv().apiRoot;
  const publicTimeoutMs = BLUESKY_UPSTREAM_TIMEOUT_MS;
  const proxyTimeoutMs = BLUESKY_PROXY_UPSTREAM_TIMEOUT_MS;

  const first = await fetchXrpcOnce<T>(publicBase, path, params, { timeoutMs: publicTimeoutMs });
  const publicUpstreamTimedOut = !first.ok && Boolean(first.aborted);
  if (first.ok) {
    return { ok: true, data: first.data };
  }
  if (isNotFoundError(first.status, first.body)) {
    return { ok: false, status: first.status, body: first.body };
  }
  if (publicUpstreamTimedOut) {
    console.log(
      `Bluesky XRPC public AppView (${trimBaseUrl(publicBase)}) timed out after ${publicTimeoutMs}ms`
    );
  }
  if (
    !isFallbackEligible(first.status, first.body, first.aborted) ||
    !credentialKey?.trim() ||
    !px.hasBundledEncryptedCredentials()
  ) {
    return { ok: false, status: first.status, body: first.body };
  }

  try {
    await px.initCredentials(credentialKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      'Bluesky proxy credentials init failed',
      msg,
      `(credentialKey length: ${credentialKey.trim().length})`
    );
  }
  if (!px.hasBlueskyProxyAccounts()) {
    console.log('Bluesky XRPC proxy fallback skipped: credentials have no bluesky.accounts');
    return { ok: false, status: first.status, body: first.body };
  }

  const proxyHostHintFor = (service: string): string | undefined => {
    const h = px.blueskyProxyServiceHostname(service);
    return h || undefined;
  };

  const proxyAccounts = px.getShuffledBlueskyAccounts(opts?.preferredProxyServiceHost);
  for (const cred of proxyAccounts) {
    const accessJwt = await getBlueskyAccessJwt(cred);
    if (!accessJwt) continue;

    const proxyHost = px.blueskyProxyServiceHostname(cred.service) || trimBaseUrl(cred.service);
    if (publicUpstreamTimedOut) {
      console.log(`Bluesky XRPC attempting PDS proxy fallback via ${proxyHost}`);
    }

    let attempt = await fetchXrpcOnce<T>(cred.service, path, params, {
      authorization: `Bearer ${accessJwt}`,
      timeoutMs: proxyTimeoutMs
    });

    if (attempt.ok) {
      return { ok: true, data: attempt.data, proxyHostHint: proxyHostHintFor(cred.service) };
    }

    // Public already failed with a non-NotFound error (outage, timeout, etc.); do not let a
    // proxy NotFound override that — it can be a false negative while the record exists.
    if (isNotFoundError(attempt.status, attempt.body)) {
      continue;
    }

    if (attempt.aborted) {
      console.log(
        `Bluesky XRPC PDS proxy ${proxyHost} timed out after ${proxyTimeoutMs}ms; trying next proxy account if any`
      );
      continue;
    }

    if (attempt.status === 401) {
      invalidateBlueskySession(cred);
      const freshJwt = await getBlueskyAccessJwt(cred);
      if (freshJwt) {
        attempt = await fetchXrpcOnce<T>(cred.service, path, params, {
          authorization: `Bearer ${freshJwt}`,
          timeoutMs: proxyTimeoutMs
        });
        if (attempt.ok) {
          console.log(`Bluesky XRPC successfully fetched from proxy PDS ${proxyHost}`);
          return { ok: true, data: attempt.data, proxyHostHint: proxyHostHintFor(cred.service) };
        }
        if (isNotFoundError(attempt.status, attempt.body)) {
          continue;
        }
        if (attempt.aborted) {
          console.log(
            `Bluesky XRPC PDS proxy ${proxyHost} timed out after ${proxyTimeoutMs}ms (after session refresh); trying next proxy account if any`
          );
        }
      }
      continue;
    }
  }

  console.log('Bluesky XRPC proxy fallback failed: all proxy PDSes exhausted');

  return { ok: false, status: first.status, body: first.body };
}

/** Parse JSON body after a successful logical XRPC (used by helpers that return empty defaults). */
async function executeBlueskyGetJson<T>(
  path: string,
  params: BlueskyXrpcParams,
  opts?: BlueskyFetchOpts
): Promise<T | null> {
  const r = await executeBlueskyXrpc<T>(path, params, opts);
  if (!r.ok) return null;
  return r.data;
}

export type FetchPostThreadResult =
  | { ok: true; data: BlueskyThreadResponse; proxyHostHint?: string }
  | { ok: false; data: null; notFound: boolean; status: number; body: string };

export const fetchPostThreadResult = async (
  atUri: string,
  depth = 10,
  parentHeight?: number,
  opts?: BlueskyFetchOpts
): Promise<FetchPostThreadResult> => {
  const result = await executeBlueskyXrpc<BlueskyThreadResponse>(
    'app.bsky.feed.getPostThread',
    {
      uri: atUri,
      depth,
      parentHeight
    },
    opts
  );
  if (!result.ok) {
    const notFound = isNotFoundError(result.status, result.body);
    console.log('Bluesky getPostThread failed', result.status, result.body?.slice?.(0, 200));
    return { ok: false, data: null, notFound, status: result.status, body: result.body };
  }
  return { ok: true, data: result.data, proxyHostHint: result.proxyHostHint };
};

export const fetchPostThread = async (
  atUri: string,
  depth = 10,
  parentHeight?: number,
  opts?: BlueskyFetchOpts
): Promise<BlueskyThreadResponse | null> => {
  const r = await fetchPostThreadResult(atUri, depth, parentHeight, opts);
  return r.ok ? r.data : null;
};

/** Batch-resolve post views (quotes not hydrated in thread, etc.). */
export const fetchPostsByUris = async (
  uris: string[],
  opts?: BlueskyFetchOpts
): Promise<BlueskyPost[]> => {
  if (!uris.length) return [];
  const j = await executeBlueskyGetJson<{ posts?: BlueskyPost[] }>(
    'app.bsky.feed.getPosts',
    { uris },
    opts
  );
  return j?.posts ?? [];
};

export const fetchProfilesByActors = async (
  actors: string[],
  opts?: BlueskyFetchOpts
): Promise<Map<string, { handle: string; displayName?: string; avatar?: string }>> => {
  const out = new Map<string, { handle: string; displayName?: string; avatar?: string }>();
  if (!actors.length) return out;
  const j = await executeBlueskyGetJson<{
    profiles?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    }[];
  }>('app.bsky.actor.getProfiles', { actors }, opts);
  for (const p of j?.profiles ?? []) {
    out.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar });
  }
  return out;
};

export const fetchActorProfile = async (
  actor: string,
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyProfileViewDetailed } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyProfileViewDetailed>(
    'app.bsky.actor.getProfile',
    { actor },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getProfile failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

export const fetchAuthorFeed = async (
  params: {
    actor: string;
    limit: number;
    cursor?: string;
    filter: BlueskyAuthorFeedFilter;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyAuthorFeedResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyAuthorFeedResponse>(
    'app.bsky.feed.getAuthorFeed',
    {
      actor: params.actor,
      limit: params.limit,
      cursor: params.cursor,
      filter: params.filter
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getAuthorFeed failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

export const fetchActorLikes = async (
  params: {
    actor: string;
    limit: number;
    cursor?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetActorLikesResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetActorLikesResponse>(
    'app.bsky.feed.getActorLikes',
    {
      actor: params.actor,
      limit: params.limit,
      cursor: params.cursor
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getActorLikes failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

/** `app.bsky.feed.searchPosts` against public AppView (cursor may be restricted on some hosts). */
export const fetchSearchPosts = async (
  params: {
    q: string;
    sort: 'latest' | 'top';
    limit: number;
    cursor?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskySearchPostsResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskySearchPostsResponse>(
    'app.bsky.feed.searchPosts',
    {
      q: params.q,
      sort: params.sort,
      limit: params.limit,
      cursor: params.cursor
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky searchPosts failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

/**
 * `app.bsky.actor.searchActors` against the public AppView. Unlike `searchPosts`, actor search is
 * served unauthenticated, so this works on a plain AppView with no proxy credentials.
 */
export const fetchSearchActors = async (
  params: {
    q: string;
    limit: number;
    cursor?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskySearchActorsResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskySearchActorsResponse>(
    'app.bsky.actor.searchActors',
    {
      q: params.q,
      limit: params.limit,
      cursor: params.cursor
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky searchActors failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

/**
 * `app.bsky.actor.searchActorsTypeahead` — the prefix-matching sibling of `searchActors`, meant
 * for autocomplete while the user is still typing. No cursor: it answers one short page by design.
 */
export const fetchSearchActorsTypeahead = async (
  params: {
    q: string;
    limit: number;
  },
  opts?: BlueskyFetchOpts
): Promise<
  | { ok: true; data: BlueskySearchActorsTypeaheadResponse }
  | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskySearchActorsTypeaheadResponse>(
    'app.bsky.actor.searchActorsTypeahead',
    {
      q: params.q,
      limit: params.limit
    },
    opts
  );
  if (!result.ok) {
    console.log(
      'Bluesky searchActorsTypeahead failed',
      result.status,
      result.body?.slice?.(0, 200)
    );
  }
  return result;
};

const GET_PROFILES_MAX_ACTORS = 25;

/** Batch `app.bsky.actor.getProfiles` (max 25 actors per request per lexicon). */
export const fetchProfilesDetailedBatched = async (
  actors: string[],
  opts?: BlueskyFetchOpts
): Promise<Map<string, BlueskyProfileViewDetailed>> => {
  const out = new Map<string, BlueskyProfileViewDetailed>();
  if (!actors.length) return out;
  const unique = [...new Set(actors)];

  for (let i = 0; i < unique.length; i += GET_PROFILES_MAX_ACTORS) {
    const chunk = unique.slice(i, i + GET_PROFILES_MAX_ACTORS);
    const j = await executeBlueskyGetJson<{ profiles?: BlueskyProfileViewDetailed[] }>(
      'app.bsky.actor.getProfiles',
      { actors: chunk },
      opts
    );
    for (const p of j?.profiles ?? []) {
      if (p?.did) out.set(p.did, p);
    }
  }

  return out;
};

export const fetchFollowers = async (
  params: {
    actor: string;
    limit: number;
    cursor?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetFollowersResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetFollowersResponse>(
    'app.bsky.graph.getFollowers',
    {
      actor: params.actor,
      limit: params.limit,
      cursor: params.cursor
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getFollowers failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

export const fetchFollows = async (
  params: {
    actor: string;
    limit: number;
    cursor?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetFollowsResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetFollowsResponse>(
    'app.bsky.graph.getFollows',
    {
      actor: params.actor,
      limit: params.limit,
      cursor: params.cursor
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getFollows failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

export const fetchRepostedBy = async (
  params: {
    uri: string;
    limit: number;
    cursor?: string;
    cid?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetRepostedByResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetRepostedByResponse>(
    'app.bsky.feed.getRepostedBy',
    {
      uri: params.uri,
      limit: params.limit,
      cursor: params.cursor,
      cid: params.cid
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getRepostedBy failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

export const fetchGetLikes = async (
  params: {
    uri: string;
    limit: number;
    cursor?: string;
    cid?: string;
  },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetLikesResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetLikesResponse>(
    'app.bsky.feed.getLikes',
    {
      uri: params.uri,
      limit: params.limit,
      cursor: params.cursor,
      cid: params.cid
    },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getLikes failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};

/** Public AppView (with optional proxy fallback); `limit` is typically 1–25 per upstream. */
export const fetchTrendingTopics = async (
  params: { limit: number },
  opts?: BlueskyFetchOpts
): Promise<
  { ok: true; data: BlueskyGetTrendingTopicsResponse } | { ok: false; status: number; body: string }
> => {
  const result = await executeBlueskyXrpc<BlueskyGetTrendingTopicsResponse>(
    'app.bsky.unspecced.getTrendingTopics',
    { limit: params.limit },
    opts
  );
  if (!result.ok) {
    console.log('Bluesky getTrendingTopics failed', result.status, result.body?.slice?.(0, 200));
  }
  return result;
};
