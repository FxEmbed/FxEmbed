/**
 * Extract JSON payloads from Instagram Comet `data-sjs` script tags and locate Relay blobs by key.
 *
 * Logged-out post pages (2026+) embed media under `xig_polaris_media.if_not_gated_logged_out`
 * (yt-dlp InstagramIE). Older pages used `xdt_api__v1__media__shortcode__web_info`.
 */

const TARGET_KEYS = new Set([
  'xig_polaris_media',
  'xdt_api__v1__media__shortcode__web_info',
  'xdt_api__v1__media__media_id__comments__connection',
  'xdt_api__v1__profile_timeline'
]);

export function extractDataSjsScriptBodies(html: string): string[] {
  const out: string[] = [];
  /**
   * Instagram/Meta JSON in these tags escape `</script>` as `<\/script>`, so a real closing tag
   * will not appear inside the payload. Do not relax this to allow raw `</script>` without a proper
   * HTML/JSON parser or the match can end too early.
   */
  /** `type` / `data-sjs` attribute order varies; both must be present on the same tag. */
  const re =
    /<script(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bdata-sjs)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

const COLLECT_MAX_DEPTH = 64;

export function collectDeepByKey(
  obj: unknown,
  key: string,
  out: unknown[],
  currentDepth = 0,
  seen: WeakSet<object> = new WeakSet()
): void {
  if (currentDepth >= COLLECT_MAX_DEPTH) return;
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectDeepByKey(item, key, out, currentDepth + 1, seen);
    }
    return;
  }
  if (seen.has(obj)) return;
  seen.add(obj);
  const rec = obj as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(rec, key)) {
    out.push(rec[key]);
  }
  for (const v of Object.values(rec)) {
    collectDeepByKey(v, key, out, currentDepth + 1, seen);
  }
}

/**
 * LSD from homepage `__eqmc` JSON (`{"l":"..."}`), preferred by yt-dlp for logged-out GraphQL.
 */
