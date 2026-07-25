import {
  fetchInstagramHtml,
  fetchInstagramSession,
  fetchPolarisPostGraphql,
  fetchRulingForContent
} from './client.js';
import {
  extractPolarisProductFromGraphqlJson,
  extractPostMediaItem,
  type PolarisMediaBundle
} from './extractors.js';
import { instagramShortcodeToPk } from './shortcode.js';

export type InstagramWebInfoPage =
  | {
      ok: true;
      status: number;
      html: string;
      item: Record<string, unknown>;
      pathUsed: string;
      comments: PolarisMediaBundle['comments'];
      source: 'polaris-graphql' | 'polaris-html' | 'web-info-html';
    }
  | {
      ok: false;
      status: number;
      html: string;
      item: null;
      pathUsed: null;
      comments: null;
      source: null;
    };

function isLoginRedirect(finalUrl: string | undefined): boolean {
  if (!finalUrl) return false;
  try {
    const path = new URL(finalUrl).pathname;
    return path.startsWith('/accounts/login') || path === '/';
  } catch {
    return false;
  }
}

/**
 * Fetches logged-out Instagram post media using the yt-dlp Polaris path:
 *
 * 1. Homepage session (cookies + LSD from `__eqmc`)
 * 2. Optional `get_ruling_for_content` warm-up
 * 3. Try Polaris GraphQL (`PolarisLoggedOutDesktopWWWPostRootContentQuery`)
 * 4. Fall back to permalink HTML and extract `xig_polaris_media.if_not_gated_logged_out`
 *    (reliable without TLS impersonation — yt-dlp's #17113 fallback)
 * 5. Legacy `xdt_api__v1__media__shortcode__web_info` HTML fallback
 */
export async function fetchInstagramPageWithWebInfo(
  shortcode: string,
  userAgent: string | undefined
): Promise<InstagramWebInfoPage> {
  const session = await fetchInstagramSession(userAgent);
  const cookies = session?.cookieHeader ?? '';
  const htmlOpts = cookies ? { cookies } : undefined;

  let mediaId: string | null = null;
  try {
    mediaId = String(instagramShortcodeToPk(shortcode));
  } catch {
    mediaId = null;
  }

  // Prefer GraphQL when we have a full session; ignore failures (common without TLS impersonation).
  if (session && mediaId && session.lsd) {
    const refererPath = `/p/${encodeURIComponent(shortcode)}/`;
    const ruling = await fetchRulingForContent({
      mediaId,
      session,
      userAgent,
      refererPath
    });
    // yt-dlp only sends CSRF when ruling grants access; we still try GraphQL either way.
    if (ruling.granted || session.csrf) {
      const gql = await fetchPolarisPostGraphql({
        mediaId,
        session,
        userAgent,
        refererUrl: `https://www.instagram.com${refererPath}`
      });
      const bundle = gql.ok ? extractPolarisProductFromGraphqlJson(gql.json) : null;
      if (bundle?.product) {
        return {
          ok: true,
          status: gql.status,
          html: '',
          item: bundle.product,
          pathUsed: refererPath,
          comments: bundle.comments,
          source: 'polaris-graphql'
        };
      }
    }
  }

  const paths = [
    `/p/${encodeURIComponent(shortcode)}/`,
    `/reel/${encodeURIComponent(shortcode)}/`
  ] as const;

  let last: { ok: boolean; status: number; html: string; finalUrl?: string } = {
    ok: false,
    status: 500,
    html: ''
  };
  let bestAttempt: { ok: boolean; status: number; html: string; finalUrl?: string } | null = null;
  const attempts: {
    path: string;
    httpOk: boolean;
    status: number;
    hasPolaris: boolean;
    hasWebInfo: boolean;
    loginRedirect: boolean;
  }[] = [];

  for (const path of paths) {
    const r = await fetchInstagramHtml(path, userAgent, htmlOpts);
    last = r;
    const loginRedirect = isLoginRedirect(r.finalUrl);
    const item = r.ok && !loginRedirect ? extractPostMediaItem(r.html) : null;
    const looksPolaris =
      Boolean(item) &&
      (typeof item!.__typename === 'string'
        ? item!.__typename.startsWith('XIGPolaris')
        : typeof item!.media_type === 'number' || Array.isArray(item!.video_versions));
    attempts.push({
      path,
      httpOk: r.ok,
      status: r.status,
      hasPolaris: Boolean(item && looksPolaris),
      hasWebInfo: Boolean(item && !looksPolaris),
      loginRedirect
    });

    if (r.ok && !loginRedirect && item) {
      return {
        ok: true,
        status: r.status,
        html: r.html,
        item,
        pathUsed: path,
        comments: null,
        source: looksPolaris ? 'polaris-html' : 'web-info-html'
      };
    }

    const hasBody = Boolean(r.html && r.html.length > 0);
    if (hasBody) {
      if (!bestAttempt) {
        bestAttempt = r;
      } else {
        const b = bestAttempt;
        if (r.ok && !b.ok) {
          bestAttempt = r;
        } else if (r.ok && b.ok) {
          bestAttempt = r;
        } else if (!r.ok && !b.ok && r.status > b.status) {
          bestAttempt = r;
        }
      }
    }
  }

  const out = bestAttempt ?? last;
  console.error('[instagram] no polaris/web_info media after GraphQL + /p + /reel', {
    shortcode,
    mediaId,
    hasSession: Boolean(session),
    attempts
  });
  return {
    ok: false,
    status: out.status,
    html: out.html,
    item: null,
    pathUsed: null,
    comments: null,
    source: null
  };
}
