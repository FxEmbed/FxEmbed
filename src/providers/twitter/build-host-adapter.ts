import type { TwitterBuildHost } from '@fxembed/atmosphere/providers/twitter/build-host';
import { isParamTruthy } from '@fxembed/atmosphere/helpers';
import type { Context } from 'hono';
import i18next from 'i18next';
import { experimentCheck, Experiment } from '../../experiments';
import { shouldTranscodeGif } from '../../helpers/giftranscode';
import { withLocalizedTombstoneMessage } from '../../helpers/tombstone';
import { translateStatus } from '../../helpers/translate';
import { isAiTranslationEnabled, translateStatusAI } from '../../helpers/translateAI';

/** Maps Hono request context into {@link TwitterBuildHost} for `@fxembed/atmosphere` Twitter processors. */
export function twitterBuildHostFromContext(c: Context): TwitterBuildHost {
  return {
    credentialKey: c.env?.CREDENTIAL_KEY,
    aiEnabled: isAiTranslationEnabled(c.env),
    twitterProxy: c.env?.TwitterProxy,
    analyticsEngine: c.env?.AnalyticsEngine,
    exceptionWebhookUrl: c.env?.EXCEPTION_DISCORD_WEBHOOK,
    waitUntil: p => c.executionCtx?.waitUntil(p),
    request: {
      url: c.req.url,
      cf: c.req.raw?.cf,
      userAgent: c.req.header('User-Agent') ?? undefined
    },
    t: (key, options) => i18next.t(key, options as Record<string, unknown>),
    translatePolyglot: (status, lang) => translateStatus(status as never, lang, c),
    translateAI: (status, lang) => translateStatusAI(status as never, lang, c),
    shouldTranscodeGif: () => shouldTranscodeGif(c),
    useWebpInsteadOfGifForKitchensink: () => {
      return (
        experimentCheck(Experiment.KITCHENSINK_GIF) &&
        (c.req.header('user-agent')?.includes('Discordbot') ?? false) &&
        !isParamTruthy(new URL(c.req.url).searchParams.get('gif') ?? undefined)
      );
    },
    broadcastStreamApi: experimentCheck(Experiment.BROADCAST_STREAM_API),
    tweetDetailApi: experimentCheck(Experiment.TWEET_DETAIL_API),
    withLocalizedTombstone: (t, language) => withLocalizedTombstoneMessage(t, language)
  };
}
