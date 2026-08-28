import { expect, test } from 'vitest';
import {
  isTranslatableLanguageCode,
  NON_TRANSLATABLE_LANGUAGE_CODES,
  normalizeLanguage,
  translationDestinationMatches
} from '@fxembed/atmosphere/helpers';

test('NON_TRANSLATABLE_LANGUAGE_CODES includes X pseudo language codes', () => {
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('qht')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('qam')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('qct')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('qme')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('qst')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('zxx')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('unk')).toBe(true);
  expect(NON_TRANSLATABLE_LANGUAGE_CODES.has('und')).toBe(true);
});

test('isTranslatableLanguageCode accepts real language codes', () => {
  expect(isTranslatableLanguageCode('en')).toBe(true);
  expect(isTranslatableLanguageCode('ja')).toBe(true);
  expect(isTranslatableLanguageCode('zh-cn')).toBe(true);
});

test('isTranslatableLanguageCode rejects pseudo and unknown language codes', () => {
  for (const code of NON_TRANSLATABLE_LANGUAGE_CODES) {
    expect(isTranslatableLanguageCode(code)).toBe(false);
    expect(isTranslatableLanguageCode(code.toUpperCase())).toBe(false);
  }

  expect(isTranslatableLanguageCode('')).toBe(false);
  expect(isTranslatableLanguageCode(null)).toBe(false);
  expect(isTranslatableLanguageCode(undefined)).toBe(false);
});

test('normalizeLanguage maps Traditional Chinese aliases to zh-tw', () => {
  expect(normalizeLanguage('zh-tw')).toBe('zh-tw');
  expect(normalizeLanguage('zh-TW')).toBe('zh-tw');
  expect(normalizeLanguage('tw')).toBe('zh-tw');
  expect(normalizeLanguage('zh-hk')).toBe('zh-tw');
  expect(normalizeLanguage('hk')).toBe('zh-tw');
  expect(normalizeLanguage('zh-hant')).toBe('zh-tw');
  expect(normalizeLanguage('zh')).toBe('zh-cn');
  expect(normalizeLanguage('zh-cn')).toBe('zh-cn');
  expect(normalizeLanguage('zh-hans')).toBe('zh-cn');
});

test('translationDestinationMatches accepts bare zh for Chinese targets', () => {
  expect(translationDestinationMatches('zh', 'zh-tw')).toBe(true);
  expect(translationDestinationMatches('zh', 'zh-cn')).toBe(true);
  expect(translationDestinationMatches('zh-tw', 'zh-tw')).toBe(true);
  expect(translationDestinationMatches('zh-TW', 'zh-hk')).toBe(true);
  expect(translationDestinationMatches('zh-cn', 'zh-tw')).toBe(false);
  expect(translationDestinationMatches('en', 'zh-tw')).toBe(false);
  expect(translationDestinationMatches(null, 'zh-tw')).toBe(false);
});
