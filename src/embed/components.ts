import { Context } from 'hono';
import i18next from 'i18next';
import { Constants } from '../constants';
import { DataProvider } from '../enum';
import { Experiment, experimentCheck } from '../experiments';
import { renderArticleToMarkdown } from '../helpers/article';
import { getBranding, type Branding } from '../helpers/branding';
import { shouldTranscodeGif } from '../helpers/giftranscode';
import {
  escapeMarkdown,
  formatTextMarkdownWithin,
  markdownBlockquote,
  markdownLink
} from '../helpers/markdown';
import { isTombstone } from '../helpers/tombstone';
import { formatNumber, truncateWithEllipsis } from '../helpers/utils';
import type { APIStatusTombstone, APITwitterStatus } from '../realms/api/schemas';
import type { APIStatus } from '../types/apiStatus';
import type { InputFlags } from '../types/types';

/* Discord component embeds: a JSON payload of message components in the page <head> that
   Discord renders in place of the standard link preview. The OG tags stay as the fallback.

   https://github.com/discord/discord-api-docs/blob/main/developers/link-previews/component-embeds.mdx */

export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  Section = 9,
  TextDisplay = 10,
  Thumbnail = 11,
  MediaGallery = 12,
  Separator = 14,
  Container = 17
}

/* Component embeds only allow link buttons */
const BUTTON_STYLE_LINK = 5;

type UnfurledMediaItem = { url: string };

type TextDisplayComponent = { type: ComponentType.TextDisplay; content: string };

type ThumbnailComponent = {
  type: ComponentType.Thumbnail;
  media: UnfurledMediaItem;
  description?: string;
};

type ButtonComponent = {
  type: ComponentType.Button;
  style: typeof BUTTON_STYLE_LINK;
  url: string;
  label: string;
};

type SectionComponent = {
  type: ComponentType.Section;
  components: TextDisplayComponent[];
  accessory: ThumbnailComponent | ButtonComponent;
};

type MediaGalleryItem = { media: UnfurledMediaItem; description?: string; spoiler?: boolean };

type MediaGalleryComponent = { type: ComponentType.MediaGallery; items: MediaGalleryItem[] };

type SeparatorComponent = { type: ComponentType.Separator; divider?: boolean; spacing?: 1 | 2 };

type ContainerChild =
  TextDisplayComponent | SectionComponent | MediaGalleryComponent | SeparatorComponent;

type ContainerComponent = {
  type: ComponentType.Container;
  accent_color?: number;
  components: ContainerChild[];
};

export type ComponentEmbedPayload = { component: ContainerComponent };

/* Limits shared with message components (Discord rejects the whole payload past these) */
const MAX_COMPONENTS = 40;
/* Total across every Text Display, including markdown syntax and link URLs. Not documented for
   link previews; payloads with more text than this weren't displayed in testing. */
const MAX_TEXT_LENGTH = 2100;
const MAX_GALLERY_ITEMS = 10;
const MAX_MEDIA_URL_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_BUTTON_LABEL_LENGTH = 80;

/* Our own limits, so the post body gets most of the text budget */
const QUOTE_MAX_LENGTH = 300;
const COMMUNITY_NOTE_MAX_LENGTH = 400;
const ORIGINAL_TEXT_MIN_LENGTH = 100;
const POLL_BAR_LENGTH = 24;

/**
 * Decided before the post is fetched. `COMPONENT_EMBED` turns component embeds on for all posts.
 * Flags that ask for a specific kind of embed (direct media, gallery, old embeds, API) opt out.
 */
export const getShouldUseComponentEmbed = (userAgent: string, flags: InputFlags): boolean => {
  if (
    !experimentCheck(Experiment.COMPONENT_EMBED, userAgent.includes('Discordbot')) ||
    flags.direct ||
    flags.gallery ||
    flags.api ||
    flags.noActivity ||
    flags.archive
  ) {
    return false;
  }
  return true;
};

/** External players and broadcasts stay on the player meta tags, which a component embed would replace. */
export const keepsClassicPlayerEmbed = (status: APIStatus): boolean =>
  (status.media?.all?.length ?? 0) <= 0 &&
  !!(status.media?.external?.url || status.media?.broadcast?.stream?.url);

