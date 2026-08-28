import type { APIUser, UserAPIResponse } from '../../types/api-schemas.js';
import { fetchEmbedData, fetchUniversalData } from './client.js';
import { buildAPITikTokUser, buildAPITikTokUserFromEmbed } from './processor.js';

/** Result envelope so callers can tell "no such user" from "upstream broke". */
export interface TikTokProfileResult {
  user: APIUser | null;
  code: number;
}

/**
 * Normalizes anything that identifies a TikTok account into a bare handle:
 * `@user`, `user`, `https://www.tiktok.com/@user`, `tiktok.com/@user/video/123`.
 */
export const normalizeTikTokHandle = (input: string): string | null => {
  let value = input.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value) || /^(?:www\.|m\.)?tiktok\.com\//i.test(value)) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      value = new URL(withScheme).pathname;
    } catch {
      return null;
    }
  }

  const match = value.match(/@([A-Za-z0-9._]{1,24})/);
  if (match) return match[1];

  value = value.replace(/^\/+/, '').split('/')[0];
  return /^[A-Za-z0-9._]{1,24}$/.test(value) ? value : null;
};

/**
 * Fetches a profile from the server-rendered `www.tiktok.com/@handle` page, which carries the full
 * user object (including `secUid`, join date and exact `statsV2` counts).
 *
 * Falls back to the `/embed/@handle` header block, which survives some cases where the main page
 * serves an interstitial, at the cost of a thinner user object (see
 * `buildAPITikTokUserFromEmbed`).
 */
export const fetchTikTokProfile = async (handleInput: string): Promise<TikTokProfileResult> => {
  const handle = normalizeTikTokHandle(handleInput);
  if (!handle) {
    return { user: null, code: 400 };
  }

  const { data, status } = await fetchUniversalData(`/@${handle}`);
  const detail = data?.['webapp.user-detail'];
  const user = detail?.userInfo?.user;
  if (user?.uniqueId) {
    return {
      user: buildAPITikTokUser(user, detail?.userInfo?.stats, detail?.userInfo?.statsV2),
      code: 200
    };
  }

  const embed = await fetchEmbedData(`/embed/@${handle}`);
  if (embed.data?.userInfo?.uniqueId) {
    return { user: buildAPITikTokUserFromEmbed(embed.data.userInfo), code: 200 };
  }

  console.error('Could not resolve TikTok profile', handle, status, embed.status);
  return { user: null, code: status === 404 || embed.status === 404 ? 404 : 500 };
};

/** `/2/tiktok/profile/{handle}` envelope. */
export async function constructTikTokProfile(handle: string): Promise<UserAPIResponse> {
  const result = await fetchTikTokProfile(handle);
  if (result.code === 400) return { code: 400, message: 'Invalid handle' };
  if (result.code === 404) return { code: 404, message: 'User not found' };
  if (result.code !== 200 || !result.user) {
    return { code: 500, message: 'TikTok profile request failed' };
  }
  return { code: 200, message: 'OK', user: result.user };
}
