import { test, expect } from 'vitest';
import {
  isSearchTimelineClientErrorResponse,
  parseSearchTimelineClientError,
  searchTimelineClientErrorToApiQueryError
} from '@fxembed/atmosphere/providers/twitter/searchErrors';

const emptyQueryError = {
  errors: [
    {
      message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)',
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      code: 214
    }
  ],
  data: {}
};

const blocklistedError = {
  errors: [
    {
      message: 'BadRequest: Query is denylisted in Search Content Control tool.',
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      code: 214
    }
  ],
  data: {}
};

test('parseSearchTimelineClientError detects empty query', () => {
  expect(parseSearchTimelineClientError(emptyQueryError)).toBe('empty_query');
  expect(isSearchTimelineClientErrorResponse(emptyQueryError)).toBe(true);
});

test('parseSearchTimelineClientError detects blocklisted query', () => {
  expect(parseSearchTimelineClientError(blocklistedError)).toBe('blocklisted');
});

test('parseSearchTimelineClientError ignores unrelated GraphQL errors', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)', path: ['user'] }]
    })
  ).toBeNull();
  expect(parseSearchTimelineClientError({ data: {} })).toBeNull();
});

test('searchTimelineClientErrorToApiQueryError maps to API 400 messages', () => {
  expect(searchTimelineClientErrorToApiQueryError('empty_query')).toEqual({
    code: 400,
    message: 'Search query is empty or could not be parsed by X'
  });
  expect(searchTimelineClientErrorToApiQueryError('blocklisted')).toEqual({
    code: 400,
    message: 'Search query is blocked by X content controls'
  });
});

test('parseSearchTimelineClientError returns null for null input', () => {
  expect(parseSearchTimelineClientError(null)).toBeNull();
  expect(isSearchTimelineClientErrorResponse(null)).toBe(false);
});

test('parseSearchTimelineClientError returns null for undefined input', () => {
  expect(parseSearchTimelineClientError(undefined)).toBeNull();
  expect(isSearchTimelineClientErrorResponse(undefined)).toBe(false);
});

test('parseSearchTimelineClientError returns null for primitive inputs', () => {
  expect(parseSearchTimelineClientError(42)).toBeNull();
  expect(parseSearchTimelineClientError('error string')).toBeNull();
  expect(parseSearchTimelineClientError(true)).toBeNull();
});

test('parseSearchTimelineClientError returns null for empty object', () => {
  expect(parseSearchTimelineClientError({})).toBeNull();
  expect(isSearchTimelineClientErrorResponse({})).toBe(false);
});

test('parseSearchTimelineClientError returns null for empty errors array', () => {
  expect(parseSearchTimelineClientError({ errors: [] })).toBeNull();
});

test('parseSearchTimelineClientError returns null when errors[0] is null', () => {
  expect(parseSearchTimelineClientError({ errors: [null] })).toBeNull();
});

test('parseSearchTimelineClientError returns null when errors[0] has no message field', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [{ code: 214, path: ['search_by_raw_query', 'search_timeline'] }]
    })
  ).toBeNull();
});

test('parseSearchTimelineClientError returns null when message is not a string', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 214, path: ['search_by_raw_query', 'search_timeline'] }]
    })
  ).toBeNull();
});

test('parseSearchTimelineClientError matches when path is missing (undefined)', () => {
  // isSearchTimelineErrorPath returns true for non-array path values
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)' }]
    })
  ).toBe('empty_query');
});

test('parseSearchTimelineClientError matches when path is an empty array', () => {
  // isSearchTimelineErrorPath returns true when path.length === 0
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)', path: [] }]
    })
  ).toBe('empty_query');
});

test('parseSearchTimelineClientError matches when path contains only search_timeline', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [
        {
          message: 'BadRequest: Query is denylisted in Search Content Control tool.',
          path: ['search_timeline']
        }
      ]
    })
  ).toBe('blocklisted');
});

test('parseSearchTimelineClientError only inspects first error entry', () => {
  // First error has wrong path, second has matching message – should return null
  expect(
    parseSearchTimelineClientError({
      errors: [
        { message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)', path: ['user'] },
        {
          message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)',
          path: ['search_by_raw_query']
        }
      ]
    })
  ).toBeNull();
});

test('isSearchTimelineClientErrorResponse returns true for blocklisted error', () => {
  expect(isSearchTimelineClientErrorResponse(blocklistedError)).toBe(true);
});

test('parseSearchTimelineClientError returns null for unrecognised message on valid path', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [
        {
          message: 'BadRequest: SomeOtherError',
          path: ['search_by_raw_query', 'search_timeline']
        }
      ]
    })
  ).toBeNull();
  expect(
    isSearchTimelineClientErrorResponse({
      errors: [
        {
          message: 'BadRequest: SomeOtherError',
          path: ['search_by_raw_query', 'search_timeline']
        }
      ]
    })
  ).toBe(false);
});
