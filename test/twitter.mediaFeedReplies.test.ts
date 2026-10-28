import { test, expect } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';
import userTweetsMock from './mocks/UserTweets/783214.json';

type TweetResult = {
  rest_id: string;
  legacy: Record<string, string>;
};

type TimelineEntry = {
  entryId: string;
  content: Record<string, unknown> & {
    __typename: string;
    itemContent?: { tweet_results: { result: TweetResult } };
  };
};

const tweetEntry = (
  userTweetsMock.data.user.result.timeline.timeline.instructions as Array<{
    entries?: TimelineEntry[];
  }>
)
  .flatMap(instruction => instruction.entries ?? [])
  .find(entry => entry.content.__typename === 'TimelineTimelineItem')!;

const cursorEntry = (cursorType: 'Top' | 'Bottom', value: string): TimelineEntry => ({
  entryId: `cursor-${cursorType.toLowerCase()}-${value}`,
  content: {
    __typename: 'TimelineTimelineCursor',
    entryType: 'TimelineTimelineCursor',
    cursorType,
    value
  }
});

const makeEntry = (id: string, reply: boolean): TimelineEntry => {
  const entry = structuredClone(tweetEntry);
  const result = entry.content.itemContent!.tweet_results.result;
  result.rest_id = id;
  result.legacy.id_str = id;
  result.legacy.conversation_id_str = id;
  result.legacy.full_text = `post ${id}`;
  if (reply) {
    Object.assign(result.legacy, {
      in_reply_to_status_id_str: '1000000000000000000',
      in_reply_to_screen_name: 'someoneelse',
      in_reply_to_user_id_str: '1000000000000000001'
    });
  }
  entry.entryId = `tweet-${id}`;
  return entry;
};

const mediaTimeline = (entries: TimelineEntry[]) => ({
  data: {
    user: {
      result: {
        timeline: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] } }
      }
    }
  }
});

/** Serves `UserMedia` from `pages(cursor)`; every other GraphQL call falls through to the harness. */
const mediaHarness = (pages: (cursor: string | null) => unknown) => ({
  TwitterProxy: {
    fetch: async (request: string) => {
      const url = new URL(request);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const graphqlIdx = pathParts.indexOf('graphql');
      const apiMethod =
        graphqlIdx >= 0 && pathParts[graphqlIdx + 2] ? pathParts[graphqlIdx + 2] : null;
      if (apiMethod === 'UserMedia') {
        const variables = JSON.parse(decodeURIComponent(url.searchParams.get('variables') ?? '{}'));
        return Response.json(pages(variables.cursor ?? null));
      }
      return harness.TwitterProxy.fetch(request);
    }
  }
});

const requestFeed = (env: unknown, path: string) =>
  app.request(
    new Request(`https://fxtwitter.com/x/${path}`, { method: 'GET', headers: botHeaders }),
    undefined,
    env
  );

test.each(['media.xml', 'media.atom.xml'])(
  '%s excludes replies by default and includes them with with_replies',
  async format => {
    const env = mediaHarness(cursor =>
      cursor
        ? mediaTimeline([makeEntry('300', false)])
        : mediaTimeline([
            makeEntry('100', true),
            makeEntry('200', false),
            cursorEntry('Top', 'top-cursor'),
            cursorEntry('Bottom', 'next-page')
          ])
    );

    const withoutReplies = await requestFeed(env, `${format}?count=2`);
    expect(withoutReplies.status).toBe(200);
    const defaultXml = await withoutReplies.text();
    expect(defaultXml).toContain('/status/200');
    expect(defaultXml).toContain('/status/300');
    expect(defaultXml).not.toContain('/status/100');

    const withReplies = await requestFeed(env, `${format}?count=2&with_replies=1`);
    expect(withReplies.status).toBe(200);
    const repliesXml = await withReplies.text();
    expect(repliesXml).toContain('/status/100');
    expect(repliesXml).toContain('/status/200');
    expect(repliesXml).not.toContain('/status/300');
  }
);

test('media feed keeps paginating past a page that is all replies', async () => {
  const env = mediaHarness(cursor =>
    cursor
      ? mediaTimeline([makeEntry('200', false)])
      : mediaTimeline([
          makeEntry('100', true),
          cursorEntry('Top', 'top-cursor'),
          cursorEntry('Bottom', 'next-page')
        ])
  );

  const withoutReplies = await requestFeed(env, 'media.xml?count=1');
  expect(withoutReplies.status).toBe(200);
  const defaultXml = await withoutReplies.text();
  expect(defaultXml).toContain('/status/200');
  expect(defaultXml).not.toContain('/status/100');

  const withReplies = await requestFeed(env, 'media.xml?count=1&withReplies=1');
  expect(withReplies.status).toBe(200);
  const repliesXml = await withReplies.text();
  expect(repliesXml).toContain('/status/100');
  expect(repliesXml).not.toContain('/status/200');
});

test('the v2 media route still returns replies from the media tab', async () => {
  const env = mediaHarness(() => mediaTimeline([makeEntry('100', true), makeEntry('200', false)]));

  const res = await app.request(
    new Request('https://api.fxtwitter.com/2/profile/x/media', { headers: botHeaders }),
    undefined,
    env
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.results.map((s: { id: string }) => s.id)).toEqual(['100', '200']);
  expect(body.results[0].replying_to).not.toBeNull();
});
