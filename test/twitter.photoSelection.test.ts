import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import tweetMock from './mocks/TweetResultByRestId/1848831595014459513.json';

const base = '/example/status/991020';

const photoHarness = {
  TwitterProxy: {
    fetch: async (request: string) => {
      if (!new URL(request).pathname.endsWith('/TweetResultByRestId')) {
        return harness.TwitterProxy.fetch(request);
      }

      const mock = structuredClone(tweetMock);
      const tweet = mock.data.tweetResult.result;
      tweet.rest_id = '991020';
      tweet.legacy.id_str = '991020';
      tweet.legacy.conversation_id_str = '991020';

      const photo = tweet.legacy.extended_entities.media[0];
      tweet.legacy.extended_entities.media = Array.from({ length: 20 }, (_, i) => ({
        ...photo,
        id_str: String(i + 1),
        media_url_https: `https://pbs.twimg.com/media/photo${i + 1}.jpg`,
        expanded_url: `https://x.com${base}/photo/${i + 1}`
      }));

      return Response.json(mock);
    }
  }
};

test.each([
  [`${base}/photo/4`, 4],
  [`${base}/photo/5`, 5],
  [`${base}/photo/13`, 13],
  [`${base}/photo/20`, 20],
  [`${base}/photo/13/en`, 13],
  [`/dir${base}/photo/13`, 13],
  [`/dir${base}/photo/13/en`, 13],
  [`/dl${base}/photo/13`, 13],
  [`/dl${base}/photo/13/en`, 13],
  [`${base}/photo/21`, 1],
  [`${base}/photo/0`, 1]
])('Twitter %s redirects to photo %i', async (path, expected) => {
  const response = await app.request(
    new Request(`https://d.fxtwitter.com${path}`, { headers: botHeaders }),
    undefined,
    photoHarness
  );

  expect(response.status).toEqual(302);
  expect(response.headers.get('location')).toEqual(
    `https://pbs.twimg.com/media/photo${expected}.jpg?name=orig`
  );
});
