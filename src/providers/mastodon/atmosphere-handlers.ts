import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Constants } from '../../constants';
import { isParamTruthy } from '../../helpers/utils';
import {
  jsonAfterNormalize,
  normalizeApiJsonResponse
} from '../../realms/api/normalizeApiJsonResponse';
import type { APISearchResultsMastodon } from '../../realms/api/schemas';
import {
  mastodonConversationV2Route,
  mastodonProfileFollowersV2Route,
  mastodonProfileFollowingV2Route,
  mastodonProfileMediaV2Route,
  mastodonProfileStatusesV2Route,
  mastodonProfileV2Route,
  mastodonSearchUsersV2Route,
  mastodonSearchV2Route,
  mastodonStatusLikesV2Route,
  mastodonStatusRepostsV2Route,
  mastodonStatusV2Route,
  mastodonThreadV2Route
} from './atmosphere-routes';
import {
  constructMastodonConversation,
  constructMastodonThread
} from '@fxembed/atmosphere/providers/mastodon/conversation';
import { mastodonUserProfileAPI } from '@fxembed/atmosphere/providers/mastodon/profile';
import {
  mastodonProfileFollowersAPI,
  mastodonProfileFollowingAPI
} from '@fxembed/atmosphere/providers/mastodon/profileFollowers';
import {
  mastodonProfileMediaAPI,
  mastodonProfileStatusesAPI
} from '@fxembed/atmosphere/providers/mastodon/profileStatuses';
import {
  mastodonSearchAPI,
  mastodonSearchUsersAPI
} from '@fxembed/atmosphere/providers/mastodon/search';
import { mastodonStatusLikesAPI } from '@fxembed/atmosphere/providers/mastodon/statusLikes';
import { mastodonStatusRepostsAPI } from '@fxembed/atmosphere/providers/mastodon/statusReposts';
import { mastodonBuildHostFromContext } from './build-host-adapter';

const setApiHeaders = (c: Context, options?: { skipContentType?: boolean }) => {
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    if (options?.skipContentType && header.toLowerCase() === 'content-type') {
      continue;
    }
    c.header(header, value);
  }
};

