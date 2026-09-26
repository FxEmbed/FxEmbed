import i18next from 'i18next';
import { Constants } from '../constants';
import { DataProvider } from '../enum';
import { Experiment, experimentCheck } from '../experiments';
import { getSocialProof } from '../helpers/socialproof';
import '../strings';
import { isTombstone } from '../helpers/tombstone';
import type { APITwitterStatus } from '../realms/api/schemas';
import type { APIStatus } from '../types/apiStatus';

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

const LINK_BUTTON_STYLE = 5;

export interface UnfurledMediaItem {
  url: string;
}

export interface LinkButtonComponent {
  type: ComponentType.Button;
  style: typeof LINK_BUTTON_STYLE;
  url: string;
  label?: string;
  emoji?: { name: string; id?: string; animated?: boolean };
  disabled?: boolean;
}

export interface ActionRowComponent {
  type: ComponentType.ActionRow;
  components: LinkButtonComponent[];
}

export interface TextDisplayComponent {
  type: ComponentType.TextDisplay;
  content: string;
}

export interface ThumbnailComponent {
  type: ComponentType.Thumbnail;
  media: UnfurledMediaItem;
  description?: string;
  spoiler?: boolean;
}

export interface SectionComponent {
  type: ComponentType.Section;
  components: TextDisplayComponent[];
  accessory: ThumbnailComponent | LinkButtonComponent;
}

export interface MediaGalleryItem {
  media: UnfurledMediaItem;
  description?: string;
  spoiler?: boolean;
}

export interface MediaGalleryComponent {
  type: ComponentType.MediaGallery;
  items: MediaGalleryItem[];
}

export interface SeparatorComponent {
  type: ComponentType.Separator;
  divider?: boolean;
  spacing?: 1 | 2;
}

export type ContainerChild =
  | ActionRowComponent
  | TextDisplayComponent
  | SectionComponent
  | MediaGalleryComponent
  | SeparatorComponent;

export interface ContainerComponent {
  type: ComponentType.Container;
  accent_color?: number;
  spoiler?: boolean;
  components: ContainerChild[];
}

export interface ComponentEmbedPayload {
  component: ContainerComponent;
}

export const ComponentEmbedLimits = {
  MAX_COMPONENTS: 40,
  MAX_TEXT_LENGTH: 4000,
  MAX_MEDIA_URL_LENGTH: 2048,
  MAX_BUTTON_URL_LENGTH: 512,
  MAX_BUTTON_LABEL_LENGTH: 80,
  MAX_DESCRIPTION_LENGTH: 1024,
  MAX_GALLERY_ITEMS: 10,
  MAX_SECTION_TEXTS: 3,
  MAX_ACTION_ROW_BUTTONS: 5
};

const BODY_TEXT_BUDGET = 1800;
const TRANSLATION_ORIGINAL_BUDGET = 400;
const QUOTE_TEXT_BUDGET = 400;
const COMMUNITY_NOTE_BUDGET = 400;
const ARTICLE_PREVIEW_BUDGET = 300;

const truncate = (text: string, max: number): string => {
  const chars = Array.from(text);
  if (chars.length <= max) {
    return text;
  }
  return (
    chars
      .slice(0, max - 1)
      .join('')
      .trimEnd() + '…'
  );
};

const URL_REGEX = /https?:\/\/[^\s<>]+/g;

