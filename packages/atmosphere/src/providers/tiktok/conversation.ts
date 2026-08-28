import { withTimeout } from '../../helpers/with-timeout.js';
import { generateUserAgent } from '../../helpers/user-agent.js';
import type { SocialThread } from '../../types/api-status.js';
import { fetchEmbedVideo, fetchMobileApiVideo, fetchVideoPage } from './client.js';
import { TIKTOK_SHORT_HOST, TIKTOK_WEB_HOST } from './constants.js';
import { buildAPITikTokStatus, buildAPITikTokStatusFromEmbedVideo } from './processor.js';

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
 * - https://www.tiktok.com/@username/photo/1234567890
 * - https://www.tiktok.com/video/1234567890
 * - https://m.tiktok.com/v/1234567890
 * - https://www.tiktok.com/t/ZMhxxxxxxx/ (another short format that may appear after redirect)
 */
export const parseVideoUrl = (url: string): ResolvedTikTokUrl | null => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    /* @username/video/id and @username/photo/id (image slideshows use /photo/). */
    const userVideoMatch = pathname.match(/\/@([^/]+)\/(?:video|photo)\/(\d+)/);
    if (userVideoMatch) {
      return {
        videoId: userVideoMatch[2]
      };
    }

    // Match /video/id format (no username)
    const videoMatch = pathname.match(/\/(?:video|photo)\/(\d+)/);
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
 * Turns anything that identifies a post into a numeric video id: a bare id, a `/t/` or
 * `vm.tiktok.com` short code, or a full post URL.
 */
export const resolveTikTokVideoId = async (input: string): Promise<string | null> => {
  const value = input.trim();
  if (!value) return null;
  if (!isShortCode(value)) return value;

  const parsed = parseVideoUrl(
    /^https?:\/\//i.test(value) ? value : `${TIKTOK_WEB_HOST}/${value.replace(/^\/+/, '')}`
  );
  if (parsed) return parsed.videoId;

  const resolved = await resolveShortUrl(value);
  return resolved?.videoId ?? null;
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
  if (webResult.data) {
    return {
      video: webResult.data,
      author: webResult.data.author ?? null,
      cookies: webResult.cookies,
      code: 200
    };
  }

  /* Then the app's API. It returns richer video formats, but unsigned callers only get a handful
     of requests per IP before TikTok answers with empty bodies — so it is a fallback, not a
     primary. See `constants.ts`. */
  const mobileData = await fetchMobileApiVideo(videoId);
  if (mobileData) {
    return {
      video: mobileData,
      author: mobileData.author ?? null,
      cookies: webResult.cookies, // Use cookies from web fetch attempt
      code: 200
    };
  }

  /* Last resort: the embed player page, rendered by a different backend, which sometimes answers
     when the main page serves an interstitial. */
  const embedResult = await fetchEmbedVideo(videoId);
  if (embedResult.data?.itemInfos?.id) {
    return {
      video: null,
      embed: embedResult.data,
      author: null,
      cookies: webResult.cookies ?? embedResult.cookies,
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
 * Construct a TikTok video thread
 * @param id - The TikTok video ID, `/t/` short code, or full post URL
 * @param proxyBase - Optional base URL for the video proxy (e.g., https://fxtwitter.com)
 *                    If provided, video URLs will be routed through the proxy
 * @param userAgent - Optional user agent string for Telegram detection and size optimization
 */
export const constructTikTokVideo = async (
  id: string,
  proxyBase: string | null = null,
  userAgent?: string
): Promise<SocialThread> => {
  const notFound: SocialThread = {
    status: null,
    thread: [],
    author: null,
    code: 404
  };

  const videoId = await resolveTikTokVideoId(id);
  if (!videoId) {
    return notFound;
  }

  const video = await fetchTikTokVideo(videoId);
  if (video.code !== 200) {
    return notFound;
  }

  const status = video.video
    ? await buildAPITikTokStatus(video.video, video.cookies, proxyBase, userAgent)
    : video.embed
      ? buildAPITikTokStatusFromEmbedVideo(video.embed, video.cookies, proxyBase)
      : null;

  if (!status) {
    return notFound;
  }

  return {
    status: status,
    thread: [],
    author: status.author,
    code: 200
  };
};
