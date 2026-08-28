import { OpenAPIHono } from '@hono/zod-openapi';
import { registerOpenApiJsonRoute } from './openapi-json-route';
import { apiOpenapiValidationHook } from './openapi-validation-hook';
import { statusRequest } from '../twitter/routes/status';
import { profileRequest } from '../twitter/routes/profile';
import { Strings } from '../../strings';
import { Constants } from '../../constants';
import {
  conversationAPIRequest,
  profileAboutAPIRequest,
  profileAPIRequest,
  profileMediaAPIRequest,
  profileArticlesAPIRequest,
  profileFollowersAPIRequest,
  profileFollowingAPIRequest,
  profileStatusesAPIRequest,
  searchAPIRequest,
  searchUsersAPIRequest,
  statusAPIRequest,
  statusRepostsAPIRequest,
  statusQuotesAPIRequest,
  threadAPIRequest,
  trendsAPIRequest,
  typeaheadAPIRequest
} from './routes/twitter';
import { oembed } from './routes/oembed';
import { linkHitRequest, linkGoRequest } from './hit';
import { trimTrailingSlash } from 'hono/trailing-slash';
import {
  conversationV2Route,
  profileAboutV2Route,
  profileMediaV2Route,
  profileArticlesV2Route,
  profileFollowersV2Route,
  profileFollowingV2Route,
  profileStatusesV2Route,
  profileV2Route,
  searchUsersV2Route,
  searchV2Route,
  statusV2Route,
  statusRepostsV2Route,
  statusQuotesV2Route,
  threadV2Route,
  trendsV2Route,
  typeaheadV2Route
} from './routes';

export const api = new OpenAPIHono({ defaultHook: apiOpenapiValidationHook });

api.use('*', async (c, next) => {
  if (!c.req.header('user-agent')) {
    return c.json(
      {
        error:
          "You must identify yourself with a User-Agent header in order to use the FxTwitter API. We recommend using a descriptive User-Agent header to identify your app, such as 'MyAwesomeBot/1.0 (+http://example.com/myawesomebot)'. We don't track or save what kinds of data you are pulling, but you may be blocked if you send too many requests from an unidentifiable user agent."
      },
      401
    );
  }
  await next();
});

api.use(trimTrailingSlash());

/* Private/internal, not listed in OpenAPI */
api.get('/2/hit', linkHitRequest);
api.get('/2/go', linkGoRequest);

api.openapi(statusV2Route, statusAPIRequest);
api.openapi(statusRepostsV2Route, statusRepostsAPIRequest);
api.openapi(statusQuotesV2Route, statusQuotesAPIRequest);
api.openapi(threadV2Route, threadAPIRequest);
api.openapi(conversationV2Route, conversationAPIRequest);
api.openapi(profileStatusesV2Route, profileStatusesAPIRequest);
api.openapi(profileArticlesV2Route, profileArticlesAPIRequest);
api.openapi(profileAboutV2Route, profileAboutAPIRequest);
api.openapi(profileMediaV2Route, profileMediaAPIRequest);
api.openapi(profileFollowersV2Route, profileFollowersAPIRequest);
api.openapi(profileFollowingV2Route, profileFollowingAPIRequest);
api.openapi(profileV2Route, profileAPIRequest);
api.openapi(searchV2Route, searchAPIRequest);
api.openapi(searchUsersV2Route, searchUsersAPIRequest);
api.openapi(typeaheadV2Route, typeaheadAPIRequest);
api.openapi(trendsV2Route, trendsAPIRequest);

api.get('/2/owoembed', oembed);

registerOpenApiJsonRoute(api, '/2/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'FxTwitter API',
    version: '2.0.0',
    description: 'FxTwitter API v2'
  },
  servers: [
    {
      url: Constants.API_HOST_ROOT,
      description: 'FxTwitter API host'
    }
  ]
});

/* Current v1 API endpoints. Currently, these still go through the Twitter embed requests. API v2+ won't do this. */
api.get('/status/:id', statusRequest);
api.get('/status/:id/:language', statusRequest);
api.get('/:handle/status/:id', statusRequest);
api.get('/:handle/status/:id/:language', statusRequest);
api.get('/robots.txt', async c => c.text(Strings.ROBOTS_TXT_API));

api.get('/:handle', profileRequest);

// api.get('/', async c => c.redirect(Constants.API_DOCS_URL, 302));
api.get('*', async c => {
  return c.json({ code: 404, message: 'Not found' }, 404);
});
