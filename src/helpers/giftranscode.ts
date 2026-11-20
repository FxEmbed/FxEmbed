import { Context } from 'hono';
import { Constants } from '../constants';
import { experimentCheck, Experiment } from '../experiments';
import { getGIFTranscodeDomain as getGIFTranscodeDomainCore } from '@fxembed/atmosphere/helpers';

export const getGIFTranscodeDomain = (twitterId: string): string | null =>
  getGIFTranscodeDomainCore(twitterId, Constants.GIF_TRANSCODE_DOMAIN_LIST);

export const shouldTranscodeGif = (c: Context) => {
  const userAgent = c.req.header('user-agent') ?? '';
  const hostname = new URL(c.req.url).hostname;
  return (
    experimentCheck(Experiment.TRANSCODE_GIFS, !!Constants.GIF_TRANSCODE_DOMAIN_LIST) &&
    !userAgent.includes('TelegramBot') &&
    !Constants.OLD_EMBED_DOMAINS.includes(hostname) &&
    (!Constants.API_HOST_LIST.includes(hostname) || userAgent.includes('Fluxerbot')) &&
    !Constants.BLUESKY_API_HOST_LIST.includes(hostname)
  );
};
