import { withTimeout } from '../../helpers/utils';
import { generateUserAgent } from '../../helpers/useragent';
import { SocialThread } from '../../types/types';
import { buildAPITikTokStatus } from './processor';

const TIKTOK_WEB_HOST = 'https://www.tiktok.com';
const TIKTOK_SHORT_HOST = 'https://vm.tiktok.com';
const TIKTOK_API_HOST = 'https://api16-normal-c-useast1a.tiktokv.com';

/**
 * Result from resolving a short URL
 */
export interface ResolvedTikTokUrl {
  videoId: string;
}

/**
 * Result from fetching a TikTok video page, includes cookies for video proxy
 */
export interface TikTokFetchResult {
  video: TikTokItemInfo | null;
  cookies: string | null;
}

/**
 * Resolve a TikTok short URL to get the video ID
 * Handles both vm.tiktok.com and www.tiktok.com/t/ shorthand formats
 * These URLs redirect to the full video URL
 *
 * @param shortCode - Either just the code (e.g., "ZP8yxgATu") or a full shorthand URL
 */
export const resolveShortUrl = async (shortCode: string): Promise<ResolvedTikTokUrl | null> => {
  // Determine if we need to construct a URL or if one was provided
  let shortUrl: string;

  if (shortCode.startsWith('http://') || shortCode.startsWith('https://')) {
    // Full URL provided
    shortUrl = shortCode;
  } else if (shortCode.includes('/')) {
    // Relative path provided (e.g., "/t/ZP8yxgATu/")
    shortUrl = `${TIKTOK_WEB_HOST}${shortCode.startsWith('/') ? shortCode : '/' + shortCode}`;
  } else {
    // Just a code, use vm.tiktok.com (legacy format)
    shortUrl = `${TIKTOK_SHORT_HOST}/${shortCode}`;
  }

  console.log('Resolving TikTok short URL:', shortUrl);

  try {
    const [userAgent, secChUa] = generateUserAgent();
    // Use redirect: 'manual' to capture the redirect location without following it
    const response = await withTimeout((signal: AbortSignal) =>
      fetch(shortUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': userAgent,
          'sec-ch-ua': secChUa,
          'Accept': 'text/html'
        },
        redirect: 'manual',
        signal
      })
    );

    // Check for redirect (301, 302, 303, 307, 308)
    const location = response.headers.get('location');
    if (location) {
      return parseVideoUrl(location);
    }

    // If no redirect header, try following the redirect
    if (response.status >= 300 && response.status < 400) {
      // Some servers don't include location in HEAD, try GET
      const getResponse = await withTimeout((signal: AbortSignal) =>
        fetch(shortUrl, {
          headers: {
            'User-Agent': userAgent,
            'sec-ch-ua': secChUa,
            'Accept': 'text/html'
          },
          redirect: 'follow',
          signal
        })
      );
      return parseVideoUrl(getResponse.url);
    }

    // If response is OK, the URL might have resolved fully
    if (response.ok) {
      return parseVideoUrl(response.url);
    }

    console.error('Failed to resolve short URL:', response.status);
    return null;
  } catch (e) {
    console.error('Error resolving TikTok short URL:', e);
    return null;
  }
};

/**
 * Parse a TikTok video URL to extract video ID
 * Supports formats:
 * - https://www.tiktok.com/@username/video/1234567890
 * - https://www.tiktok.com/video/1234567890
 * - https://m.tiktok.com/v/1234567890
 * - https://www.tiktok.com/t/ZMhxxxxxxx/ (another short format that may appear after redirect)
 */
