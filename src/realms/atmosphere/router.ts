import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { Constants } from '../../constants';
import { Strings } from '../../strings';
import { api } from '../api/router';
import { blueskyApi } from '../bluesky-api/router';
import { registerOpenApiJsonRoute } from '../api/openapi-json-route';
import { apiOpenapiValidationHook } from '../api/openapi-validation-hook';
import { registerInstagramAtmosphereRoutes } from '../../providers/instagram/atmosphere-register';
import { registerMastodonAtmosphereRoutes } from '../../providers/mastodon/atmosphere-register';
import { registerThreadsAtmosphereRoutes } from '../../providers/threads/atmosphere-register';
import { registerTikTokAtmosphereRoutes } from '../../providers/tiktok/atmosphere-register';
import { tiktokVideoProxy, tiktokVideoProxyOptions } from '../tiktok/routes/proxy';

export const atmosphere = new OpenAPIHono({ defaultHook: apiOpenapiValidationHook });

atmosphere.use('*', async (c, next) => {
  if (!c.req.header('user-agent')) {
    return c.json(
      {
        error:
          "You must identify yourself with a User-Agent header in order to use the Atmosphere API. We recommend using a descriptive User-Agent header to identify your app, such as 'MyAwesomeBot/1.0 (+http://example.com/myawesomebot)'."
      },
      401
    );
  }
  await next();
});

const trimTrailingSlashMiddleware = trimTrailingSlash();
atmosphere.use(async (c, next) => {
  const p = c.req.path;
  if (p === '/' || p === '') {
    return next();
  }
  return trimTrailingSlashMiddleware(c, next);
});

const atmosphereRoot = async (c: Context) => {
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  c.header('cache-control', 'max-age=0, no-cache, no-store, must-revalidate');
  return c.json({
    service: 'atmosphere' as const,
    version: '2.0.0' as const,
    openapi: '/2/openapi.json' as const,
    note: 'Use `/2/openapi.json` for route and schema details. Twitter (`/2/twitter/…`) and Bluesky (`/2/bluesky/…`) are served by the same in-process API apps as the standalone FxTwitter / FxBluesky API hosts.'
  });
};

atmosphere.get('/', atmosphereRoot);

registerMastodonAtmosphereRoutes(atmosphere);
registerInstagramAtmosphereRoutes(atmosphere);
registerThreadsAtmosphereRoutes(atmosphere);
registerTikTokAtmosphereRoutes(atmosphere);

/**
 * TikTok media URLs in API responses point back at the host that served them, and TikTok's CDN
 * 403s requests that arrive without the cookies from the page fetch. So the Atmosphere host needs
 * the same `/proxy` route the TikTok realm has. Not in the OpenAPI document: it streams video
 * bytes, and the URLs are only meaningful as returned inside a status payload.
 */
atmosphere.get('/proxy', tiktokVideoProxy);
atmosphere.options('/proxy', tiktokVideoProxyOptions);

/**
 * FxTwitter API v2 under `/2/twitter/…` — forward to the in-process `api` app (same handlers and
 * OpenAPI schemas as `api.fxtwitter.com`) so we do not register duplicate OpenAPI paths/schemas.
 */
const forwardTwitterToApi = (c: Context) => {
  const apiPath = '/2' + c.req.path.slice('/2/twitter'.length);
  const u = new URL(c.req.url);
  u.pathname = apiPath;
  return api.fetch(new Request(u, c.req.raw), c.env, c.executionCtx);
};
atmosphere.all('/2/twitter/*', forwardTwitterToApi);

/**
 * FxBluesky API v2 under `/2/bluesky/…` — forward to `blueskyApi` (same as `api.fxbsky.app`).
 */
const forwardBlueskyToApi = (c: Context) => {
  const apiPath = '/2' + c.req.path.slice('/2/bluesky'.length);
  const u = new URL(c.req.url);
  u.pathname = apiPath;
  return blueskyApi.fetch(new Request(u, c.req.raw), c.env, c.executionCtx);
};
atmosphere.all('/2/bluesky/*', forwardBlueskyToApi);

registerOpenApiJsonRoute(atmosphere, '/2/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'FxEmbed Atmosphere API',
    version: '2.0.0',
    description:
      'Multi-provider JSON API (X/Twitter, Bluesky, Mastodon/ActivityPub, TikTok, Instagram, Threads). Mastodon routes are under `/2/mastodon/{instance}/…`, TikTok under `/2/tiktok/…`, Instagram under `/2/instagram/…`, Threads under `/2/threads/…`. Twitter (`/2/twitter/…`) and Bluesky (`/2/bluesky/…`) are served by forwarding to the same logic as `api.fxtwitter.com` and `api.fxbsky.app`; use their `/2/openapi.json` for full path and schema documentation. Instagram routes for likers, follow lists, tagged posts, stories, user search and typeahead need an Instagram account proxy on the deployment and answer `501` without one. TikTok routes are served from the public TikTok web and embed pages; comments, likers, follow lists, keyword search, typeahead and trends have no TikTok route because TikTok gates those behind request signing.'
  },
  servers: Constants.ATMOSPHERE_API_HOST_ROOT
    ? [
        {
          url: Constants.ATMOSPHERE_API_HOST_ROOT,
          description: 'Atmosphere API host'
        }
      ]
    : []
});

atmosphere.get('/robots.txt', async c => c.text(Strings.ROBOTS_TXT_API));

atmosphere.all('*', async c => c.json({ code: 404, message: 'Not found' }, 404));
