import { Constants } from '../constants';
import { DataProvider } from '../enum';
import { truncateWithEllipsis } from './utils';

/* Helpers for producing Discord-flavored markdown (component embeds render Text Display
   content as Discord markdown, not HTML). */

/** Escape characters that Discord markdown would otherwise interpret in user-provided text. */
export const escapeMarkdown = (text: string): string =>
  text
    .replace(/([\\*_~`|[\]<>])/g, '\\$1')
    /* Headings (`# `, `## `, `### `) and subtext (`-# `) only apply at the start of a line */
    .replace(/^([ \t]*)(#{1,3}[ \t]|-#[ \t])/gm, '$1\\$2');

/** Make a URL safe to use as the target of a masked link `[label](url)` */
export const escapeMarkdownUrl = (url: string): string =>
  url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');

export const markdownLink = (label: string, url: string): string =>
  `[${label}](${escapeMarkdownUrl(url)})`;

/** Prefix every line with `> ` so multi-line text stays inside the quote */
export const markdownBlockquote = (text: string): string =>
  text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

const URL_TRAILING_PUNCTUATION = /[.,:;!?'"\]]$/;

/* URLs, @mentions (Bluesky/Instagram handles may contain dots and hyphens), and #hashtags */
const TOKEN_REGEX =
  /(https?:\/\/[^\s<>"]+)|(?<![\p{L}\p{N}_/@.])@([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)|(?<![\p{L}\p{N}_/&#])#([\p{L}\p{N}_]*[\p{L}_][\p{L}\p{N}_]*)/gu;

const getLinkBases = (provider: DataProvider): { mention: string; hashtag: string } | null => {
  switch (provider) {
    case DataProvider.Twitter:
      return {
        mention: `${Constants.TWITTER_ROOT}/`,
        hashtag: `${Constants.TWITTER_ROOT}/hashtag/`
      };
    case DataProvider.Bluesky:
      return {
        mention: `${Constants.BLUESKY_ROOT}/profile/`,
        hashtag: `${Constants.BLUESKY_ROOT}/hashtag/`
      };
    case DataProvider.TikTok:
      return { mention: `${Constants.TIKTOK_ROOT}/@`, hashtag: `${Constants.TIKTOK_ROOT}/tag/` };
    case DataProvider.Instagram:
      return {
        mention: `${Constants.INSTAGRAM_ROOT}/`,
        hashtag: `${Constants.INSTAGRAM_ROOT}/explore/tags/`
      };
    default:
      return null;
  }
};

/** Trim punctuation that is almost certainly not part of a URL (keeps balanced parentheses) */
const trimUrl = (url: string): string => {
  for (;;) {
    if (URL_TRAILING_PUNCTUATION.test(url)) {
      url = url.slice(0, -1);
    } else if (
      url.endsWith(')') &&
      (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)
    ) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
};

/**
 * Convert plain post text into Discord markdown: user text is escaped, URLs are left bare
 * (Discord autolinks them), and mentions / hashtags become masked links for the provider
 * unless `linkEntities` is false.
 */
export const formatTextMarkdown = (
  text: string,
  provider: DataProvider,
  linkEntities = true
): string => {
  const bases = linkEntities ? getLinkBases(provider) : null;
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_REGEX)) {
    const index = match.index ?? 0;
    let token = match[0];
    let replacement: string;

    if (match[1]) {
      token = trimUrl(match[1]);
      replacement = token;
    } else if (match[2] && bases) {
      replacement = markdownLink(escapeMarkdown(token), `${bases.mention}${match[2]}`);
    } else if (match[3] && bases) {
      replacement = markdownLink(
        escapeMarkdown(token),
        `${bases.hashtag}${encodeURIComponent(match[3])}`
      );
    } else {
      continue;
    }

    result += escapeMarkdown(text.slice(lastIndex, index)) + replacement;
    lastIndex = index + token.length;
  }

  return result + escapeMarkdown(text.slice(lastIndex));
};

/**
 * Like formatTextMarkdown, but keeps the rendered markdown within `maxLength` characters.
 * Mention and hashtag links cost ~30 characters each, so when the linked text doesn't fit they
 * are dropped before any text is cut. Truncation happens on the source text so masked links
 * are never cut in half.
 */
export const formatTextMarkdownWithin = (
  text: string,
  provider: DataProvider,
  maxLength: number
): { markdown: string; truncated: boolean } => {
  const linked = formatTextMarkdown(text, provider);
  if (linked.length <= maxLength) {
    return { markdown: linked, truncated: false };
  }
  let markdown = formatTextMarkdown(text, provider, false);
  if (markdown.length <= maxLength) {
    return { markdown, truncated: false };
  }
  let sourceLength = Math.min(text.length, maxLength);
  /* Escapes only ever make the output longer than the source,
     so shrink the source by the overflow until it fits */
  for (let attempt = 0; attempt < 8 && sourceLength > 0; attempt++) {
    markdown = formatTextMarkdown(truncateWithEllipsis(text, sourceLength), provider, false);
    if (markdown.length <= maxLength) {
      return { markdown, truncated: true };
    }
    sourceLength -= Math.max(markdown.length - maxLength, 16);
  }
  return { markdown: '…', truncated: true };
};
