import { Context, Hono } from 'hono';
// import { cache } from "hono/cache";
import { versionRoute } from '../common/version';
import { Strings } from '../../strings';
import { Constants } from '../../constants';
import { genericTwitterRedirect, setRedirectRequest } from './routes/redirects';
import { profileRequest } from './routes/profile';
import { statusRequest } from './routes/status';
import { oembed } from '../api/routes/oembed';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { activityRequest } from './routes/activity';
import { getBranding } from '../../helpers/branding';

export const twitter = new Hono();

export const getBaseRedirectUrl = (c: Context) => {
  const baseRedirect = c.req.header('cookie')?.match(/(?<=base_redirect=)(.*?)(?=;|$)/)?.[0];

  if (baseRedirect) {
    console.log('Found base redirect', baseRedirect);
    try {
      new URL(baseRedirect);
    } catch (_e) {
      return Constants.TWITTER_ROOT;
    }
    return baseRedirect.endsWith('/') ? baseRedirect.slice(0, -1) : baseRedirect;
  }

  return Constants.TWITTER_ROOT;
};

export const faviconRoute = async (c: Context) => {
  const branding = getBranding(c);
  try {
    const response = await fetch(branding.favicon);
    const body = await response.arrayBuffer();
    return c.body(body, response.status as ContentfulStatusCode, {
      'Content-Type': response.headers.get('Content-Type') || 'image/x-icon',
      'Content-Length': response.headers.get('Content-Length') || body.byteLength.toString()
    });
  } catch (_e) {
    return c.redirect(branding.favicon, 302);
  }
};

/* Workaround for some dumb maybe-build time issue where statusRequest isn't ready or something because none of these trigger*/
const twitterStatusRequest = async (c: Context) => await statusRequest(c);
const _profileRequest = async (c: Context) => await profileRequest(c);

twitter.use(trimTrailingSlash());
twitter.get('/api/v1/statuses/:id', activityRequest);
twitter.get('/:endpoint{status(es)?|article}/:id', twitterStatusRequest);
twitter.get('/:endpoint{status(es)?|article}/:id/:language', twitterStatusRequest);
twitter.get('/i/web/:endpoint{status(es)?|article}/:id', twitterStatusRequest);
twitter.get('/i/web/:endpoint{status(es)?|article}/:id/:language', twitterStatusRequest);
twitter.get(
  '/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:language',
  twitterStatusRequest
);
twitter.get('/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id', twitterStatusRequest);
twitter.get(
  '/:prefix{(dir|dl)}/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:language',
  twitterStatusRequest
);
twitter.get(
  '/:prefix{(dir|dl)}/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id',
  twitterStatusRequest
);
twitter.get(
  '/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:mediaType{(photos?|videos?)}/:mediaNumber{[1-4]}',
  twitterStatusRequest
);
twitter.get(
  '/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:mediaType{(photos?|videos?)}/:mediaNumber{[1-4]}/:language',
  twitterStatusRequest
);
twitter.get(
  '/:prefix{(dir|dl)}/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:mediaType{(photos?|videos?)}/:mediaNumber{[1-4]}',
  twitterStatusRequest
);
twitter.get(
  '/:prefix{(dir|dl)}/:handle{[0-9a-zA-Z_]+}/:endpoint{status(es)?|article}/:id/:mediaType{(photos?|videos?)}/:mediaNumber{[1-4]}/:language',
  twitterStatusRequest
);
twitter.get('/:handle/:endpoint{status(es)?|article}/:id/*', twitterStatusRequest);

twitter.get('/version', c => versionRoute(c));
twitter.get('/set_base_redirect', setRedirectRequest);
/* Yes, I actually made the endpoint /owoembed. Deal with it. */
twitter.get('/owoembed', oembed);

twitter.get('/robots.txt', async c => c.text(Strings.ROBOTS_TXT));
twitter.get('/favicon.ico', faviconRoute);

twitter.get('/i/events/:id', genericTwitterRedirect);
twitter.get('/i/trending/:id', genericTwitterRedirect);
twitter.get(
  '/i/broadcasts/:id',
  genericTwitterRedirect
); /* https://github.com/FxEmbed/FxEmbed/issues/730 */
twitter.get('/hashtag/:hashtag', genericTwitterRedirect);

twitter.get('/:handle', _profileRequest);
/* Redirect profile subpages in case someone links them for some reason (https://github.com/FxEmbed/FxEmbed/issues/603) */
twitter.get('/:handle/:subpage', genericTwitterRedirect);

twitter.all('*', async c => c.redirect(getBranding(c).redirect, 302));
