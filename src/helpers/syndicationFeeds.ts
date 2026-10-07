import type { APIBlueskyStatus, APITwitterStatus, APIVideo } from '../realms/api/schemas';
import { truncateWithEllipsis } from './utils';
import { isTombstone } from './tombstone';

/** Twitter or Bluesky API v2–shaped status for RSS/Atom item mapping. */
export type SyndicationStatus = APITwitterStatus | APIBlueskyStatus;

export type SyndicationFeedMeta = {
  channelTitle: string;
  channelDescription: string;
  profileWebUrl: string;
  selfUrlRss: string;
  selfUrlAtom: string;
  /** Feed-level Atom author (RFC 4287); not duplicated on entries. */
  authorName?: string;
  /**
   * Channel artwork: RSS 2.0 `<image>`, Atom `<icon>` (RFC 4287).
   * Many readers show this as the feed / author avatar.
   */
  channelImageUrl?: string;
};

/** RSS 2.0 `<enclosure>` / Atom `<link rel="enclosure">`; optional Media RSS thumbnail for video. */
export type SyndicationEnclosure = {
  url: string;
  type: string;
  /** Byte length when known; otherwise 0 (common when size is unavailable). */
  length: number;
  /** Poster image for video enclosures (RSS `<media:thumbnail>`). */
  thumbnailUrl?: string;
};

export type SyndicationFeedItem = {
  id: string;
  url: string;
  title: string;
  updated: Date;
  htmlContent: string;
  enclosure?: SyndicationEnclosure;
};

/** XML 1.0 excludes controls, lone surrogates, and U+FFFE/U+FFFF, even in CDATA. */
const xmlText = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '');

/** Escape text for XML text nodes and attribute values. */
export const escapeXml = (text: string): string =>
  xmlText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** CDATA cannot contain the literal `]]>`, split if present. */
