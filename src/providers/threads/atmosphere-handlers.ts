import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Constants } from '../../constants';
import {
  jsonAfterNormalize,
  normalizeApiJsonResponse
} from '../../realms/api/normalizeApiJsonResponse';
import type {
  APIProfileRelationshipList,
  APISearchResultsThreads,
  APITrendsResponse,
  APITypeaheadResponse,
  APIUserListResults,
  UserAPIResponse
} from '../../realms/api/schemas';
import type { SocialConversation, SocialThread } from '../../types/apiStatus';
import {
  constructThreadsConversation,
  type ThreadsConversationResult
} from '@fxembed/atmosphere/providers/threads/conversation';
import { constructThreadsPost } from '@fxembed/atmosphere/providers/threads/post';
import {
  constructThreadsProfile,
  constructThreadsProfileStatuses
} from '@fxembed/atmosphere/providers/threads/profile';
import { constructThreadsStatusLikes } from '@fxembed/atmosphere/providers/threads/likes';
import {
  constructThreadsProfileTab,
  type ThreadsProfileTab
} from '@fxembed/atmosphere/providers/threads/profile-tabs';
import {
  constructThreadsRelationshipList,
  type ThreadsRelationshipKind
} from '@fxembed/atmosphere/providers/threads/relationships';
import {
  constructThreadsSearch,
  constructThreadsTypeahead,
  constructThreadsUserSearch
} from '@fxembed/atmosphere/providers/threads/search';
import { constructThreadsTrends } from '@fxembed/atmosphere/providers/threads/trends';
import {
  threadsConversationV2Route,
  threadsProfileFollowersV2Route,
  threadsProfileFollowingV2Route,
  threadsProfileMediaV2Route,
  threadsProfileRepliesV2Route,
  threadsProfileRepostsV2Route,
  threadsProfileStatusesV2Route,
  threadsProfileV2Route,
  threadsSearchUsersV2Route,
  threadsSearchV2Route,
  threadsStatusLikesV2Route,
  threadsStatusV2Route,
  threadsTrendsV2Route,
  threadsTypeaheadV2Route
} from './atmosphere-routes';

