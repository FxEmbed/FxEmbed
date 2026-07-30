import { getMastodonProviderEnv } from '../mastodon-runtime.js';
import { DataProvider } from '../../types/data-provider.js';
import { handleMosaic } from '../../helpers/mosaic.js';
import { unescapeText } from '../../helpers/unescape-text.js';
import type {
  APIFacet,
  APIRepostedBy,
  APIUser,
  APIMastodonStatus,
  APIStatusTombstone,
  APITombstoneReason
} from '../../types/api-schemas.js';
import { isTombstone, tombstoneMessageForReason } from '../../helpers/tombstone.js';
import { assertSafeMastodonDomain } from './client.js';
import type { MastodonBuildHost } from './build-host.js';
import type { APIStatus } from '../../types/api-status.js';

export const buildMastodonTombstone = (
  reason: APITombstoneReason,
  id: string,
  domain: string
): APIStatusTombstone => ({
  type: 'tombstone',
  provider: 'mastodon',
  reason,
  message: tombstoneMessageForReason(reason),
  id,
  url: `https://${assertSafeMastodonDomain(domain)}/`
});

const decodeBasicEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

/** HTML → plain without outer trim (for segment concatenation). */
const htmlToPlainCore = (html: string): string => {
  let s = html.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  s = s.replace(/<p[^>]*>/gi, '');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeBasicEntities(s).replace(/\n{3,}/g, '\n\n');
};

/** Strip HTML to plain text; preserve line breaks from `<br>` / `<p>` */
const htmlToPlainText = (html: string): string => htmlToPlainCore(html).trim();

const extractAttr = (attrs: string, name: string): string => {
  const reDouble = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const reSingle = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i');
  const dm = attrs.match(reDouble);
  if (dm) return decodeBasicEntities(dm[1]);
  const sm = attrs.match(reSingle);
  return sm ? decodeBasicEntities(sm[1]) : '';
};

const mastodonCustomEmojiByShortcode = (
  emojis: MastodonCustomEmoji[] | undefined
): Map<string, MastodonCustomEmoji> => {
  const m = new Map<string, MastodonCustomEmoji>();
  for (const e of emojis ?? []) {
    if (e?.shortcode && e?.url) m.set(e.shortcode, e);
  }
  return m;
};

/**
 * Replace Mastodon inline custom-emoji `<img>` nodes with plain `:shortcode:` before tag stripping.
 * Uses `class="custom-emoji"` / `emojione`, `alt`/`title`, and optional `emojis[]` URL matching.
 */
export const normalizeCustomEmojiImagesInHtml = (
  html: string,
  emojis?: MastodonCustomEmoji[]
): string => {
  const byShortcode = mastodonCustomEmojiByShortcode(emojis);
  const urlToEmoji = new Map<string, MastodonCustomEmoji>();
  for (const e of emojis ?? []) {
    if (!e?.url) continue;
    urlToEmoji.set(e.url, e);
    if (e.static_url) urlToEmoji.set(e.static_url, e);
  }

  return html.replace(/<img\s+([^>]*?)>/gi, (full, attrs: string) => {
    const cls = extractAttr(attrs, 'class');
    const src = extractAttr(attrs, 'src');
    const pick = extractAttr(attrs, 'alt') || extractAttr(attrs, 'title');
    const altMatch = pick.match(/^:([^:\s]+):$/);
    const isClass = /\bcustom-emoji\b/i.test(cls) || /\bemojione\b/i.test(cls);

    let emoji: MastodonCustomEmoji | undefined;
    if (src) emoji = urlToEmoji.get(src);
    if (!emoji && altMatch) emoji = byShortcode.get(altMatch[1]);

    if (emoji) return `:${emoji.shortcode}:`;
    if (isClass && altMatch) return pick;
    return full;
  });
};

/** Scan plain text for `:shortcode:` tokens present in `emojis` (longest shortcode first). */
export const buildCustomEmojiFacets = (
  plain: string,
  emojis: MastodonCustomEmoji[] | undefined,
  avoid: APIFacet[]
): APIFacet[] => {
  if (!emojis?.length) return [];

  const byShortcode = mastodonCustomEmojiByShortcode(emojis);
  const shortcodes = [...byShortcode.keys()].sort((a, b) => b.length - a.length);

  const occupied: [number, number][] = avoid.map(f => [f.indices[0], f.indices[1]]);
  const rangeFree = (s: number, e: number): boolean =>
    !occupied.some(([os, oe]) => os < e && oe > s);
  const occupy = (s: number, e: number): void => {
    occupied.push([s, e]);
  };

  const out: APIFacet[] = [];
  for (let i = 0; i < plain.length;) {
    let advanced = false;
    for (const sc of shortcodes) {
      const token = `:${sc}:`;
      if (!plain.startsWith(token, i)) continue;
      const e = i + token.length;
      if (!rangeFree(i, e)) continue;
      const emoji = byShortcode.get(sc);
      if (!emoji?.url) continue;
      out.push({
        type: 'custom_emoji',
        indices: [i, e],
        display: token,
        original: sc,
        replacement: emoji.url
      });
      occupy(i, e);
      i = e;
      advanced = true;
      break;
    }
    if (!advanced) i += 1;
  }

  out.sort((a, b) => a.indices[0] - b.indices[0]);
  return out;
};

