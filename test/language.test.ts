import { expect, test } from 'vitest';
import {
  isTranslatableLanguageCode,
  NON_TRANSLATABLE_LANGUAGE_CODES
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