export function extractLsdFromEqmc(html: string): string | null {
  const m = html.match(/<script\b[^>]*\bid=["']__eqmc["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  try {
    const eqmc = JSON.parse(m[1]) as { l?: unknown };
    if (typeof eqmc.l === 'string' && eqmc.l.length > 0) return eqmc.l;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * LSD (loaded state / doc token) for GraphQL `lsd` / `X-FB-LSD` from `__eqmc` or embedded Relay JSON.
 */
export function extractLsdFromHtml(html: string): string | null {
  const fromEqmc = extractLsdFromEqmc(html);
  if (fromEqmc) return fromEqmc;

  const tokenArray = html.match(/\["LSD",\[\],\{"token":"([^"]+)"/);
  if (tokenArray?.[1]) return tokenArray[1];

  for (const raw of extractDataSjsScriptBodies(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const k of ['LSD', 'lsd'] as const) {
      const acc: unknown[] = [];
      collectDeepByKey(parsed, k, acc);
      for (const v of acc) {
        if (typeof v === 'string' && v.length > 0) return v;
        if (v && typeof v === 'object' && 'token' in (v as object)) {
          const t = (v as { token?: unknown }).token;
          if (typeof t === 'string' && t.length > 0) return t;
        }
      }
    }
  }
  return null;
}

export function findRelayBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];
  for (const raw of extractDataSjsScriptBodies(html)) {
    try {
      blobs.push(JSON.parse(raw) as unknown);
    } catch {
      /* skip malformed */
    }
  }
  return blobs;
}

export function extractFromHtmlByKeys(html: string, keys: string[]): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  for (const k of keys) map.set(k, []);
  const blobs = findRelayBlobs(html);
  for (const root of blobs) {
    for (const k of keys) {
      const acc = map.get(k)!;
      collectDeepByKey(root, k, acc);
    }
  }
  return map;
}

export type PolarisMediaBundle = {
  /** Product media under `if_not_gated_logged_out` (same shape yt-dlp `_extract_product` expects). */
  product: Record<string, unknown>;
  /** Sibling comments connection on `xig_polaris_media`, when present. */
  comments: { edges?: unknown[]; page_info?: Record<string, unknown> } | null;
  /** Outer polaris node (pk/code/gating). */
  polaris: Record<string, unknown>;
};

/**
 * Logged-out post payload introduced mid-2026 (`xig_polaris_media`).
 * Returns the ungated product media used for video/photo URLs.
 */
export function extractPolarisMediaBundle(html: string): PolarisMediaBundle | null {
  const map = extractFromHtmlByKeys(html, ['xig_polaris_media']);
  const vals = map.get('xig_polaris_media') ?? [];
  for (const v of vals) {
    if (!v || typeof v !== 'object') continue;
    const polaris = v as Record<string, unknown>;
    const product = polaris.if_not_gated_logged_out;
    if (!product || typeof product !== 'object') continue;
    const commentsRaw = polaris.comments_connection;
    const comments =
      commentsRaw && typeof commentsRaw === 'object'
        ? (commentsRaw as { edges?: unknown[]; page_info?: Record<string, unknown> })
        : null;
    return {
      product: product as Record<string, unknown>,
      comments,
      polaris
    };
  }
  return null;
}

/** Convenience: product media only. */
export function extractPolarisProductMedia(html: string): Record<string, unknown> | null {
  return extractPolarisMediaBundle(html)?.product ?? null;
}

/** Legacy shortcode web_info (pre-polaris). Kept as a fallback. */
export function extractShortcodeWebInfo(html: string): Record<string, unknown> | null {
  const map = extractFromHtmlByKeys(html, ['xdt_api__v1__media__shortcode__web_info']);
  const vals = map.get('xdt_api__v1__media__shortcode__web_info') ?? [];
  for (const v of vals) {
    if (v && typeof v === 'object') {
      const items = (v as Record<string, unknown>).items;
      if (Array.isArray(items) && items.length > 0) {
        return (items[0] as Record<string, unknown>) ?? null;
      }
    }
  }
  return null;
}

/**
 * Prefer polaris product media; fall back to legacy web_info `items[0]`.
 */
export function extractPostMediaItem(html: string): Record<string, unknown> | null {
  return extractPolarisProductMedia(html) ?? extractShortcodeWebInfo(html);
}

export function extractCommentsConnection(html: string): {
  edges?: unknown[];
  page_info?: Record<string, unknown>;
} | null {
  const polaris = extractPolarisMediaBundle(html);
  if (polaris?.comments) return polaris.comments;

  const map = extractFromHtmlByKeys(html, ['xdt_api__v1__media__media_id__comments__connection']);
  const vals = map.get('xdt_api__v1__media__media_id__comments__connection') ?? [];
  for (const v of vals) {
    if (v && typeof v === 'object') {
      return v as { edges?: unknown[]; page_info?: Record<string, unknown> };
    }
  }
  return null;
}

/** Optional related grid on post pages (mixed items). */
export function extractProfileTimelineSnippet(html: string): unknown[] | null {
  const map = extractFromHtmlByKeys(html, ['xdt_api__v1__profile_timeline']);
  const vals = map.get('xdt_api__v1__profile_timeline') ?? [];
  for (const v of vals) {
    if (v && typeof v === 'object') {
      const items = (v as Record<string, unknown>).items;
      if (Array.isArray(items)) return items;
    }
  }
  return null;
}

export function hasUsefulRelayData(html: string): boolean {
  if (extractPolarisProductMedia(html) || extractShortcodeWebInfo(html)) return true;
  const map = extractFromHtmlByKeys(html, [...TARGET_KEYS]);
  for (const [, arr] of map) {
    if (arr.length > 0) return true;
  }
  return false;
}

/**
 * Parse `mediaPresentationDuration` from an Instagram DASH MPD string (e.g. `PT0H0M4.967S`).
 */
export function parseDashPresentationDurationSec(manifest: string | null | undefined): number {
  if (!manifest || typeof manifest !== 'string') return Number.NaN;
  const m = manifest.match(/mediaPresentationDuration=["']([^"']+)["']/);
  if (!m?.[1]) return Number.NaN;
  const iso = m[1];
  const parts = iso.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!parts) return Number.NaN;
  const h = parts[1] ? Number(parts[1]) : 0;
  const min = parts[2] ? Number(parts[2]) : 0;
  const s = parts[3] ? Number(parts[3]) : 0;
  const total = h * 3600 + min * 60 + s;
  return Number.isFinite(total) && total > 0 ? total : Number.NaN;
}

/**
 * Best-effort map of height → bandwidth (bits/sec) from Instagram DASH Representations.
 * Attribute order varies; we only keep the highest bandwidth seen for each height.
 */
export function parseDashBandwidthByHeight(
  manifest: string | null | undefined
): Map<number, number> {
  const out = new Map<number, number>();
  if (!manifest || typeof manifest !== 'string') return out;
  const re = /<Representation\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(manifest))) {
    const attrs = match[1] ?? '';
    const bw = attrs.match(/\bbandwidth=["'](\d+)["']/i);
    const h = attrs.match(/\bheight=["'](\d+)["']/i);
    if (!bw?.[1] || !h?.[1]) continue;
    const bandwidth = Number(bw[1]);
    const height = Number(h[1]);
    if (!Number.isFinite(bandwidth) || bandwidth <= 0 || !Number.isFinite(height) || height <= 0) {
      continue;
    }
    const prev = out.get(height) ?? 0;
    if (bandwidth > prev) out.set(height, bandwidth);
  }
  return out;
}

/**
 * Pull product media from a Polaris GraphQL JSON response
 * (`data.xig_polaris_media.if_not_gated_logged_out`).
 */
export function extractPolarisProductFromGraphqlJson(json: unknown): PolarisMediaBundle | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const polaris = (data as { xig_polaris_media?: unknown }).xig_polaris_media;
  if (!polaris || typeof polaris !== 'object') return null;
  const rec = polaris as Record<string, unknown>;
  const product = rec.if_not_gated_logged_out;
  if (!product || typeof product !== 'object') return null;
  const commentsRaw = rec.comments_connection;
  const comments =
    commentsRaw && typeof commentsRaw === 'object'
      ? (commentsRaw as { edges?: unknown[]; page_info?: Record<string, unknown> })
      : null;
  return { product: product as Record<string, unknown>, comments, polaris: rec };
}
