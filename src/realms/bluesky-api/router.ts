import { OpenAPIHono } from '@hono/zod-openapi';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { registerOpenApiJsonRoute } from '../api/openapi-json-route';
import { apiOpenapiValidationHook } from '../api/openapi-validation-hook';
import { Constants } from '../../constants';
import { Strings } from '../../strings';
import {
  blueskyConversationV2Route,
  blueskyProfileFollowersV2Route,
  blueskyProfileFollowingV2Route,
  blueskyProfileLikesV2Route,
  blueskyProfileMediaV2Route,
  blueskyProfileStatusesV2Route,
  blueskyProfileV2Route,
  blueskySearchUsersV2Route,
  blueskyTypeaheadV2Route,
  blueskySearchV2Route,
  blueskyTrendsV2Route,
  blueskyStatusLikesV2Route,
  blueskyStatusRepostsV2Route,
  blueskyStatusV2Route,
  blueskyThreadV2Route
} from './routes';
import {
  blueskyConversationAPIRequest,
  blueskyProfileAPIRequest,
  blueskyProfileFollowersAPIRequest,
  blueskyProfileFollowingAPIRequest,
  blueskyProfileLikesAPIRequest,
  blueskyProfileMediaAPIRequest,
  blueskyProfileStatusesAPIRequest,
  blueskySearchAPIRequest,
  blueskySearchUsersAPIRequest,
  blueskyTypeaheadAPIRequest,
  blueskyTrendsAPIRequest,
  blueskyStatusAPIRequest,
  blueskyStatusLikesAPIRequest,
  blueskyStatusRepostsAPIRequest,
  blueskyThreadAPIRequest
} from './handlers';

export const blueskyApi = new OpenAPIHono({ defaultHook: apiOpenapiValidationHook });

blueskyApi.use('*', async (c, next) => {
  if (!c.req.header('user-agent')) {
    return c.json(
      {
        error:
          "You must identify yourself with a User-Agent header in order to use the FxBluesky API. We recommend using a descriptive User-Agent header to identify your app, such as 'MyAwesomeBot/1.0 (+http://example.com/myawesomebot)'."
      },
      401
    );
  }
  await next();
});

blueskyApi.use(trimTrailingSlash());

blueskyApi.openapi(blueskyStatusV2Route, blueskyStatusAPIRequest);
blueskyApi.openapi(blueskyStatusRepostsV2Route, blueskyStatusRepostsAPIRequest);
blueskyApi.openapi(blueskyStatusLikesV2Route, blueskyStatusLikesAPIRequest);
blueskyApi.openapi(blueskyThreadV2Route, blueskyThreadAPIRequest);
blueskyApi.openapi(blueskyConversationV2Route, blueskyConversationAPIRequest);
blueskyApi.openapi(blueskySearchV2Route, blueskySearchAPIRequest);
blueskyApi.openapi(blueskySearchUsersV2Route, blueskySearchUsersAPIRequest);
blueskyApi.openapi(blueskyTypeaheadV2Route, blueskyTypeaheadAPIRequest);
blueskyApi.openapi(blueskyTrendsV2Route, blueskyTrendsAPIRequest);
blueskyApi.openapi(blueskyProfileV2Route, blueskyProfileAPIRequest);
blueskyApi.openapi(blueskyProfileFollowersV2Route, blueskyProfileFollowersAPIRequest);
blueskyApi.openapi(blueskyProfileFollowingV2Route, blueskyProfileFollowingAPIRequest);
blueskyApi.openapi(blueskyProfileMediaV2Route, blueskyProfileMediaAPIRequest);
blueskyApi.openapi(blueskyProfileLikesV2Route, blueskyProfileLikesAPIRequest);
blueskyApi.openapi(blueskyProfileStatusesV2Route, blueskyProfileStatusesAPIRequest);

registerOpenApiJsonRoute(blueskyApi, '/2/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'FxBluesky API',
    version: '2.0.0',
    description: 'FxBluesky API v2'
  },
  servers: Constants.BLUESKY_API_HOST_ROOT
    ? [
        {
          url: Constants.BLUESKY_API_HOST_ROOT,
          description: 'FxBluesky API host'
        }
      ]
    : []
});

blueskyApi.get('/robots.txt', async c => c.text(Strings.ROBOTS_TXT_API));

blueskyApi.all('*', async c => c.json({ code: 404, message: 'Not found' }, 404));
