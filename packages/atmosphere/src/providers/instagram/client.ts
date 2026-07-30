import { withTimeout } from '../../helpers/with-timeout.js';
import {
  INSTAGRAM_ASBD_ID,
  INSTAGRAM_COMMENT_PAGINATION_DOC_ID,
  INSTAGRAM_ORIGIN,
  INSTAGRAM_POST_ROOT_DOC_ID,
  INSTAGRAM_POST_ROOT_FRIENDLY_NAME,
  INSTAGRAM_TIMELINE_QUERY_HASH,
  INSTAGRAM_WEB_APP_ID
} from './constants.js';
import { extractLsdFromHtml } from './extractors.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function readSetCookieNames(headers: Headers): Map<string, string> {
  const map = new Map<string, string>();
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const parts =
    typeof h.getSetCookie === 'function'
      ? h.getSetCookie()
      : (() => {
          const single = headers.get('set-cookie');
          return single ? [single] : [];
        })();
  for (const line of parts) {
    const first = line.split(';')[0]?.trim();
    if (!first?.includes('=')) continue;
    const eq = first.indexOf('=');
    map.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return map;
}

function cookieHeaderToMap(cookie: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i <= 0) continue;
    m.set(t.slice(0, i), t.slice(i + 1));
  }
  return m;
}

function mapToCookieHeader(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeCookieHeader(existing: string | undefined, headers: Headers): string {
  const m = cookieHeaderToMap(existing ?? '');
  for (const [k, v] of readSetCookieNames(headers)) {
    m.set(k, v);
  }
  return mapToCookieHeader(m);
}

export type InstagramSession = {
  cookieHeader: string;
  lsd: string;
  csrf: string;
};

export async function fetchInstagramCsrfToken(
  userAgent: string | undefined
): Promise<string | null> {
  try {
    const res = await withTimeout(signal =>
      fetch(`${INSTAGRAM_ORIGIN}/`, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: {
          'User-Agent': userAgent ?? DEFAULT_UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-IG-App-ID': INSTAGRAM_WEB_APP_ID
        }
      })
    );
    return readSetCookieNames(res.headers).get('csrftoken') ?? null;
  } catch (err) {
    console.error('[instagram] fetchInstagramCsrfToken failed', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined
    });
    return null;
  }
}

/**
 * One logged-out navigation to the homepage: cookies (`csrftoken`, `mid`, `ig_did`, …)
 * plus LSD from `__eqmc` (required for Polaris GraphQL, matching yt-dlp).
 */
