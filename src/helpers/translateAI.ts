import { Context } from 'hono';
import type { APIMastodonStatus, APITwitterStatus } from '../realms/api/schemas';
import i18next from 'i18next';
import { normalizeLanguage } from './language';

type WorkersAITranslationResponse = {
  choices?: { message?: { content?: string | null } }[];
  response?: string;
  usage: CFAITranslation['usage'];
};

const translateTextLLM = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  c: Context
): Promise<CFAITranslation | null> => {
  const messages = [
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
  console.log('messages', messages);
  const response: WorkersAITranslationResponse = await c.env.AI.run('@cf/openai/gpt-oss-120b', {
    messages
  });
  console.log(`translationResults`, response);
  const translatedText = response.choices?.[0]?.message?.content ?? response.response;
  if (typeof translatedText !== 'string' || !translatedText.trim()) {
    return null;
  }

  return {
    translated_text: translatedText,
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

  console.log('Using LLM translation');

  try {
    const response = await translateTextLLM(
      status.text ?? 'Unknown',
      status.lang ?? 'Unknown',
      language,
      c
    );
    if (response) return response;
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
