import { Hono } from 'hono';
import { statusRequest } from '../twitter/routes/status';
import { profileRequest } from '../twitter/routes/profile';
import { Strings } from '../../strings';
import { Constants } from '../../constants';
import {
  profileAPIRequest,
  searchAPIRequest,
  statusAPIRequest,
  threadAPIRequest
} from './routes/twitter';
import { oembed } from './routes/oembed';
import { linkHitRequest, linkGoRequest } from './hit';
import { trimTrailingSlash } from 'hono/trailing-slash';

export const api = new Hono();

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

api.get('/2/hit', linkHitRequest);
api.get('/2/go', linkGoRequest);

api.get('/2/status/:id', statusAPIRequest);
api.get('/2/thread/:id', threadAPIRequest);
api.get('/2/profile/:handle', profileAPIRequest);
api.get('/2/search', searchAPIRequest);
api.get('/2/owoembed', oembed);

/* Current v1 API endpoints. Currently, these still go through the Twitter embed requests. API v2+ won't do this. */
api.get('/status/:id', statusRequest);
api.get('/status/:id/:language', statusRequest);
api.get('/:handle/status/:id', statusRequest);
api.get('/:handle/status/:id/:language', statusRequest);
api.get('/robots.txt', async c => c.text(Strings.ROBOTS_TXT_API));

api.get('/:handle', profileRequest);

/* TODO: Figure out why / won't resolve but * does */
api.get('*', async c => c.redirect(Constants.API_DOCS_URL, 302));
