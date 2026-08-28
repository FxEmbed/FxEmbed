import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  threadsConversationAPIRequest,
  threadsProfileAPIRequest,
  threadsProfileStatusesAPIRequest,
  threadsStatusAPIRequest
} from './atmosphere-handlers';
import {
  threadsConversationV2Route,
  threadsProfileStatusesV2Route,
  threadsProfileV2Route,
  threadsStatusV2Route
} from './atmosphere-routes';

export const registerThreadsAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(threadsStatusV2Route, threadsStatusAPIRequest);
  atmosphere.openapi(threadsProfileV2Route, threadsProfileAPIRequest);
  atmosphere.openapi(threadsProfileStatusesV2Route, threadsProfileStatusesAPIRequest);
  atmosphere.openapi(threadsConversationV2Route, threadsConversationAPIRequest);
};
