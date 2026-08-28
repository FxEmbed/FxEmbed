import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Constants } from '../../constants';
import {
  jsonAfterNormalize,
  normalizeApiJsonResponse
} from '../../realms/api/normalizeApiJsonResponse';
import type {
  APIProfileRelationshipList,
  APISearchResultsInstagram,
  APITypeaheadResponse,
  APIUserListResults,
  SocialThreadInstagram,
  UserAPIResponse
} from '../../realms/api/schemas';
import {
  constructInstagramConversation,
  type InstagramConversationResult
} from '@fxembed/atmosphere/providers/instagram/conversation';
import { constructInstagramPost } from '@fxembed/atmosphere/providers/instagram/post';
import {
  constructInstagramProfile,
  constructInstagramProfileStatuses,
  constructInstagramProfileVideos
} from '@fxembed/atmosphere/providers/instagram/profile';
import { constructInstagramStatusLikes } from '@fxembed/atmosphere/providers/instagram/likes';
import { constructInstagramRelationshipList } from '@fxembed/atmosphere/providers/instagram/relationships';
import {
  constructInstagramTypeahead,
  constructInstagramUserSearch
} from '@fxembed/atmosphere/providers/instagram/search';
import { constructInstagramProfileStories } from '@fxembed/atmosphere/providers/instagram/stories';
import { constructInstagramProfileTagged } from '@fxembed/atmosphere/providers/instagram/tagged';
import { normalizeInstagramPostId } from '@fxembed/atmosphere/providers/instagram/shortcode';
import {
  instagramConversationV2Route,
  instagramProfileFollowersV2Route,
  instagramProfileFollowingV2Route,
  instagramProfileStatusesV2Route,
  instagramProfileStoriesV2Route,
  instagramProfileTaggedV2Route,
  instagramProfileVideosV2Route,
  instagramProfileV2Route,
  instagramSearchUsersV2Route,
  instagramStatusLikesV2Route,
  instagramStatusV2Route,
  instagramTypeaheadV2Route
} from './atmosphere-routes';