export async function fetchInstagramSession(
  userAgent: string | undefined
): Promise<InstagramSession | null> {
  try {
    const res = await withTimeout(signal =>
      fetch(`${INSTAGRAM_ORIGIN}/`, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: {
          'User-Agent': userAgent ?? DEFAULT_UA,
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      })
    );
    const html = await res.text();
    const cookies = readSetCookieNames(res.headers);
    const cookieHeader = mapToCookieHeader(cookies);
    const csrf = cookies.get('csrftoken') ?? '';
    const lsd = extractLsdFromHtml(html) ?? '';
    if (!cookieHeader || !csrf || !lsd) {
      console.error('[instagram] fetchInstagramSession missing cookies/csrf/lsd', {
        hasCookies: Boolean(cookieHeader),
        hasCsrf: Boolean(csrf),
        hasLsd: Boolean(lsd)
      });
      // Still return partial session when cookies exist — HTML scrape can succeed without LSD.
      if (!cookieHeader) return null;
      return { cookieHeader, lsd, csrf };
    }
    return { cookieHeader, lsd, csrf };
  } catch (err) {
    console.error('[instagram] fetchInstagramSession failed', {
      message: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

/**
 * @deprecated Prefer {@link fetchInstagramSession}. Cookie-only helper kept for callers that
 * only need a Cookie header string.
 */
export async function fetchInstagramLoggedOutSession(
  userAgent: string | undefined
): Promise<string> {
  const session = await fetchInstagramSession(userAgent);
  return session?.cookieHeader ?? '';
}

export type FetchInstagramHtmlOptions = {
  /** `Cookie` header from {@link fetchInstagramSession} (semicolon-separated). */
  cookies?: string;
};

export async function fetchInstagramHtml(
  path: string,
  userAgent: string | undefined,
  options?: FetchInstagramHtmlOptions
): Promise<{ ok: boolean; status: number; html: string; finalUrl?: string }> {
  try {
    const cookieHeader = options?.cookies;
    const headers: Record<string, string> = {
      'User-Agent': userAgent ?? DEFAULT_UA,
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${INSTAGRAM_ORIGIN}/`,
      'X-IG-App-ID': INSTAGRAM_WEB_APP_ID
    };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'same-origin';
      headers['Sec-Fetch-User'] = '?1';
      headers['Upgrade-Insecure-Requests'] = '1';
    }
    const res = await withTimeout(signal =>
      fetch(`${INSTAGRAM_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers
      })
    );
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, finalUrl: res.url };
  } catch (err) {
    console.error('[instagram] fetchInstagramHtml failed', {
      path,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined
    });
    return { ok: false, status: 500, html: '' };
  }
}

/**
 * Accessibility / CSRF warm-up used by yt-dlp before Polaris GraphQL.
 * `status: "ok"` indicates the logged-out API will grant content access.
 */
export async function fetchRulingForContent(params: {
  mediaId: string;
  session: InstagramSession;
  userAgent: string | undefined;
  refererPath: string;
}): Promise<{ ok: boolean; status: number; granted: boolean; json: unknown | null }> {
  try {
    const url = new URL(`${INSTAGRAM_ORIGIN}/api/v1/web/get_ruling_for_content/`);
    url.searchParams.set('content_type', 'MEDIA');
    url.searchParams.set('target_id', params.mediaId);
    const res = await withTimeout(signal =>
      fetch(url.toString(), {
        method: 'GET',
        signal,
        headers: {
          'User-Agent': params.userAgent ?? DEFAULT_UA,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': INSTAGRAM_ORIGIN,
          'Referer': `${INSTAGRAM_ORIGIN}${params.refererPath.startsWith('/') ? params.refererPath : `/${params.refererPath}`}`,
          'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
          'X-ASBD-ID': INSTAGRAM_ASBD_ID,
          'X-IG-WWW-Claim': '0',
          'Cookie': params.session.cookieHeader
        }
      })
    );
    params.session.cookieHeader = mergeCookieHeader(params.session.cookieHeader, res.headers);
    const nextCsrf = readSetCookieNames(res.headers).get('csrftoken');
    if (nextCsrf) params.session.csrf = nextCsrf;
    if (!res.ok) {
      return { ok: false, status: res.status, granted: false, json: null };
    }
    const json = (await res.json()) as { status?: string };
    return {
      ok: true,
      status: res.status,
      granted: json?.status === 'ok',
      json
    };
  } catch (err) {
    console.error('[instagram] fetchRulingForContent failed', {
      message: err instanceof Error ? err.message : String(err)
    });
    return { ok: false, status: 500, granted: false, json: null };
  }
}

/**
 * Polaris logged-out post GraphQL (`PolarisLoggedOutDesktopWWWPostRootContentQuery`).
 * yt-dlp requires TLS browser impersonation for this call; without it Instagram often
 * returns HTML. Callers should fall back to HTML `data-sjs` extraction on failure.
 */
export async function fetchPolarisPostGraphql(params: {
  mediaId: string;
  session: InstagramSession;
  userAgent: string | undefined;
  refererUrl: string;
}): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  if (!params.session.lsd) {
    return { ok: false, status: 0, json: null };
  }
  const body = new URLSearchParams({
    lsd: params.session.lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: INSTAGRAM_POST_ROOT_FRIENDLY_NAME,
    server_timestamps: 'true',
    variables: JSON.stringify({ media_id: params.mediaId }),
    doc_id: INSTAGRAM_POST_ROOT_DOC_ID
  });
  try {
    const headers: Record<string, string> = {
      'User-Agent': params.userAgent ?? DEFAULT_UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': INSTAGRAM_ORIGIN,
      'Referer': params.refererUrl,
      'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
      'X-ASBD-ID': INSTAGRAM_ASBD_ID,
      'X-IG-WWW-Claim': '0',
      'X-FB-Friendly-Name': INSTAGRAM_POST_ROOT_FRIENDLY_NAME,
      'X-FB-LSD': params.session.lsd,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': params.session.cookieHeader
    };
    if (params.session.csrf) {
      headers['X-CSRFToken'] = params.session.csrf;
    }
    const res = await withTimeout(signal =>
      fetch(`${INSTAGRAM_ORIGIN}/api/graphql`, {
        method: 'POST',
        signal,
        headers,
        body: body.toString()
      })
    );
    params.session.cookieHeader = mergeCookieHeader(params.session.cookieHeader, res.headers);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, json: null };
    }
    // Without TLS impersonation Instagram often returns an HTML document here.
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { ok: false, status: res.status, json: null };
    }
    try {
      return { ok: true, status: res.status, json: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, status: res.status, json: null };
    }
  } catch (err) {
    console.error('[instagram] fetchPolarisPostGraphql failed', {
      message: err instanceof Error ? err.message : String(err)
    });
    return { ok: false, status: 500, json: null };
  }
}

