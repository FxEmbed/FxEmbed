import { test, expect } from 'vitest';
import {
  classifyAPIErrors,
  isSearchTimelineClientErrorResponse
} from '@fxembed/atmosphere/providers/twitter/proxy/errors';

// Fixture: empty query error as returned by X GraphQL
const emptyQueryErrorJson = {
  errors: [
    {
      message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)',
      locations: [{ line: 3, column: 5 }],
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      extensions: { name: 'BadRequestError', source: 'Client', code: 214 },
      code: 214,
      kind: 'Validation',
      name: 'BadRequestError',
      source: 'Client'
    }
  ],
  data: {}
};

// Fixture: blocklisted query error as returned by X GraphQL
const blocklistedErrorJson = {
  errors: [
    {
      message: 'BadRequest: Query is denylisted in Search Content Control tool.',
      locations: [{ line: 3, column: 5 }],
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      extensions: { name: 'BadRequestError', source: 'Client', code: 214 },
      code: 214,
      kind: 'Validation',
      name: 'BadRequestError',
      source: 'Client'
    }
  ],
  data: {}
};

// Fixture: empty query error with no data field (no tweet payload)
const emptyQueryErrorNoData = {
  errors: [
    {
      message: 'BadRequest: SearchQueryParsingException(ERROR_EMPTY_QUERY)',
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      code: 214
    }
  ]
};

// Fixture: blocklisted error with no data field
const blocklistedErrorNoData = {
  errors: [
    {
      message: 'BadRequest: Query is denylisted in Search Content Control tool.',
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      code: 214
    }
  ]
};

test('classifyAPIErrors ignores SearchTimeline empty_query error', () => {
  const result = classifyAPIErrors(emptyQueryErrorJson, JSON.stringify(emptyQueryErrorJson), 200);
  expect(result.action).toBe('ignore');
});

test('classifyAPIErrors ignores SearchTimeline blocklisted error', () => {
  const result = classifyAPIErrors(blocklistedErrorJson, JSON.stringify(blocklistedErrorJson), 200);
  expect(result.action).toBe('ignore');
});

test('classifyAPIErrors ignores empty_query even without a tweet payload', () => {
  // Unlike most ignore rules, these new rules do NOT use ignoreOnlyWithPayload
  const result = classifyAPIErrors(
    emptyQueryErrorNoData,
    JSON.stringify(emptyQueryErrorNoData),
    200
  );
  expect(result.action).toBe('ignore');
});

test('classifyAPIErrors ignores blocklisted even without a tweet payload', () => {
  // Unlike most ignore rules, these new rules do NOT use ignoreOnlyWithPayload
  const result = classifyAPIErrors(
    blocklistedErrorNoData,
    JSON.stringify(blocklistedErrorNoData),
    200
  );
  expect(result.action).toBe('ignore');
});

test('classifyAPIErrors retries on unknown SearchTimeline error not matching known patterns', () => {
  const unknownSearchError = {
    errors: [
      {
        message: 'BadRequest: SomeUnknownSearchError',
        path: ['search_by_raw_query', 'search_timeline'],
        code: 214
      }
    ]
  };
  const result = classifyAPIErrors(
    unknownSearchError,
    JSON.stringify(unknownSearchError),
    200
  );
  // Falls through all rules → retry
  expect(result.action).toBe('retry');
});

test('classifyAPIErrors ignores when no errors property present', () => {
  // Early-return path: no errors and no NsfwViewerIsUnderage
  const noErrors = { data: { search_by_raw_query: { search_timeline: { timeline: {} } } } };
  const result = classifyAPIErrors(noErrors, JSON.stringify(noErrors), 200);
  expect(result.action).toBe('ignore');
});

test('isSearchTimelineClientErrorResponse is re-exported from proxy/errors', () => {
  expect(isSearchTimelineClientErrorResponse(emptyQueryErrorJson)).toBe(true);
  expect(isSearchTimelineClientErrorResponse(blocklistedErrorJson)).toBe(true);
  expect(isSearchTimelineClientErrorResponse({ data: {} })).toBe(false);
  expect(isSearchTimelineClientErrorResponse(null)).toBe(false);
});