import { Context } from 'hono';
import type { APIMastodonStatus, APITwitterStatus } from '../realms/api/schemas';
import i18next from 'i18next';
import { normalizeLanguage } from './language';
import {
  resolveOrcaCredential,
  maskOrcaKey,
  type OrcaCredentialEnv
} from './orcarouter/credential';
import { resolveOrcaOrigins } from './orcarouter/config';
import { orcaChatCompletion, OrcaRequestError } from './orcarouter/provider';
import { isModelStillCompatible, resolveOrcaCatalog, type OrcaModel } from './orcarouter/catalog';
import { Constants } from '../constants';

/**
 * Build the translation prompt. Shared by every provider so the instruction text cannot
 * drift between them.
 */
const buildTranslationMessages = (text: string, sourceLang: string, targetLang: string) => [
  {
    role: 'system' as const,
    content: `You are a translation assistant. You will be given text from a social media post and you will need to translate it to the target language as accurately as possible.
Do not include any other text in your response.
Do not introduce new information not present in the original text.
Hashtags, usernames, and similar content should be kept in the original language.
Maintain the original text's emojis, punctuation, whitespaces, and line breaks.

The source language is ${i18next.t(`language_${sourceLang}`, { lng: 'en' })}.
The target language is ${i18next.t(`language_${targetLang}`, { lng: 'en' })}.`
  },
  { role: 'user' as const, content: `${text}` }
];

/**
 * Cached text-chat catalog for the configured OrcaRouter origin.
 *
 * The catalog is fetched through the same provider code path as inference, and cached so a
 * translation request does not pay for discovery every time. A failed discovery is cached
 * only briefly, so an outage does not pin a degraded list for long.
 */
let catalogCache: { models: OrcaModel[]; source: string; expiresAt: number } | null = null;

async function orcaTextChatModels(
  origins: ReturnType<typeof resolveOrcaOrigins>,
  apiKey: string
): Promise<{ models: OrcaModel[]; source: string }> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache;
  }
  const catalog = await resolveOrcaCatalog({
    origins,
    apiKey,
    capability: 'chat',
    lastKnownGood: catalogCache?.models
  });
  const ttl = catalog.source === 'live' ? Constants.ORCAROUTER_CATALOG_TTL_MS : 30_000;
  catalogCache = { models: catalog.models, source: catalog.source, expiresAt: Date.now() + ttl };
  return catalogCache;
}

/** Test seam: forget the cached catalog so a test can observe discovery again. */
export function resetOrcaCatalogCache(): void {
  catalogCache = null;
}

/**
 * Whether the AI translation path should run at all.
 *
 * The path used to be gated on the Cloudflare Workers AI binding alone. OrcaRouter is an
 * alternative provider for the same entry point, so a deployment that configures only
 * OrcaRouter must still reach it. Existing behaviour is unchanged when neither is set.
 */
export function isAiTranslationEnabled(
  env: ({ AI?: unknown } & OrcaCredentialEnv) | undefined
): boolean {
  return Boolean(env?.AI) || resolveOrcaCredential(env) !== null;
}

/**
 * Translate through OrcaRouter.
 *
 * The model is validated against the live catalog before it is used: a configured model
 * that is no longer compatible is cleared rather than sent, so an attachment or capability
 * change cannot leave a stale selection in place. Discovery failure falls back to the
 * verified seed, which is always labelled as degraded.
 */
const translateTextWithOrcaRouter = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  c: Context
): Promise<CFAITranslation | null> => {
  const credential = resolveOrcaCredential(c.env);
  if (!credential) return null;

  const origins = resolveOrcaOrigins(c.env);

  let models: OrcaModel[];
  let catalogSource: string;
  try {
    const catalog = await orcaTextChatModels(origins, credential.apiKey);
    models = catalog.models;
    catalogSource = catalog.source;
  } catch (error) {
    console.error('OrcaRouter model discovery failed', error);
    return null;
  }

  const configured = c.env.ORCAROUTER_MODEL?.trim();
  if (!configured) {
    console.error(
      `OrcaRouter is configured but ORCAROUTER_MODEL is unset; no translation was attempted. ` +
        `Choose a model with \`npm run orcarouter:models\`.`
    );
    return null;
  }
  if (!isModelStillCompatible(models, configured)) {
    console.error(
      `OrcaRouter model "${configured}" is not in the current ${catalogSource} text-chat catalog; ` +
        `clearing the selection. Pick a compatible model with \`npm run orcarouter:models\`.`
    );
    return null;
  }

  const result = await orcaChatCompletion({
    origins,
    apiKey: credential.apiKey,
    model: configured,
    messages: buildTranslationMessages(text, sourceLang, targetLang)
  });

  console.log(
    `OrcaRouter translation via ${result.model} (credential ${credential.source}, ${maskOrcaKey(
      credential.apiKey
    )}, catalog ${catalogSource})`
  );

  return {
    translated_text: result.text,
    usage: {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens
    }
  };
};

const translateTextLLM = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  c: Context
): Promise<CFAITranslation | null> => {
  const messages = buildTranslationMessages(text, sourceLang, targetLang);
  const response = await c.env.AI.run('@cf/openai/gpt-oss-120b', { messages });
  return {
    translated_text: response.response,
    usage: {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    }
  };
};

/* Handles translating statuses when asked! */
export const translateStatusAI = async (
  status: APITwitterStatus | APIBlueskyStatus | APIMastodonStatus | APIStatus,
  _language: string,
  c: Context
): Promise<CFAITranslation | null> => {
  const language = normalizeLanguage(_language);
  const text = status.text ?? 'Unknown';
  const sourceLang = status.lang ?? 'Unknown';

  /* OrcaRouter is tried first when configured. A 401 is terminal and never retried. */
  if (resolveOrcaCredential(c.env)) {
    try {
      const response = await translateTextWithOrcaRouter(text, sourceLang, language, c);
      if (response) return response;
    } catch (e: unknown) {
      if (e instanceof OrcaRequestError && e.kind === 'needs_reauth') {
        console.error(
          `OrcaRouter credential was rejected (${e.status}); reauthenticate with ` +
            `\`npm run orcarouter:login\` or update ORCAROUTER_API_KEY. Not retrying.`
        );
      } else {
        console.error('OrcaRouter translation failed', e);
      }
    }
  }
  console.log('Using LLM translation');

  try {
    const response = await translateTextLLM(text, sourceLang, language, c);
    return response;
  } catch (e: unknown) {
    console.error('Unknown error while fetching from Translation API', e);
  }

  console.log('Using M2M100-1.2B translation');

  try {
    const response: CFAITranslation = await c.env.AI.run('@cf/meta/m2m100-1.2b', {
      text: status.text,
      source_lang: status.lang,
      target_lang: language
    });

    console.log(`translationResults`, response);
    return response;
  } catch (e: unknown) {
    console.error('Unknown error while fetching from Translation API', e);
    return null;
  }
};
