import { Context } from 'hono';
import { Constants } from '../constants';
import { withTimeout } from './utils';
import { normalizeLanguage } from './language';

/* Handles translating statuses when asked! */
export const translateStatus = async (
  tweet: GraphQLTwitterStatus,
  guestToken: string,
  _language: string,
  c: Context
): Promise<TranslationPartial | null> => {
  const csrfToken = crypto.randomUUID().replace(/-/g, ''); // Generate a random CSRF token, this doesn't matter, Twitter just cares that header and cookie match

  const headers: { [header: string]: string } = {
    'Authorization': Constants.GUEST_BEARER_TOKEN,
    ...Constants.BASE_HEADERS,
    'Cookie': [
      `guest_id_ads=v1%3A${guestToken}`,
      `guest_id_marketing=v1%3A${guestToken}`,
      `guest_id=v1%3A${guestToken}`,
      `ct0=${csrfToken};`
    ].join('; '),
    'x-csrf-token': csrfToken,
    'x-twitter-active-user': 'yes',
    'x-guest-token': guestToken,
    'Referer': `${Constants.TWITTER_ROOT}/i/status/${tweet.rest_id}`
  };

  let translationApiResponse;
  let translationResults: TranslationPartial;

  const language = normalizeLanguage(_language);

  headers['x-twitter-client-language'] = language;

  /* As of August 2023, you can no longer fetch translations with guest token */
  if (typeof c.env?.TwitterProxy === 'undefined') {
    return null;
  }

  try {
    const url = `${Constants.TWITTER_ROOT}/i/api/1.1/strato/column/None/tweetId=${
      tweet.rest_id ?? tweet.legacy?.id_str ?? tweet.legacy?.conversation_id_str
    },destinationLanguage=None,translationSource=Some(Google),feature=None,timeout=None,onlyCached=None/translation/service/translateTweet`;
    console.log(url, headers);
    translationApiResponse = (await withTimeout((signal: AbortSignal) =>
      c.env?.TwitterProxy.fetch(url, {
        method: 'GET',
        headers: headers,
        signal: signal
      })
    )) as Response;
    translationResults = (await translationApiResponse.json()) as TranslationPartial;

    console.log(`translationResults`, translationResults);

    if (translationResults.translationState !== 'Success') {
      return null;
    }

    console.log(translationResults);
    return translationResults;
  } catch (e: unknown) {
    console.error('Unknown error while fetching from Translation API', e);
    return null;
  }
};