/** Logs uncaught throws from Instagram upstream logic (network, timeouts, parse bugs). */
async function withInstagramErrorLog<T>(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
  onError: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[instagram] ${label}`, {
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

const instagramStatus500: SocialThreadInstagram = {
  code: 500,
  status: null,
  thread: null,
  author: null
};

const instagramSearch500: APISearchResultsInstagram = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const instagramConversationError: InstagramConversationResult = {
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

export const instagramStatusAPIRequest: RouteHandler<typeof instagramStatusV2Route> = async c => {
  const { id } = c.req.valid('param');
  const ua = c.req.header('user-agent') ?? undefined;
  const shortcode = normalizeInstagramPostId(id);
  const body = await withInstagramErrorLog(
    'constructInstagramPost',
    { shortcode },
    () => constructInstagramPost(shortcode, ua, { credentialKey: c.env?.CREDENTIAL_KEY }),
    instagramStatus500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 404, 500] as const,
    'instagramStatusAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramStatusV2Route>(c, payload, httpStatus);
};

const instagramProfile500: UserAPIResponse = {
  code: 500,
  message: 'Internal error'
};

export const instagramProfileAPIRequest: RouteHandler<typeof instagramProfileV2Route> = async c => {
  const { username } = c.req.valid('param');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramProfile',
    { username },
    () => constructInstagramProfile(username, ua, { credentialKey: c.env?.CREDENTIAL_KEY }),
    instagramProfile500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'instagramProfileAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileV2Route>(c, payload, httpStatus);
};

export const instagramProfileStatusesAPIRequest: RouteHandler<
  typeof instagramProfileStatusesV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramProfileStatuses',
    { username },
    () =>
      constructInstagramProfileStatuses(username, {
        count: q.count,
        cursor: q.cursor ?? null,
        userAgent: ua,
        credentialKey: c.env?.CREDENTIAL_KEY
      }),
    instagramSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'instagramProfileStatusesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileStatusesV2Route>(c, payload, httpStatus);
};

export const instagramProfileVideosAPIRequest: RouteHandler<
  typeof instagramProfileVideosV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramProfileVideos',
    { username },
    () =>
      constructInstagramProfileVideos(username, {
        count: q.count,
        cursor: q.cursor ?? null,
        userAgent: ua,
        credentialKey: c.env?.CREDENTIAL_KEY
      }),
    instagramSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'instagramProfileVideosAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileVideosV2Route>(c, payload, httpStatus);
};

export const instagramConversationAPIRequest: RouteHandler<
  typeof instagramConversationV2Route
> = async c => {
  const { id } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const shortcode = normalizeInstagramPostId(id);
  const result = await withInstagramErrorLog(
    'constructInstagramConversation',
    { shortcode },
    () =>
      constructInstagramConversation(shortcode, {
        cursor: q.cursor ?? null,
        count: q.count,
        sortOrder: q.sort_order,
        userAgent: ua,
        credentialKey: c.env?.CREDENTIAL_KEY
      }),
    instagramConversationError
  );
  if (!result.ok) {
    if (result.data) {
      const { httpStatus, payload } = normalizeApiJsonResponse(
        result.data,
        [200, 400, 404, 500] as const,
        'instagramConversationAPIRequest'
      );
      c.status(httpStatus);
      setApiHeaders(c);
      return jsonAfterNormalize<typeof instagramConversationV2Route>(c, payload, httpStatus);
    }
    setApiHeaders(c);
    return c.json({ code: 400 as const, message: result.message }, 400);
  }
  const { httpStatus, payload } = normalizeApiJsonResponse(
    result.data,
    [200, 400, 404, 500] as const,
    'instagramConversationAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramConversationV2Route>(c, payload, httpStatus);
};

/** Statuses the proxy-gated Instagram routes can answer with, including 501 for "no proxy here". */
const PROXY_ROUTE_STATUSES = [200, 400, 404, 500, 501] as const;

const instagramUserList500: APIUserListResults = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const instagramRelationship500: APIProfileRelationshipList = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

export const instagramStatusLikesAPIRequest: RouteHandler<
  typeof instagramStatusLikesV2Route
> = async c => {
  const { id } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const shortcode = normalizeInstagramPostId(id);
  const body = await withInstagramErrorLog(
    'constructInstagramStatusLikes',
    { shortcode },
    () =>
      constructInstagramStatusLikes(shortcode, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramUserList500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'instagramStatusLikesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramStatusLikesV2Route>(c, payload, httpStatus);
};

export const instagramProfileFollowersAPIRequest: RouteHandler<
  typeof instagramProfileFollowersV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramRelationshipList',
    { username, kind: 'followers' },
    () =>
      constructInstagramRelationshipList(username, 'followers', {
        count: q.count,
        cursor: q.cursor ?? null,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramRelationship500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'instagramProfileFollowersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileFollowersV2Route>(c, payload, httpStatus);
};

export const instagramProfileFollowingAPIRequest: RouteHandler<
  typeof instagramProfileFollowingV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramRelationshipList',
    { username, kind: 'following' },
    () =>
      constructInstagramRelationshipList(username, 'following', {
        count: q.count,
        cursor: q.cursor ?? null,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramRelationship500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'instagramProfileFollowingAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileFollowingV2Route>(c, payload, httpStatus);
};

export const instagramProfileTaggedAPIRequest: RouteHandler<
  typeof instagramProfileTaggedV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramProfileTagged',
    { username },
    () =>
      constructInstagramProfileTagged(username, {
        count: q.count,
        cursor: q.cursor ?? null,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    PROXY_ROUTE_STATUSES,
    'instagramProfileTaggedAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileTaggedV2Route>(c, payload, httpStatus);
};

export const instagramProfileStoriesAPIRequest: RouteHandler<
  typeof instagramProfileStoriesV2Route
> = async c => {
  const { username } = c.req.valid('param');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramProfileStories',
    { username },
    () =>
      constructInstagramProfileStories(username, {
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 404, 500, 501] as const,
    'instagramProfileStoriesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramProfileStoriesV2Route>(c, payload, httpStatus);
};

export const instagramSearchUsersAPIRequest: RouteHandler<
  typeof instagramSearchUsersV2Route
> = async c => {
  const q = c.req.valid('query');
  const ua = c.req.header('user-agent') ?? undefined;
  const body = await withInstagramErrorLog(
    'constructInstagramUserSearch',
    { query: q.query },
    () =>
      constructInstagramUserSearch(q.query, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    instagramUserList500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 500, 501] as const,
    'instagramSearchUsersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramSearchUsersV2Route>(c, payload, httpStatus);
};

export const instagramTypeaheadAPIRequest: RouteHandler<
  typeof instagramTypeaheadV2Route
> = async c => {
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
  const body = await withInstagramErrorLog(
    'constructInstagramTypeahead',
    { query: q.query },
    () =>
      constructInstagramTypeahead(q.query, {
        count: q.count,
        ctx: { userAgent: ua, credentialKey: c.env?.CREDENTIAL_KEY }
      }),
    typeahead500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 500, 501] as const,
    'instagramTypeaheadAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof instagramTypeaheadV2Route>(c, payload, httpStatus);
};
