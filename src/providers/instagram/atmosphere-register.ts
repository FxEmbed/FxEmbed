import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  instagramConversationAPIRequest,
  instagramProfileAPIRequest,
  instagramProfileFollowersAPIRequest,
  instagramProfileFollowingAPIRequest,
  instagramProfileStatusesAPIRequest,
  instagramProfileStoriesAPIRequest,
  instagramProfileTaggedAPIRequest,
  instagramProfileVideosAPIRequest,
  instagramSearchUsersAPIRequest,
  instagramStatusAPIRequest,
  instagramStatusLikesAPIRequest,
  instagramTypeaheadAPIRequest
} from './atmosphere-handlers';
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

export const registerInstagramAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(instagramStatusV2Route, instagramStatusAPIRequest);
  atmosphere.openapi(instagramProfileV2Route, instagramProfileAPIRequest);
  atmosphere.openapi(instagramProfileStatusesV2Route, instagramProfileStatusesAPIRequest);
  atmosphere.openapi(instagramProfileVideosV2Route, instagramProfileVideosAPIRequest);
  atmosphere.openapi(instagramConversationV2Route, instagramConversationAPIRequest);
  atmosphere.openapi(instagramStatusLikesV2Route, instagramStatusLikesAPIRequest);
  atmosphere.openapi(instagramProfileFollowersV2Route, instagramProfileFollowersAPIRequest);
  atmosphere.openapi(instagramProfileFollowingV2Route, instagramProfileFollowingAPIRequest);
  atmosphere.openapi(instagramProfileTaggedV2Route, instagramProfileTaggedAPIRequest);
  atmosphere.openapi(instagramProfileStoriesV2Route, instagramProfileStoriesAPIRequest);
  atmosphere.openapi(instagramSearchUsersV2Route, instagramSearchUsersAPIRequest);
  atmosphere.openapi(instagramTypeaheadV2Route, instagramTypeaheadAPIRequest);
};