const PLATFORM_NAMES: Partial<Record<DataProvider, string>> = {
  [DataProvider.Bluesky]: 'Bluesky',
  [DataProvider.TikTok]: 'TikTok',
  [DataProvider.Instagram]: 'Instagram'
};

/** Name the platform the way the link does: "Twitter" on fxtwitter.com / twittpr.com, "X" on fixupx.com */
const getPlatformName = (provider: DataProvider, flags: InputFlags): string | undefined =>
  provider === DataProvider.Twitter
    ? flags.isXDomain === false
      ? 'Twitter'
      : 'X'
    : PLATFORM_NAMES[provider];

const textDisplay = (content: string): TextDisplayComponent => ({
  type: ComponentType.TextDisplay,
  content
});

const isUsableMediaUrl = (url: string | null | undefined): url is string =>
  !!url && /^https?:\/\//.test(url) && url.length <= MAX_MEDIA_URL_LENGTH;

const galleryItem = (url: string, description?: string | null): MediaGalleryItem => ({
  media: { url },
  ...(description ? { description: truncateWithEllipsis(description, MAX_DESCRIPTION_LENGTH) } : {})
});

const gallery = (items: MediaGalleryItem[]): MediaGalleryComponent | null =>
  items.length > 0
    ? { type: ComponentType.MediaGallery, items: items.slice(0, MAX_GALLERY_ITEMS) }
    : null;

/** Same media URL handling as the activity embed (GIF transcodes, video redirect workaround) */
const statusMediaItem = (
  c: Context,
  media: APIPhoto | APIVideo,
  provider: DataProvider
): MediaGalleryItem | null => {
  let url = media.url;
  if (media.type === 'gif' && media.format !== 'image/gif') {
    const transcodeUrl = (media as APIPhoto).transcode_url;
    if (transcodeUrl && shouldTranscodeGif(c)) {
      url = transcodeUrl;
    }
  } else if (
    media.type === 'video' &&
    provider !== DataProvider.TikTok &&
    provider !== DataProvider.Instagram &&
    experimentCheck(Experiment.VIDEO_REDIRECT_WORKAROUND, !!Constants.API_HOST_LIST)
  ) {
    url = `https://${Constants.API_HOST_LIST[0]}/2/go?url=${encodeURIComponent(url)}`;
  }
  return isUsableMediaUrl(url) ? galleryItem(url, (media as APIPhoto).altText) : null;
};

const statusMediaItems = (
  c: Context,
  status: APIStatus,
  flags: InputFlags,
  mediaNumber?: number
): MediaGalleryItem[] => {
  const all = status.media?.all ?? [];
  const selected = mediaNumber ? all[mediaNumber - 1] : undefined;
  if (selected) {
    const item = statusMediaItem(c, selected, status.provider);
    return item ? [item] : [];
  }
  const mosaicUrl = status.media?.mosaic?.formats?.jpeg;
  if (flags.forceMosaic && all.length > 1 && isUsableMediaUrl(mosaicUrl)) {
    return [galleryItem(mosaicUrl)];
  }
  return all
    .map(media => statusMediaItem(c, media, status.provider))
    .filter((item): item is MediaGalleryItem => item !== null);
};

const articleMediaItem = (media: TwitterApiMedia): MediaGalleryItem | null => {
  if (media.media_info.__typename === 'ApiImage') {
    const url = media.media_info.original_img_url;
    return isUsableMediaUrl(url) ? galleryItem(url) : null;
  }
  const video = media.media_info as TwitterApiVideo;
  /* Article videos have variants directly on media_info, regular videos under video_info */
  const variants =
    ((media.media_info as Record<string, unknown>).variants as
      { url: string; bit_rate?: number; bitrate?: number; content_type?: string }[] | undefined) ??
    video.video_info?.variants;
  const best = (variants ?? [])
    .filter(variant => variant.url && !variant.url.includes('.m3u8'))
    .sort(
      (a, b) =>
        ((b as { bit_rate?: number }).bit_rate ?? b.bitrate ?? 0) -
        ((a as { bit_rate?: number }).bit_rate ?? a.bitrate ?? 0)
    )[0];
  return isUsableMediaUrl(best?.url) ? galleryItem(best.url, video.ext_alt_text) : null;
};