const mergeMentionHashtagUrlAndEmojiFacets = (base: APIFacet[], emoji: APIFacet[]): APIFacet[] => {
  const priority = (t: string): number => (t === 'custom_emoji' ? 1 : 0);
  const combined = [...base, ...emoji].sort((a, b) => {
    const d = a.indices[0] - b.indices[0];
    if (d !== 0) return d;
    const d2 = a.indices[1] - b.indices[1];
    if (d2 !== 0) return d2;
    return priority(a.type) - priority(b.type);
  });

  const out: APIFacet[] = [];
  for (const f of combined) {
    const [s, e] = f.indices;
    if (s >= e) continue;
    if (out.some(o => o.indices[0] < e && o.indices[1] > s)) continue;
    out.push(f);
  }
  out.sort((a, b) => a.indices[0] - b.indices[0]);
  return out;
};

/** `https://host/@user` → `user@host` (fediverse profile URLs in account `note` HTML). */
const accountFromProfileHref = (href: string, instanceDomain: string): string | null => {
  try {
    const url = new URL(href, `https://${instanceDomain}`);
    if (!/^https?:$/i.test(url.protocol)) return null;
    const path = (url.pathname.replace(/\/+$/, '') || '/').replace(/^\/+/, '/');
    const mm = path.match(/^\/@([^/@]+)$/);
    if (!mm) return null;
    return `${decodeBasicEntities(mm[1])}@${url.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
};

const guessAcctFromMentionPlain = (innerPlain: string, instanceDomain: string): string | null => {
  const h = innerPlain.trim().replace(/^@+/, '');
  if (!h) return null;
  if (h.includes('@')) return h;
  return `${h}@${instanceDomain}`;
};

const facetFromMastodonNoteAnchor = (
  attrs: string,
  hrefRaw: string,
  innerPlain: string,
  start: number,
  end: number,
  instanceDomain: string
): APIFacet | null => {
  if (!innerPlain) return null;

  const cls = extractAttr(attrs, 'class');
  const isHashtag = /\bhashtag\b/.test(cls) || /\brel\s*=\s*["']tag["']/i.test(attrs);

  let absHref = '';
  if (hrefRaw) {
    if (/^https?:\/\//i.test(hrefRaw)) absHref = hrefRaw;
    else if (hrefRaw.startsWith('/')) {
      try {
        absHref = new URL(hrefRaw, `https://${instanceDomain}`).href;
      } catch {
        absHref = hrefRaw;
      }
    } else {
      absHref = hrefRaw;
    }
  }

  if (isHashtag) {
    const tagName = innerPlain.replace(/^#/u, '').trim() || innerPlain.trim();
    return {
      type: 'hashtag',
      indices: [start, end],
      display: innerPlain.startsWith('#') ? innerPlain : `#${tagName}`,
      replacement: absHref || undefined,
      original: tagName
    };
  }

  const isMentionClass = /\bmention\b/.test(cls);
  const acctFromUrl =
    absHref && /^https?:\/\//i.test(absHref)
      ? accountFromProfileHref(absHref, instanceDomain)
      : null;

  if (isMentionClass || acctFromUrl) {
    const acct = acctFromUrl ?? guessAcctFromMentionPlain(innerPlain, instanceDomain);
    if (!acct) {
      if (absHref && /^https?:\/\//i.test(absHref)) {
        return {
          type: 'url',
          indices: [start, end],
          display: innerPlain,
          replacement: absHref,
          original: absHref
        };
      }
      return null;
    }
    return {
      type: 'mention',
      indices: [start, end],
      display: innerPlain,
      original: acct
    };
  }

  if (absHref && /^https?:\/\//i.test(absHref)) {
    return {
      type: 'url',
      indices: [start, end],
      display: innerPlain,
      replacement: absHref,
      original: absHref
    };
  }

  return null;
};