export const escapeMarkdown = (text: string): string => {
  const escapeSegment = (segment: string) =>
    segment
      .replace(/([\\*_~`|[\]<>])/g, '\\$1')
      .replace(/^(\s*)([#>-]|\d+\.)(?=\s)/gm, (_match, indent: string, marker: string) =>
        marker.endsWith('.') ? `${indent}${marker.slice(0, -1)}\\.` : `${indent}\\${marker}`
      );

  let result = '';
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    result += escapeSegment(text.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  return result + escapeSegment(text.slice(lastIndex));
};

const blockquote = (text: string): string =>
  text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

const fitText = (text: string, budget: number, quote = false): string => {
  const render = (t: string) => (quote ? blockquote(escapeMarkdown(t)) : escapeMarkdown(t));
  let limit = budget;
  let result = render(truncate(text, limit));
  while (result.length > budget && limit > 1) {
    limit = Math.max(1, limit - (result.length - budget));
    result = render(truncate(text, limit));
  }
  return result;
};

const isHttpUrl = (url: string | null | undefined): url is string =>
  typeof url === 'string' && /^https?:\/\//.test(url);

const hexToInt = (color: string | undefined): number | undefined => {
  const match = color?.match(/^#?([0-9a-f]{6})$/i);
  return match ? parseInt(match[1], 16) : undefined;
};

const formatPostDate = (timestamp: number | undefined): string | null => {
  if (!timestamp) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(i18next.language || 'en', { dateStyle: 'medium' }).format(
      new Date(timestamp * 1000)
    );
  } catch {
    return null;
  }
};

const providerLabel = (provider: DataProvider): string => {
  switch (provider) {
    case DataProvider.Twitter:
      return 'X';
    case DataProvider.Bluesky:
      return 'Bluesky';
    case DataProvider.TikTok:
      return 'TikTok';
    case DataProvider.Instagram:
      return 'Instagram';
    default:
      return 'Open';
  }
};

type GalleryMedia = NonNullable<APIStatus['media']['all']>[number];

const galleryItemForMedia = (
  media: GalleryMedia,
  status: APIStatus,
  transcodeGifs: boolean
): MediaGalleryItem | null => {
  let url = media.url;

  if (media.type === 'gif') {
    if (transcodeGifs && media.transcode_url) {
      url = media.transcode_url;
    }
  } else if (
    media.type === 'video' &&
    experimentCheck(Experiment.VIDEO_REDIRECT_WORKAROUND, !!Constants.API_HOST_LIST) &&
    status.provider !== DataProvider.TikTok &&
    status.provider !== DataProvider.Instagram
  ) {
    url = `https://${Constants.API_HOST_LIST[0]}/2/go?url=${encodeURIComponent(url)}`;
  }

  if (!isHttpUrl(url) || url.length > ComponentEmbedLimits.MAX_MEDIA_URL_LENGTH) {
    return null;
  }

  const item: MediaGalleryItem = { media: { url } };
  const altText = 'altText' in media ? media.altText : undefined;
  if (altText) {
    item.description = truncate(altText, ComponentEmbedLimits.MAX_DESCRIPTION_LENGTH);
  }
  return item;
};

export interface ComponentEmbedOptions {
  statusUrl: string;
  accentColor?: string;
  mediaNumber?: number;
  textOnly?: boolean;
  transcodeGifs?: boolean;
}

export const buildStatusComponentEmbed = (
  status: APIStatus,
  options: ComponentEmbedOptions
): ComponentEmbedPayload | null => {
  if (
    (status.media?.all?.length ?? 0) === 0 &&
    (status.media?.external?.url || status.media?.broadcast?.stream?.url)
  ) {
    return null;
  }

  const twitterStatus = status as APITwitterStatus;
  const quote = status.quote && !isTombstone(status.quote) ? status.quote : null;
  const children: ContainerChild[] = [];

  const { author } = status;
  const authorUrl = isHttpUrl(author.url) ? author.url : options.statusUrl;
  const meta = [`[@${escapeMarkdown(author.screen_name)}](${authorUrl})`];
  const postDate = formatPostDate(status.created_timestamp);
  if (postDate) {
    meta.push(escapeMarkdown(postDate));
  }
  let header = `### [${escapeMarkdown(author.name || author.screen_name)}](${authorUrl})\n-# ${meta.join(' · ')}`;
  if (status.replying_to?.screen_name) {
    header += `\n-# ↩ ${escapeMarkdown(
      i18next.t('replyingTo').format({ screen_name: status.replying_to.screen_name })
    )}`;
  }

  const headerText: TextDisplayComponent = { type: ComponentType.TextDisplay, content: header };
  if (isHttpUrl(author.avatar_url)) {
    children.push({
      type: ComponentType.Section,
      components: [headerText],
      accessory: { type: ComponentType.Thumbnail, media: { url: author.avatar_url } }
    });
  } else {
    children.push(headerText);
  }

  let body = '';
  if (status.translation?.text) {
    const translatedFrom = i18next.t('translatedFrom').format({
      language: i18next.t(`language_${status.translation.source_lang}`)
    });
    body =
      `-# 📑 ${escapeMarkdown(translatedFrom)}\n` +
      fitText(status.translation.text.trim(), BODY_TEXT_BUDGET);
    if (status.text.trim()) {
      body +=
        `\n${blockquote(`**${escapeMarkdown(i18next.t('ivOriginalText'))}**`)}\n` +
        fitText(status.text.trim(), TRANSLATION_ORIGINAL_BUDGET, true);
    }
  } else if (status.text.trim()) {
    body = fitText(status.text.trim(), BODY_TEXT_BUDGET);
  }
  if (body) {
    children.push({ type: ComponentType.TextDisplay, content: body });
  }

  if (twitterStatus.article) {
    const { article } = twitterStatus;
    let content = `**📰 [${escapeMarkdown(article.title)}](${options.statusUrl})**`;
    if (article.preview_text) {
      content += `\n${fitText(article.preview_text, ARTICLE_PREVIEW_BUDGET)}`;
    }
    children.push({ type: ComponentType.TextDisplay, content });
  }

  if (status.poll) {
    const barLength = 16;
    const top = Math.max(...status.poll.choices.map(choice => choice.percentage));
    const lines = status.poll.choices.map(choice => {
      const filled = Math.round((choice.percentage / 100) * barLength);
      const label = escapeMarkdown(choice.label);
      return `\`${'█'.repeat(filled)}${'░'.repeat(barLength - filled)}\` ${choice.percentage}%  ${
        choice.percentage === top && top > 0 ? `**${label}**` : label
      }`;
    });
    lines.push(
      `-# ${escapeMarkdown(
        i18next.t('pollVotes', {
          voteCount: status.poll.total_votes,
          timeLeft: status.poll.time_left_en ?? ''
        })
      )}`
    );
    children.push({ type: ComponentType.TextDisplay, content: lines.join('\n') });
  }

  if (status.quote) {
    let content: string;
    if (quote) {
      const quoteHeader = i18next.t('quotedFrom').format({
        name: quote.author.name,
        screen_name: quote.author.screen_name
      });
      content = blockquote(`**[${escapeMarkdown(quoteHeader)}](${quote.url})**`);
      const quoteText = (quote.translation?.text ?? quote.text).trim();
      if (quoteText) {
        content += `\n${fitText(quoteText, QUOTE_TEXT_BUDGET, true)}`;
      }
    } else {
      content = blockquote(`*${escapeMarkdown(i18next.t('quotedFromTombstone'))}*`);
    }
    children.push({ type: ComponentType.TextDisplay, content });
  }

  const communityNote = twitterStatus.community_note?.text?.trim();
  if (communityNote) {
    children.push({
      type: ComponentType.TextDisplay,
      content:
        `${blockquote(`**${escapeMarkdown(i18next.t('ivCommunityNoteHeader'))}**`)}\n` +
        fitText(communityNote, COMMUNITY_NOTE_BUDGET, true)
    });
  }

  if (!options.textOnly) {
    let mediaList: GalleryMedia[] =
      (status.media?.all?.length ?? 0) > 0 ? status.media.all! : (quote?.media?.all ?? []);

    if (options.mediaNumber && mediaList[options.mediaNumber - 1]) {
      mediaList = [mediaList[options.mediaNumber - 1]];
    }

    const items = mediaList
      .map(media => galleryItemForMedia(media, status, options.transcodeGifs ?? false))
      .filter((item): item is MediaGalleryItem => item !== null)
      .slice(0, ComponentEmbedLimits.MAX_GALLERY_ITEMS);

    if (items.length === 0 && twitterStatus.article?.cover_media?.media_info) {
      const cover = twitterStatus.article.cover_media.media_info as { original_img_url?: string };
      if (isHttpUrl(cover.original_img_url)) {
        items.push({ media: { url: cover.original_img_url } });
      }
    }

    if (items.length > 0) {
      children.push({ type: ComponentType.MediaGallery, items });
    }
  }

  const socialProof = getSocialProof(status);
  const openButton: LinkButtonComponent | null = isHttpUrl(options.statusUrl)
    ? {
        type: ComponentType.Button,
        style: LINK_BUTTON_STYLE,
        url: options.statusUrl,
        label: truncate(
          i18next.t('viewOnPlatform').format({ platform: providerLabel(status.provider) }),
          ComponentEmbedLimits.MAX_BUTTON_LABEL_LENGTH
        )
      }
    : null;

  if (socialProof || openButton) {
    children.push({ type: ComponentType.Separator, divider: true, spacing: 1 });
  }
  const socialText: TextDisplayComponent | null = socialProof
    ? { type: ComponentType.TextDisplay, content: `-# ${socialProof.replace(/ {3}/g, '  ·  ')}` }
    : null;
  if (socialText && openButton) {
    children.push({ type: ComponentType.Section, components: [socialText], accessory: openButton });
  } else if (socialText) {
    children.push(socialText);
  } else if (openButton) {
    children.push({ type: ComponentType.ActionRow, components: [openButton] });
  }

  const container: ContainerComponent = { type: ComponentType.Container, components: children };
  const accentColor = hexToInt(options.accentColor);
  if (accentColor !== undefined) {
    container.accent_color = accentColor;
  }

  return { component: container };
};

export const validateComponentEmbed = (payload: ComponentEmbedPayload): string[] => {
  const errors: string[] = [];
  let componentCount = 0;
  let textLength = 0;

  const checkMediaUrl = (url: unknown, path: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      errors.push(`${path}: media URL must be http(s)`);
    } else if (url.length > ComponentEmbedLimits.MAX_MEDIA_URL_LENGTH) {
      errors.push(`${path}: media URL is longer than ${ComponentEmbedLimits.MAX_MEDIA_URL_LENGTH}`);
    }
  };

  const checkDescription = (description: unknown, path: string) => {
    if (
      typeof description === 'string' &&
      description.length > ComponentEmbedLimits.MAX_DESCRIPTION_LENGTH
    ) {
      errors.push(`${path}: description is too long`);
    }
  };

  const checkButton = (button: LinkButtonComponent, path: string) => {
    componentCount++;
    const allowedKeys = ['type', 'url', 'style', 'label', 'emoji', 'disabled'];
    for (const key of Object.keys(button)) {
      if (!allowedKeys.includes(key)) {
        errors.push(`${path}: button key "${key}" is not allowed`);
      }
    }
    if (button.style !== LINK_BUTTON_STYLE) {
      errors.push(`${path}: button must use the link style`);
    }
    if (!button.label && !button.emoji) {
      errors.push(`${path}: button needs a label or an emoji`);
    }
    if (button.label && button.label.length > ComponentEmbedLimits.MAX_BUTTON_LABEL_LENGTH) {
      errors.push(`${path}: button label is too long`);
    }
    if (typeof button.url !== 'string' || !/^https?:\/\//.test(button.url)) {
      errors.push(`${path}: button URL must be http(s)`);
    } else if (button.url.length > ComponentEmbedLimits.MAX_BUTTON_URL_LENGTH) {
      errors.push(`${path}: button URL is too long`);
    }
  };

  const checkText = (text: TextDisplayComponent, path: string) => {
    componentCount++;
    if (typeof text.content !== 'string' || text.content.length === 0) {
      errors.push(`${path}: text display needs content`);
      return;
    }
    textLength += text.content.length;
  };

  const checkThumbnail = (thumbnail: ThumbnailComponent, path: string) => {
    componentCount++;
    checkMediaUrl(thumbnail.media?.url, path);
    checkDescription(thumbnail.description, path);
  };

  const checkChild = (child: ContainerChild, path: string) => {
    switch (child.type) {
      case ComponentType.TextDisplay:
        checkText(child, path);
        break;
      case ComponentType.Section:
        componentCount++;
        if (
          !Array.isArray(child.components) ||
          child.components.length < 1 ||
          child.components.length > ComponentEmbedLimits.MAX_SECTION_TEXTS
        ) {
          errors.push(`${path}: section needs 1-3 text displays`);
        } else {
          child.components.forEach((text, i) => {
            if (text.type !== ComponentType.TextDisplay) {
              errors.push(`${path}.components[${i}]: sections only hold text displays`);
            } else {
              checkText(text, `${path}.components[${i}]`);
            }
          });
        }
        if (child.accessory?.type === ComponentType.Thumbnail) {
          checkThumbnail(child.accessory, `${path}.accessory`);
        } else if (child.accessory?.type === ComponentType.Button) {
          checkButton(child.accessory, `${path}.accessory`);
        } else {
          errors.push(`${path}: section accessory must be a thumbnail or a button`);
        }
        break;
      case ComponentType.MediaGallery:
        componentCount++;
        if (
          !Array.isArray(child.items) ||
          child.items.length < 1 ||
          child.items.length > ComponentEmbedLimits.MAX_GALLERY_ITEMS
        ) {
          errors.push(`${path}: media gallery needs 1-10 items`);
        } else {
          child.items.forEach((item, i) => {
            checkMediaUrl(item.media?.url, `${path}.items[${i}]`);
            checkDescription(item.description, `${path}.items[${i}]`);
          });
        }
        break;
      case ComponentType.Separator:
        componentCount++;
        break;
      case ComponentType.ActionRow:
        componentCount++;
        if (
          !Array.isArray(child.components) ||
          child.components.length < 1 ||
          child.components.length > ComponentEmbedLimits.MAX_ACTION_ROW_BUTTONS
        ) {
          errors.push(`${path}: action row needs 1-5 buttons`);
        } else {
          child.components.forEach((button, i) => {
            if (button.type !== ComponentType.Button) {
              errors.push(`${path}.components[${i}]: action rows only hold buttons`);
            } else {
              checkButton(button, `${path}.components[${i}]`);
            }
          });
        }
        break;
      default:
        errors.push(
          `${path}: component type ${(child as { type: unknown }).type} is not allowed here`
        );
    }
  };

  const container = payload?.component;
  if (container?.type !== ComponentType.Container) {
    errors.push('component: top level component must be a container');
    return errors;
  }
  componentCount++;
  if (!Array.isArray(container.components) || container.components.length === 0) {
    errors.push('component: container needs at least one component');
  } else {
    container.components.forEach((child, i) => checkChild(child, `component.components[${i}]`));
  }

  if (componentCount > ComponentEmbedLimits.MAX_COMPONENTS) {
    errors.push(
      `component: ${componentCount} components is more than ${ComponentEmbedLimits.MAX_COMPONENTS}`
    );
  }
  if (textLength > ComponentEmbedLimits.MAX_TEXT_LENGTH) {
    errors.push(
      `component: ${textLength} characters of text is more than ${ComponentEmbedLimits.MAX_TEXT_LENGTH}`
    );
  }

  return errors;
};

export const renderComponentEmbedScript = (payload: ComponentEmbedPayload): string => {
  const json = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script id="discord:component-embed" type="application/json">${json}</script>`;
};