const authorHeader = (status: APIStatus): string => {
  const { author } = status;
  const name = escapeMarkdown(author.name || author.screen_name || '');
  const lines = [`### ${author.url ? markdownLink(name, author.url) : name}\n`];
  if (author.screen_name) {
    lines.push(`-# @${escapeMarkdown(author.screen_name)}`);
  }
  if (status.replying_to) {
    const { replying_to } = status;
    const label =
      replying_to.screen_name === author.screen_name
        ? i18next.t('threadPartHeader').format({ screen_name: replying_to.screen_name })
        : i18next.t('replyingTo').format({ screen_name: replying_to.screen_name });
    const url = replying_to.url ?? replying_to.profile_url;
    lines.push(`-# ↩ ${url ? markdownLink(escapeMarkdown(label), url) : escapeMarkdown(label)}`);
  }
  return lines.join('\n');
};

const translationHeader = (status: APIStatus): string =>
  `-# 📑 ${escapeMarkdown(
    i18next.t('translatedFrom').format({
      language: i18next.t(`language_${status.translation?.source_lang}`)
    })
  )}`;

/** Post text, with the translation first and the original quoted below when there's room */
const statusBody = (status: APIStatus, maxLength: number): string => {
  if (!status.translation?.text) {
    return formatTextMarkdownWithin(status.text, status.provider, maxLength).markdown;
  }
  const header = translationHeader(status);
  const translated = formatTextMarkdownWithin(
    status.translation.text,
    status.provider,
    maxLength - header.length - 1
  ).markdown;
  let body = `${header}\n${translated}`;

  const originalHeader = `**${escapeMarkdown(i18next.t('ivOriginalText'))}**\n`;
  /* Every line of the original gets a `> ` prefix, so leave some slack for those */
  const originalRoom = maxLength - body.length - originalHeader.length - 2;
  if (originalRoom >= ORIGINAL_TEXT_MIN_LENGTH && status.text.trim()) {
    const original = formatTextMarkdownWithin(
      status.text,
      status.provider,
      originalRoom - status.text.split('\n').length * 2
    ).markdown;
    body += `\n\n${markdownBlockquote(originalHeader + original)}`;
  }
  return body;
};

const quoteBlock = (quote: APIStatus | APIStatusTombstone): string => {
  if (isTombstone(quote)) {
    return markdownBlockquote(
      `*${escapeMarkdown(`${i18next.t('quotedFromTombstone')}: ${quote.message}`)}*`
    );
  }
  const heading = escapeMarkdown(
    i18next.t('quotedFrom').format({
      name: quote.author?.name ?? '',
      screen_name: quote.author?.screen_name ?? ''
    })
  );
  const quoteText = quote.translation?.text ?? quote.text;
  const body = quoteText.trim()
    ? `\n${formatTextMarkdownWithin(quoteText, quote.provider, QUOTE_MAX_LENGTH).markdown}`
    : '';
  return markdownBlockquote(`**${quote.url ? markdownLink(heading, quote.url) : heading}**${body}`);
};

const pollBlock = (poll: APIPoll): string => {
  const choices = poll.choices.map(choice => {
    const bar = '█'.repeat(Math.round((choice.percentage / 100) * POLL_BAR_LENGTH));
    return `${bar}\n**${escapeMarkdown(choice.label)}** · ${choice.percentage}%`;
  });
  const footer = i18next.t('pollVotes', {
    voteCount: poll.total_votes,
    timeLeft: poll.time_left_en ?? ''
  });
  return `${choices.join('\n')}\n-# ${escapeMarkdown(footer.replace(/\n/g, ' '))}`;
};

