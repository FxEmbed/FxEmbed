import { withTimeout } from '../../helpers/with-timeout.js';
import { generateUserAgent } from '../../helpers/user-agent.js';
import {
  TIKTOK_API_HOST,
  TIKTOK_API_PATHS,
  TIKTOK_APP_CONFIG,
  TIKTOK_MOBILE_UA,
  TIKTOK_PROXY_COOKIES,
  TIKTOK_WEB_HOST
} from './constants.js';

/** Page fetch result: parsed embedded JSON plus the cookies TikTok handed us. */
export interface TikTokPageResult<T> {
  data: T | null;
  cookies: string | null;
  /** HTTP status of the page fetch, so callers can tell 404 from a parse failure. */
  status: number;
}

const browserHeaders = (): Record<string, string> => {
  const [userAgent, secChUa] = generateUserAgent();
  return {
    'User-Agent': userAgent,
    'sec-ch-ua': secChUa,
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'no-cache'
  };
};

/**
 * Parse a `Set-Cookie` header into name/value pairs. Splitting on `,` alone is wrong (expiry dates
 * contain commas), so we only split where a comma is followed by a `name=` pair.
 */
const parseSetCookieHeader = (setCookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>();
  for (const part of setCookieHeader.split(/,\s*(?=[a-zA-Z_][a-zA-Z0-9_]*=)/)) {
    const cookiePart = part.split(';')[0].trim();
    const eqIndex = cookiePart.indexOf('=');
    if (eqIndex > 0) {
      cookies.set(cookiePart.substring(0, eqIndex), cookiePart.substring(eqIndex + 1));
    }
  }
  return cookies;
};

