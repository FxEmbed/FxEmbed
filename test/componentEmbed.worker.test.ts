import { expect, test, vi } from 'vitest';
import { app } from '../src/worker';
import { botHeaders } from './helpers/data';
import harness from './helpers/harness';

vi.mock('../src/experiments', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/experiments')>();
  return {
    ...actual,
    experimentCheck: (experiment: string, condition = true) =>
      experiment === actual.Experiment.COMPONENT_EMBED
        ? condition
        : actual.experimentCheck(experiment as never, condition)
  };
});

const BROADCAST_STATUS_ID = '2020202020';

vi.mock('@fxembed/atmosphere/providers/twitter/conversation', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@fxembed/atmosphere/providers/twitter/conversation')>();
  return {
    ...actual,
    constructTwitterThread: async (
      id: string,
      ...rest: Parameters<typeof actual.constructTwitterThread> extends [unknown, ...infer R]
        ? R
        : never
    ) => {
      if (id !== BROADCAST_STATUS_ID) {
        return actual.constructTwitterThread(id, ...rest);
      }
      const thread = await actual.constructTwitterThread('20', ...rest);
      const stream = {
        type: 'video',
        url: 'https://stream-test.fxembed.com/download.mp4?url=x',
        thumbnail_url: 'https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg',
        format: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 0,
        formats: []
      };
      const status = thread.status as { media: Record<string, unknown> };
      status.media = {
        ...status.media,
        broadcast: { url: 'https://x.com/i/broadcasts/1', stream: { url: 'https://a.b/c' } },
        videos: [stream],
        all: [stream]
      };
      return thread;
    }
  };
});

const request = (url: string, headers: Record<string, string> = botHeaders) =>
  app.request(new Request(url, { headers }), undefined, harness);

const payloadOf = (html: string) => {
  const match = html.match(
    /<script id="discord:component-embed" type="application\/json">(.*?)<\/script>/
  );
  return match ? JSON.parse(match[1]) : null;
};

test('Discordbot gets a component embed instead of the activity embed', async () => {
  const result = await request('https://fxtwitter.com/jack/status/20');
  expect(result.status).toEqual(200);
  const html = await result.text();

  const payload = payloadOf(html);
  expect(payload?.component?.type).toEqual(17);
  expect(JSON.stringify(payload)).toContain('just setting up my twttr');

  expect(html).not.toMatch(/application\/activity\+json/);
  expect(html).toMatch(/<meta property="og:title"/);
  expect(html).toMatch(/<meta property="og:description"/);
});

test('Discord crawler user agent gets a component embed', async () => {
  const result = await request('https://fxtwitter.com/jack/status/20', {
    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
  });
  expect(payloadOf(await result.text())).not.toBeNull();
});

test('Old-embed, direct and gallery domains keep the regular embed', async () => {
  for (const host of ['o.fxtwitter.com', 'd.fxtwitter.com', 'g.fxtwitter.com']) {
    const result = await request(`https://${host}/jack/status/20`);
    expect(payloadOf(await result.text()), host).toBeNull();
  }
});

test('Other crawlers do not get a component embed', async () => {
  const result = await request('https://fxtwitter.com/jack/status/20', {
    'User-Agent': 'TelegramBot (like TwitterBot)'
  });
  expect(payloadOf(await result.text())).toBeNull();
});

test('Broadcasts keep the activity embed instead of a component embed', async () => {
  const result = await request(`https://fxtwitter.com/jack/status/${BROADCAST_STATUS_ID}`);
  expect(result.status).toEqual(200);
  const html = await result.text();
  expect(payloadOf(html)).toBeNull();
  expect(html).toMatch(/application\/activity\+json/);
});