export const parseVideoUrl = (url: string): ResolvedTikTokUrl | null => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Match @username/video/id format
    const userVideoMatch = pathname.match(/\/@([^/]+)\/video\/(\d+)/);
    if (userVideoMatch) {
      return {
        videoId: userVideoMatch[2]
      };
    }

    // Match /video/id format (no username)
    const videoMatch = pathname.match(/\/video\/(\d+)/);
    if (videoMatch) {
      return {
        videoId: videoMatch[1]
      };
    }

    // Match /v/id format (mobile)
    const mobileMatch = pathname.match(/\/v\/(\d+)/);
    if (mobileMatch) {
      return {
        videoId: mobileMatch[1]
      };
    }

    // Check if video ID is in query parameters (some redirects include it there)
    const itemId = urlObj.searchParams.get('item_id');
    if (itemId) {
      return {
        videoId: itemId
      };
    }

    console.error('Could not parse video URL:', url);
    return null;
  } catch (e) {
    console.error('Error parsing TikTok URL:', e);
    return null;
  }
};

/* App configuration - must be kept in sync */
const TIKTOK_APP_CONFIG = {
  appName: 'musical_ly',
  appVersion: '35.1.3',
  manifestVersion: '2023501030',
  // aid: 1233 = musical_ly, 1180 = trill, 1128 = aweme, 0 = universal
  aid: '1233',
  deviceType: 'Pixel 8',
  deviceBrand: 'Google',
  osVersion: '14',
  osApi: '34',
  buildId: 'UP1A.231005.007'
};

/* User agent mimicking the TikTok Android app - must match app config */
const TIKTOK_MOBILE_UA = `com.zhiliaoapp.musically/${TIKTOK_APP_CONFIG.manifestVersion} (Linux; U; Android ${TIKTOK_APP_CONFIG.osVersion}; en_US; ${TIKTOK_APP_CONFIG.deviceType}; Build/${TIKTOK_APP_CONFIG.buildId}; Cronet/58.0.2991.0)`;

/**
 * Generate random hex string of specified length
 */
const generateHexString = (length: number): string => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

/**
 * Extract JSON data from SIGI_STATE script tag (older TikTok pages)
 */
const extractSigiState = (html: string): TikTokSigiState | null => {
  const sigiRegex = /<script[^>]+\bid="(?:SIGI_STATE|sigi-persisted-data)"[^>]*>([^<]+)<\/script>/;
  const match = html.match(sigiRegex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as TikTokSigiState;
  } catch (e) {
    console.error('Failed to parse SIGI_STATE:', e);
    return null;
  }
};

/**
 * Extract JSON data from __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag (newer TikTok pages)
 */
const extractUniversalData = (html: string): TikTokUniversalData | null => {
  const universalRegex =
    /<script[^>]+\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/;
  const match = html.match(universalRegex);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]) as TikTokUniversalData;
    // Return the __DEFAULT_SCOPE__ contents if available
    return data.__DEFAULT_SCOPE__ ?? data;
  } catch (e) {
    console.error('Failed to parse UNIVERSAL_DATA:', e);
    return null;
  }
};

/**
 * Parse Set-Cookie header and extract all cookie name=value pairs
 * Handles the complex format with multiple cookies and attributes
 */
const parseSetCookieHeader = (setCookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>();

  // Set-Cookie headers can contain multiple cookies separated by commas
  // but dates also contain commas, so we need to be careful
  // The safest approach is to split on the pattern ", <cookie_name>="
  const parts = setCookieHeader.split(/,\s*(?=[a-zA-Z_][a-zA-Z0-9_]*=)/);

  for (const part of parts) {
    // Get just the first segment before the first semicolon (the actual cookie)
    const cookiePart = part.split(';')[0].trim();
    const eqIndex = cookiePart.indexOf('=');
    if (eqIndex > 0) {
      const name = cookiePart.substring(0, eqIndex);
      const value = cookiePart.substring(eqIndex + 1);
      cookies.set(name, value);
    }
  }

  return cookies;
};

/**
 * Fetch video page and extract embedded data
 * Also captures cookies needed for video proxy
 *
 * Key cookie: tt_chain_token - required for video CDN authentication
 */
