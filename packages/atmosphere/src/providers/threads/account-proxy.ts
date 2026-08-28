import { withTimeout } from '../../helpers/with-timeout.js';
import { getInstagramProviderEnv } from '../instagram-runtime.js';
import {
  hasInstagramAccountProxy,
  resolveInstagramAccounts,
  type InstagramRequestContext
} from '../instagram/account-proxy.js';
import { INSTAGRAM_ASBD_ID } from '../instagram/constants.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import {
  THREADS_ANDROID_APP_ID,
  THREADS_ANDROID_CAPABILITIES,
  THREADS_ANDROID_USER_AGENT,
  THREADS_API_V1,
  THREADS_ORIGIN
} from './constants.js';

const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Per-request Threads context. Threads accounts *are* Instagram accounts, so the proxy pool is the
 * Instagram one — this is the same `{ credentialKey }` shape, aliased so callers in the Threads
 * provider don't have to reach into the Instagram module.
 */
export type ThreadsRequestContext = InstagramRequestContext;

/** True when this deployment can proxy Threads through a logged-in Instagram account. */
export const hasThreadsAccountProxy = hasInstagramAccountProxy;

/**
 * Threads reuses the Instagram credential pool wholesale: one `sessionid` authenticates both
 * surfaces, and only the client fingerprint differs (see {@link threadsProxyHeaders}).
 */
export const resolveThreadsAccounts = resolveInstagramAccounts;

function cookieHeaderFor(account: InstagramCredentials): string {
  const parts = [`sessionid=${account.sessionId}`];
  if (account.userId) parts.push(`ds_user_id=${account.userId}`);
  if (account.csrfToken) parts.push(`csrftoken=${account.csrfToken}`);
  if (account.mid) parts.push(`mid=${account.mid}`);
  if (account.deviceId) parts.push(`ig_did=${account.deviceId}`);
  return parts.join('; ');
}

/**
 * Headers for one proxied Threads request. Same session cookies as the Instagram proxy, but with
 * the Barcelona app id — `text_feed/…` and `fbsearch/text_app/…` are only served to it. `android`
 * accounts get the decompiled app's fingerprint; `web` accounts keep a browser fingerprint with
 * `threads.com` as the origin, matching where such a `sessionid` was harvested.
 */
export function threadsProxyHeaders(
  account: InstagramCredentials,
  options: { referer?: string; acceptHint?: string } = {}
): Record<string, string> {
  const android = account.platform === 'android';
  const headers: Record<string, string> = {
    'User-Agent': android ? THREADS_ANDROID_USER_AGENT : WEB_USER_AGENT,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': THREADS_ANDROID_APP_ID,
    'X-IG-Capabilities': THREADS_ANDROID_CAPABILITIES,
    'X-IG-WWW-Claim': '0',
    // `BarcelonaProfileNetworkSource` stamps this on every feed read.
    'X-IG-Accept-Hint': options.acceptHint ?? 'feed',
    'Cookie': cookieHeaderFor(account)
  };
  if (android) {
    headers['X-IG-Connection-Type'] = 'WIFI';
    if (account.androidDeviceId) {
      headers['X-IG-Device-ID'] = account.androidDeviceId;
    }
  } else {
    headers['X-ASBD-ID'] = INSTAGRAM_ASBD_ID;
    headers['Origin'] = THREADS_ORIGIN;
    headers['Referer'] = options.referer ?? `${THREADS_ORIGIN}/`;
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-origin';
  }
  if (account.csrfToken) {
    headers['X-CSRFToken'] = account.csrfToken;
  }
  return headers;
}

