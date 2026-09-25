import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { blueskyStatusRequest } from './routes/status';
import { oembed } from './routes/oembed';
import { versionRoute } from '../common/version';
import { genericBlueskyRedirect } from './routes/redirects';
import { activityRequest } from './routes/activity';
import { getBranding } from '../../helpers/branding';
import {
  profileFeedAtomBluesky,
  profileFeedRssBluesky,
  profileMediaFeedAtomBluesky,
  profileMediaFeedRssBluesky
} from './routes/feed';

export const bluesky = new Hono();

bluesky.use(trimTrailingSlash());
bluesky.get('/owoembed', oembed);
bluesky.get('/api/v1/statuses/:snowcode', activityRequest);
bluesky.get('/:prefix/:handle/post/:id', blueskyStatusRequest);
bluesky.get('/:prefix/:handle/post/:id/photo/:mediaNumber{[1-9][0-9]*}', blueskyStatusRequest);
bluesky.get(
  '/:prefix/:handle/post/:id/photo/:mediaNumber{[1-9][0-9]*}/:language',
  blueskyStatusRequest
);
bluesky.get('/profile/:handle/post/:id', blueskyStatusRequest);
bluesky.get('/profile/:handle/post/:id/photo/:mediaNumber{[1-9][0-9]*}', blueskyStatusRequest);
bluesky.get(
  '/profile/:handle/post/:id/photo/:mediaNumber{[1-9][0-9]*}/:language',
  blueskyStatusRequest
);
bluesky.get('/:prefix/profile/:handle/post/:id/:language', blueskyStatusRequest);
bluesky.get('/profile/:handle/post/:id/:language', blueskyStatusRequest);
bluesky.get('/profile/:handle/feed.xml', profileFeedRssBluesky);
bluesky.get('/profile/:handle/feed.atom.xml', profileFeedAtomBluesky);
bluesky.get('/profile/:handle/media.xml', profileMediaFeedRssBluesky);
bluesky.get('/profile/:handle/media.atom.xml', profileMediaFeedAtomBluesky);
bluesky.get('/profile/*', genericBlueskyRedirect);
bluesky.get('/version', c => versionRoute(c));

bluesky.all('*', async c => c.redirect(getBranding(c).redirect, 302));
