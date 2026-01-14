import { Context } from 'hono';
import { fetchTikTokVideo } from '../../../providers/tiktok/conversation';
import { generateUserAgent } from '../../../helpers/useragent';
import { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Allowed TikTok CDN domains
 */
const ALLOWED_TIKTOK_DOMAINS = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktok.com',
  'bytedance.com',
  'bytedance.net',
  'musical.ly',
  'byteimg.com'
];

/**
 * Validates that a hostname is from an allowed domain
 * Rejects IP addresses, empty hostnames, and invalid domains
 * Only accepts exact domain matches or proper subdomains
 *
 * @param hostname - The hostname to validate
 * @param allowedDomains - Array of allowed domains
 * @returns true if the hostname is valid, false otherwise
 */
function isAllowedDomain(hostname: string, allowedDomains: string[]): boolean {
  if (!hostname) {
    return false;
  }

  // Normalize hostname to lowercase
  const normalizedHostname = hostname.toLowerCase();

  // Check against each allowed domain
  for (const allowedDomain of allowedDomains) {
    const normalizedAllowedDomain = allowedDomain.toLowerCase();

    // Exact match
    if (normalizedHostname === normalizedAllowedDomain) {
      return true;
    }

    // Subdomain match (must end with .allowedDomain)
    if (normalizedHostname.endsWith('.' + normalizedAllowedDomain)) {
      return true;
    }
  }

  return false;
}

/**
 * TikTok video proxy endpoint
 * Fetches TikTok videos with proper headers/cookies and streams them back
 * This is needed because TikTok's CDN often 403s direct requests without proper auth
 *
 * Some useful tips:
 * 1. Don't send Sec-Fetch-* headers - they can trigger bot detection
 * 2. The tt_chain_token cookie must be sent to the CDN hostname
 * 3. Referer should be the actual video page URL
 * 4. Keep headers minimal and consistent
 *
 * Usage: /proxy?url=<encoded_video_url>&cookies=<encoded_cookies>&videoId=<id>
 */
export const tiktokVideoProxy = async (c: Context) => {
  const videoUrl = c.req.query('url');
  const cookies = c.req.query('cookies');
  const videoId = c.req.query('videoId');

  if (!videoUrl) {
    return c.json({ error: 'Missing url parameter' }, 400);
  }

  try {
    // Validate the URL is from TikTok's CDN
    const url = new URL(videoUrl);
    if (!isAllowedDomain(url.hostname, ALLOWED_TIKTOK_DOMAINS)) {
      return c.json({ error: 'Invalid video URL - must be from TikTok CDN' }, 400);
    }

    console.log('Proxying TikTok video:', url.hostname + url.pathname.substring(0, 50) + '...');

    // Decode cookies if they were URL-encoded
    const decodedCookies = cookies ? decodeURIComponent(cookies.replace(/\+/g, ' ')) : '';

    // Get the video ID for Referer (fallback to a generic path if not provided)
    const refererUrl = videoId
      ? `https://www.tiktok.com/@_/video/${videoId}`
      : 'https://www.tiktok.com/';

    // Try fetching with multiple strategies
    let response = await tryFetchWithStrategies(videoUrl, decodedCookies, refererUrl, c);

    // If we get a 403 and have a videoId, try to fetch fresh video data
    if (response.status === 403 && videoId) {
      console.log('Got 403, attempting to fetch fresh video data for:', videoId);
      try {
        const freshData = await fetchTikTokVideo(videoId);
        if (freshData.video && freshData.code === 200) {
          // Extract video URL from fresh data
          const freshUrl = extractVideoUrlFromData(freshData.video);
          if (freshUrl && freshUrl !== videoUrl) {
            console.log('Got fresh video URL, retrying...');
            const freshCookies = freshData.cookies || decodedCookies;
            response = await tryFetchWithStrategies(freshUrl, freshCookies, refererUrl, c);
          }
        }
      } catch (e) {
        console.error('Failed to fetch fresh video data:', e);
      }
    }

    if (!response.ok && response.status !== 206) {
      console.error('TikTok CDN error:', response.status, await response.text().catch(() => ''));
      return c.json(
        { error: `TikTok CDN returned ${response.status}` },
        response.status as ContentfulStatusCode
      );
    }

    // Build response headers
    const headers = new Headers();

    // Pass through important headers
    const contentType = response.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);

    const contentLength = response.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) headers.set('Content-Range', contentRange);

    const acceptRanges = response.headers.get('Accept-Ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    // Add CORS headers for embeds
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // Cache for 1 hour (TikTok URLs expire, so don't cache too long)
    headers.set('Cache-Control', 'public, max-age=3600');

    // Stream the video response
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error('TikTok proxy error:', error);
    return c.json({ error: 'Failed to proxy video' }, 500);
  }
};

