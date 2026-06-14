/** GraphQL `x-twitter-client-language` for inline Grok translations when a target lang is requested. */
export const buildLanguageHeaders = (
  language: string | undefined
): Record<string, string> | undefined => {
  if (typeof language !== 'string') {
    return undefined;
  }
  const cleaned = language.trim().toLowerCase();
  if (cleaned.length === 0) {
    return undefined;
  }
  return { 'x-twitter-client-language': normalizeLanguage(cleaned) };
};

/**
 * ISO / X pseudo language codes that do not represent a real source language.
 * @see https://devcommunity.x.com/t/unkown-language-code-qht-returned-by-api/172819/3
 */
export const NON_TRANSLATABLE_LANGUAGE_CODES = new Set([
  'unk',
  'und',
  'zxx',
  'qam', // mentions only
  'qct', // cashtags only
  'qht', // hashtags only
  'qme', // media links
  'qst' // very short text
]);

export const isTranslatableLanguageCode = (language: string | null | undefined): boolean => {
  if (typeof language !== 'string' || language.length === 0) {
    return false;
  }
  return !NON_TRANSLATABLE_LANGUAGE_CODES.has(language.toLowerCase());
};

export const normalizeLanguage = (language: string) => {
  switch (language) {
    case 'zh':
    case 'cn':
      language = 'zh-cn';
      break;
    case 'tw':
      language = 'zh-tw';
      break;
    case 'jp':
      language = 'ja';
      break;
    case 'kr':
      language = 'ko';
      break;
    case 'ua':
      language = 'uk';
      break;
    default:
      break;
  }
  return language;
};
