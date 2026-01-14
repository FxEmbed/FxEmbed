import { ActivityStatus } from '../src/types/types';
import { app } from '../src/worker';
import { expect, test } from 'vitest';
import harness from './helpers/harness';
import { botHeaders, twitterBaseUrl } from './helpers/data';

test('Status activity basic status', async () => {
  const result = await app.request(
    new Request('https://fxtwitter.com/api/v1/statuses/6608666766545266', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('20');
  expect(response.url).toEqual(`${twitterBaseUrl}/jack/status/20`);
  expect(response.uri).toEqual(`${twitterBaseUrl}/jack/status/20`);
  expect(response.created_at).toEqual('2006-03-21T20:50:14.000Z');
  expect(response.edited_at).toBeNull();
  expect(response.reblog).toBeNull();
  expect(response.application).toEqual({
    name: 'Twitter Web Client',
    website: null
  });
  expect(response.content).toMatch(/just setting up my twttr/);
  expect(response.account.id).toEqual('12');
  expect(response.account.display_name).toEqual('jack');
  expect(response.account.username).toEqual('jack');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
  expect(response.account.created_at).toEqual('2006-03-21T20:50:14.000Z');
  expect(response.account.locked).toEqual(false);
  expect(response.account.bot).toEqual(false);
  expect(response.account.emojis).toEqual([]);
  expect(response.account.roles).toEqual([]);
  expect(response.account.fields).toEqual([]);
  expect(response.media_attachments).toEqual([]);
  expect(response.mentions).toEqual([]);
  expect(response.tags).toEqual([]);
  expect(response.spoiler_text).toEqual('');
  expect(response.visibility).toEqual('public');
  expect(response.poll).toBeNull();
  expect(response.card).toBeNull();
});

test('Status activity video status', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360565354525854595752606054615254596166',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1841206275088290279');
  expect(response.url).toEqual(`${twitterBaseUrl}/DivineDropbear/status/1841206275088290279`);
  expect(response.uri).toEqual(`${twitterBaseUrl}/DivineDropbear/status/1841206275088290279`);
  expect(response.created_at).toEqual('2024-10-01T19:59:18.000Z');
  expect(response.edited_at).toBeNull();
  expect(response.reblog).toBeNull();
  expect(response.content).toMatch(
    /Sulphur-crested Cockatoo enjoying the warm Brisbane breeze\.\.\./
  );
  expect(response.content).toMatch(/<a href="https:\/\/x\.com\/fred_od_photo">@fred_od_photo<\/a>/);
  expect(response.content).toMatch(
    /<a href="https:\/\/x\.com\/hashtag\/birdphotography">#birdphotography<\/a>/
  );
  expect(response.account.id).toEqual('974067190386147329');
  expect(response.account.display_name).toEqual('Tranquility Found');
  expect(response.account.username).toEqual('DivineDropbear');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(1);
  expect(response.media_attachments[0].type).toEqual('video');
  expect(response.media_attachments[0].preview_url).toEqual(
    'https://pbs.twimg.com/ext_tw_video_thumb/1841204388993646595/pu/img/KKN8tSQm60z2FmtE.jpg'
  );
  expect(response.media_attachments[0].meta).toBeTruthy();
  expect(response.media_attachments[0].meta?.original?.width).toEqual(1920);
  expect(response.media_attachments[0].meta?.original?.height).toEqual(1080);
  expect(response.media_attachments[0].meta?.original?.size).toEqual('1920x1080');
  expect(response.media_attachments[0].meta?.original?.aspect).toEqual(1.7777777777777777);

  expect(response.media_attachments[0].url).toContain('video.twimg.com');
  expect(response.media_attachments[0].remote_url).toBeNull();
  expect(response.media_attachments[0].preview_remote_url).toBeNull();
  expect(response.media_attachments[0].text_url).toBeNull();
});

