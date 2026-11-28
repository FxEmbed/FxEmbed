import { vi, test, expect } from 'vitest';
import type { APITwitterStatus } from '../src/realms/api/schemas';
import type { SocialThread } from '../src/types/apiStatus';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import tweetMock from './mocks/TweetResultByRestId/1848831595014459513.json';

// Broadcast enrichment is gated by Experiment.BROADCAST_STREAM_API; enable it here to verify broadcast output.
vi.mock('../src/experiments', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/experiments')>();
  return {
    ...actual,
    experimentCheck: (experiment: import('../src/experiments').Experiment, condition = true) =>
      experiment === actual.Experiment.BROADCAST_STREAM_API
        ? condition
        : actual.experimentCheck(experiment, condition)
  };
});

const createBroadcastHarness = (streamResponse: unknown) => ({
  TwitterProxy: {
    fetch: async (request: string) => {
      const { pathname } = new URL(request);
      if (pathname.includes('/live_video_stream/status/')) {
        return Response.json(streamResponse);
      }
      if (!pathname.endsWith('/TweetResultByRestId')) {
        return harness.TwitterProxy.fetch(request);
      }

      const mock = structuredClone(tweetMock) as typeof tweetMock & {
        data: {
          tweetResult: {
            result: Record<string, unknown>;
          };
        };
      };
      mock.data.tweetResult.result.rest_id = '991021';
      mock.data.tweetResult.result.legacy = {
        ...mock.data.tweetResult.result.legacy,
        id_str: '991021',
        conversation_id_str: '991021'
      };
      mock.data.tweetResult.result.card = {
        rest_id: 'card://991021',
        legacy: {
          name: '3691239323:periscope_broadcast',
          binding_values: [
            {
              key: 'broadcast_url',
              value: { string_value: 'https://x.com/i/broadcasts/1ZkKzExample' }
            },
            { key: 'broadcast_state', value: { string_value: 'LIVE' } },
            { key: 'broadcast_id', value: { string_value: '1ZkKzExample' } },
            { key: 'broadcast_media_id', value: { string_value: '28_1ZkKzExample' } },
            { key: 'broadcast_media_key', value: { string_value: '28_1ZkKzExample' } },
            { key: 'broadcast_title', value: { string_value: 'Test Broadcast' } }
          ]
        }
      };

      return Response.json(mock);
    }
  }
});

test.each([
  ['v1', '/status/991021', 'tweet'],
  ['v2', '/2/status/991021', 'status']
] as const)(
  'API %s broadcast does not throw when live_video_stream omits source',
  async (_version, path, key) => {
    const result = await app.request(
      new Request(`https://api.fxtwitter.com${path}`, { headers: botHeaders }),
      undefined,
      createBroadcastHarness({
        errors: [{ code: 34, message: 'Sorry, that page does not exist.' }]
      })
    );
    expect(result.status).toEqual(200);
    const status = ((await result.json()) as Record<typeof key, APITwitterStatus>)[key];
    expect(status.media?.broadcast?.url).toEqual('https://x.com/i/broadcasts/1ZkKzExample');
    expect(status.media?.broadcast?.stream).toBeUndefined();
  }
);

test('API broadcast preserves stream URL when live_video_stream includes source.location', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/991021', { headers: botHeaders }),
    undefined,
    createBroadcastHarness({
      source: { location: 'https://video.twimg.com/ext_tw_video/stream.m3u8' }
    })
  );
  expect(result.status).toEqual(200);
  const body = (await result.json()) as SocialThread;
  expect(body.status?.media?.broadcast?.stream?.url).toEqual(
    'https://video.twimg.com/ext_tw_video/stream.m3u8'
  );
});