/**
 * Mastodon `account.note` is HTML with `<a>` for mentions, hashtags, and links.
 * Build plain text (same rules as `htmlToPlainText` on interleaved segments) and API facets with UTF-16 indices.
 */
const plainTextAndFacetsFromMastodonNote = (
  html: string,
  instanceDomain: string,
  emojis?: MastodonCustomEmoji[]
): { text: string; facets: APIFacet[] } => {
  const normalized = normalizeCustomEmojiImagesInHtml(html.trim(), emojis);
  const trimmed = normalized;
  if (!trimmed) return { text: '', facets: [] };

  const facets: APIFacet[] = [];
  const anchorRe = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
  const parts: Array<{ kind: 'text'; html: string } | { kind: 'a'; attrs: string; inner: string }> =
    [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(normalized)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ kind: 'text', html: normalized.slice(lastIdx, m.index) });
    }
    parts.push({ kind: 'a', attrs: m[1], inner: m[2] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < normalized.length) {
    parts.push({ kind: 'text', html: normalized.slice(lastIdx) });
  }

  let text = '';
  for (const p of parts) {
    if (p.kind === 'text') {
      text += htmlToPlainCore(p.html);
      continue;
    }
    const innerPlain = htmlToPlainCore(p.inner);
    const start = text.length;
    text += innerPlain;
    const end = text.length;
    const href = extractAttr(p.attrs, 'href');
    const facet = facetFromMastodonNoteAnchor(
      p.attrs,
      href,
      innerPlain,
      start,
      end,
      instanceDomain
    );
    if (facet) facets.push(facet);
  }

  const lead = text.length - text.trimStart().length;
  const afterLead = text.slice(lead);
  const trimmedLen = afterLead.trimEnd().length;
  const finalText = afterLead.slice(0, trimmedLen);
  const trail = afterLead.length - trimmedLen;
  const rightBound = text.length - trail;

  const adjFacets: APIFacet[] = [];
  for (const f of facets) {
    const [s, e] = f.indices;
    if (e <= lead || s >= rightBound) continue;
    const ns = Math.max(s, lead) - lead;
    const ne = Math.min(e, rightBound) - lead;
    if (ns < ne) adjFacets.push({ ...f, indices: [ns, ne] });
  }
  adjFacets.sort((a, b) => a.indices[0] - b.indices[0]);
  const emojiFacets = buildCustomEmojiFacets(finalText, emojis, adjFacets);
  const merged = mergeMentionHashtagUrlAndEmojiFacets(adjFacets, emojiFacets);
  return { text: finalText, facets: merged };
};

/**
 * Mastodon uses a bare local username in `acct` for accounts on the requesting instance.
 * Horizon and the Atmosphere API contract treat `screen_name` as full fediverse acct (`user@host`).
 */
const mastodonFullAcct = (
  account: Pick<MastodonAccount, 'acct' | 'username'>,
  instanceDomain: string
): string => {
  const safe = assertSafeMastodonDomain(instanceDomain);
  const a = (account.acct ?? '').trim();
  if (a.includes('@')) return a;
  return `${account.username}@${safe}`;
};

const buildFacetsFromStatus = (
  plain: string,
  status: MastodonStatus,
  instanceDomain: string
): APIFacet[] => {
  const facets: APIFacet[] = [];
  for (const m of status.mentions ?? []) {
    const fullMentionAcct = mastodonFullAcct(m, instanceDomain);
    const needle = `@${m.acct}`;
    let from = 0;
    while (from < plain.length) {
      const i = plain.indexOf(needle, from);
      if (i === -1) break;
      facets.push({
        type: 'mention',
        indices: [i, i + needle.length],
        display: needle,
        original: fullMentionAcct,
        id: m.id
      });
      from = i + needle.length;
    }
    const shortNeedle = `@${m.username}`;
    if (shortNeedle !== needle) {
      from = 0;
      while (from < plain.length) {
        const i = plain.indexOf(shortNeedle, from);
        if (i === -1) break;
        if (facets.some(f => f.type === 'mention' && f.indices[0] <= i && i < f.indices[1])) {
          from = i + shortNeedle.length;
          continue;
        }
        facets.push({
          type: 'mention',
          indices: [i, i + shortNeedle.length],
          display: shortNeedle,
          original: fullMentionAcct,
          id: m.id
        });
        from = i + shortNeedle.length;
      }
    }
  }
  for (const tag of status.tags ?? []) {
    const needle = `#${tag.name}`;
    let from = 0;
    while (from < plain.length) {
      const i = plain.indexOf(needle, from);
      if (i === -1) break;
      facets.push({
        type: 'hashtag',
        indices: [i, i + needle.length],
        display: needle,
        replacement: tag.url
      });
      from = i + needle.length;
    }
  }
  facets.sort((a, b) => a.indices[0] - b.indices[0]);
  return facets;
};