const communityNoteBlock = (status: APITwitterStatus): string | null => {
  const noteText = status.community_note?.text?.trim();
  if (!noteText) {
    return null;
  }
  const note = formatTextMarkdownWithin(
    noteText,
    DataProvider.Twitter,
    COMMUNITY_NOTE_MAX_LENGTH
  ).markdown;
  return `-# ⚠️ ${escapeMarkdown(i18next.t('ivCommunityNoteHeader'))}\n${markdownBlockquote(note)}`;
};

/* Custom emojis for engagement counts (views has no custom emoji yet) */
const ENGAGEMENT_EMOJI = {
  replies: '<:Replies:1554338278545825812>',
  reposts: '<:Reposts:1554354865013260411>',
  likes: '<:Likes:1554338262116737044>',
  views: '<:Views:1554338751231168522>'
};

const engagementText = (status: APIStatus): string | null => {
  const views = (status as APITwitterStatus).views ?? 0;
  const counts: [string, number][] = [
    [ENGAGEMENT_EMOJI.replies, status.replies],
    [ENGAGEMENT_EMOJI.reposts, status.reposts],
    [ENGAGEMENT_EMOJI.likes, status.likes],
    [ENGAGEMENT_EMOJI.views, views]
  ];
  const parts = counts
    .filter(([, count]) => count > 0)
    .map(([emoji, count]) => `${emoji} ${formatNumber(count)}`);
  return parts.length > 0 ? `${parts.join('    ')}` : null;
};

/** `<:Name:id>` for the branding's emoji. Discord only needs the ID to match, so any valid name works. */
const brandingEmoji = (branding: Branding): string => {
  if (!branding.emojiId || !/^\d{17,20}$/.test(branding.emojiId)) {
    return '';
  }
  const name = branding.name.replace(/\W/g, '').slice(0, 32);
  return `<:${name.length >= 2 ? name : 'branding'}:${branding.emojiId}> `;
};

/** Engagement and branding/date, as separate Text Displays so Discord spaces them apart */
const footerTexts = (status: APIStatus, branding: Branding): string[] => {
  const texts: string[] = [];
  const engagement = engagementText(status);
  if (engagement) {
    texts.push(`-# ${engagement}`);
  }
  const timestamp = Math.floor(status.created_timestamp);
  const brandingText = `${brandingEmoji(branding)}**${escapeMarkdown(branding.name)}**`;
  texts.push(timestamp > 0 ? `-# ${brandingText} · <t:${timestamp}:f>` : `-# ${brandingText}`);
  return texts;
};

