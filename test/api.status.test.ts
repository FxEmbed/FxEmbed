import { test, expect } from 'vitest';
import type { APITwitterStatus } from '../src/realms/api/schemas';
import type { SocialConversation, SocialThread } from '../src/types/apiStatus';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

/** Legacy `/status/:id` JSON envelope (global `TweetAPIResponse` is not a module export). */
type TweetAPIEnvelope = {
  code: number;
  message: string;
  tweet?: APITwitterStatus;
};

test('API fetch basic Status', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/status/20', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as TweetAPIEnvelope;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const status = response.tweet!;
  expect(status).toBeTruthy();
  expect(status.url).toEqual(`${twitterBaseUrl}/jack/status/20`);
  expect(status.id).toEqual('20');
  expect(status.text).toEqual('just setting up my twttr');
  expect(status.author.screen_name?.toLowerCase()).toEqual('jack');
  expect(status.author.id).toEqual('12');
  expect(status.author.name).toBeTruthy();
  expect(status.author.avatar_url).toBeTruthy();
  expect(status.author.banner_url).toBeTruthy();
  // The reply count now returns 0 as of some time between Sep 17-19 2024 from guest API. No idea why.
  // expect(status.replies).toBeGreaterThan(0);
  // @ts-expect-error retweets only in legacy API
  expect(status.retweets).toBeGreaterThan(0);
  expect(status.likes).toBeGreaterThan(0);
  expect(status.bookmarks).toBeGreaterThan(0);
  expect(status.quotes).toEqual(2886);
  // @ts-expect-error twitter_card only in legacy API
  expect(status.twitter_card).toEqual('tweet');
  expect(status.created_at).toEqual('Tue Mar 21 20:50:14 +0000 2006');
  expect(status.created_timestamp).toEqual(1142974214);
  expect(status.lang).toEqual('en');
  expect(status.replying_to).toBeNull();
});

test('API fetch Status with community', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/status/1964084223871971826', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as TweetAPIEnvelope;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const status = response.tweet!;
  expect(status).toBeTruthy();
  expect(status.id).toEqual('1964084223871971826');
  expect(status.quotes).toEqual(33);

  expect(status.community).toBeTruthy();
  const community = status.community!;
  expect(community.id).toEqual('1506777270324764673');
  expect(community.name).toEqual('Fox Twitter');
  expect(community.description).toEqual('Fox superiority');
  expect(community.created_at).toEqual(new Date(1648078670474).toISOString());
  expect(community.search_tags).toEqual([]);
  expect(community.is_nsfw).toEqual(false);
  expect(community.topic).toEqual('Animals');
  expect(community.join_policy).toEqual('Open');
  expect(community.invites_policy).toEqual('MemberInvitesAllowed');
  expect(community.is_pinned).toEqual(false);

  expect(community.admin).toBeTruthy();
  expect(community.admin?.id).toEqual('1194627934495092736');
  expect(community.admin?.screen_name?.toLowerCase()).toEqual('shreddyfox');

  expect(community.creator).toBeTruthy();
  expect(community.creator?.id).toEqual('1194627934495092736');
  expect(community.creator?.screen_name?.toLowerCase()).toEqual('shreddyfox');
});

test('API v2 /2/status includes quote count', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/20', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const body = (await result.json()) as SocialThread;
  expect(body.code).toEqual(200);
  expect(body.status?.quotes).toEqual(2886);
});

test('API v2 /2/status rejects non-numeric id with 400', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/abc', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(400);
  const body = (await result.json()) as { code?: number; message?: string };
  expect(body.code).toEqual(400);
  expect(typeof body.message).toBe('string');
  expect(body.message?.length).toBeGreaterThan(0);
});

test('API v2 /2/thread includes quote count on focal status', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/thread/20', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const body = (await result.json()) as SocialThread;
  expect(body.code).toEqual(200);
  expect(body.status?.quotes).toEqual(2886);
});

test('API v2 /2/status photo includes formats with orig url', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/status/1848831595014459513', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const body = (await result.json()) as SocialThread;
  expect(body.code).toEqual(200);
  const photo = body.status?.media?.photos?.[0];
  expect(photo).toBeTruthy();
  expect(photo?.url).toContain('name=orig');
  expect(photo?.formats?.map(f => f.name)).toEqual(
    expect.arrayContaining(['thumb', 'small', 'medium', 'large', 'orig'])
  );
  expect(photo?.formats?.find(f => f.name === 'large')?.url).toContain('name=large');
});

test('Legacy /status JSON omits photo formats', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/status/1848831595014459513', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as TweetAPIEnvelope;
  const photo = response.tweet?.media?.photos?.[0];
  expect(photo).toBeTruthy();
  expect(photo?.url).toContain('name=orig');
  expect(photo).not.toHaveProperty('formats');
});

test('API v2 /2/conversation includes quote count on focal status', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/conversation/20', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const body = (await result.json()) as SocialConversation;
  expect(body.code).toEqual(200);
  expect(body.status?.quotes).toEqual(2886);
});
