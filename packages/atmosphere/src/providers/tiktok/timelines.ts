import type {
  APISearchResultsTikTok,
  APITikTokCollection,
  APITikTokCollectionResults,
  APIUser
} from '../../types/api-schemas.js';
import type { APITikTokStatus } from '../../types/api-status.js';
import { fetchEmbedData } from './client.js';
import { TIKTOK_EMBED_PAGE_SIZE, TIKTOK_WEB_HOST } from './constants.js';
import { buildAPITikTokStatusFromEmbedItem, buildAPITikTokUserFromEmbed } from './processor.js';
import { normalizeTikTokHandle } from './profile.js';

/**
 * A page of statuses from one of TikTok's `/embed/…` playlist pages.
 *
 * `cursor.bottom` is always `null`: the embed pages take no cursor and hardcode their page size,
 * so a single request is the whole result set. Callers that need deeper history need the signed
 * `/aweme/v1/aweme/post/` endpoint (see `constants.ts` for why that is not wired up).
 */
export interface TikTokTimelineResult {
  results: APITikTokStatus[];
  /** Page owner / hashtag / sound header, when the page carries one. */
  author: APIUser | null;
  info: TikTokEmbedPlaylistInfo | null;
  code: number;
}

const emptyResult = (code: number): TikTokTimelineResult => ({
  results: [],
  author: null,
  info: null,
  code
});

/** Author stub for hashtag / sound pages, which have no real account behind them. */
const placeholderAuthor = (name: string, url: string, avatar: string | null): APIUser => ({
  id: '',
  name,
  screen_name: '',
  avatar_url: avatar,
  banner_url: null,
  description: '',
  raw_description: { text: '', facets: [] },
  location: '',
  followers: 0,
  following: 0,
  media_count: 0,
  statuses: 0,
  likes: 0,
  url,
  protected: false,
  joined: '',
  birthday: null,
  website: null,
  type: 'profile',
  profile_embed: true
});

const mapItems = (
  items: TikTokEmbedItem[] | undefined,
  author: APIUser,
  proxyBase: string | null,
  cookies: string | null,
  count: number
): APITikTokStatus[] =>
  (items ?? [])
    .slice(0, count)
    .map(item => buildAPITikTokStatusFromEmbedItem(item, author, proxyBase, cookies));

/**
 * Recent videos for one creator, from `www.tiktok.com/embed/@handle`.
 * That page server-renders the account header plus its most recent videos, unsigned.
 */
export const fetchTikTokProfileStatuses = async (
  handleInput: string,
  count = 10,
  proxyBase: string | null = null
): Promise<TikTokTimelineResult> => {
  const handle = normalizeTikTokHandle(handleInput);
  if (!handle) return emptyResult(400);

  const { data, cookies, status } = await fetchEmbedData(`/embed/@${handle}`);
  if (!data?.userInfo?.uniqueId) {
    return emptyResult(status === 404 ? 404 : status === 200 ? 404 : 500);
  }

  const author = buildAPITikTokUserFromEmbed(data.userInfo);
  return {
    results: mapItems(data.videoList, author, proxyBase, cookies, count),
    author,
    info: null,
    code: 200
  };
};

/**
 * Recent videos for a hashtag, from `www.tiktok.com/embed/tag/:hashtag`.
 * The page's `embedInfo` also carries the hashtag's total view and video counts.
 */