/** Builds the cookie string the video proxy replays to TikTok's CDN. */
const collectProxyCookies = (response: Response): string | null => {
  const setCookieHeader = response.headers.get('set-cookie');
  if (!setCookieHeader) return null;

  const parsed = parseSetCookieHeader(setCookieHeader);
  const parts: string[] = [];
  for (const name of TIKTOK_PROXY_COOKIES) {
    const value = parsed.get(name);
    if (value) parts.push(`${name}=${value}`);
  }
  if (parts.length === 0) {
    for (const [name, value] of parsed) parts.push(`${name}=${value}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
};

/** Extracts and parses one `<script id="…">…</script>` JSON blob from a page. */
const extractScriptJson = <T>(html: string, id: string): T | null => {
  const pattern = new RegExp(
    `<script[^>]+\\bid="${id.replace(/[$]/g, '\\$')}"[^>]*>([\\s\\S]*?)<\\/script>`
  );
  const match = html.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch (e) {
    console.error(`Failed to parse ${id}:`, e);
    return null;
  }
};

/** `__UNIVERSAL_DATA_FOR_REHYDRATION__`, unwrapped to its `__DEFAULT_SCOPE__` contents. */
export const extractUniversalData = (html: string): TikTokUniversalData | null => {
  const data = extractScriptJson<TikTokUniversalData>(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
  if (!data) return null;
  return (data.__DEFAULT_SCOPE__ as TikTokUniversalData) ?? data;
};

/** `SIGI_STATE` / `sigi-persisted-data` — the older page format, still served in some A/B arms. */
export const extractSigiState = (html: string): TikTokSigiState | null =>
  extractScriptJson<TikTokSigiState>(html, 'SIGI_STATE') ??
  extractScriptJson<TikTokSigiState>(html, 'sigi-persisted-data');

/**
 * `__FRONTITY_CONNECT_STATE__` from an `/embed/…` page, narrowed to the route's own entry.
 * The embed app keys its data by request path, so we take the single non-`strategy` entry rather
 * than trying to reconstruct the exact key (trailing slashes and query strings both appear).
 */
export const extractEmbedState = (html: string): TikTokEmbedRouteData | null => {
  const state = extractScriptJson<TikTokFrontityState>(html, '__FRONTITY_CONNECT_STATE__');
  const data = state?.source?.data;
  if (!data) return null;
  for (const [key, value] of Object.entries(data)) {
    if (key === 'strategy' || !value || typeof value !== 'object') continue;
    return value as TikTokEmbedRouteData;
  }
  return null;
};

/** GETs a `www.tiktok.com` page and returns its HTML plus the cookies it set. */
const fetchPage = async (
  url: string
): Promise<{ html: string | null; cookies: string | null; status: number }> => {
  try {
    const response = await withTimeout((signal: AbortSignal) =>
      fetch(url, { headers: browserHeaders(), signal })
    );
    const cookies = collectProxyCookies(response);
    if (!response.ok) {
      console.error('TikTok page fetch failed:', url, response.status);
      return { html: null, cookies, status: response.status };
    }
    return { html: await response.text(), cookies, status: response.status };
  } catch (e) {
    console.error('Error fetching TikTok page:', url, e);
    return { html: null, cookies: null, status: 0 };
  }
};

/** Fetches a page and pulls `__UNIVERSAL_DATA_FOR_REHYDRATION__` out of it. */
export const fetchUniversalData = async (
  path: string
): Promise<TikTokPageResult<TikTokUniversalData>> => {
  const { html, cookies, status } = await fetchPage(`${TIKTOK_WEB_HOST}${path}`);
  if (!html) return { data: null, cookies, status };
  return { data: extractUniversalData(html), cookies, status };
};

/** Fetches an `/embed/…` page and pulls its Frontity route state out of it. */
export const fetchEmbedData = async (
  path: string
): Promise<TikTokPageResult<TikTokEmbedRouteData>> => {
  const { html, cookies, status } = await fetchPage(`${TIKTOK_WEB_HOST}${path}`);
  if (!html) return { data: null, cookies, status };
  const data = extractEmbedState(html);
  // The embed app answers 200 with an `isError` payload for missing/blocked resources.
  if (data?.isError) {
    console.error('TikTok embed returned error', path, data.errorCode, data.errorStatus);
    return { data: null, cookies, status: data.errorStatus ?? 404 };
  }
  return { data, cookies, status };
};

/** Fetches a video page (`/@a/video/:id`) and extracts the item struct from either page format. */
export const fetchVideoPage = async (
  videoId: string
): Promise<TikTokPageResult<TikTokItemInfo>> => {
  const { html, cookies, status } = await fetchPage(`${TIKTOK_WEB_HOST}/@a/video/${videoId}`);
  if (!html) return { data: null, cookies, status };

  const universalData = extractUniversalData(html);
  if (universalData) {
    const videoDetail = universalData['webapp.video-detail'];
    if (videoDetail?.itemInfo?.itemStruct) {
      return { data: videoDetail.itemInfo.itemStruct, cookies, status };
    }

    /* `webapp.reflow.video.detail` is an A/B variant of the same payload, and it has been seen
       with the item struct at three different depths. */
    const reflow = (universalData as Record<string, TikTokReflowVideoDetail | undefined>)[
      'webapp.reflow.video.detail'
    ];
    const reflowItem =
      reflow?.itemInfo?.itemStruct ??
      reflow?.videoDetail?.itemInfo?.itemStruct ??
      reflow?.itemStruct;
    if (reflowItem) {
      return { data: reflowItem, cookies, status };
    }
  }

  const sigiState = extractSigiState(html);
  const items = sigiState?.ItemModule ? Object.values(sigiState.ItemModule) : [];
  if (items.length > 0) {
    return { data: items[0], cookies, status };
  }

  console.error('Could not extract video data from page', videoId);
  return { data: null, cookies, status };
};

/**
 * Fetches a video through the `/embed/v2/:id` player page. Useful as a second opinion when the
 * main page is geo-gated or serves an interstitial — the embed app renders from a different
 * backend and returns a flatter `videoData` shape.
 */
export const fetchEmbedVideo = async (
  videoId: string
): Promise<TikTokPageResult<TikTokEmbedVideoData>> => {
  const { data, cookies, status } = await fetchEmbedData(`/embed/v2/${videoId}`);
  return { data: data?.videoData ?? null, cookies, status };
};

const generateHexString = (length: number): string => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

const generateDeviceId = (): string => {
  const min = 7250000000000000000n;
  const max = 7325099899999994577n;
  const range = max - min;
  const high = BigInt(Math.floor(Math.random() * 0x100000000)) << 32n;
  const low = BigInt(Math.floor(Math.random() * 0x100000000));
  return String(min + ((high | low) % range));
};

/** The device/app query string every `/aweme/v1/…` request carries. */
const buildApiQuery = (): URLSearchParams => {
  // `version_code` is the dotted version zero-padded per segment: 46.7.2 -> 460702.
  const versionCode = TIKTOK_APP_CONFIG.appVersion
    .split('.')
    .map(v => v.padStart(2, '0'))
    .join('');

  return new URLSearchParams({
    device_platform: 'android',
    os: 'android',
    ssmix: 'a',
    _rticket: String(Date.now()),
    cdid: crypto.randomUUID(),
    channel: 'googleplay',
    aid: TIKTOK_APP_CONFIG.aid,
    app_name: TIKTOK_APP_CONFIG.appName,
    version_code: versionCode,
    version_name: TIKTOK_APP_CONFIG.appVersion,
    manifest_version_code: TIKTOK_APP_CONFIG.manifestVersion,
    update_version_code: TIKTOK_APP_CONFIG.manifestVersion,
    ab_version: TIKTOK_APP_CONFIG.appVersion,
    resolution: '1080*2400',
    dpi: '420',
    device_type: TIKTOK_APP_CONFIG.deviceType,
    device_brand: TIKTOK_APP_CONFIG.deviceBrand,
    language: 'en',
    os_api: TIKTOK_APP_CONFIG.osApi,
    os_version: TIKTOK_APP_CONFIG.osVersion,
    ac: 'wifi',
    is_pad: '0',
    current_region: 'US',
    app_type: 'normal',
    sys_region: 'US',
    last_install_time: String(
      Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1036800 + 86400)
    ),
    timezone_name: 'America/New_York',
    residence: 'US',
    app_language: 'en',
    timezone_offset: '-14400',
    host_abi: 'arm64-v8a',
    locale: 'en',
    ac2: 'wifi5g',
    uoo: '1',
    carrier_region: 'US',
    op_region: 'US',
    build_number: TIKTOK_APP_CONFIG.appVersion,
    region: 'US',
    ts: String(Math.floor(Date.now() / 1000)),
    device_id: generateDeviceId(),
    openudid: generateHexString(16)
  });
};

/**
 * Fetches one video from the Android app's API.
 *
 * This is a *fallback only*: unsigned callers get a small budget of requests per IP before TikTok
 * answers `429`, then `200` with an empty body for a long cooldown. `X-Argus` is sent empty because
 * that is what the endpoint tolerates without the native signer (same as yt-dlp).
 */
export const fetchMobileApiVideo = async (videoId: string): Promise<TikTokAwemeDetail | null> => {
  const query = buildApiQuery();
  query.set('aweme_id', videoId);
  const apiUrl = `${TIKTOK_API_HOST}${TIKTOK_API_PATHS.multiAwemeDetail}?${query.toString()}`;

  try {
    const response = await withTimeout((signal: AbortSignal) =>
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'User-Agent': TIKTOK_MOBILE_UA,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `odin_tt=${generateHexString(160)}`,
          'Accept-Encoding': 'gzip, deflate',
          'X-Argus': ''
        },
        body: new URLSearchParams({
          aweme_ids: `[${videoId}]`,
          request_source: '0'
        }).toString(),
        signal
      })
    );

    if (!response.ok) {
      console.error('TikTok mobile API fetch failed:', response.status);
      return null;
    }

    const text = await response.text();
    if (!text) {
      // Signature rejection and rate limiting both look like this.
      console.error('TikTok mobile API returned an empty body (signed-request gate or rate limit)');
      return null;
    }

    const data = JSON.parse(text) as {
      aweme_details?: TikTokAwemeDetail[];
      aweme_detail?: TikTokAwemeDetail;
      status_code?: number;
    };

    if (data.aweme_details && data.aweme_details.length > 0) {
      return data.aweme_details[0];
    }
    if (data.aweme_detail) {
      return data.aweme_detail;
    }
    if (data.status_code) {
      console.error('TikTok mobile API returned error status:', data.status_code);
    }
    return null;
  } catch (e) {
    console.error('Error fetching TikTok mobile API:', e);
    return null;
  }
};

/** Fetches TikTok's public oEmbed document for a post URL. */
export const fetchOEmbed = async (postUrl: string): Promise<TikTokOEmbedResponse | null> => {
  try {
    const response = await withTimeout((signal: AbortSignal) =>
      fetch(`${TIKTOK_WEB_HOST}/oembed?url=${encodeURIComponent(postUrl)}`, {
        headers: { 'User-Agent': generateUserAgent()[0], 'Accept': 'application/json' },
        signal
      })
    );
    if (!response.ok) return null;
    return (await response.json()) as TikTokOEmbedResponse;
  } catch (e) {
    console.error('Error fetching TikTok oEmbed:', e);
    return null;
  }
};
