import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  profileMediaAPIPaginated,
  profileStatusesAPIPaginated
} from '@fxembed/atmosphere/providers/twitter/userStatuses';
import { parseHandleOrId } from '@fxembed/atmosphere/providers/twitter/profile';
import { isParamTruthy } from '../../../helpers/utils';
import type { APITwitterStatus } from '../../../realms/api/schemas';
import {
  statusesToFeedItems,
  toAtomFeedXml,
  toRss20Xml,
  type SyndicationFeedMeta
} from '../../../helpers/syndicationFeeds';
import { getBranding } from '../../../helpers/branding';
import { twitterBuildHostFromContext } from '../../../providers/twitter/build-host-adapter';

const DEFAULT_FEED_COUNT = 90;
const FEED_CACHE_CONTROL = 'public, max-age=120';

type SyndicationFeedKind = 'timeline' | 'media';

function clampCount(raw: string | undefined): number {
  const n = raw === undefined ? DEFAULT_FEED_COUNT : parseInt(raw, 10);
  if (Number.isNaN(n)) return DEFAULT_FEED_COUNT;
  return Math.min(100, Math.max(1, n));
}

/** Matches JSON API `lang` query; optional `language` alias for embed-style URLs. */
function feedRequestLanguage(c: Context): string | undefined {
  const q = c.req.query();
  const raw = q.lang ?? q.language;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return raw;
}

function parseFeedQuery(c: Context): {
  count: number;
  withReplies: boolean;
  safe: boolean;
  language?: string;
} {
  const q = c.req.query();
  const language = feedRequestLanguage(c);
  return {
    count: clampCount(q.count),
    withReplies: isParamTruthy(q.with_replies ?? q.withReplies),
    safe: isParamTruthy(q.safe),
    ...(language ? { language } : {})
  };
}

function feedAuthorName(handle: string, results: APITwitterStatus[]): string {
  const screen = handle.replace(/^@/, '');
  const fromPost = results.find(s => s.author?.name?.trim())?.author?.name?.trim();
  return fromPost ?? `@${screen}`;
}

function feedChannelTitle(handle: string, results: APITwitterStatus[]): string {
  const screenFromUrl = handle.replace(/^@/, '').toLowerCase();
  const authorForProfile =
    results.find(
      s => s.author && s.author.screen_name.replace(/^@/, '').toLowerCase() === screenFromUrl
    )?.author ?? results.find(s => s.author)?.author;

  const screen = (authorForProfile?.screen_name ?? handle.replace(/^@/, '')).replace(/^@/, '');
  const atScreen = `@${screen}`;
  const displayName = authorForProfile?.name?.trim();
  return displayName ? `${displayName} (${atScreen})` : atScreen;
}

function feedChannelImageUrl(results: APITwitterStatus[]): string | undefined {
  const url = results.find(s => s.author?.avatar_url)?.author?.avatar_url;
  return url ?? undefined;
}

/** Newest post time from raw API results (used when safe filter empties all items). */
function newestUnfilteredStatusDate(results: APITwitterStatus[]): Date | undefined {
  if (results.length === 0) return undefined;
  return new Date(Math.max(...results.map(s => s.created_timestamp * 1000)));
}

function buildMeta(
  c: Context,
  handle: string,
  kind: SyndicationFeedKind,
  results: APITwitterStatus[]
): SyndicationFeedMeta {
  const requestUrl = new URL(c.req.url);
  const origin = requestUrl.origin;
  const qs = requestUrl.search;
  const branding = getBranding(c);
  const enc = encodeURIComponent(handle);
  const profileWebUrl = `${origin}/${enc}${qs}`;
  const authorName = feedAuthorName(handle, results);
  const channelTitle = feedChannelTitle(handle, results);
  const channelImageUrl = feedChannelImageUrl(results);

  if (kind === 'media') {
    const selfUrlRss = `${origin}/${enc}/media.xml${qs}`;
    const selfUrlAtom = `${origin}/${enc}/media.atom.xml${qs}`;
    return {
      channelTitle,
      channelDescription: `Media from @${handle} via ${branding.name}.`,
      profileWebUrl,
      selfUrlRss,
      selfUrlAtom,
      authorName,
      ...(channelImageUrl ? { channelImageUrl } : {})
    };
  }

  const selfUrlRss = `${origin}/${enc}/feed.xml${qs}`;
  const selfUrlAtom = `${origin}/${enc}/feed.atom.xml${qs}`;

  return {
    channelTitle,
    channelDescription: `Posts by @${handle}`,
    profileWebUrl,
    selfUrlRss,
    selfUrlAtom,
    authorName,
    ...(channelImageUrl ? { channelImageUrl } : {})
  };
}

async function serveFeed(
  c: Context,
  handle: string | undefined,
  format: 'rss' | 'atom',
  kind: SyndicationFeedKind
): Promise<Response> {
  if (!handle) {
    c.header('Cache-Control', 'no-store');
    return c.body('', 404);
  }
  const parsed = parseHandleOrId(handle);

  let apiResult;
  let omitSensitive: boolean;

  if (kind === 'timeline') {
    const q = parseFeedQuery(c);
    omitSensitive = q.safe;
    apiResult = await profileStatusesAPIPaginated(
      parsed,
      q.count,
      twitterBuildHostFromContext(c),
      q.withReplies,
      q.language
    );
  } else {
    const q = parseFeedQuery(c);
    omitSensitive = q.safe;
    apiResult = await profileMediaAPIPaginated(
      parsed,
      q.count,
      twitterBuildHostFromContext(c),
      q.withReplies,
      q.language
    );
  }

  const meta = buildMeta(c, handle, kind, apiResult.results);
  const items = statusesToFeedItems(apiResult.results, { omitSensitive });
  const feedUpdatedFallback = omitSensitive
    ? newestUnfilteredStatusDate(apiResult.results)
    : undefined;

  c.header('Access-Control-Allow-Origin', '*');

  if (apiResult.code === 404) {
    c.header('Cache-Control', 'no-store');
    return c.body('', 404);
  }

  if (apiResult.code !== 200) {
    c.header('Cache-Control', 'no-store');
    return c.body('', apiResult.code as ContentfulStatusCode);
  }

  const contentType =
    format === 'rss' ? 'application/rss+xml; charset=utf-8' : 'application/atom+xml; charset=utf-8';
  c.header('Content-Type', contentType);
  c.header('Cache-Control', FEED_CACHE_CONTROL);

  const xml =
    format === 'rss'
      ? toRss20Xml(meta, items, feedUpdatedFallback)
      : toAtomFeedXml(meta, items, feedUpdatedFallback);
  return c.body(xml, 200);
}

export const profileFeedRssTwitter = (c: Context) =>
  serveFeed(c, c.req.param('handle'), 'rss', 'timeline');
export const profileFeedAtomTwitter = (c: Context) =>
  serveFeed(c, c.req.param('handle'), 'atom', 'timeline');

export const profileMediaFeedRssTwitter = (c: Context) =>
  serveFeed(c, c.req.param('handle'), 'rss', 'media');
export const profileMediaFeedAtomTwitter = (c: Context) =>
  serveFeed(c, c.req.param('handle'), 'atom', 'media');