test('Status activity mosaic status', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360566060555357615752535656576157535566686612666753',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1848831595014459513');
  expect(response.url).toEqual(`${twitterBaseUrl}/SpaceX/status/1848831595014459513`);
  expect(response.content).toMatch(
    /Flight 6 Super Heavy booster moved to the Starbase pad for testing\. The move comes just one week after returning the first booster caught following launch/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(1);
  expect(response.media_attachments[0].type).toEqual('image');
  expect(response.media_attachments[0].url).toEqual(
    'https://mosaic.fxtwitter.com/jpeg/1848831595014459513/GahebgHbEAEevTU/GahecZ5aAAEX7GX/GaheddqbsAAzGXg'
  );
  expect(response.account.username).toEqual('SpaceX');
  expect(response.account.display_name).toEqual('SpaceX');
  expect(response.account.created_at).toEqual('2009-04-23T21:53:30.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
});

test('Status activity native multi-image status', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360566060555357615752535656576157535566',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1848831595014459513');
  expect(response.url).toEqual(`${twitterBaseUrl}/SpaceX/status/1848831595014459513`);
  expect(response.content).toMatch(
    /Flight 6 Super Heavy booster moved to the Starbase pad for testing\. The move comes just one week after returning the first booster caught following launch/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(3);
  expect(response.media_attachments[0].type).toEqual('image');
  expect(response.media_attachments[0].url).toEqual(
    'https://pbs.twimg.com/media/GahebgHbEAEevTU.jpg?name=orig'
  );
  expect(response.media_attachments[1].type).toEqual('image');
  expect(response.media_attachments[1].url).toEqual(
    'https://pbs.twimg.com/media/GahecZ5aAAEX7GX.jpg?name=orig'
  );
  expect(response.media_attachments[2].type).toEqual('image');
  expect(response.media_attachments[2].url).toEqual(
    'https://pbs.twimg.com/media/GaheddqbsAAzGXg.jpg?name=orig'
  );
  expect(response.account.username).toEqual('SpaceX');
  expect(response.account.display_name).toEqual('SpaceX');
  expect(response.account.created_at).toEqual('2009-04-23T21:53:30.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
});

test('Status activity select image 1', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360566060555357615752535656576157535566686613666753',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1848831595014459513');
  expect(response.url).toEqual(`${twitterBaseUrl}/SpaceX/status/1848831595014459513`);
  expect(response.content).toMatch(
    /Flight 6 Super Heavy booster moved to the Starbase pad for testing\. The move comes just one week after returning the first booster caught following launch/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(1);
  expect(response.media_attachments[0].type).toEqual('image');
  expect(response.media_attachments[0].url).toEqual(
    'https://pbs.twimg.com/media/GahebgHbEAEevTU.jpg?name=orig'
  );
  expect(response.account.username).toEqual('SpaceX');
  expect(response.account.display_name).toEqual('SpaceX');
  expect(response.account.created_at).toEqual('2009-04-23T21:53:30.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
});

test('Status activity select non-existing image', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360566060555357615752535656576157535566686613666756',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1848831595014459513');
  expect(response.url).toEqual(`${twitterBaseUrl}/SpaceX/status/1848831595014459513`);
  expect(response.content).toMatch(
    /Flight 6 Super Heavy booster moved to the Starbase pad for testing\. The move comes just one week after returning the first booster caught following launch/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(3);
  expect(response.media_attachments[0].type).toEqual('image');
  expect(response.media_attachments[0].url).toEqual(
    'https://pbs.twimg.com/media/GahebgHbEAEevTU.jpg?name=orig'
  );
  expect(response.media_attachments[1].type).toEqual('image');
  expect(response.media_attachments[1].url).toEqual(
    'https://pbs.twimg.com/media/GahecZ5aAAEX7GX.jpg?name=orig'
  );
  expect(response.media_attachments[2].type).toEqual('image');
  expect(response.media_attachments[2].url).toEqual(
    'https://pbs.twimg.com/media/GaheddqbsAAzGXg.jpg?name=orig'
  );
  expect(response.account.username).toEqual('SpaceX');
  expect(response.account.display_name).toEqual('SpaceX');
  expect(response.account.created_at).toEqual('2009-04-23T21:53:30.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
});

