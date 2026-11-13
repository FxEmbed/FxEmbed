import { Context } from 'hono';
import { Constants } from '../../../constants';
import { handleProfile } from '../../../user';
import { getBaseRedirectUrl, isHorizonEmbedParam } from '../router';
import { Experiment, experimentCheck } from '../../../experiments';
import { getBranding } from '../../../helpers/branding';
import { InputFlags } from '../../../types/types';

/* Handler for User Profiles */
export const profileRequest = async (c: Context) => {
  const handle = c.req.param('handle');
  const url = new URL(c.req.url);
  const userAgent = c.req.header('User-Agent') || '';
  const flags: InputFlags = {};

  /* User Agent matching for embed generators, bots, crawlers, and other automated
     tools. It's pretty all-encompassing. Note that Firefox/92 is in here because 
     Discord sometimes uses the following UA:
     
     Mozilla/5.0 (Macintosh; Intel Mac OS X 11.6; rv:92.0) Gecko/20100101 Firefox/92.0
     
     I'm not sure why that specific one, it's pretty weird, but this edge case ensures
     stuff keeps working.
     
     On the very rare off chance someone happens to be using specifically Firefox 92,
     the http-equiv="refresh" meta tag will ensure an actual human is sent to the destination. */
  const isBotUA = userAgent.match(Constants.BOT_UA_REGEX) !== null;

  if (!handle) {
    return c.redirect(getBranding(c).redirect, 302);
  }

  /* If not a valid screen name, we redirect to project GitHub */
  if (handle.match(/\w{1,15}/gi)?.[0] !== handle) {
    return c.redirect(getBranding(c).redirect, 302);
  }
  const username = handle.match(/\w{1,15}/gi)?.[0] as string;
  /* Check if request is to api.fxtwitter.com */
  if (Constants.API_HOST_LIST.includes(url.hostname)) {
    console.log('JSON API request');
    flags.api = true;
  }

  if (isHorizonEmbedParam(url)) {
    flags.horizon = true;
  }

  const baseUrl = getBaseRedirectUrl(c);
  const horizonProfileUrl = `${Constants.HORIZON_WEB_ROOT}/${username}`;

  /* Do not cache if using a custom redirect */
  const cacheControl =
    baseUrl !== Constants.TWITTER_ROOT || flags.horizon ? 'max-age=0' : undefined;

  if (cacheControl) {
    c.header('cache-control', cacheControl);
  }
  /* Direct media or API access bypasses bot check, returning same response regardless of UA */
  if (isBotUA || flags.api) {
    if (isBotUA) {
      console.log(`Matched bot UA ${userAgent}`);
    } else {
      console.log('Bypass bot check');
    }

    const profileResponse = await handleProfile(c, username, flags);

    /* Return the response containing embed information */
    return profileResponse;
  } else {
    /* A human has clicked a fxtwitter.com/:screen_name link!
        Obviously we just need to redirect to the user directly.*/
    console.log('Matched human UA', userAgent);

    let newUrl = `${baseUrl}/${handle}`;
    if (baseUrl.startsWith('twitter:/')) {
      newUrl = `twitter://user?screen_name=${handle}`;
    }

    /* Check for custom redirect */
    if (flags.horizon) {
      return c.redirect(horizonProfileUrl, 302);
    }
    if (experimentCheck(Experiment.USE_HORIZON_WEB, baseUrl === Constants.TWITTER_ROOT)) {
      const app = await fetch(`https://app.fxtwitter.com/${handle}`);
      const appBody = await app.text();
      if (appBody.includes('<!doctype html>')) {
        return c.html(appBody, 200);
      } else {
        return c.redirect(newUrl, 302);
      }
    } else {
      return c.redirect(newUrl, 302);
    }
  }
};
