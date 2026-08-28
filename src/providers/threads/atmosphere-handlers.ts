import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Constants } from '../../constants';
import {
  jsonAfterNormalize,
  normalizeApiJsonResponse
} from '../../realms/api/normalizeApiJsonResponse';
import type { APISearchResultsThreads, UserAPIResponse } from '../../realms/api/schemas';
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
import {
  threadsConversationV2Route,
  threadsProfileStatusesV2Route,
  threadsProfileV2Route,
  threadsStatusV2Route
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
    () => constructThreadsPost(id, ua),
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
    () => constructThreadsProfile(username, ua),
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
        userAgent: ua
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
        userAgent: ua
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