test('Status activity poll', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665360616161575658615658575455526159525366',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1899954694652309701');
  expect(response.url).toEqual(`${twitterBaseUrl}/Vyseroy/status/1899954694652309701`);
  expect(response.created_at).toEqual('2025-03-12T22:44:33.000Z');
  expect(response.content).toMatch(
    /You can only pick ONE ship for the rest of your time in Star Citizen\. What are you choosing\?" 🚀💭<br>︀︀<a href="https:\/\/x\.com\/hashtag\/starcitizen">#starcitizen<\/a> <a href="https:\/\/x\.com\/hashtag\/poll">#poll<\/a> <a href="https:\/\/x\.com\/hashtag\/videogames">#videogames<\/a> <a href="https:\/\/x\.com\/hashtag\/spacegames">#spacegames<\/a><br><br><blockquote>██<br><b>MISC Freelancer<\/b>&emsp;9\.1%<br>︀︀︀<br>︀████████<br><b>Anvil Carrack<\/b>&emsp;27\.3%<br>︀︀︀<br>︀███████<br><b>Drake Cutlass \(Any\?\)<\/b>&emsp;22\.7%<br>︀︀︀<br>︀█████████████<br><b>Origin 600i<\/b>&emsp;40\.9%<br>︀︀︀<br>︀22 votes · Final results/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.media_attachments.length).toEqual(0);
  expect(response.account.username).toEqual('Vyseroy');
  expect(response.account.display_name).toContain('Vyseroy');
  expect(response.account.created_at).toEqual('2010-04-17T11:45:16.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
});

test('Status activity quote and video', async () => {
  const result = await app.request(
    new Request(
      'https://fxtwitter.com/api/v1/statuses/66086667665361525452576154616157615352615255555766',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as ActivityStatus;
  expect(response).toBeTruthy();
  expect(response.id).toEqual('1902059299591090335');
  expect(response.url).toEqual(`${twitterBaseUrl}/carrionkid/status/1902059299591090335`);
  expect(response.created_at).toEqual('2025-03-18T18:07:30.000Z');
  expect(response.content).toMatch(
    /<br><br><blockquote><b><a href="https:\/\/x\.com\/__itzt3z\/status\/1900793157786255768">Quoting<\/a> 🛸 \(<a href="https:\/\/x\.com\/__itzt3z">@__itzt3z<\/a>\)<\/b><br>︀<br>the funniest tik toks be the ones they dont let you save<\/blockquote>/
  );
  expect(response.media_attachments).toBeTruthy();
  expect(response.account.username).toEqual('carrionkid');
  expect(response.account.display_name).toContain('harlow');
  expect(response.account.created_at).toEqual('2018-08-14T00:56:49.000Z');
  expect(response.account.avatar).toMatch(/https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/);
  expect(response.account.avatar_static).toMatch(
    /https:\/\/pbs\.twimg\.com\/profile_images\/.+\.jpg/
  );
  expect(response.account.header).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.header_static).toMatch(/https:\/\/pbs\.twimg\.com\/profile_banners\/.+/);
  expect(response.account.followers_count).toBeGreaterThan(0);
  expect(response.account.following_count).toBeGreaterThan(0);
  expect(response.account.statuses_count).toBeGreaterThan(0);
  expect(response.media_attachments.length).toEqual(1);
  expect(response.media_attachments[0].type).toEqual('video');
  expect(response.media_attachments[0].preview_url).toEqual(
    'https://pbs.twimg.com/ext_tw_video_thumb/1902059279190052864/pu/img/DLoQFXU9gzkHQ2fh.jpg'
  );
  expect(response.media_attachments[0].meta).toBeTruthy();
  expect(response.media_attachments[0].meta?.original?.width).toEqual(576);
  expect(response.media_attachments[0].meta?.original?.height).toEqual(1280);
  expect(response.media_attachments[0].meta?.original?.size).toEqual('576x1280');
  expect(response.media_attachments[0].meta?.original?.aspect).toEqual(0.45);

  expect(response.media_attachments[0].url).toContain('video.twimg.com');
  expect(response.media_attachments[0].remote_url).toBeNull();
  expect(response.media_attachments[0].preview_remote_url).toBeNull();
  expect(response.media_attachments[0].text_url).toBeNull();

  expect(response.application).toEqual({
    name: 'Twitter for Android',
    website: null
  });
});
