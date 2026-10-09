import {
  cookieHeaderFor,
  privateApiRequest,
  type PrivateApiResult
} from '../../helpers/private-api-request.js';
import { getInstagramProviderEnv, getInstagramProxyRuntime } from '../instagram-runtime.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import {
  INSTAGRAM_ANDROID_APP_ID,
  INSTAGRAM_ANDROID_CAPABILITIES,
  INSTAGRAM_ANDROID_USER_AGENT,
  INSTAGRAM_API_V1,
  INSTAGRAM_ASBD_ID,
  INSTAGRAM_ORIGIN,
  INSTAGRAM_WEB_APP_ID
} from './constants.js';

const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Per-request Instagram context. `credentialKey` is the worker's `CREDENTIAL_KEY` binding; without
 * it (or without a bundled credential blob) every Instagram path stays logged-out.
 */
export type InstagramRequestContext = {
  userAgent?: string;
  credentialKey?: string;
};

/**
 * True when this deployment *can* proxy Instagram through a logged-in account: a credential key is
 * configured and the worker bundle carries an encrypted credential blob. Whether that blob actually
 * contains Instagram accounts is only known after decryption — see {@link resolveInstagramAccounts}.
 */
export function hasInstagramAccountProxy(ctx: InstagramRequestContext | undefined): boolean {
  return Boolean(
    ctx?.credentialKey?.trim() && getInstagramProxyRuntime().hasBundledEncryptedCredentials()
  );
}

/** Decrypts (once) and returns the proxy accounts in shuffled order; empty when unavailable. */
export async function resolveInstagramAccounts(
  ctx: InstagramRequestContext | undefined
): Promise<InstagramCredentials[]> {
  if (!hasInstagramAccountProxy(ctx)) return [];
  const rt = getInstagramProxyRuntime();
  try {
    await rt.initCredentials(ctx?.credentialKey);
  } catch (err) {
    console.error('[instagram] credential init failed', {
      message: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
  if (!rt.hasInstagramProxyAccounts()) {
    return [];
  }
  return rt.getShuffledInstagramAccounts().filter(a => Boolean(a?.sessionId));
}

/**
 * Headers for one proxied request. `android` accounts get the app fingerprint read out of the
 * decompiled APK; `web` accounts get the desktop-browser fingerprint that matches a `sessionid`
 * harvested from www.instagram.com.
 */
export function instagramProxyHeaders(
  account: InstagramCredentials,
  options: { referer?: string } = {}
): Record<string, string> {
  const android = account.platform === 'android';
  const headers: Record<string, string> = {
    'User-Agent': android ? INSTAGRAM_ANDROID_USER_AGENT : WEB_USER_AGENT,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': android ? INSTAGRAM_ANDROID_APP_ID : INSTAGRAM_WEB_APP_ID,
    'X-IG-Capabilities': INSTAGRAM_ANDROID_CAPABILITIES,
    'X-IG-WWW-Claim': '0',
    'Cookie': cookieHeaderFor(account)
  };
  if (android) {
    headers['X-IG-Connection-Type'] = 'WIFI';
    if (account.androidDeviceId) {
      headers['X-IG-Device-ID'] = account.androidDeviceId;
    }
  } else {
    headers['X-ASBD-ID'] = INSTAGRAM_ASBD_ID;
    headers['Origin'] = INSTAGRAM_ORIGIN;
    headers['Referer'] = options.referer ?? `${INSTAGRAM_ORIGIN}/`;
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-origin';
  }
  if (account.csrfToken) {
    headers['X-CSRFToken'] = account.csrfToken;
  }
  return headers;
}

export type InstagramPrivateApiResult = PrivateApiResult;

/**
 * Calls an `i.instagram.com/api/v1/…` endpoint through a proxy account, rotating accounts on
 * auth/rate-limit failures and on a 200 `{ status: 'fail' }` body (checkpoint / spam block).
 * Returns `{ ok: false, status: 0 }` when no proxy account is configured so callers can fall
 * back to their logged-out path.
 */
export async function instagramPrivateApiRequest(
  path: string,
  ctx: InstagramRequestContext | undefined,
  options: {
    query?: Record<string, string | number | undefined>;
    method?: 'GET' | 'POST';
    body?: string;
    referer?: string;
    accounts?: InstagramCredentials[];
  } = {}
): Promise<InstagramPrivateApiResult> {
  const accounts = options.accounts ?? (await resolveInstagramAccounts(ctx));
  if (!accounts.length) {
    return { ok: false, status: 0, json: null };
  }

  const { apiRoot } = getInstagramProviderEnv();
  const url = new URL(`${apiRoot}${INSTAGRAM_API_V1}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return privateApiRequest({
    accounts,
    url: url.toString(),
    headersFor: account => instagramProxyHeaders(account, { referer: options.referer }),
    method: options.method,
    body: options.body,
    logTag: 'instagram',
    logPath: path
  });
}