const cdataWrap = (inner: string): string =>
  `<![CDATA[${xmlText(inner).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

const toRfc822 = (d: Date): string => d.toUTCString();

const toIso8601 = (d: Date): string => d.toISOString();

/** Unified media ordering (matches HTML body). */
export function statusMediaList(status: SyndicationStatus) {
  const m = status.media;
  if (m?.all?.length) return m.all;
  return [...(m?.photos ?? []), ...(m?.videos ?? [])];
}

function mimeForImageUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('.png')) return 'image/png';
  if (u.includes('.webp')) return 'image/webp';
  if (u.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function isApiVideo(m: { type: string } & object): m is APIVideo {
  if (m.type === 'video') return true;
  return m.type === 'gif' && 'duration' in m;
}

/** Prefer progressive video (not HLS) for RSS/Atom enclosures. */
function pickProgressiveVideoUrl(v: APIVideo): { url: string; mime: string } | null {
  const out: { url: string; mime: string; bitrate: number }[] = [];
  const push = (url: string, mime: string, bitrate: number) => {
    if (!url || url.includes('.m3u8')) return;
    out.push({ url, mime, bitrate });
  };

  if (v.transcode_url) {
    const url = v.transcode_url;
    let mime = 'video/mp4';
    if (url.includes('.webm')) mime = 'video/webm';
    else if (url.includes('.gif')) mime = 'image/gif';
    else if (url.includes('.webp')) mime = 'image/webp';
    push(url, mime, v.filesize ?? 0);
  }
  for (const f of v.formats ?? []) {
    if (f.container === 'm3u8' || f.url.includes('.m3u8')) continue;
    let mime = 'video/mp4';
    if (f.container === 'webm' || f.url.includes('.webm')) mime = 'video/webm';
    else if (f.url.includes('.gif')) mime = 'image/gif';
    else if (f.url.includes('.webp')) mime = 'image/webp';
    push(f.url, mime, f.bitrate ?? f.size ?? 0);
  }
  if (out.length === 0) return null;
  const mp4s = out.filter(x => x.mime === 'video/mp4');
  const pool = mp4s.length ? mp4s : out;
  pool.sort((a, b) => b.bitrate - a.bitrate);
  return { url: pool[0].url, mime: pool[0].mime };
}

/**
 * One enclosure per item: first attached photo or progressive video (else video poster),
 * else external embed thumbnail, else link-card image.
 */
export function syndicationEnclosureFromStatus(
  status: SyndicationStatus
): SyndicationEnclosure | undefined {
  const first = statusMediaList(status)[0];
  if (first) {
    if (isApiVideo(first)) {
      const picked = pickProgressiveVideoUrl(first);
      if (picked) {
        return {
          url: picked.url,
          type: picked.mime,
          length: 0,
          thumbnailUrl: first.thumbnail_url ?? undefined
        };
      }
      if (first.thumbnail_url) {
        return {
          url: first.thumbnail_url,
          type: mimeForImageUrl(first.thumbnail_url),
          length: 0
        };
      }
      return undefined;
    }
    if (first.url) {
      return {
        url: first.url,
        type: mimeForImageUrl(first.url),
        length: 0
      };
    }
    return undefined;
  }

  const extThumb = status.media?.external?.thumbnail_url;
  if (extThumb) {
    return {
      url: extThumb,
      type: mimeForImageUrl(extThumb),
      length: 0
    };
  }

  if (status.provider === 'twitter') {
    const cardImg = status.card?.image?.url;
    if (cardImg) {
      return {
        url: cardImg,
        type: mimeForImageUrl(cardImg),
        length: 0
      };
    }
  }

  return undefined;
}

function buildItemHtml(
  status: SyndicationStatus,
  options: { omitSensitive?: boolean } = {}
): string {
  const body = escapeXml(status.text).replace(/\n/g, '<br />\n');
  const parts: string[] = [`<p>${body}</p>`];

  const mediaList = statusMediaList(status);

  for (const m of mediaList) {
    const url = m.url;
    if (!url) continue;
    if (m.type === 'photo' || m.type === 'gif' || m.type === 'mosaic_photo') {
      const alt = 'altText' in m && m.altText ? m.altText : '';
      parts.push(
        `<p><a href="${escapeXml(url)}"><img src="${escapeXml(url)}" alt="${escapeXml(alt)}" /></a></p>`
      );
    } else {
      parts.push(`<p><a href="${escapeXml(url)}">Media</a></p>`);
    }
  }

  const q = status.quote;
  if (q) {
    if (isTombstone(q)) {
      parts.push(`<blockquote><i>${escapeXml(q.message)}</i></blockquote>`);
    } else if (!(options.omitSensitive && q.possibly_sensitive)) {
      const qtext = escapeXml(truncateWithEllipsis(q.text.replace(/\s+/g, ' ').trim(), 280));
      parts.push(`<blockquote><a href="${escapeXml(q.url)}">${qtext}</a></blockquote>`);
    }
  }

  return parts.join('\n');
}

export function statusesToFeedItems(
  statuses: SyndicationStatus[],
  options: { omitSensitive?: boolean }
): SyndicationFeedItem[] {
  const out: SyndicationFeedItem[] = [];
  for (const s of statuses) {
    if (options.omitSensitive && s.possibly_sensitive) continue;
    const flat = s.text.replace(/\s+/g, ' ').trim();
    const title = truncateWithEllipsis(flat || s.url, 140);
    const enclosure = syndicationEnclosureFromStatus(s);
    out.push({
      id: s.url,
      url: s.url,
      title,
      updated: new Date(s.created_timestamp * 1000),
      htmlContent: buildItemHtml(s, options),
      ...(enclosure ? { enclosure } : {})
    });
  }
  return out;
}

export function feedUpdated(items: SyndicationFeedItem[], fallback?: Date): Date {
  if (items.length === 0) return fallback ?? new Date(0);
  return new Date(Math.max(...items.map(i => i.updated.getTime())));
}

export function toRss20Xml(
  meta: SyndicationFeedMeta,
  items: SyndicationFeedItem[],
  feedUpdatedFallback?: Date
): string {
  const lastBuild = feedUpdated(items, feedUpdatedFallback);
  const channelBits = [
    `<title>${escapeXml(meta.channelTitle)}</title>`,
    `<link>${escapeXml(meta.profileWebUrl)}</link>`,
    `<description>${escapeXml(meta.channelDescription)}</description>`,
    `<language>en</language>`,
    `<lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>`,
    `<atom:link href="${escapeXml(meta.selfUrlRss)}" rel="self" type="application/rss+xml" />`
  ];

  if (meta.channelImageUrl) {
    channelBits.push(
      `<image>` +
        `<url>${escapeXml(meta.channelImageUrl)}</url>` +
        `<title>${escapeXml(meta.channelTitle)}</title>` +
        `<link>${escapeXml(meta.profileWebUrl)}</link>` +
        `</image>`
    );
  }

  const itemBits = items.map(item => {
    const enc = item.enclosure;
    const enclosureBits = enc
      ? `<enclosure url="${escapeXml(enc.url)}" length="${enc.length}" type="${escapeXml(enc.type)}"/>` +
        (enc.thumbnailUrl && enc.type.startsWith('video/')
          ? `<media:thumbnail url="${escapeXml(enc.thumbnailUrl)}"/>`
          : '')
      : '';
    return (
      `<item>` +
      `<title>${escapeXml(item.title)}</title>` +
      `<link>${escapeXml(item.url)}</link>` +
      `<guid isPermaLink="true">${escapeXml(item.url)}</guid>` +
      `<pubDate>${toRfc822(item.updated)}</pubDate>` +
      enclosureBits +
      `<description>${cdataWrap(item.htmlContent)}</description>` +
      `</item>`
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">` +
    `<channel>` +
    channelBits.join('') +
    itemBits.join('') +
    `</channel></rss>`
  );
}

