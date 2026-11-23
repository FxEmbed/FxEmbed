import type { BlueskyBuildHost } from '@fxembed/atmosphere/providers/bluesky/build-host';
import type { Context } from 'hono';
import i18next from 'i18next';
import { translateStatus } from '../../helpers/translate';
import { isAiTranslationEnabled, translateStatusAI } from '../../helpers/translateAI';

/** Maps Hono request context into {@link BlueskyBuildHost} for `@fxembed/atmosphere` Bluesky processors. */
export function blueskyBuildHostFromContext(c: Context): BlueskyBuildHost {
  return {
    credentialKey: c.env?.CREDENTIAL_KEY,
    aiEnabled: isAiTranslationEnabled(c.env),
    t: (key, options) => i18next.t(key, options as Record<string, unknown>),
    translatePolyglot: (status, lang) => translateStatus(status as never, lang, c),
    translateAI: (status, lang) => translateStatusAI(status as never, lang, c)
  };
}
