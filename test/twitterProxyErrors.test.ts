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
    classifyAPIErrors(deadlineExceededWithUserPayload, JSON.stringify(deadlineExceededWithUserPayload), 200)
  ).toEqual({ action: 'ignore' });
});

test('classifyAPIErrors retries DeadlineExceeded when response has no payload', () => {
  expect(
    classifyAPIErrors(deadlineExceededWithoutPayload, JSON.stringify(deadlineExceededWithoutPayload), 200)
  ).toEqual({ action: 'retry' });
});
