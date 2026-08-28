import type { APIInstagramStatus, APISearchResultsInstagram } from '../../types/api-schemas.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { fetchPrivateReelsMedia } from './private-api.js';
import { instagramNodeToStatus } from './processor.js';
import { resolveInstagramUser } from './resolve-user.js';

const empty = (code: number): APISearchResultsInstagram => ({
  code,
  results: [],
  cursor: { top: null, bottom: null }
});

/** `feed/reels_media/` answers with `reels` keyed by pk and/or a `reels_media` array. */
function storyItemsFromReelsResponse(json: unknown, userId: string): Record<string, unknown>[] {
  if (!json || typeof json !== 'object') return [];
  const root = json as { reels?: Record<string, unknown>; reels_media?: unknown[] };
  const trays: unknown[] = [];
  const keyed = root.reels?.[userId];
  if (keyed) trays.push(keyed);
  if (Array.isArray(root.reels_media)) trays.push(...root.reels_media);

  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const tray of trays) {
    if (!tray || typeof tray !== 'object') continue;
    const items = (tray as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const key = String(rec.pk ?? rec.id ?? '');
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(rec);
    }
  }
  return out;
}

/**
 * An account's currently-active stories. Stories expire after 24 hours and are logged-in only, so
 * this needs the account proxy; there is no pagination to expose.
 */
export async function constructInstagramProfileStories(
  username: string,
  options: { ctx?: InstagramRequestContext } = {}
): Promise<APISearchResultsInstagram> {
  const accounts = await resolveInstagramAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501);
  }

  const resolved = await resolveInstagramUser(username, options.ctx, { accounts });
  if (resolved.code !== 200 || !resolved.user) {
    return empty(resolved.code);
  }
  const userId = resolved.user.id;

  const res = await fetchPrivateReelsMedia([userId], options.ctx, { accounts });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const ownerFallback = {
    id: userId,
    username,
    fullName: resolved.user.name,
    pic: resolved.user.avatar_url
  };
  const results: APIInstagramStatus[] = [];
  for (const item of storyItemsFromReelsResponse(res.json, userId)) {
    const status = instagramNodeToStatus(item, ownerFallback, {
      userAgent: options.ctx?.userAgent
    });
    if (status) results.push(status);
  }
  return { code: 200, results, cursor: { top: null, bottom: null } };
}
