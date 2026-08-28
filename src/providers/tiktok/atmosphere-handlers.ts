import type { RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Constants } from '../../constants';
import {
  jsonAfterNormalize,
  normalizeApiJsonResponse
} from '../../realms/api/normalizeApiJsonResponse';
import type {
  APISearchResultsTikTok,
  APITikTokCollectionResults,
  SocialThreadTikTok,
  UserAPIResponse
} from '../../realms/api/schemas';
import { constructTikTokVideo } from '@fxembed/atmosphere/providers/tiktok/conversation';
import { constructTikTokProfile } from '@fxembed/atmosphere/providers/tiktok/profile';
import {
  constructTikTokHashtag,
  constructTikTokMusic,
  constructTikTokProfileStatuses
} from '@fxembed/atmosphere/providers/tiktok/timelines';
import {
  tiktokHashtagV2Route,
  tiktokMusicV2Route,
  tiktokProfileStatusesV2Route,
  tiktokProfileV2Route,
  tiktokStatusV2Route
} from './atmosphere-routes';

/** Logs uncaught throws from TikTok upstream logic (network, timeouts, parse bugs). */
async function withTikTokErrorLog<T>(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
  onError: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[tiktok] ${label}`, {
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

/** Base for the `/proxy` route that replays TikTok's cookies to its video CDN. */
const proxyBaseFor = (c: Context): string => {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
};

const tiktokStatus500: SocialThreadTikTok = {
  code: 500,
  status: null,
  thread: null,
  author: null
};

const tiktokSearch500: APISearchResultsTikTok = {
  code: 500,
  results: [],
  cursor: { top: null, bottom: null }
};

const tiktokCollection500: APITikTokCollectionResults = {
  code: 500,
  collection: null,
  results: [],
  cursor: { top: null, bottom: null }
};

export const tiktokStatusAPIRequest: RouteHandler<typeof tiktokStatusV2Route> = async c => {
  const { id } = c.req.valid('param');
  const body = await withTikTokErrorLog(
    'constructTikTokVideo',
    { id },
    async () =>
      (await constructTikTokVideo(
        id,
        proxyBaseFor(c),
        c.req.header('user-agent') ?? undefined
      )) as SocialThreadTikTok,
    tiktokStatus500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 404, 500] as const,
    'tiktokStatusAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof tiktokStatusV2Route>(c, payload, httpStatus);
};

const tiktokProfile500: UserAPIResponse = {
  code: 500,
  message: 'Internal error'
};

export const tiktokProfileAPIRequest: RouteHandler<typeof tiktokProfileV2Route> = async c => {
  const { handle } = c.req.valid('param');
  const body = await withTikTokErrorLog(
    'constructTikTokProfile',
    { handle },
    () => constructTikTokProfile(handle),
    tiktokProfile500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'tiktokProfileAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof tiktokProfileV2Route>(c, payload, httpStatus);
};

export const tiktokProfileStatusesAPIRequest: RouteHandler<
  typeof tiktokProfileStatusesV2Route
> = async c => {
  const { handle } = c.req.valid('param');
  const { count } = c.req.valid('query');
  const body = await withTikTokErrorLog(
    'constructTikTokProfileStatuses',
    { handle },
    () => constructTikTokProfileStatuses(handle, { count, proxyBase: proxyBaseFor(c) }),
    tiktokSearch500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'tiktokProfileStatusesAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof tiktokProfileStatusesV2Route>(c, payload, httpStatus);
};

export const tiktokHashtagAPIRequest: RouteHandler<typeof tiktokHashtagV2Route> = async c => {
  const { hashtag } = c.req.valid('param');
  const { count } = c.req.valid('query');
  const body = await withTikTokErrorLog(
    'constructTikTokHashtag',
    { hashtag },
    () => constructTikTokHashtag(hashtag, { count, proxyBase: proxyBaseFor(c) }),
    tiktokCollection500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'tiktokHashtagAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof tiktokHashtagV2Route>(c, payload, httpStatus);
};

export const tiktokMusicAPIRequest: RouteHandler<typeof tiktokMusicV2Route> = async c => {
  const { id } = c.req.valid('param');
  const { count } = c.req.valid('query');
  const body = await withTikTokErrorLog(
    'constructTikTokMusic',
    { id },
    () => constructTikTokMusic(id, { count, proxyBase: proxyBaseFor(c) }),
    tiktokCollection500
  );
  const { httpStatus, payload } = normalizeApiJsonResponse(
    body,
    [200, 400, 404, 500] as const,
    'tiktokMusicAPIRequest'
  );
  c.status(httpStatus);
  setApiHeaders(c);
  return jsonAfterNormalize<typeof tiktokMusicV2Route>(c, payload, httpStatus);
};