async function withThreadsErrorLog<T>(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
  onError: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[threads] ${label}`, {
      ...context,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return onError;
  }
}

const setApiHeaders = (c: Context) => {
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
};

const threadsStatus500: SocialThread = {
  code: 500,
  status: null,
  thread: null,
  author: null
};

const threadsSearch500: APISearchResultsThreads = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const threadsConversationError: ThreadsConversationResult = {
  ok: false,
  message: 'Internal server error',
  data: {
    code: 500,
    status: null,
    thread: null,
    replies: null,
    author: null,
    cursor: null
  }
};

export const threadsStatusAPIRequest: RouteHandler<typeof threadsStatusV2Route> = async c => {
  const { id } = c.req.valid('param');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsPost',
    { id },
    () => constructThreadsPost(id, ua, { credentialKey: c.env?.CREDENTIAL_KEY }),
    threadsStatus500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'threadsStatusAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsStatusV2Route>(c, payload, httpStatus);
};

const threadsProfile500: UserAPIResponse = {
  code: 500,
  message: 'Internal error'
};

export const threadsProfileAPIRequest: RouteHandler<typeof threadsProfileV2Route> = async c => {
  const { username } = c.req.valid('param');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsProfile',
    { username },
    () => constructThreadsProfile(username, ua, { credentialKey: c.env?.CREDENTIAL_KEY }),
    threadsProfile500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'threadsProfileAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileV2Route>(c, payload, httpStatus);
};

export const threadsProfileStatusesAPIRequest: RouteHandler<
  typeof threadsProfileStatusesV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsProfileStatuses',
    { username },
    () =>
      constructThreadsProfileStatuses(username, {
        count: q.count,
        cursor: q.cursor ?? null,
        userAgent: ua,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'threadsProfileStatusesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileStatusesV2Route>(c, payload, httpStatus);
};

export const threadsConversationAPIRequest: RouteHandler<
  typeof threadsConversationV2Route
> = async c => {
  const { id } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const result = await withThreadsErrorLog(
    'constructThreadsConversation',
    { id },
    () =>
      constructThreadsConversation(id, {
        cursor: q.cursor ?? null,
        count: q.count,
        sortOrder: q.sort_order,
        userAgent: ua,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsConversationError
  );
  if (!result.ok) {
    if (result.data) {
      const { httpStatus, payload } = normalizeApiJsonResponse(
        result.data,
        [200, 400, 404, 500] as const,
        'threadsConversationAPIRequest'
      );
      c.status(httpStatus);
      setApiHeaders(c);
      return jsonAfterNormalize<typeof threadsConversationV2Route>(c, payload, httpStatus);
    }
    setApiHeaders(c);
    return c.json({ code: 400 as const, message: result.message }, 400);
  }
  const { httpStatus, payload } = normalizeApiJsonResponse(
    result.data as SocialConversation,
    [200, 400, 404, 500] as const,
    'threadsConversationAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsConversationV2Route>(c, payload, httpStatus);
};

/** Statuses the proxy-gated Threads routes can answer with, including 501 for "no proxy here". */
const PROXY_ROUTE_STATUSES = [200, 400, 404, 500, 501] as const;

const threadsUserList500: APIUserListResults = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const threadsRelationship500: APIProfileRelationshipList = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const threadsTrends500: APITrendsResponse = {
  code: 500,
  timeline_type: 'threads',
  trends: [],
  cursor: { top: null, bottom: null }
};

/**
 * The proxy-only profile tabs differ only by which upstream tab they read, so the work lives in one
 * helper and each route keeps its own thin, correctly-typed handler.
 */
async function profileTabBody(
  username: string,
  tab: ThreadsProfileTab,
  q: { count: number; cursor?: string },
  ctx: { userAgent?: string; credentialKey?: string }
): Promise<APISearchResultsThreads> {
  return withThreadsErrorLog(
    'constructThreadsProfileTab',
    { username, tab },
    () =>
      constructThreadsProfileTab(username, tab, {
        count: q.count,
        cursor: q.cursor ?? null,
        ctx
      }),
    threadsSearch500
  );
}

export const threadsProfileRepliesAPIRequest: RouteHandler<
  typeof threadsProfileRepliesV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const body = await profileTabBody(username, 'replies', q, {
    userAgent: c.req.header('user-agent') ?? undefined,
    credentialKey: c.env?.CREDENTIAL_KEY
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsProfileRepliesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileRepliesV2Route>(c, payload, httpStatus);
};

export const threadsProfileRepostsAPIRequest: RouteHandler<
  typeof threadsProfileRepostsV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const body = await profileTabBody(username, 'reposts', q, {
    userAgent: c.req.header('user-agent') ?? undefined,
    credentialKey: c.env?.CREDENTIAL_KEY
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsProfileRepostsAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileRepostsV2Route>(c, payload, httpStatus);
};

export const threadsProfileMediaAPIRequest: RouteHandler<
  typeof threadsProfileMediaV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const body = await profileTabBody(username, 'media', q, {
    userAgent: c.req.header('user-agent') ?? undefined,
    credentialKey: c.env?.CREDENTIAL_KEY
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsProfileMediaAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileMediaV2Route>(c, payload, httpStatus);
};

/** Followers and following differ only by which upstream list they read. */
async function relationshipBody(
  username: string,
  kind: ThreadsRelationshipKind,
  q: { count: number; cursor?: string },
  ctx: { userAgent?: string; credentialKey?: string }
): Promise<APIProfileRelationshipList> {
  return withThreadsErrorLog(
    'constructThreadsRelationshipList',
    { username, kind },
    () =>
      constructThreadsRelationshipList(username, kind, {
        count: q.count,
        cursor: q.cursor ?? null,
        ctx
      }),
    threadsRelationship500
  );
}

export const threadsProfileFollowersAPIRequest: RouteHandler<
  typeof threadsProfileFollowersV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const body = await relationshipBody(username, 'followers', q, {
    userAgent: c.req.header('user-agent') ?? undefined,
    credentialKey: c.env?.CREDENTIAL_KEY
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsProfileFollowersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileFollowersV2Route>(c, payload, httpStatus);
};

export const threadsProfileFollowingAPIRequest: RouteHandler<
  typeof threadsProfileFollowingV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const body = await relationshipBody(username, 'following', q, {
    userAgent: c.req.header('user-agent') ?? undefined,
    credentialKey: c.env?.CREDENTIAL_KEY
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsProfileFollowingAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsProfileFollowingV2Route>(c, payload, httpStatus);
};

export const threadsStatusLikesAPIRequest: RouteHandler<
  typeof threadsStatusLikesV2Route
> = async c => {
  const { id } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsStatusLikes',
    { id },
    () =>
      constructThreadsStatusLikes(id, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsUserList500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsStatusLikesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsStatusLikesV2Route>(c, payload, httpStatus);
};

export const threadsSearchAPIRequest: RouteHandler<typeof threadsSearchV2Route> = async c => {
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsSearch',
    { q: q.q },
    () =>
      constructThreadsSearch(q.q, {
        count: q.count,
        cursor: q.cursor ?? null,
        sortOrder: q.sort_order,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'threadsSearchAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsSearchV2Route>(c, payload, httpStatus);
};

export const threadsSearchUsersAPIRequest: RouteHandler<
  typeof threadsSearchUsersV2Route
> = async c => {
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsUserSearch',
    { q: q.q },
    () =>
      constructThreadsUserSearch(q.q, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsUserList500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 500, 501] as const,
    'threadsSearchUsersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsSearchUsersV2Route>(c, payload, httpStatus);
};

export const threadsTrendsAPIRequest: RouteHandler<typeof threadsTrendsV2Route> = async c => {
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withThreadsErrorLog(
    'constructThreadsTrends',
    {},
    () =>
      constructThreadsTrends({
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    threadsTrends500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 404, 500, 501] as const,
    'threadsTrendsAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsTrendsV2Route>(c, payload, httpStatus);
};

export const threadsTypeaheadAPIRequest: RouteHandler<typeof threadsTypeaheadV2Route> = async c => {
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const typeahead500: APITypeaheadResponse = {
    code: 500,
    query: q.query,
    num_results: 0,
    users: [],
    topics: [],
    events: []
  };
  const body = await withThreadsErrorLog(
    'constructThreadsTypeahead',
    { query: q.query },
    () =>
      constructThreadsTypeahead(q.query, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    typeahead500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 500, 501] as const,
    'threadsTypeaheadAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof threadsTypeaheadV2Route>(c, payload, httpStatus);
};
