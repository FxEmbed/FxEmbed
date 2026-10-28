import { test, expect } from 'vitest';
import { classifyAPIErrors } from '@fxembed/atmosphere/providers/twitter/proxy/errors';

const deadlineExceededWithUserPayload = {
  data: {
    user_results: {
      result: {
        __typename: 'User',
        core: { screen_name: 'example' }
      }
    }
  },
  errors: [
    {
      extensions: { kind: 'ServiceLevel', name: 'DeadlineExceeded', source: 'Server' },
      kind: 'ServiceLevel',
      message: 'DeadlineExceeded: Unspecified',
      name: 'DeadlineExceeded',
      path: ['user_results', 'result', 'super_followed_by'],
      source: 'Server'
    }
  ]
};

const unknownCursorError = {
  errors: [
    {
      code: 214,
      kind: 'Validation',
      message: "BadRequest: Unknown request cursor {'top': None, 'bottom': None}",
      name: 'BadRequestError',
      path: ['search_by_raw_query', 'search_timeline', 'timeline'],
      source: 'Client'
    }
  ]
};

const deadlineExceededWithoutPayload = {
  errors: [
    {
      kind: 'ServiceLevel',
      message: 'DeadlineExceeded: Unspecified',
      name: 'DeadlineExceeded',
      path: ['user_results', 'result']
    }
  ]
};

test('classifyAPIErrors ignores DeadlineExceeded when user payload is present', () => {
  expect(
    classifyAPIErrors(
      deadlineExceededWithUserPayload,
      JSON.stringify(deadlineExceededWithUserPayload),
      200
    )
  ).toEqual({ action: 'ignore' });
});

test('classifyAPIErrors does not retry an unknown SearchTimeline cursor', () => {
  expect(classifyAPIErrors(unknownCursorError, JSON.stringify(unknownCursorError), 200)).toEqual({
    action: 'ignore'
  });
});

test('classifyAPIErrors retries DeadlineExceeded when response has no payload', () => {
  expect(
    classifyAPIErrors(
      deadlineExceededWithoutPayload,
      JSON.stringify(deadlineExceededWithoutPayload),
      200
    )
  ).toEqual({ action: 'retry' });
});