/**
 * Try fetching video with multiple strategies
 * Attempts different header configurations to maximize success rate
 */
async function tryFetchWithStrategies(
  videoUrl: string,
  cookies: string,
  refererUrl: string,
  c: Context
): Promise<Response> {
  const rangeHeader = c.req.header('Range');
  const [userAgent, secChUa] = generateUserAgent();

  // For other providers, we are usually better off with the full headers
  // But for TikTok, it usually fails if you include that many headers. No idea how that makes sense.
  const minimalHeaders: Record<string, string> = {
    'User-Agent': userAgent,
    'sec-ch-ua': secChUa,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': refererUrl
  };

  // Add cookies if provided
  if (cookies) {
    minimalHeaders['Cookie'] = cookies;
  }

  // Add range header if client is seeking
  if (rangeHeader) {
    minimalHeaders['Range'] = rangeHeader;
  }

  console.log('Strategy 1: Minimal headers');
  let response = await fetch(videoUrl, { headers: minimalHeaders });
  console.log('Response status:', response.status);

  if (response.ok || response.status === 206) {
    return response;
  }

  // Strategy 2: Add Accept-Encoding
  if (response.status === 403) {
    console.log('Strategy 2: Adding Accept-Encoding');
    const headersWithEncoding = {
      ...minimalHeaders,
      'Accept-Encoding': 'identity;q=1, *;q=0'
    };
    response = await fetch(videoUrl, { headers: headersWithEncoding });
    console.log('Response status:', response.status);

    if (response.ok || response.status === 206) {
      return response;
    }
  }

  // Strategy 3: Origin header (some CDNs require this)
  if (response.status === 403) {
    console.log('Strategy 3: Adding Origin header');
    const headersWithOrigin = {
      ...minimalHeaders,
      Origin: 'https://www.tiktok.com'
    };
    response = await fetch(videoUrl, { headers: headersWithOrigin });
    console.log('Response status:', response.status);

    if (response.ok || response.status === 206) {
      return response;
    }
  }

  // Strategy 4: Fallback to no cookies (in case cookies are the problem)
  if (response.status === 403 && cookies) {
    console.log('Strategy 4: Trying without cookies');
    const headersNoCookies = { ...minimalHeaders };
    delete headersNoCookies['Cookie'];
    response = await fetch(videoUrl, { headers: headersNoCookies });
    console.log('Response status:', response.status);
  }

  return response;
}

/**
 * Extract video URL from TikTok video data
 * Handles both web API and mobile API formats
 */
function extractVideoUrlFromData(video: TikTokItemInfo | TikTokAwemeDetail): string | null {
  // Web API format
  if ('createTime' in video && video.video?.playAddr) {
    return video.video.playAddr;
  }

  // Mobile API format
  if ('aweme_id' in video || 'create_time' in video) {
    const awemeVideo = video as TikTokAwemeDetail;
    // Try bit_rate first for best quality
    const bitRates = awemeVideo.video?.bit_rate;
    if (bitRates && bitRates.length > 0) {
      const sorted = [...bitRates].sort((a, b) => b.bit_rate - a.bit_rate);
      const urls = sorted[0]?.play_addr?.url_list;
      if (urls && urls.length > 0) {
        // Prefer non-maliva URLs
        const regionalUrl = urls.find(
          (u: string) =>
            u.includes('.us.') || u.includes('.eu.') || u.includes('useast') || u.includes('uswest')
        );
        return regionalUrl || urls[0];
      }
    }
    // Fallback to play_addr
    const playUrls = awemeVideo.video?.play_addr?.url_list;
    if (playUrls && playUrls.length > 0) {
      return playUrls[0];
    }
  }

  return null;
}

/**
 * Handle CORS preflight requests
 */
export const tiktokVideoProxyOptions = async (_c: Context) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '86400'
    }
  });
};