export const mastodonAccountToApiUser = (account: MastodonAccount, domain: string): APIUser => {
  const safe = assertSafeMastodonDomain(domain);
  const { text: rawNote, facets: noteFacets } = account.note
    ? plainTextAndFacetsFromMastodonNote(account.note, safe, account.emojis)
    : { text: '', facets: [] };
  const webUrl = account.url || `https://${safe}/@${account.username}`;
  return {
    id: account.id,
    name: (account.display_name || account.username).trim() || account.username,
    screen_name: mastodonFullAcct(account, domain),
    avatar_url: account.avatar_static || account.avatar || null,
    banner_url: account.header_static || account.header || null,
    description: rawNote,
    raw_description: { text: rawNote, facets: noteFacets },
    location: '',
    url: webUrl,
    protected: account.locked,
    followers: account.followers_count ?? 0,
    following: account.following_count ?? 0,
    statuses: account.statuses_count ?? 0,
    media_count: 0,
    likes: 0,
    joined: account.created_at ?? '',
    birthday: { day: 0, month: 0, year: 0 },
    website: null,
    ...(account.verified
      ? {
          verification: {
            verified: true,
            type: null,
            verified_at: null
          }
        }
      : {}),
    type: 'profile'
  };
};

const repostedByFromAccount = (account: MastodonAccount, domain: string): APIRepostedBy => {
  const u = mastodonAccountToApiUser(account, domain);
  return {
    id: u.screen_name,
    name: u.name,
    screen_name: u.screen_name,
    avatar_url: u.avatar_url,
    url: u.url
  };
};

const applyMedia = (api: APIMastodonStatus, status: MastodonStatus): void => {
  const photos: NonNullable<APIMastodonStatus['media']['photos']> = [];
  const videos: NonNullable<APIMastodonStatus['media']['videos']> = [];

  for (const m of status.media_attachments ?? []) {
    if (m.type === 'image' || m.type === 'unknown') {
      photos.push({
        type: 'photo',
        url: m.url || m.preview_url,
        width: m.meta?.original?.width ?? 0,
        height: m.meta?.original?.height ?? 0,
        altText: m.description ?? undefined
      });
    } else if (m.type === 'gifv') {
      photos.push({
        type: 'gif',
        url: m.url,
        format: 'image/gif',
        width: m.meta?.original?.width ?? 0,
        height: m.meta?.original?.height ?? 0
      });
    } else if (m.type === 'video' || m.type === 'audio') {
      const w = m.meta?.original?.width ?? 0;
      const h = m.meta?.original?.height ?? 0;
      const dur = m.meta?.original?.duration ?? 0;
      videos.push({
        type: 'video',
        url: m.url,
        width: w,
        height: h,
        duration: dur,
        thumbnail_url: m.preview_url ?? null,
        formats: [{ url: m.url, container: 'mp4' }]
      });
    }
  }

  if (photos.length) {
    api.media.photos = photos;
    api.embed_card = 'summary_large_image';
  }
  if (videos.length) {
    api.media.videos = videos;
    api.embed_card = 'player';
  }

  if (status.card?.image && !photos.length && !videos.length) {
    photos.push({
      type: 'photo',
      url: status.card.image,
      width: typeof status.card.width === 'number' ? status.card.width : 0,
      height: typeof status.card.height === 'number' ? status.card.height : 0,
      altText: status.card.title || ''
    });
    api.media.photos = photos;
    api.embed_card = 'summary_large_image';
  }
};