const parseColor = (color: string | undefined): number | undefined => {
  const match = color?.match(/^#?([0-9a-f]{6})$/i);
  return match ? parseInt(match[1], 16) : undefined;
};

const textLength = (components: ContainerChild[]): number =>
  components.reduce((length, component) => {
    if (component.type === ComponentType.TextDisplay) {
      return length + component.content.length;
    }
    if (component.type === ComponentType.Section) {
      return length + textLength(component.components);
    }
    return length;
  }, 0);

const componentCount = (components: ContainerChild[]): number =>
  components.reduce(
    (count, component) =>
      count + 1 + (component.type === ComponentType.Section ? component.components.length + 1 : 0),
    1
  );

interface ComponentEmbedOptions {
  context: Context;
  status: APIStatus;
  /** Permalink of the post on its platform (respects the `horizon` flag) */
  publicUrl: string;
  flags: InputFlags;
  mediaNumber?: number;
}

/**
 * Builds a component embed for a post. The layout is, top to bottom:
 * author (avatar when the post has no media), article title & cover, text, poll, media, quote,
 * community note, then engagement and a link back to the post.
 * Expects i18next to already be initialized for the embed's language.
 */
export const buildComponentEmbed = ({
  context,
  status,
  publicUrl,
  flags,
  mediaNumber
}: ComponentEmbedOptions): ComponentEmbedPayload => {
  const branding = getBranding(context);
  const twitterStatus = status as APITwitterStatus;
  const article = status.provider === DataProvider.Twitter ? twitterStatus.article : undefined;
  const includeMedia = !flags.textOnly;

  /* Everything except the post body has a fixed size, so the body gets whatever is left */
  const header = authorHeader(status);
  const footer = footerTexts(status, branding);
  const poll = status.poll ? pollBlock(status.poll) : null;
  const quote = status.quote ? quoteBlock(status.quote) : null;
  const note = status.provider === DataProvider.Twitter ? communityNoteBlock(twitterStatus) : null;
  const bodyBudget =
    MAX_TEXT_LENGTH -
    header.length -
    footer.join('').length -
    (poll?.length ?? 0) -
    (quote?.length ?? 0) -
    (note?.length ?? 0);

  const components: ContainerChild[] = [];

  /* Media is resolved first so the author header can show the avatar only when nothing else will */
  let mediaGallery: MediaGalleryComponent | null = null;
  let articleTitle: string | null = null;
  let articleCover: MediaGalleryComponent | null = null;
  let articleBody: string | null = null;

  if (article) {
    articleTitle = `## ${escapeMarkdown(article.title)}`;
    const coverItem =
      includeMedia && article.cover_media ? articleMediaItem(article.cover_media) : null;
    articleCover = gallery(coverItem ? [coverItem] : []);

    const { markdown, collectedMedia } = renderArticleToMarkdown(article.content, {
      maxLength: bodyBudget - articleTitle.length,
      mediaEntities: article.media_entities ?? []
    });
    if (markdown.trim()) {
      articleBody = markdown;
    }
    if (includeMedia) {
      mediaGallery = gallery(
        collectedMedia
          .filter(media => media.media_id !== article.cover_media?.media_id)
          .map(articleMediaItem)
          .filter((item): item is MediaGalleryItem => item !== null)
      );
    }
  } else if (includeMedia) {
    mediaGallery = gallery(statusMediaItems(context, status, flags, mediaNumber));
  }

  const postHasMedia = !!(articleCover || mediaGallery);

  components.push(
    !postHasMedia && isUsableMediaUrl(status.author.avatar_url)
      ? {
          type: ComponentType.Section,
          components: [textDisplay(header)],
          accessory: { type: ComponentType.Thumbnail, media: { url: status.author.avatar_url } }
        }
      : textDisplay(header)
  );

  if (articleTitle) {
    components.push(textDisplay(articleTitle));
  }
  if (articleCover) {
    components.push(articleCover);
  }
  if (article) {
    if (articleBody) {
      components.push(textDisplay(articleBody));
    }
  } else {
    const body = statusBody(status, bodyBudget);
    if (body.trim()) {
      components.push(textDisplay(body));
    }
  }

  if (poll) {
    components.push(textDisplay(poll));
  }

  if (mediaGallery) {
    components.push(mediaGallery);
  }

  if (quote && status.quote) {
    components.push(textDisplay(quote));
    /* Like the regular embed, a quote's media is shown when the post itself has none */
    if (includeMedia && !mediaGallery && !isTombstone(status.quote)) {
      const quoteGallery = gallery(statusMediaItems(context, status.quote, flags, mediaNumber));
      if (quoteGallery) {
        components.push(quoteGallery);
      }
    }
  }

  if (note) {
    components.push(textDisplay(note));
  }

  components.push({ type: ComponentType.Separator, divider: true, spacing: 1 });

  const platform = getPlatformName(status.provider, flags);
  if (platform && publicUrl) {
    components.push({
      type: ComponentType.Section,
      components: footer.map(textDisplay),
      accessory: {
        type: ComponentType.Button,
        style: BUTTON_STYLE_LINK,
        url: publicUrl,
        label: truncateWithEllipsis(
          i18next.t('viewOnPlatform', { platform }),
          MAX_BUTTON_LABEL_LENGTH
        )
      }
    });
  } else {
    components.push(...footer.map(textDisplay));
  }

  if (textLength(components) > MAX_TEXT_LENGTH || componentCount(components) > MAX_COMPONENTS) {
    throw new Error('Component embed exceeds Discord limits');
  }

  return {
    component: {
      type: ComponentType.Container,
      accent_color: parseColor(branding.color),
      components
    }
  };
};

/** Inline `<script>` tag for the page head. Escapes anything that could close the script early. */
export const renderComponentEmbed = (payload: ComponentEmbedPayload): string =>
  `<script id="discord:component-embed" type="application/json">${JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
