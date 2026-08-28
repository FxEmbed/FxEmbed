import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  mastodonConversationAPIRequest,
  mastodonProfileAPIRequest,
  mastodonProfileFollowersAPIRequest,
  mastodonProfileFollowingAPIRequest,
  mastodonProfileMediaAPIRequest,
  mastodonProfileStatusesAPIRequest,
  mastodonSearchAPIRequest,
  mastodonSearchUsersAPIRequest,
  mastodonStatusAPIRequest,
  mastodonStatusLikesAPIRequest,
  mastodonStatusRepostsAPIRequest,
  mastodonThreadAPIRequest
} from './atmosphere-handlers';
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

export const registerMastodonAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(mastodonStatusV2Route, mastodonStatusAPIRequest);
  atmosphere.openapi(mastodonStatusRepostsV2Route, mastodonStatusRepostsAPIRequest);
  atmosphere.openapi(mastodonStatusLikesV2Route, mastodonStatusLikesAPIRequest);
  atmosphere.openapi(mastodonThreadV2Route, mastodonThreadAPIRequest);
  atmosphere.openapi(mastodonConversationV2Route, mastodonConversationAPIRequest);
  atmosphere.openapi(mastodonSearchV2Route, mastodonSearchAPIRequest);
  atmosphere.openapi(mastodonSearchUsersV2Route, mastodonSearchUsersAPIRequest);
  atmosphere.openapi(mastodonProfileV2Route, mastodonProfileAPIRequest);
  atmosphere.openapi(mastodonProfileFollowersV2Route, mastodonProfileFollowersAPIRequest);
  atmosphere.openapi(mastodonProfileFollowingV2Route, mastodonProfileFollowingAPIRequest);
  atmosphere.openapi(mastodonProfileMediaV2Route, mastodonProfileMediaAPIRequest);
  atmosphere.openapi(mastodonProfileStatusesV2Route, mastodonProfileStatusesAPIRequest);
};