export const fetchTikTokHashtagStatuses = async (
  hashtagInput: string,
  count = 10,
  proxyBase: string | null = null
): Promise<TikTokTimelineResult> => {
  const hashtag = hashtagInput.trim().replace(/^#/, '');
  if (!/^[\w.\-À-￿]{1,100}$/u.test(hashtag)) return emptyResult(400);

  const { data, cookies, status } = await fetchEmbedData(
    `/embed/tag/${encodeURIComponent(hashtag)}`
  );
  if (!data || (!data.videoList?.length && !data.embedInfo)) {
    return emptyResult(status === 200 ? 404 : status || 500);
  }

  const author = placeholderAuthor(
    `#${hashtag}`,
    `${TIKTOK_WEB_HOST}/tag/${encodeURIComponent(hashtag)}`,
    data.embedInfo?.coverUrl || null
  );

  return {
    results: mapItems(data.videoList, author, proxyBase, cookies, count),
    author,
    info: data.embedInfo ?? null,
    code: 200
  };
};

/**
 * Recent videos using a sound, from `www.tiktok.com/embed/music/:id`.
 * TikTok accepts either the bare music id or a `slug-id` path; we always send the bare id.
 */
export const fetchTikTokMusicStatuses = async (
  musicIdInput: string,
  count = 10,
  proxyBase: string | null = null
): Promise<TikTokTimelineResult> => {
  const musicId = musicIdInput.trim().match(/(\d{6,25})$/)?.[1];
  if (!musicId) return emptyResult(400);

  const { data, cookies, status } = await fetchEmbedData(`/embed/music/${musicId}`);
  if (!data || (!data.videoList?.length && !data.embedInfo)) {
    return emptyResult(status === 200 ? 404 : status || 500);
  }

  const author = placeholderAuthor(
    data.embedInfo?.title || `Sound ${musicId}`,
    `${TIKTOK_WEB_HOST}/music/x-${musicId}`,
    data.embedInfo?.coverUrl || null
  );

  return {
    results: mapItems(data.videoList, author, proxyBase, cookies, count),
    author,
    info: data.embedInfo ?? null,
    code: 200
  };
};

/**
 * Normalizes a collection counter. Hashtag pages send these as decimal strings and sound pages
 * send them as numbers; a missing counter stays `null` rather than becoming a misleading zero.
 */
const parseCollectionCount = (value: string | number | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toCollection = (
  info: TikTokEmbedPlaylistInfo | null,
  name: string,
  url: string
): APITikTokCollection | null => {
  if (!info) return null;
  return {
    id: info.id ?? null,
    name: info.title || name,
    url,
    description: info.description || null,
    cover_url: info.coverUrl || null,
    views: parseCollectionCount(info.viewCount),
    statuses: parseCollectionCount(info.videoCount),
    author_name: info.artist || null
  };
};

/** `/2/tiktok/profile/{handle}/statuses` envelope. */
export async function constructTikTokProfileStatuses(
  handle: string,
  options: { count: number; proxyBase?: string | null } = { count: TIKTOK_EMBED_PAGE_SIZE }
): Promise<APISearchResultsTikTok> {
  const result = await fetchTikTokProfileStatuses(handle, options.count, options.proxyBase ?? null);
  /* The embed pages take no cursor, so there is never a next page to hand back. */
  return { code: result.code, results: result.results, cursor: { top: null, bottom: null } };
}

/** `/2/tiktok/hashtag/{hashtag}` envelope. */
export async function constructTikTokHashtag(
  hashtag: string,
  options: { count: number; proxyBase?: string | null } = { count: TIKTOK_EMBED_PAGE_SIZE }
): Promise<APITikTokCollectionResults> {
  const name = hashtag.trim().replace(/^#/, '');
  const result = await fetchTikTokHashtagStatuses(
    hashtag,
    options.count,
    options.proxyBase ?? null
  );
  return {
    code: result.code,
    collection: toCollection(
      result.info,
      `#${name}`,
      `${TIKTOK_WEB_HOST}/tag/${encodeURIComponent(name)}`
    ),
    results: result.results,
    cursor: { top: null, bottom: null }
  };
}

/** `/2/tiktok/music/{id}` envelope. */
export async function constructTikTokMusic(
  musicId: string,
  options: { count: number; proxyBase?: string | null } = { count: TIKTOK_EMBED_PAGE_SIZE }
): Promise<APITikTokCollectionResults> {
  const id = musicId.trim().match(/(\d{6,25})$/)?.[1] ?? musicId;
  const result = await fetchTikTokMusicStatuses(musicId, options.count, options.proxyBase ?? null);
  return {
    code: result.code,
    collection: toCollection(result.info, `Sound ${id}`, `${TIKTOK_WEB_HOST}/music/x-${id}`),
    results: result.results,
    cursor: { top: null, bottom: null }
  };
}
