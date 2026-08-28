const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Cap so a same-origin loop cannot burn the request timeout on hop after hop. */
const MAX_SAME_ORIGIN_REDIRECTS = 5;

/** Next hop if Location is https and same-origin as `from`; otherwise null (do not follow). */
export function sameOriginHttpsRedirectUrl(from: string, location: string | null): string | null {
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

/**
 * `fetch` that does not auto-follow redirects. workerd rejects `redirect: 'error'`
 * ("won't be implemented"); `manual` plus same-origin HTTPS checks keep session cookies
 * off cross-origin Location hops.
 */
export async function fetchSameOriginHttps(url: string, init: RequestInit): Promise<Response> {
  const requestInit: RequestInit = { ...init, redirect: 'manual' };
  let requestUrl = url;
  let response = await fetch(requestUrl, requestInit);
  for (let hop = 0; hop < MAX_SAME_ORIGIN_REDIRECTS; hop++) {
    if (!REDIRECT_STATUSES.has(response.status)) break;
    const nextUrl = sameOriginHttpsRedirectUrl(requestUrl, response.headers.get('Location'));
    if (!nextUrl) break;
    requestUrl = nextUrl;
    response = await fetch(requestUrl, requestInit);
  }
  return response;
}