export function toAtomFeedXml(
  meta: SyndicationFeedMeta,
  items: SyndicationFeedItem[],
  feedUpdatedFallback?: Date
): string {
  const updated = feedUpdated(items, feedUpdatedFallback);
  const feedId = meta.selfUrlAtom;

  const authorBlock =
    meta.authorName !== undefined && meta.authorName !== ''
      ? `<author><name>${escapeXml(meta.authorName)}</name></author>`
      : '';

  const iconBit =
    meta.channelImageUrl !== undefined && meta.channelImageUrl !== ''
      ? `<icon>${escapeXml(meta.channelImageUrl)}</icon>`
      : '';

  const head =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<feed xmlns="http://www.w3.org/2005/Atom">` +
    `<title>${escapeXml(meta.channelTitle)}</title>` +
    `<link href="${escapeXml(meta.profileWebUrl)}" rel="alternate" type="text/html"/>` +
    `<link href="${escapeXml(meta.selfUrlAtom)}" rel="self" type="application/atom+xml"/>` +
    `<id>${escapeXml(feedId)}</id>` +
    `<updated>${toIso8601(updated)}</updated>` +
    `<subtitle>${escapeXml(meta.channelDescription)}</subtitle>` +
    iconBit +
    authorBlock;

  const entries = items.map(item => {
    const eid = escapeXml(item.id);
    const enc = item.enclosure;
    const enclosureLink =
      enc !== undefined
        ? `<link rel="enclosure" href="${escapeXml(enc.url)}" type="${escapeXml(enc.type)}" length="${enc.length}"/>`
        : '';
    return (
      `<entry>` +
      `<title>${escapeXml(item.title)}</title>` +
      `<link href="${escapeXml(item.url)}" rel="alternate" type="text/html"/>` +
      enclosureLink +
      `<id>${eid}</id>` +
      `<updated>${toIso8601(item.updated)}</updated>` +
      `<published>${toIso8601(item.updated)}</published>` +
      `<content type="html">${cdataWrap(item.htmlContent)}</content>` +
      `</entry>`
    );
  });

  return head + entries.join('') + `</feed>`;
}
