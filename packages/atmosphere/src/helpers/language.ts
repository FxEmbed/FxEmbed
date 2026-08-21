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
  if (typeof language !== 'string') {
    return false;
  }
  const trimmed = language.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return !NON_TRANSLATABLE_LANGUAGE_CODES.has(trimmed.toLowerCase());
};

export const normalizeLanguage = (language: string) => {
  language = language.trim().toLowerCase();
  switch (language) {
    case 'zh':
    case 'cn':
    case 'zh-hans':
      language = 'zh-cn';
      break;
    case 'tw':
    case 'hk':
    case 'zh-hk':
    case 'zh-mo':
    case 'zh-hant':
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

/**
 * Match Grok/X inline translation destination codes to a requested target.
 * X often reports destination_language as bare `zh` for both Simplified and Traditional;
 * mapping that through normalizeLanguage alone would force `zh-cn` and reject `/zh-tw`.
 */
export const translationDestinationMatches = (
  destinationLanguage: string | null | undefined,
  targetLanguage: string
): boolean => {
  if (typeof destinationLanguage !== 'string') {
    return false;
  }
  const dest = destinationLanguage.trim().toLowerCase();
  if (dest.length === 0) {
    return false;
  }
  const target = normalizeLanguage(targetLanguage);
  if (normalizeLanguage(dest) === target) {
    return true;
  }
  // Bare "zh" from Grok: accept for either Chinese script target (client language header selects script).
  if (dest === 'zh' && (target === 'zh-cn' || target === 'zh-tw')) {
    return true;
  }
  return false;
};
