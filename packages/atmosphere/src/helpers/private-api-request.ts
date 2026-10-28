import type { InstagramCredentials } from '../types/proxy-credentials.js';
import { fetchSameOriginHttps } from './same-origin-https-fetch.js';
import { withTimeout } from './with-timeout.js';

/** HTTP statuses where another account is worth trying: auth/checkpoint/rate limit. */
const ROTATE_STATUSES = new Set([401, 403, 429]);

export type PrivateApiResult = {
  ok: boolean;
  /** 0 when no account was available at all (proxy not configured). */
  status: number;
  json: unknown | null;
  /** Set when a request actually went out, for logging. */
  accountUsed?: string;
};

/** Session cookies for one proxy account. Threads authenticates off the same `sessionid`. */
export function cookieHeaderFor(account: InstagramCredentials): string {
  const parts = [`sessionid=${account.sessionId}`];
  if (account.userId) parts.push(`ds_user_id=${account.userId}`);
  if (account.csrfToken) parts.push(`csrftoken=${account.csrfToken}`);
  if (account.mid) parts.push(`mid=${account.mid}`);
  if (account.deviceId) parts.push(`ig_did=${account.deviceId}`);
  return parts.join('; ');
}

/**
 * Walks `accounts` until one answers, rotating on auth/rate-limit statuses, a non-JSON body
 * (a logged-out session gets an HTML login page) and a 200 `{ status: 'fail' }` soft failure.
 *
 * The caller builds the URL and the headers because those are the parts that genuinely differ
 * per surface; everything after the request is sent is identical, which is why the body-read
 * timeout had to be fixed twice (#2396 and #2401).
 */
export async function privateApiRequest(options: {
  accounts: InstagramCredentials[];
  url: string;
  headersFor: (account: InstagramCredentials) => Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  /** Prefixes the console lines, e.g. `instagram` or `threads`. */
  logTag: string;
  /** The path as the caller wants it logged, after any placeholder substitution. */
  logPath: string;
}): Promise<PrivateApiResult> {
  const { accounts, url, headersFor, method, body, logTag, logPath } = options;

  let last: PrivateApiResult = { ok: false, status: 500, json: null };
  for (const account of accounts) {
    const headers = headersFor(account);
    if (method === 'POST') {
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
        const response = await fetchSameOriginHttps(url, {
          method: method ?? 'GET',
          headers,
          body: method === 'POST' ? (body ?? '') : undefined,
          signal
        });
        if (!response.ok) {
          return { response, text: '', parsed: null, parseFailed: false };
        }
        const read = await response.text();
        try {
          return { response, text: read, parsed: JSON.parse(read) as unknown, parseFailed: false };
        } catch {
          return { response, text: read, parsed: null, parseFailed: true };
        }
      });
      res = timed.response;
      text = timed.text;
      parsed = timed.parsed;
      parseFailed = timed.parseFailed;
    } catch (err) {
      console.error(`[${logTag}] private API request threw`, {
        path: logPath,
        account: account.username,
        message: err instanceof Error ? err.message : String(err)
      });
      last = { ok: false, status: 500, json: null, accountUsed: account.username };
      continue;
    }

    if (!res.ok) {
      console.error(`[${logTag}] private API request failed`, {
        path: logPath,
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
      console.error(`[${logTag}] private API returned non-JSON (session likely invalid)`, {
        path: logPath,
        account: account.username
      });
      last = { ok: false, status: res.status, json: null, accountUsed: account.username };
      continue;
    }
    if (parseFailed) {
      last = { ok: false, status: res.status, json: null, accountUsed: account.username };
      continue;
    }
    // The private API answers 200 with `{ status: 'fail' }` for soft failures (checkpoint,
    // spam block, feedback_required). Rotate rather than surfacing an empty page as success.
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { status?: unknown }).status === 'fail'
    ) {
      console.error(`[${logTag}] private API returned status=fail`, {
        path: logPath,
        account: account.username
      });
      last = { ok: false, status: 502, json: parsed, accountUsed: account.username };
      continue;
    }
    return { ok: true, status: res.status, json: parsed, accountUsed: account.username };
  }
  return last;
}
