import { Context } from 'hono';
import { Constants } from '../../../constants';
import { getBaseRedirectUrl } from '../router';
import { DataProvider } from '../../../embed/status';
import { Strings } from '../../../strings';
import { handleActivity } from '../../../embed/activity';

/* Handler for activity request */
export const activityRequest = async (c: Context) => {
  const { id } = c.req.param();
  const baseUrl = getBaseRedirectUrl(c);

  /* This throws the necessary data to handleActivity (in activity.ts) */
  const statusResponse = await handleActivity(c, id ?? '0', DataProvider.Twitter);
  /* Do not cache if using a custom redirect */
  const cacheControl = baseUrl !== Constants.TWITTER_ROOT ? 'max-age=0' : undefined;

  if (cacheControl) {
    c.header('cache-control', cacheControl);
  }

  if (statusResponse) {
    c.status(200);
    /* Return the response containing embed information */
    return statusResponse;
  } else {
    /* Somehow handleStatus sent us nothing. This should *never* happen, but we have a case for it. */
    return c.text(Strings.ERROR_UNKNOWN, 500);
  }
};