/** HTTP statuses where another account is worth trying: auth/checkpoint/rate limit. */
const ROTATE_STATUSES = new Set([401, 403, 429]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Cap so a same-origin loop cannot burn the request timeout on hop after hop. */
const MAX_SAME_ORIGIN_REDIRECTS = 5;

/** Next hop if Location is https and same-origin as `from`; otherwise null (do not follow). */
function sameOriginHttpsRedirectUrl(from: string, location: string | null): string | null {
  if (!location) return null;
  try {
    const current = new URL(from);
    const next = new URL(location, from);
    if (next.protocol !== 'https:') return null;
    if (next.origin !== current.origin) return null;
    return next.href;
  } catch {
    return null;
  }
}

export type ThreadsPrivateApiResult = {
  ok: boolean;
  /** 0 when no account was available at all (proxy not configured). */
  status: number;
  json: unknown | null;
  /** Set when a request actually went out, for logging. */
  accountUsed?: string;
};

/**
 * Calls an `i.instagram.com/api/v1/…` endpoint as the Threads app, rotating accounts on
 * auth/rate-limit failures. Returns `{ ok: false, status: 0 }` when no proxy account is configured
 * so callers can fall back to their logged-out path (or report 501).
 *
 * `pathParams` fills the `{user_id}` / `{post_id}` placeholders the app's own route templates use;
 * anything left over is sent as a query parameter, which is how the app's request builder behaves.
 */
export async function threadsPrivateApiRequest(
  path: string,
  ctx: ThreadsRequestContext | undefined,
  options: {
    pathParams?: Record<string, string>;
    query?: Record<string, string | number | boolean | undefined | null>;
    method?: 'GET' | 'POST';
    body?: string;
    referer?: string;
    acceptHint?: string;
    accounts?: InstagramCredentials[];
  } = {}
): Promise<ThreadsPrivateApiResult> {
  const accounts = options.accounts ?? (await resolveThreadsAccounts(ctx));
  if (!accounts.length) {
    return { ok: false, status: 0, json: null };
  }

  let resolvedPath = path;
  for (const [key, value] of Object.entries(options.pathParams ?? {})) {
    resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
  }

  const { apiRoot } = getInstagramProviderEnv();
  const url = new URL(
    `${apiRoot}${THREADS_API_V1}${resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`}`
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(
      key,
      typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
    );
  }

  let last: ThreadsPrivateApiResult = { ok: false, status: 500, json: null };
  for (const account of accounts) {
    const headers = threadsProxyHeaders(account, {
      referer: options.referer,
      acceptHint: options.acceptHint
    });
    if (options.method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    let res: Response;
    let text: string;
    let parsed: unknown;
    let parseFailed: boolean;
    try {
      // Fetch can resolve on headers; keep body read + JSON.parse inside the timeout so a
      // stalled body aborts and rotates instead of hanging the request.
      const timed = await withTimeout(async signal => {
        const init: RequestInit = {
          method: options.method ?? 'GET',
          headers,
          body: options.method === 'POST' ? (options.body ?? '') : undefined,
          signal,
          // workerd rejects redirect: 'error' ("won't be implemented"). manual plus
          // same-origin HTTPS checks keep session cookies off cross-origin Location hops.
          redirect: 'manual'
        };
        let requestUrl = url.toString();
        let response = await fetch(requestUrl, init);
        for (let hop = 0; hop < MAX_SAME_ORIGIN_REDIRECTS; hop++) {
          if (!REDIRECT_STATUSES.has(response.status)) break;
          const nextUrl = sameOriginHttpsRedirectUrl(requestUrl, response.headers.get('Location'));
          if (!nextUrl) break;
          requestUrl = nextUrl;
          response = await fetch(requestUrl, init);
        }
        if (!response.ok) {
          return { response, text: '', parsed: null, parseFailed: false };
        }
        const body = await response.text();
        try {
          return { response, text: body, parsed: JSON.parse(body) as unknown, parseFailed: false };
        } catch {
          return { response, text: body, parsed: null, parseFailed: true };
        }
      });
      res = timed.response;
      text = timed.text;
      parsed = timed.parsed;
      parseFailed = timed.parseFailed;
    } catch (err) {
      console.error('[threads] private API request threw', {
        path: resolvedPath,
        account: account.username,
        message: err instanceof Error ? err.message : String(err)
      });
      last = { ok: false, status: 500, json: null, accountUsed: account.username };
      continue;
    }

    if (!res.ok) {
      console.error('[threads] private API request failed', {
        path: resolvedPath,
        account: account.username,
        status: res.status
      });
      last = { ok: false, status: res.status, json: null, accountUsed: account.username };
      if (ROTATE_STATUSES.has(res.status)) continue;
      return last;
    }

    const trimmed = text.trim();
    // A logged-out or checkpointed session gets an HTML login page rather than JSON.
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      console.error('[threads] private API returned non-JSON (session likely invalid)', {
        path: resolvedPath,
        account: account.username
      });
      last = { ok: false, status: res.status, json: null, accountUsed: account.username };
      continue;
    }
    if (parseFailed) {
      last = { ok: false, status: res.status, json: null, accountUsed: account.username };
      continue;
    }
    // The private API answers 200 with `{ status: 'fail' }` for soft failures (spam block,
    // feedback_required). Rotate rather than surfacing an empty page as success.
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { status?: unknown }).status === 'fail'
    ) {
      console.error('[threads] private API returned status=fail', {
        path: resolvedPath,
        account: account.username
      });
      last = { ok: false, status: 502, json: parsed, accountUsed: account.username };
      continue;
    }
    return { ok: true, status: res.status, json: parsed, accountUsed: account.username };
  }
  return last;
}
