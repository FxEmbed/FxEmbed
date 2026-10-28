import {
  cookieHeaderFor,
  privateApiRequest,
  type PrivateApiResult
} from '../../helpers/private-api-request.js';
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

export type ThreadsPrivateApiResult = PrivateApiResult;

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

  return privateApiRequest({
    accounts,
    url: url.toString(),
    headersFor: account =>
      threadsProxyHeaders(account, { referer: options.referer, acceptHint: options.acceptHint }),
    method: options.method,
    body: options.body,
    logTag: 'threads',
    logPath: resolvedPath
  });
}