const fetchVideoPage = async (videoId: string): Promise<TikTokFetchResult> => {
  const url = `${TIKTOK_WEB_HOST}/@a/video/${videoId}`;

  console.log('Fetching TikTok page:', url);

  try {
    const [userAgent, secChUa] = generateUserAgent();
    const response = await withTimeout((signal: AbortSignal) =>
      fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'sec-ch-ua': secChUa,
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'no-cache'
        },
        signal
      })
    );

    // Capture cookies from TikTok's response (needed for video proxy)
    // The critical cookie is tt_chain_token - it's referenced in video URLs as tk=tt_chain_token
    const setCookieHeader = response.headers.get('set-cookie');
    let cookies: string | null = null;
    if (setCookieHeader) {
      const parsedCookies = parseSetCookieHeader(setCookieHeader);

      // Log the cookies we found (for debugging)
      console.log('Parsed cookies:', Array.from(parsedCookies.keys()).join(', '));

      // tt_chain_token is the most important cookie for video CDN auth
      const ttChainToken = parsedCookies.get('tt_chain_token');
      if (ttChainToken) {
        console.log('Found tt_chain_token');
      }

      // Build cookie string for the proxy - include important cookies
      // Priority: tt_chain_token, sid_tt, sessionid
      const importantCookies = [
        'tt_chain_token',
        'sid_tt',
        'sessionid',
        'tt_csrf_token',
        'odin_tt'
      ];
      const cookieParts: string[] = [];
      for (const name of importantCookies) {
        const value = parsedCookies.get(name);
        if (value) {
          cookieParts.push(`${name}=${value}`);
        }
      }

      // If we didn't get any important cookies, include all of them
      if (cookieParts.length === 0) {
        for (const [name, value] of parsedCookies) {
          cookieParts.push(`${name}=${value}`);
        }
      }

      cookies = cookieParts.join('; ');
      console.log(
        'Captured TikTok cookies:',
        cookies.substring(0, 100) + (cookies.length > 100 ? '...' : '')
      );
    }

    if (!response.ok) {
      console.error('TikTok page fetch failed:', response.status);
      return { video: null, cookies };
    }

    const html = await response.text();

    // Diagnostic logging - check what's in the response
    console.log('HTML length:', html.length);
    console.log('Contains UNIVERSAL_DATA:', html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__'));
    console.log(
      'Contains SIGI_STATE:',
      html.includes('SIGI_STATE') || html.includes('sigi-persisted-data')
    );
    console.log('Contains video ID:', html.includes(videoId));
    console.log('Contains "login":', html.toLowerCase().includes('login'));
    console.log('Contains "captcha":', html.toLowerCase().includes('captcha'));
    console.log('Contains "verify":', html.toLowerCase().includes('verify'));
    console.log('Title match:', html.match(/<title>([^<]*)<\/title>/)?.[1] || 'no title found');

    // Try UNIVERSAL_DATA first (newer pages)
    const universalData = extractUniversalData(html);
    console.log('universalData parsed:', universalData !== null);
    if (universalData) {
      console.log('universalData keys:', Object.keys(universalData));

      // Try standard structure: webapp.video-detail
      const videoDetail = universalData['webapp.video-detail'];
      console.log('Has webapp.video-detail:', !!videoDetail);
      if (videoDetail?.itemInfo?.itemStruct) {
        console.log('Extracted video data from UNIVERSAL_DATA (webapp.video-detail)');
        return { video: videoDetail.itemInfo.itemStruct, cookies };
      }

      // Try reflow structure: webapp.reflow.video.detail (A/B test variant)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reflowDetail = (universalData as Record<string, any>)['webapp.reflow.video.detail'];
      console.log('Has webapp.reflow.video.detail:', !!reflowDetail);
      if (reflowDetail) {
        console.log('reflowDetail keys:', Object.keys(reflowDetail));
        // Direct itemInfo structure
        if (reflowDetail?.itemInfo?.itemStruct) {
          console.log('Extracted video data from UNIVERSAL_DATA (webapp.reflow.video.detail)');
          return { video: reflowDetail.itemInfo.itemStruct as TikTokItemInfo, cookies };
        }
        // Nested videoDetail structure
        if (reflowDetail?.videoDetail?.itemInfo?.itemStruct) {
          console.log('Extracted video data from UNIVERSAL_DATA (reflow nested)');
          return { video: reflowDetail.videoDetail.itemInfo.itemStruct as TikTokItemInfo, cookies };
        }
        // Maybe itemStruct is directly on reflowDetail
        if (reflowDetail?.itemStruct) {
          console.log('Extracted video data from UNIVERSAL_DATA (reflow direct itemStruct)');
          return { video: reflowDetail.itemStruct as TikTokItemInfo, cookies };
        }
      }
    }

    // Fall back to SIGI_STATE (older pages)
    const sigiState = extractSigiState(html);
    console.log('sigiState parsed:', sigiState !== null);
    if (sigiState) {
      console.log('sigiState keys:', Object.keys(sigiState));
      console.log('Has ItemModule:', !!sigiState.ItemModule);
      if (sigiState.ItemModule) {
        const items = Object.values(sigiState.ItemModule);
        console.log('ItemModule count:', items.length);
        if (items.length > 0) {
          console.log('Extracted video data from SIGI_STATE');
          return { video: items[0], cookies };
        }
      }
    }

    // If we still failed, try to find what script tags exist
    const scriptIds =
      html.match(/id="([^"]+)"/g)?.filter(m => m.includes('STATE') || m.includes('DATA')) || [];
    console.log('Script IDs containing STATE/DATA:', scriptIds);

    console.error('Could not extract video data from page');
    return { video: null, cookies };
  } catch (e) {
    console.error('Error fetching TikTok page:', e);
    return { video: null, cookies: null };
  }
};

