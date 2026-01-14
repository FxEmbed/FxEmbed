import { test, expect } from 'vitest';
import { TweetAPIResponse, APITwitterStatus } from '../src/types/types';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

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
  const response = (await result.json()) as TweetAPIResponse;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const status = response.tweet as APITwitterStatus;
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
  const response = (await result.json()) as TweetAPIResponse;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const status = response.tweet as APITwitterStatus;
  expect(status).toBeTruthy();
  expect(status.id).toEqual('1964084223871971826');

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
