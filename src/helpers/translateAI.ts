import { Context } from 'hono';
import type { APIMastodonStatus, APITwitterStatus } from '../realms/api/schemas';
import i18next from 'i18next';
import { Constants } from '../constants';
import { normalizeLanguage } from './language';

type TranslationMessage = { role: 'system' | 'user'; content: string };

export type OpenAICompatibleTranslationConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /* Extra fields merged into the request body, e.g. provider-specific reasoning toggles */
  extraBody?: Record<string, unknown>;
};

const buildTranslationMessages = (
  text: string,
  sourceLang: string,
  targetLang: string
): TranslationMessage[] => [
  {
    role: 'system',
    content: `You are a translation assistant. You will be given text from a social media post and you will need to translate it to the target language as accurately as possible.
Do not include any other text in your response.
Do not introduce new information not present in the original text.
Hashtags, usernames, and similar content should be kept in the original language.
Maintain the original text's emojis, punctuation, whitespaces, and line breaks.

The source language is ${i18next.t(`language_${sourceLang}`, { lng: 'en' })}.
The target language is ${i18next.t(`language_${targetLang}`, { lng: 'en' })}.`
  },
  {
    role: 'user',
    content: `${text}`
  }
];

/* Reasoning models served without a reasoning parser (e.g. llama.cpp, vLLM) put their
   chain of thought in the content, sometimes without the opening <think> tag. */
export const stripReasoning = (text: string): string => {
  if (!text.includes('</think>')) {
    return text;
  }
  return text.replace(/^[\s\S]*?<\/think>\s*/, '');
};

const parseExtraBody = (raw: string): Record<string, unknown> | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (e: unknown) {
    console.error('LLM_TRANSLATION_EXTRA_BODY is not valid JSON', e);
    return undefined;
  }
  console.error('LLM_TRANSLATION_EXTRA_BODY must be a JSON object');
  return undefined;
};

const getOpenAICompatibleTranslationConfig = (): OpenAICompatibleTranslationConfig | null => {
  if (!Constants.LLM_TRANSLATION_BASE_URL || !Constants.LLM_TRANSLATION_MODEL) {
    return null;
  }
  return {
    baseUrl: Constants.LLM_TRANSLATION_BASE_URL,
    apiKey: Constants.LLM_TRANSLATION_API_KEY,
    model: Constants.LLM_TRANSLATION_MODEL,
    extraBody: parseExtraBody(Constants.LLM_TRANSLATION_EXTRA_BODY)
  };
};

/* Whether any LLM translation backend (Workers AI binding or OpenAI-compatible endpoint) is usable */
export const isAITranslationAvailable = (c: Context): boolean =>
  Boolean(c.env?.AI) || getOpenAICompatibleTranslationConfig() !== null;

/* Translates text using any OpenAI-compatible chat completions endpoint */
export const translateTextOpenAICompatible = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  config: OpenAICompatibleTranslationConfig
): Promise<CFAITranslation | null> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': Constants.FRIENDLY_USER_AGENT
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...config.extraBody,
      model: config.model,
      messages: buildTranslationMessages(text, sourceLang, targetLang),
      stream: false
    })
  });

  if (!response.ok) {
    console.error(
      'OpenAI-compatible translation failed',
      response.status,
      await response.text().catch(() => '')
    );
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    console.error('OpenAI-compatible translation returned no content', data);
    return null;
  }
  const translatedText = stripReasoning(content);
  if (!translatedText.trim()) {
    return null;
  }

  return {
    translated_text: translatedText,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0
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
  console.log('messages', messages);
  const response = await c.env.AI.run('@cf/openai/gpt-oss-120b', { messages });
  console.log(`translationResults`, response);
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

  const openAIConfig = getOpenAICompatibleTranslationConfig();
  if (openAIConfig) {
    console.log('Using OpenAI-compatible LLM translation');

    try {
      const response = await translateTextOpenAICompatible(
        status.text ?? 'Unknown',
        status.lang ?? 'Unknown',
        language,
        openAIConfig
      );
      if (response) {
        return response;
      }
    } catch (e: unknown) {
      console.error('Unknown error while fetching from OpenAI-compatible Translation API', e);
    }
  }

  if (!c.env?.AI) {
    return null;
  }

  console.log('Using LLM translation');

  try {
    const response = await translateTextLLM(
      status.text ?? 'Unknown',
      status.lang ?? 'Unknown',
      language,
      c
    );
    return response;
  } catch (e: unknown) {
    console.error('Unknown error while fetching from Translation API', e);
  }

  console.log('Using M2M100-1.2B translation');

  try {
    console.log(c.env);
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