/**
 * Build device ID for mobile API requests
 */
const generateDeviceId = (): string => {
  const min = 7250000000000000000n;
  const max = 7325099899999994577n;
  const range = max - min;
  const high = BigInt(Math.floor(Math.random() * 0x100000000)) << 32n;
  const low = BigInt(Math.floor(Math.random() * 0x100000000));
  const random = (high | low) % range;
  return String(min + random);
};

/**
 * Build mobile API query parameters
 * Key params that we need: openudid, proper aid, synced versions
 */
const buildApiQuery = (videoId: string, deviceId: string): URLSearchParams => {
  // Version code is formatted as XXYYZZ from X.Y.Z (e.g., 35.1.3 -> 350103)
  const versionParts = TIKTOK_APP_CONFIG.appVersion.split('.');
  const versionCode = versionParts.map(v => v.padStart(2, '0')).join('');

  const params = new URLSearchParams({
    aweme_id: videoId,
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
    device_id: deviceId,
    openudid: generateHexString(16)
  });

  return params;
};

/**
 * Fetch video data using mobile API (most comprehensive data)
 * - Uses POST to multi/aweme/detail (more reliable than GET)
 * - odin_tt cookie (160 hex chars) for API authentication
 * - Proper User-Agent matching app version
 * - openudid parameter
 * - X-Argus header (empty string, but required)
 */
const fetchMobileApi = async (videoId: string): Promise<TikTokAwemeDetail | null> => {
  const deviceId = generateDeviceId();
  const query = buildApiQuery(videoId, deviceId);

  const apiUrl = `${TIKTOK_API_HOST}/aweme/v1/multi/aweme/detail/?${query.toString()}`;

  // Generate odin_tt cookie - 160 random hex characters
  const odinTt = generateHexString(160);

  console.log('Fetching TikTok mobile API (POST multi/aweme/detail)');

  try {
    // POST body with aweme_ids array
    const postData = new URLSearchParams({
      aweme_ids: `[${videoId}]`,
      request_source: '0'
    });

    const response = await withTimeout((signal: AbortSignal) =>
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'User-Agent': TIKTOK_MOBILE_UA,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `odin_tt=${odinTt}`,
          'Accept-Encoding': 'gzip, deflate',
          'X-Argus': '' // yt-dlp sets this as an empty string, not sure if it's required or not
        },
        body: postData.toString(),
        signal
      })
    );

    console.log('Mobile API response status:', response.status);

    if (!response.ok) {
      console.error('TikTok mobile API fetch failed:', response.status);
      const errorText = await response.text();
      console.error('Error response:', errorText.substring(0, 500));
      return null;
    }

    const text = await response.text();
    console.log('Response length:', text.length);
    console.log('Response preview:', text.substring(0, 500));

    // Parse the response
    const data = JSON.parse(text) as {
      aweme_details?: TikTokAwemeDetail[];
      aweme_detail?: TikTokAwemeDetail;
      status_code?: number;
    };

    // Try aweme_details array first (multi endpoint)
    if (data.aweme_details && data.aweme_details.length > 0) {
      console.log('Extracted video data from mobile API (multi endpoint)');
      return data.aweme_details[0];
    }

    // Fallback to single aweme_detail
    if (data.aweme_detail) {
      console.log('Extracted video data from mobile API (single endpoint)');
      return data.aweme_detail;
    }

    // Check for error status codes in the response
    if (data.status_code !== undefined && data.status_code !== 0) {
      console.error('TikTok API returned error status:', data.status_code);
    }

    return null;
  } catch (e) {
    console.error('Error fetching TikTok mobile API:', e);
    return null;
  }
};

