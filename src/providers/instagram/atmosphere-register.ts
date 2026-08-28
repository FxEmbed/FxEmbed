import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  instagramConversationAPIRequest,
  instagramProfileAPIRequest,
  instagramProfileStatusesAPIRequest,
  instagramProfileVideosAPIRequest,
  instagramStatusAPIRequest
} from './atmosphere-handlers';
import {
  instagramConversationV2Route,
  instagramProfileStatusesV2Route,
  instagramProfileVideosV2Route,
  instagramProfileV2Route,
  instagramStatusV2Route
} from './atmosphere-routes';

export const registerInstagramAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(instagramStatusV2Route, instagramStatusAPIRequest);
  atmosphere.openapi(instagramProfileV2Route, instagramProfileAPIRequest);
  atmosphere.openapi(instagramProfileStatusesV2Route, instagramProfileStatusesAPIRequest);
  atmosphere.openapi(instagramProfileVideosV2Route, instagramProfileVideosAPIRequest);
  atmosphere.openapi(instagramConversationV2Route, instagramConversationAPIRequest);
};