export async function fetchWebProfileInfo(
  username: string,
  userAgent: string | undefined
): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  try {
    const url = new URL(`${INSTAGRAM_ORIGIN}/api/v1/users/web_profile_info/`);
    url.searchParams.set('username', username);
    const res = await withTimeout(signal =>
      fetch(url, {
        method: 'GET',
        signal,
        headers: {
          'User-Agent': userAgent ?? DEFAULT_UA,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `${INSTAGRAM_ORIGIN}/${encodeURIComponent(username)}/`,
          'X-IG-App-ID': INSTAGRAM_WEB_APP_ID
        }
      })
    );
    if (!res.ok) {
      return { ok: false, status: res.status, json: null };
    }
    return { ok: true, status: res.status, json: (await res.json()) as unknown };
  } catch (err) {
    console.error('[instagram] fetchWebProfileInfo failed', {
      username,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined
    });
    return { ok: false, status: 500, json: null };
  }
}

export async function fetchTimelineGraphqlPage(params: {
  userId: string;
  first: number;
  after: string | null;
  userAgent: string | undefined;
  refererUsername: string;
  csrfToken: string | null;
}): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  const variables = {
    id: params.userId,
    first: params.first,
    ...(params.after ? { after: params.after } : {})
  };
  const url = new URL(`${INSTAGRAM_ORIGIN}/graphql/query/`);
  url.searchParams.set('query_hash', INSTAGRAM_TIMELINE_QUERY_HASH);
  url.searchParams.set('variables', JSON.stringify(variables));
  try {
    const headers: Record<string, string> = {
      'User-Agent': params.userAgent ?? DEFAULT_UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${INSTAGRAM_ORIGIN}/${encodeURIComponent(params.refererUsername)}/`,
      'Origin': INSTAGRAM_ORIGIN,
      'X-IG-App-ID': INSTAGRAM_WEB_APP_ID
    };
    if (params.csrfToken) {
      headers['X-CSRFToken'] = params.csrfToken;
    }
    const res = await withTimeout(signal =>
      fetch(url.toString(), {
        method: 'GET',
        signal,
        headers
      })
    );
    if (!res.ok) {
      return { ok: false, status: res.status, json: null };
    }
    return { ok: true, status: res.status, json: (await res.json()) as unknown };
  } catch (err) {
    console.error('[instagram] fetchTimelineGraphqlPage failed', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined
    });
    return { ok: false, status: 500, json: null };
  }
}

export async function fetchCommentPageGraphql(params: {
  mediaId: string;
  after: string | null;
  first: number;
  sortOrder: 'popular' | 'recent';
  refererPath: string;
  userAgent: string | undefined;
  csrfToken: string | null;
  lsd: string;
}): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  const variables: Record<string, unknown> = {
    media_id: params.mediaId,
    first: params.first,
    last: null,
    before: null,
    sort_order: params.sortOrder,
    __relay_internal__pv__PolarisIsLoggedInrelayprovider: false
  };
  if (params.after) {
    variables.after = params.after;
  }
  const body = new URLSearchParams({
    lsd: params.lsd,
    fb_api_req_friendly_name: 'PolarisPostCommentsPaginationQuery',
    variables: JSON.stringify(variables),
    doc_id: INSTAGRAM_COMMENT_PAGINATION_DOC_ID
  });
  try {
    const headers: Record<string, string> = {
      'User-Agent': params.userAgent ?? DEFAULT_UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': INSTAGRAM_ORIGIN,
      'Referer': `${INSTAGRAM_ORIGIN}${params.refererPath.startsWith('/') ? params.refererPath : `/${params.refererPath}`}`,
      'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
      'X-FB-LSD': params.lsd
    };
    if (params.csrfToken) {
      headers['X-CSRFToken'] = params.csrfToken;
    }
    const res = await withTimeout(signal =>
      fetch(`${INSTAGRAM_ORIGIN}/api/graphql`, {
        method: 'POST',
        signal,
        headers,
        body: body.toString()
      })
    );
    if (!res.ok) {
      return { ok: false, status: res.status, json: null };
    }
    return { ok: true, status: res.status, json: (await res.json()) as unknown };
  } catch (err) {
    console.error('[instagram] fetchCommentPageGraphql failed', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined
    });
    return { ok: false, status: 500, json: null };
  }
}
