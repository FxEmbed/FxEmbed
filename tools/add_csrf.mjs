/**
 * Fetch ct0/csrf for each Twitter account (auth_token only) and write credentials.json.
 * Expects: { "twitter": { "accounts": [{ username, authToken, csrfToken? }, ...] } }
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const completePath = join(repoRoot, 'credentials.complete.json');
const fallbackPath = join(repoRoot, 'credentials.json');
const credPath = fs.existsSync(completePath) ? completePath : fallbackPath;

async function getCsrfToken(account) {
  const response = await fetch(
    'https://x.com/i/api/graphql/q94uRCEn65LZThakYcPT6g/TweetDetail?variables=%7B%22focalTweetId%22%3A%2220%22%2C%22with_rux_injections%22%3Afalse%2C%22includePromotedContent%22%3Atrue%2C%22withCommunity%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withBirdwatchNotes%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D&features=%7B%22rweb_lists_timeline_redesign_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22tweetypie_unmention_optimization_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Afalse%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_media_download_video_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticleRichContentState%22%3Afalse%7D',
    {
      headers: {
        'accept': '*/*',
        'accept-language': 'en',
        'authorization':
          'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'content-type': 'application/json',
        'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        'cookie': `auth_token=${account.authToken}`,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': '',
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en'
      },
      referrer: 'https://x.com/jack/status/20',
      referrerPolicy: 'strict-origin-when-cross-origin',
      method: 'GET'
    }
  );

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/ct0=(.*?);/);
  const ct0 = match?.[1];
  return ct0 ? ct0 : null;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (!data.twitter?.accounts || !Array.isArray(data.twitter.accounts)) {
    console.error(
      `${credPath} must contain { "twitter": { "accounts": [...] } } (see credentials.example.json)`
    );
    process.exit(1);
  }

  let added = 0;
  for (const account of data.twitter.accounts) {
    if (account.csrfToken) continue;
    const csrfToken = await getCsrfToken(account);
    if (!csrfToken) {
      throw new Error(
        `Could not obtain ct0/csrf for @${account.username} (no Set-Cookie ct0 and no existing csrfToken)`
      );
    }
    account.csrfToken = csrfToken;
    added++;
    await sleep(50);
    console.log(`Activated @${account.username} (csrf length ${csrfToken.length})`);
  }

  fs.writeFileSync(credPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Updated ${credPath} (${added} csrf tokens added)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
