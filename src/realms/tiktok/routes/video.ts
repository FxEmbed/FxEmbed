import { Context } from 'hono';
import { handleStatus } from '../../../embed/status';
import { DataProvider } from '../../../enum';
import { Constants } from '../../../constants';
import { Experiment, experimentCheck } from '../../../experiments';
import { Strings } from '../../../strings';
import { InputFlags } from '../../../types/types';
import { resolveShortUrl, isShortCode } from '../../../providers/tiktok/conversation';

export const tiktokVideoRequest = async (c: Context) => {
  console.log('tiktok video request!!!');
  let { id } = c.req.param();

  // Check if this is a shorthand URL (e.g., /t/ZP8yxgATu)
  // Shorthand codes are alphanumeric, while video IDs are purely numeric
  if (isShortCode(id)) {
    console.log('Detected shorthand code:', id);
    const resolved = await resolveShortUrl(id);
    if (!resolved) {
      console.error('Failed to resolve shorthand URL:', id);
      return c.text(Strings.ERROR_UNKNOWN, 404);
    }
    id = resolved.videoId;
    console.log('Resolved to video ID:', id);
  }

  const userAgent = c.req.header('User-Agent') || '';
  const url = new URL(c.req.url);
  const flags: InputFlags = {};

  /* User Agent matching for embed generators, bots, crawlers, and other automated
     tools. It's pretty all-encompassing. Note that Firefox/92 is in here because 
     Discord sometimes uses the following UA:
     
     Mozilla/5.0 (Macintosh; Intel Mac OS X 11.6; rv:92.0) Gecko/20100101 Firefox/92.0
     
     I'm not sure why that specific one, it's pretty weird, but this edge case ensures
     stuff keeps working.
     
     On the very rare off chance someone happens to be using specifically Firefox 92,
     the http-equiv="refresh" meta tag will ensure an actual human is sent to the destination. */
  const isBotUA = userAgent.match(Constants.BOT_UA_REGEX) !== null || flags?.archive;

  if (url.pathname.match(/\/post\/\w+\.(mp4|png|jpe?g|gifv?)/g)) {
    console.log('Direct media request by extension');
    flags.direct = true;
  } else if (Constants.DIRECT_MEDIA_DOMAINS.includes(url.hostname)) {
    console.log('Direct media request by domain');
    flags.direct = true;
  } else if (Constants.INSTANT_VIEW_DOMAINS.includes(url.hostname)) {
    console.log('Forced instant view request');
    flags.forceInstantView = true;
  } else if (experimentCheck(Experiment.IV_FORCE_THREAD_UNROLL, userAgent.includes('Telegram'))) {
    console.log('Forced unroll instant view');
    flags.instantViewUnrollThreads = true;
  } else if (Constants.GALLERY_DOMAINS.includes(url.hostname)) {
    console.log('Gallery embed request');
    flags.gallery = true;
  } else if (Constants.OLD_EMBED_DOMAINS.includes(url.hostname)) {
    console.log('Disable activity embed');
    flags.noActivity = true;
  }

  if (isBotUA || flags.direct || flags.api) {
    if (isBotUA) {
      console.log(`Matched bot UA ${userAgent}`);
    } else {
      console.log(`Bypass bot check (Presented user-agent ${userAgent})`);
    }
    const statusResponse = await handleStatus(
      c,
      id,
      null,
      undefined, //mediaNumber ? parseInt(mediaNumber) : undefined,
      userAgent,
      flags,
      undefined,
      DataProvider.TikTok
    );

    if (statusResponse) {
      /* We're checking if the User Agent is a bot again specifically in case they requested
        direct media (d.fxbsky.app, .mp4/.jpg, etc) but the status contains no media.

        Since we obviously have no media to give the user, we'll just redirect to the status.
        Embeds will return as usual to bots as if direct media was never specified. */
      if (!isBotUA && !flags.api && !flags.direct) {
        const url = `${Constants.TIKTOK_ROOT}/@demo/video/${id}`;
        return c.redirect(url, 302);
      }

      c.status(200);
      /* Return the response containing embed information */
      return statusResponse;
    } else {
      /* Somehow handleStatus sent us nothing. This should *never* happen, but we have a case for it. */
      return c.text(Strings.ERROR_UNKNOWN, 500);
    }
  } else {
    /* A human has clicked a fxbsky.app/profil/:screen_name/post/:id link!
      Obviously we just need to redirect to the status directly.*/
    console.log('Matched human UA', userAgent);

    return c.redirect(`${Constants.TIKTOK_ROOT}/@demo/video/${id}`, 302);
  }
};
