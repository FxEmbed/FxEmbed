import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  threadsConversationAPIRequest,
  threadsProfileAPIRequest,
  threadsProfileFollowersAPIRequest,
  threadsProfileFollowingAPIRequest,
  threadsProfileMediaAPIRequest,
  threadsProfileRepliesAPIRequest,
  threadsProfileRepostsAPIRequest,
  threadsProfileStatusesAPIRequest,
  threadsSearchAPIRequest,
  threadsSearchUsersAPIRequest,
  threadsStatusAPIRequest,
  threadsStatusLikesAPIRequest,
  threadsTrendsAPIRequest,
  threadsTypeaheadAPIRequest
} from './atmosphere-handlers';
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

export const registerThreadsAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(threadsStatusV2Route, threadsStatusAPIRequest);
  atmosphere.openapi(threadsStatusLikesV2Route, threadsStatusLikesAPIRequest);
  atmosphere.openapi(threadsProfileV2Route, threadsProfileAPIRequest);
  atmosphere.openapi(threadsProfileStatusesV2Route, threadsProfileStatusesAPIRequest);
  atmosphere.openapi(threadsProfileRepliesV2Route, threadsProfileRepliesAPIRequest);
  atmosphere.openapi(threadsProfileRepostsV2Route, threadsProfileRepostsAPIRequest);
  atmosphere.openapi(threadsProfileMediaV2Route, threadsProfileMediaAPIRequest);
  atmosphere.openapi(threadsProfileFollowersV2Route, threadsProfileFollowersAPIRequest);
  atmosphere.openapi(threadsProfileFollowingV2Route, threadsProfileFollowingAPIRequest);
  atmosphere.openapi(threadsConversationV2Route, threadsConversationAPIRequest);
  atmosphere.openapi(threadsSearchV2Route, threadsSearchAPIRequest);
  atmosphere.openapi(threadsSearchUsersV2Route, threadsSearchUsersAPIRequest);
  atmosphere.openapi(threadsTrendsV2Route, threadsTrendsAPIRequest);
  atmosphere.openapi(threadsTypeaheadV2Route, threadsTypeaheadAPIRequest);
};
