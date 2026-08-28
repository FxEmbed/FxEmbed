import { test, expect } from 'vitest';
import {
  formatSearchQueryTooLongMessage,
  isSearchTimelineClientErrorResponse,
  parseSearchTimelineClientError,
  searchQueryTooLongError,
  searchTimelineClientErrorToApiQueryError,
  TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH
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

const queryTooLongError = {
  errors: [
    {
      message: 'BadRequest: Raw query length 2268 exceeds max allowed 512',
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

test('parseSearchTimelineClientError detects query too long', () => {
  expect(parseSearchTimelineClientError(queryTooLongError)).toBe('query_too_long');
  expect(isSearchTimelineClientErrorResponse(queryTooLongError)).toBe(true);
});

test('parseSearchTimelineClientError ignores unrelated GraphQL errors', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [
        { message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)', path: ['user'] }
      ]
    })
  ).toBeNull();
  expect(parseSearchTimelineClientError({ data: {} })).toBeNull();
});

test('parseSearchTimelineClientError accepts known messages without path', () => {
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)' }]
    })
  ).toBe('empty_query');
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: Query is denylisted in Search Content Control tool.' }]
    })
  ).toBe('blocklisted');
  expect(
    parseSearchTimelineClientError({
      errors: [{ message: 'BadRequest: Raw query length 2268 exceeds max allowed 512' }]
    })
  ).toBe('query_too_long');
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
  expect(searchTimelineClientErrorToApiQueryError('query_too_long')).toEqual({
    code: 400,
    message: `Raw query length exceeds max allowed ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH}`
  });
});

test('searchQueryTooLongError includes the actual query length', () => {
  expect(searchQueryTooLongError(2268)).toEqual({
    code: 400,
    message: formatSearchQueryTooLongMessage(2268)
  });
  expect(formatSearchQueryTooLongMessage(2268)).toBe(
    'Raw query length 2268 exceeds max allowed 512'
  );
});
