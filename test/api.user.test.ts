import { test, expect } from 'vitest';
import { UserAPIResponse, APIUser } from '../src/types/types';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

test('API fetch user', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/x', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as UserAPIResponse;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const user = response.user as APIUser;
  expect(user).toBeTruthy();
  expect(user.url).toEqual(`${twitterBaseUrl}/X`);
  expect(user.id).toEqual('783214');
  expect(user.screen_name).toEqual('X');
  expect(user.followers).toEqual(expect.any(Number));
  expect(user.following).toEqual(expect.any(Number));
  // The official twitter account will never be following as many people as it has followers
  expect(user.following).not.toEqual(user.followers);
  expect(user.likes).toEqual(expect.any(Number));
  // expect(user.verified).toEqual('business');
  expect(user.joined).toEqual('Tue Feb 20 14:35:54 +0000 2007');
  // expect(user.birthday.day).toEqual(21);
  // expect(user.birthday.month).toEqual(3);
  // expect(user.birthday.year).toBeUndefined();
});

test('API fetch user that does not exist', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/notfound3842342', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(404);
  const response = (await result.json()) as UserAPIResponse;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(404);
  expect(response.message).toEqual('User not found');
  expect(response.user).toBeUndefined();
});

test('API fetch user about_account info', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/x', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );

  expect(result.status).toEqual(200);
  const response = (await result.json()) as UserAPIResponse;
  expect(response).toBeTruthy();
  expect(response.code).toEqual(200);
  expect(response.message).toEqual('OK');

  const user = response.user as APIUser;
  expect(user).toBeTruthy();

  expect(user.about_account).toBeTruthy();
  expect(user.about_account?.based_in).toEqual('United States');
  expect(user.about_account?.location_accurate).toEqual(true);
  expect(user.about_account?.created_country_accurate).toBe(true);
  expect(user.about_account?.source).toEqual('United States App Store');
  expect(user.about_account?.username_changes).toBeTruthy();
  expect(user.about_account?.username_changes?.count).toEqual(3);
  expect(typeof user.about_account?.username_changes?.last_changed_at).toBe('string');
});