export const buildAPIMastodonPost = async (
  host: MastodonBuildHost,
  status: MastodonStatus,
  domain: string,
  language: string | undefined,
  quoteDepth = 0
): Promise<APIMastodonStatus> => {
  if (quoteDepth > 10) {
    throw new Error('mastodon quote depth exceeded');
  }

  let outerBoost: MastodonAccount | null = null;
  let core = status;
  if (status.reblog) {
    outerBoost = status.account;
    core = status.reblog;
  }

  const rawHtmlNorm = normalizeCustomEmojiImagesInHtml(core.content ?? '', core.emojis);
  const rawText = core.text ?? htmlToPlainText(rawHtmlNorm);
  const text = htmlToPlainText(rawHtmlNorm) || rawText;
  const baseFacets = buildFacetsFromStatus(text, core, domain);
  const emojiFacets = buildCustomEmojiFacets(text, core.emojis, baseFacets);
  const facets = mergeMentionHashtagUrlAndEmojiFacets(baseFacets, emojiFacets);

  const created = Date.parse(core.created_at);
  const createdTs = Number.isFinite(created) ? created / 1000 : 0;

  let replying_to: APIMastodonStatus['replying_to'] = null;
  if (core.in_reply_to_id && core.in_reply_to_account_id) {
    const mention = core.mentions?.find(m => m.id === core.in_reply_to_account_id);
    if (mention) {
      replying_to = {
        screen_name: mastodonFullAcct(mention, domain),
        status: core.in_reply_to_id
      };
    }
  }

  const author = mastodonAccountToApiUser(core.account, domain);
  const statusUrl =
    core.url || `https://${assertSafeMastodonDomain(domain)}/@${core.account.username}/${core.id}`;

  const apiStatus: APIMastodonStatus = {
    id: core.id,
    url: statusUrl,
    text,
    raw_text: { text, facets },
    created_at: core.created_at,
    created_timestamp: createdTs,
    likes: core.favourites_count ?? 0,
    reposts: core.reblogs_count ?? 0,
    replies: core.replies_count ?? 0,
    author,
    media: {},
    lang: core.language ?? null,
    possibly_sensitive: core.sensitive === true,
    replying_to,
    source: core.application?.name ?? 'Mastodon',
    embed_card: 'tweet',
    provider: 'mastodon',
    type: 'status'
  };

  applyMedia(apiStatus, core);

  if (outerBoost) {
    apiStatus.reposted_by = repostedByFromAccount(outerBoost, domain);
  }

  const quoted = core.quoted_status;
  const orphanQuoteId =
    typeof core.quoted_status_id === 'string' && core.quoted_status_id.length > 0
      ? core.quoted_status_id
      : null;

  if (quoted && quoteDepth < 10) {
    const q = await buildAPIMastodonPost(host, quoted, domain, language, quoteDepth + 1);
    apiStatus.quote = q;
    if (!isTombstone(q) && q.embed_card && q.embed_card !== 'tweet') {
      apiStatus.embed_card = q.embed_card;
    }
  } else if (orphanQuoteId) {
    apiStatus.quote = buildMastodonTombstone('unavailable', orphanQuoteId, domain);
  }

  apiStatus.media.all = [...(apiStatus.media.photos ?? []), ...(apiStatus.media.videos ?? [])];

  const mEnv = getMastodonProviderEnv();
  if ((apiStatus.media.photos?.length || 0) > 1 && mEnv.mosaicDomainList.length > 0) {
    apiStatus.embed_card = 'summary_large_image';
    const mosaic = await handleMosaic(apiStatus.media?.photos || [], ':3', DataProvider.Mastodon, {
      twitterLikeDomains: mEnv.mosaicDomainList,
      blueskyDomains: []
    });
    if (mosaic !== null) {
      apiStatus.media.mosaic = mosaic;
    }
  }

  if (
    typeof language === 'string' &&
    (language.length === 2 || language.length === 5) &&
    language !== (core.language ?? '').slice(0, 2)
  ) {
    let didTranslate = false;
    if (mEnv.polyglotDomainList.length > 0 && host.translatePolyglot) {
      const translatePolyglot = await host.translatePolyglot(apiStatus as APIStatus, language);
      if (translatePolyglot !== null) {
        apiStatus.translation = {
          text: unescapeText(translatePolyglot?.translated_text || ''),
          source_lang: (translatePolyglot?.source_lang ?? 'en').toLowerCase(),
          target_lang: language.toLowerCase(),
          source_lang_en: host.t(
            `language_${(translatePolyglot?.source_lang ?? 'en').toLowerCase()}`,
            { lng: 'en' }
          ),
          provider: translatePolyglot?.provider ?? 'polyglot'
        };
        didTranslate = true;
      }
    }
    if (host.aiEnabled && !didTranslate && host.translateAI) {
      const translateAPI = await host.translateAI(apiStatus as APIStatus, language);
      if (translateAPI !== null && translateAPI?.translated_text) {
        apiStatus.translation = {
          text: unescapeText(translateAPI.translated_text || ''),
          source_lang: (apiStatus.lang ?? 'en').toLowerCase(),
          target_lang: language.toLowerCase(),
          source_lang_en: host.t(`language_${(apiStatus.lang ?? 'en').toLowerCase()}`, {
            lng: 'en'
          }),
          provider: 'llm'
        };
      }
    }
  }

  return apiStatus;
};
