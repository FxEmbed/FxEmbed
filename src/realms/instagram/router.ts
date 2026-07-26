import { Context, Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { getBranding } from '../../helpers/branding';
import { activityRequest } from './routes/activity';
import { instagramPostRequest } from './routes/post';
import { oembed } from './routes/oembed';
import { versionRoute } from '../common/version';
import { constructInstagramPost } from '@fxembed/atmosphere/providers/instagram/post';
import {
  instagramShortcodeToPk,
  normalizeInstagramPostId
} from '@fxembed/atmosphere/providers/instagram/shortcode';

export const instagram = new Hono();
instagram.use(trimTrailingSlash());

instagram.get('/owoembed', oembed);
instagram.get('/api/v1/statuses/:snowcode', activityRequest);

const instagramJsonPostRequest = async (c: Context) => {
  const { id } = c.req.param();
  if (!id) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  let shortcode: string;
  try {
    shortcode = normalizeInstagramPostId(id);
    if (!shortcode) {
      throw new Error('empty shortcode');
    }
    instagramShortcodeToPk(shortcode);
  } catch {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const thread = await constructInstagramPost(shortcode, c.req.header('User-Agent'));
  return c.json(thread);
};

instagram.get('/raw/:id', instagramJsonPostRequest);
instagram.get('/api/:id', instagramJsonPostRequest);

// Instagram permalinks: /p/SHORTCODE and /reel/SHORTCODE (same media object)
instagram.get('/p/:id', instagramPostRequest);
instagram.get('/p/:id/', instagramPostRequest);
instagram.get('/reel/:id', instagramPostRequest);
instagram.get('/reel/:id/', instagramPostRequest);

instagram.get('/version', c => versionRoute(c));

instagram.all('*', async c => c.redirect(getBranding(c).redirect, 302));
