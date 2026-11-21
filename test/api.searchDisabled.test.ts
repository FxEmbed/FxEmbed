import { expect, test } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import { Strings } from '../src/strings';

const searchBackedPaths = [
  '/2/search?q=puppies',
  '/2/search/users?q=jack',
  '/2/typeahead?q=example',
  '/2/status/20/quotes'
];

test.each(searchBackedPaths)(
  '%s answers 503 while the TWITTER_SEARCH experiment is off',
  async path => {
    const result = await app.request(
      new Request(`https://api.fxtwitter.com${path}`, { method: 'GET', headers: botHeaders }),
      undefined,
      harness
    );
    expect(result.status).toBe(503);
    const body = (await result.json()) as { code: number; message: string };
    expect(body.code).toBe(503);
    expect(body.message).toBe(Strings.X_SEARCH_UNAVAILABLE);
  }
);