export const mastodonStatusAPIRequest: RouteHandler<typeof mastodonStatusV2Route> = async c => {
  const { domain, id } = c.req.valid('param');
  const { lang } = c.req.valid('query');
  const host = mastodonBuildHostFromContext(c);
  const processedResponse = await constructMastodonThread(id, domain, false, host, lang);
  const { httpStatus, payload } = normalizeApiJsonResponse(
    processedResponse,
    [200, 400, 404, 500] as const,
    'mastodonStatusAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonStatusV2Route>(c, payload, httpStatus);
};

export const mastodonStatusRepostsAPIRequest: RouteHandler<
  typeof mastodonStatusRepostsV2Route
> = async c => {
  const { domain, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const response = await mastodonStatusRepostsAPI(id, domain, {
    count: query.count ?? 20,
    cursor: query.cursor ?? null
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    response,
    [200, 400, 401, 404, 500] as const,
    'mastodonStatusRepostsAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonStatusRepostsV2Route>(c, payload, httpStatus);
};

export const mastodonStatusLikesAPIRequest: RouteHandler<
  typeof mastodonStatusLikesV2Route
> = async c => {
  const { domain, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const response = await mastodonStatusLikesAPI(id, domain, {
    count: query.count ?? 20,
    cursor: query.cursor ?? null
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    response,
    [200, 400, 401, 404, 500] as const,
    'mastodonStatusLikesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonStatusLikesV2Route>(c, payload, httpStatus);
};

export const mastodonThreadAPIRequest: RouteHandler<typeof mastodonThreadV2Route> = async c => {
  const { domain, id } = c.req.valid('param');
  const { lang } = c.req.valid('query');
  const host = mastodonBuildHostFromContext(c);
  const processedResponse = await constructMastodonThread(id, domain, true, host, lang);
  const { httpStatus, payload } = normalizeApiJsonResponse(
    processedResponse,
    [200, 400, 404, 500] as const,
    'mastodonThreadAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonThreadV2Route>(c, payload, httpStatus);
};

export const mastodonConversationAPIRequest: RouteHandler<
  typeof mastodonConversationV2Route
> = async c => {
  const { domain, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const host = mastodonBuildHostFromContext(c);
  const result = await constructMastodonConversation(id, domain, host, {
    rankingMode: query.ranking_mode ?? 'likes',
    cursor: query.cursor ?? null,
    count: query.count ?? 20,
    language: query.lang
  });
  if (!result.ok) {
    setApiHeaders(c);
    return c.json({ code: 400 as const, message: result.message }, 400);
  }
  const processedResponse = result.data;
  const { httpStatus, payload } = normalizeApiJsonResponse(
    processedResponse,
    [200, 400, 404, 500] as const,
    'mastodonConversationAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonConversationV2Route>(c, payload, httpStatus);
};

export const mastodonSearchAPIRequest: RouteHandler<typeof mastodonSearchV2Route> = async c => {
  const { domain } = c.req.valid('param');
  const query = c.req.valid('query');
  const host = mastodonBuildHostFromContext(c);
  const searchResponse = await mastodonSearchAPI(domain, host, {
    q: query.q,
    feed: query.feed ?? 'latest',
    count: query.count ?? 30,
    cursor: query.cursor ?? null,
    language: query.lang
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    searchResponse,
    [200, 400, 401, 404, 500] as const,
    'mastodonSearchAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonSearchV2Route>(c, payload, httpStatus);
};

export const mastodonSearchUsersAPIRequest: RouteHandler<
  typeof mastodonSearchUsersV2Route
> = async c => {
  const { domain } = c.req.valid('param');
  const query = c.req.valid('query');
  const searchResponse = await mastodonSearchUsersAPI(domain, {
    q: query.q,
    count: query.count ?? 30
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    searchResponse,
    [200, 400, 401, 404, 500] as const,
    'mastodonSearchUsersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonSearchUsersV2Route>(c, payload, httpStatus);
};

export const mastodonProfileAPIRequest: RouteHandler<typeof mastodonProfileV2Route> = async c => {
  const { domain, handle } = c.req.valid('param');
  const processedResponse = await mastodonUserProfileAPI(handle, domain);
  const { httpStatus, payload } = normalizeApiJsonResponse(
    processedResponse,
    [200, 400, 404, 500] as const,
    'mastodonProfileAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonProfileV2Route>(c, payload, httpStatus);
};

export const mastodonProfileFollowersAPIRequest: RouteHandler<
  typeof mastodonProfileFollowersV2Route
> = async c => {
  const { domain, handle } = c.req.valid('param');
  const query = c.req.valid('query');
  const response = await mastodonProfileFollowersAPI(handle, domain, {
    count: query.count ?? 20,
    cursor: query.cursor ?? null
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    response,
    [200, 400, 404, 500] as const,
    'mastodonProfileFollowersAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonProfileFollowersV2Route>(c, payload, httpStatus);
};

export const mastodonProfileFollowingAPIRequest: RouteHandler<
  typeof mastodonProfileFollowingV2Route
> = async c => {
  const { domain, handle } = c.req.valid('param');
  const query = c.req.valid('query');
  const response = await mastodonProfileFollowingAPI(handle, domain, {
    count: query.count ?? 20,
    cursor: query.cursor ?? null
  });
  const { httpStatus, payload } = normalizeApiJsonResponse(
    response,
    [200, 400, 404, 500] as const,
    'mastodonProfileFollowingAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonProfileFollowingV2Route>(c, payload, httpStatus);
};

export const mastodonProfileMediaAPIRequest: RouteHandler<
  typeof mastodonProfileMediaV2Route
> = async c => {
  const { domain, handle } = c.req.valid('param');
  const query = c.req.valid('query');
  const host = mastodonBuildHostFromContext(c);
  const mediaResponse = await mastodonProfileMediaAPI(
    handle,
    domain,
    {
      count: query.count ?? 20,
      cursor: query.cursor ?? null,
      language: query.lang
    },
    host
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    mediaResponse,
    [200, 400, 404, 500] as const,
    'mastodonProfileMediaAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonProfileMediaV2Route>(c, payload, httpStatus);
};

type MastodonProfileStatusesResult = Awaited<
  ReturnType<RouteHandler<typeof mastodonProfileStatusesV2Route>>
>;

export const mastodonProfileStatusesAPIRequest = (async (
  c
): Promise<MastodonProfileStatusesResult> => {
  const { domain, handle } = c.req.valid('param');
  const query = c.req.valid('query');
  const withReplies = isParamTruthy(query.with_replies ?? c.req.query('withReplies'));

  const host = mastodonBuildHostFromContext(c);
  const statusesResponse = await mastodonProfileStatusesAPI(
    handle,
    domain,
    {
      count: query.count ?? 20,
      cursor: query.cursor ?? null,
      withReplies,
      language: query.lang,
      since: query.since
    },
    host
  );

  if ('noContent' in statusesResponse && statusesResponse.noContent) {
    c.status(204);
    setApiHeaders(c, { skipContentType: true });
    return c.body(null, 204) as MastodonProfileStatusesResult;
  }

  const body = statusesResponse as APISearchResultsMastodon;
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'mastodonProfileStatusesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof mastodonProfileStatusesV2Route>(c, payload, httpStatus);
}) as RouteHandler<typeof mastodonProfileStatusesV2Route>;
