import type { APITwitterStatus } from '../types/api-schemas.js';
import { normalizeLanguage } from './language.js';
import { getTwitterProviderEnv } from '../providers/twitter-runtime.js';
import { twitterFetch } from '../providers/twitter/fetch.js';
import type { TwitterBuildHost } from '../providers/twitter/build-host.js';

type GrokTranslation = {
  result: {
    content_type: 'POST';
    text: string;
    entities: { [key: string]: string };
  };
};

/* Handles translating statuses when asked! */
export const translateStatusGrok = async (
  status: APITwitterStatus,
  _language: string,
  host: TwitterBuildHost
): Promise<GrokTranslation | null> => {
  const language = normalizeLanguage(_language);
  const { apiRoot } = getTwitterProviderEnv();
  const response = await twitterFetch(host, {
    url: `${apiRoot}/2/grok/translation.json`,
    method: 'POST',
    body: JSON.stringify({
      content_type: 'POST',
      id: status.id,
      dst_lang: language,
      include_polls: true
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
  console.log('Grok translation response:', response);
  const text = (response as GrokTranslation | null)?.result?.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    console.warn('Grok returned no usable translation; allowing translation fallback');
    return null;
  }
  return response as GrokTranslation | null;
};