/**
 * Main function to fetch TikTok video data
 * Tries multiple methods in order of preference
 * Returns cookies needed for video proxy
 */
export const fetchTikTokVideo = async (videoId: string): Promise<TikTokThread> => {
  console.log(`Fetching TikTok video ${videoId}`);

  // Try web page extraction first (most reliable for basic data)
  const webResult = await fetchVideoPage(videoId);
  if (webResult.video) {
    return {
      video: webResult.video,
      author: webResult.video.author ?? null,
      cookies: webResult.cookies,
      code: 200
    };
  }

  // Try mobile API as fallback (may have better video URLs)
  // Note: mobile API doesn't give us cookies for the video proxy
  const mobileData = await fetchMobileApi(videoId);
  if (mobileData) {
    return {
      video: mobileData,
      author: mobileData.author ?? null,
      cookies: webResult.cookies, // Use cookies from web fetch attempt
      code: 200
    };
  }

  // If all else fails, return 404
  console.error('All TikTok fetch methods failed');
  return {
    video: null,
    author: null,
    cookies: null,
    code: 404
  };
};

/**
 * Fetch TikTok video from a short URL (vm.tiktok.com)
 * Resolves the short URL first, then fetches the video data
 */
export const fetchTikTokVideoFromShortUrl = async (shortCode: string): Promise<TikTokThread> => {
  console.log(`Resolving TikTok short URL: ${shortCode}`);

  const resolved = await resolveShortUrl(shortCode);
  if (!resolved) {
    console.error('Failed to resolve short URL');
    return {
      video: null,
      author: null,
      cookies: null,
      code: 404
    };
  }

  console.log(`Resolved to video ${resolved.videoId}`);
  return fetchTikTokVideo(resolved.videoId);
};

/**
 * Check if a string looks like a TikTok short code (vs a numeric video ID)
 * Short codes are alphanumeric and typically 8-12 characters
 * Video IDs are purely numeric and typically 19 digits
 */
export const isShortCode = (identifier: string): boolean => {
  // If it contains any non-numeric characters, it's a short code
  return !/^\d+$/.test(identifier);
};

/**
 * Construct a TikTok video thread
 * @param id - The TikTok video ID
 * @param proxyBase - Optional base URL for the video proxy (e.g., https://fxtwitter.com)
 *                    If provided, video URLs will be routed through the proxy
 * @param userAgent - Optional user agent string for Telegram detection and size optimization
 */
export const constructTikTokVideo = async (
  id: string,
  proxyBase: string | null = null,
  userAgent?: string
): Promise<SocialThread> => {
  const video = await fetchTikTokVideo(id);
  if (video.code !== 200) {
    return {
      status: null,
      thread: [],
      author: null,
      code: 404
    };
  }
  const status = await buildAPITikTokStatus(video.video!, video.cookies, proxyBase, userAgent);
  return {
    status: status,
    thread: [],
    author: status.author,
    code: 200
  };
};
