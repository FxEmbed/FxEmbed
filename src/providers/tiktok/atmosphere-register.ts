import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  tiktokHashtagAPIRequest,
  tiktokMusicAPIRequest,
  tiktokProfileAPIRequest,
  tiktokProfileStatusesAPIRequest,
  tiktokStatusAPIRequest
} from './atmosphere-handlers';
import {
  tiktokHashtagV2Route,
  tiktokMusicV2Route,
  tiktokProfileStatusesV2Route,
  tiktokProfileV2Route,
  tiktokStatusV2Route
} from './atmosphere-routes';

export const registerTikTokAtmosphereRoutes = (atmosphere: OpenAPIHono) => {
  atmosphere.openapi(tiktokStatusV2Route, tiktokStatusAPIRequest);
  atmosphere.openapi(tiktokProfileV2Route, tiktokProfileAPIRequest);
  atmosphere.openapi(tiktokProfileStatusesV2Route, tiktokProfileStatusesAPIRequest);
  atmosphere.openapi(tiktokHashtagV2Route, tiktokHashtagAPIRequest);
  atmosphere.openapi(tiktokMusicV2Route, tiktokMusicAPIRequest);
};
