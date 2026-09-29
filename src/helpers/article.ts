import { Constants } from '../constants';
import { sanitizeText, truncateWithEllipsis, wrapForeignLinks } from './utils';
import { escapeMarkdown, escapeMarkdownUrl, markdownBlockquote } from './markdown';

const DISCORD_ARTICLE_MAX_LENGTH = 10000;

interface ArticleRenderOptions {
  maxLength?: number; // undefined = no limit (Telegram)
  fullRenderer?: boolean; // true for Telegram, false for Discord
  mediaEntities: TwitterApiMedia[];
  apiHost?: string; // Required for Telegram to wrap foreign links
  photoUrlTransform?: (url: string) => string;
}

interface ArticleRenderResult {
  html: string;
  collectedMedia: TwitterApiMedia[]; // For Discord media_attachments
  wasTruncated: boolean;
}

interface StyleRange {
  offset: number;
  length: number;
  style: string;
}

interface EntityRange {
  offset: number;
  length: number;
  key: number;
}

interface InlineLink {
  fromIndex: number;
  toIndex: number;
  href: string;
  text: string;
  kind: 'mention' | 'url' | 'hashtag' | 'cashtag';
}

/** Draft.js-style entity payloads in article block `data` (mentions, urls, hashtags, cashtags). */
interface BlockDataEntitySpan {
  fromIndex: number;
  toIndex: number;
  text: string;
}

/**
 * Collects all inline links (mentions, URLs, hashtags) from block data
 * @param block The content block
 * @param apiHost Optional API host for wrapping foreign links (for Telegram)
 */
const collectInlineLinks = (block: TwitterArticleContentBlock, apiHost?: string): InlineLink[] => {
  const links: InlineLink[] = [];
  const data = block.data;

  // Process mentions -> link to twitter profile
  if (Array.isArray(data.mentions)) {
    for (const mention of data.mentions as BlockDataEntitySpan[]) {
      links.push({
        fromIndex: mention.fromIndex,
        toIndex: mention.toIndex,
        href: `${Constants.TWITTER_ROOT}/${mention.text}`,
        text: `@${mention.text}`,
        kind: 'mention'
      });
    }
  }

  // Process URLs -> use the URL as the link (wrap for Telegram if apiHost provided)
  if (Array.isArray(data.urls)) {
    for (const url of data.urls as BlockDataEntitySpan[]) {
      const href = apiHost ? wrapForeignLinks(url.text, apiHost) : url.text;
      links.push({
        fromIndex: url.fromIndex,
        toIndex: url.toIndex,
        href,
        text: url.text,
        kind: 'url'
      });
    }
  }

  // Process hashtags -> link to twitter hashtag search
  if (Array.isArray(data.hashtags)) {
    for (const hashtag of data.hashtags as BlockDataEntitySpan[]) {
      links.push({
        fromIndex: hashtag.fromIndex,
        toIndex: hashtag.toIndex,
        href: `${Constants.TWITTER_ROOT}/hashtag/${hashtag.text}`,
        text: `#${hashtag.text}`,
        kind: 'hashtag'
      });
    }
  }

  // Process cashtags (symbols) -> link to twitter search
  if (Array.isArray(data.cashtags)) {
    for (const cashtag of data.cashtags as BlockDataEntitySpan[]) {
      links.push({
        fromIndex: cashtag.fromIndex,
        toIndex: cashtag.toIndex,
        href: `${Constants.TWITTER_ROOT}/search?q=%24${cashtag.text}`,
        text: `$${cashtag.text}`,
        kind: 'cashtag'
      });
    }
  }

  // Sort by fromIndex in reverse order (so we can replace from end to beginning)
  return links.sort((a, b) => b.fromIndex - a.fromIndex);
};

interface InlineSegment {
  text: string;
  originalStart: number;
  originalEnd: number;
  styles: Set<string>;
  link: InlineLink | null;
}

/**
 * Splits text into runs that share the same inline styles and link, handling overlapping ranges
 */
const buildInlineSegments = (
  text: string,
  styleRanges: StyleRange[],
  links: InlineLink[]
): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  const currentStyles = new Set<string>();
  let currentLink: InlineLink | null = null;
  let segmentStart = 0;

  // Create events for style start/end and link start/end
  type Event = {
    position: number;
    type: 'style-start' | 'style-end' | 'link-start' | 'link-end';
    style?: string;
    link?: InlineLink;
  };

  const events: Event[] = [];

  for (const range of styleRanges) {
    events.push({ position: range.offset, type: 'style-start', style: range.style });
    events.push({ position: range.offset + range.length, type: 'style-end', style: range.style });
  }

  for (const link of links) {
    events.push({ position: link.fromIndex, type: 'link-start', link });
    events.push({ position: link.toIndex, type: 'link-end', link });
  }

  // Sort events by position, with end events before start events at same position
  events.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    // End events come before start events at the same position
    const aIsEnd = a.type.endsWith('-end') ? 0 : 1;
    const bIsEnd = b.type.endsWith('-end') ? 0 : 1;
    return aIsEnd - bIsEnd;
  });

  for (const event of events) {
    // If we've moved to a new position, save the previous segment
    if (event.position > segmentStart && event.position <= text.length) {
      const segmentText = text.substring(segmentStart, event.position);
      if (segmentText.length > 0) {
        segments.push({
          text: segmentText,
          originalStart: segmentStart,
          originalEnd: event.position,
          styles: new Set(currentStyles),
          link: currentLink
        });
      }
      segmentStart = event.position;
    }

    // Update current state
    switch (event.type) {
      case 'style-start':
        if (event.style) currentStyles.add(event.style);
        break;
      case 'style-end':
        if (event.style) currentStyles.delete(event.style);
        break;
      case 'link-start':
        if (event.link) currentLink = event.link;
        break;
      case 'link-end':
        currentLink = null;
        break;
    }
  }

  // Add remaining text
  if (segmentStart < text.length) {
    segments.push({
      text: text.substring(segmentStart),
      originalStart: segmentStart,
      originalEnd: text.length,
      styles: new Set(currentStyles),
      link: currentLink
    });
  }

  return segments;
};

/**
 * Applies inline styles and links to text, handling overlapping ranges
 */
const applyInlineStylesAndLinks = (
  text: string,
  styleRanges: StyleRange[],
  links: InlineLink[]
): string => {
  // Build a map of style tags
  const styleTagMap: Record<string, { open: string; close: string }> = {
    Bold: { open: '<b>', close: '</b>' },
    Italic: { open: '<i>', close: '</i>' },
    Strikethrough: { open: '<s>', close: '</s>' }
  };

  const segments = buildInlineSegments(text, styleRanges, links);

  // Handle case with no events
  if (segments.length === 0 && text.length > 0) {
    return sanitizeText(text);
  }

  // Build HTML with nested tags
  let result = '';
  let inLink: InlineLink | null = null;

  for (const segment of segments) {
    // Check if this segment contains HTML tags (from inline media)
    const containsHtml = /<[^>]+>/.test(segment.text);

    // Only sanitize if it doesn't contain HTML tags
    const processedText = containsHtml ? segment.text : sanitizeText(segment.text);

    // Handle link transitions
    if (segment.link !== inLink) {
      // Close previous link if any
      if (inLink !== null) {
        result += '</a>';
      }
      // Open new link if any
      if (segment.link !== null) {
        const safeHref = sanitizeText(segment.link.href);
        result += `<a href="${safeHref}">`;
      }
      inLink = segment.link;
    }

    if (segment.styles.size === 0 || containsHtml) {
      result += processedText;
    } else {
      // Apply styles in a consistent order for proper nesting
      const styleOrder = ['Bold', 'Italic', 'Strikethrough'];
      const stylesToApply = styleOrder.filter(s => segment.styles.has(s));

      let wrapped = processedText;
      for (const style of stylesToApply) {
        const tags = styleTagMap[style];
        if (tags) {
          wrapped = tags.open + wrapped + tags.close;
        }
      }
      result += wrapped;
    }
  }

  // Close any remaining open link
  if (inLink !== null) {
    result += '</a>';
  }

  return result;
};

/**
 * Renders a single block to HTML
 */
const renderBlock = (
  block: TwitterArticleContentBlock,
  entityMap: TwitterArticleEntityMapEntry[],
  mediaEntities: TwitterApiMedia[],
  options: ArticleRenderOptions
): { html: string; collectedMedia: TwitterApiMedia[] } => {
  const collectedMedia: TwitterApiMedia[] = [];
  let blockText = block.text;

  // Handle entity ranges (media, markdown, etc.)
  const entityRanges: EntityRange[] = block.entityRanges.map(er => ({
    offset: er.offset,
    length: er.length,
    key: er.key
  }));

  // Sort entity ranges by offset (reverse order for replacement)
  entityRanges.sort((a, b) => b.offset - a.offset);

  // Track media HTML insertions for atomic blocks
  let hasMediaHtml = false;

  for (const entityRange of entityRanges) {
    const entityKey = String(entityRange.key);
    const entityEntry = entityMap.find(e => e.key === entityKey);

    if (entityEntry?.value.type === 'MEDIA') {
      const mediaItem = entityEntry.value.data.mediaItems[0];
      if (mediaItem) {
        const media = mediaEntities.find(m => m.media_id === mediaItem.mediaId);
        if (media) {
          if (options.fullRenderer) {
            // Render inline media for Telegram
            let mediaHtml: string;
            if (media.media_info.__typename === 'ApiImage') {
              const image = media.media_info as TwitterApiImage;
              const imgUrl = options.photoUrlTransform
                ? options.photoUrlTransform(image.original_img_url)
                : image.original_img_url;
              mediaHtml = `<img src="${imgUrl}" alt="" />`;
            } else {
              const video = media.media_info as TwitterApiVideo;
              // Article videos have variants directly on media_info, regular videos have them under video_info
              const mediaInfoAny = media.media_info as Record<string, unknown>;
              const variants =
                (mediaInfoAny.variants as Array<{ url: string; bit_rate?: number }>) ||
                video.video_info?.variants;
              // Filter to MP4 variants only (exclude m3u8 playlists)
              const mp4Variants = variants?.filter(
                (v: { url: string }) => v.url && !v.url.includes('.m3u8')
              );
              // Build source elements for all variants (lowest to highest quality)
              // This allows Telegram to pick an appropriate quality under 20MB limit
              if (mp4Variants && mp4Variants.length > 0) {
                const sources = mp4Variants
                  .map((v: { url: string }) => `<source src="${v.url}" type="video/mp4">`)
                  .join('');
                mediaHtml = `<video controls>${sources}</video>`;
              } else {
                // Fallback to single source
                const videoUrl = variants?.[0]?.url || video.media_url_https;
                mediaHtml = `<video src="${videoUrl}" controls></video>`;
              }
            }
            hasMediaHtml = true;
            // Replace the placeholder text with the media
            blockText =
              blockText.substring(0, entityRange.offset) +
              mediaHtml +
              blockText.substring(entityRange.offset + entityRange.length);
          } else {
            // Collect media for Discord
            collectedMedia.push(media);
            // Remove the placeholder text
            blockText =
              blockText.substring(0, entityRange.offset) +
              blockText.substring(entityRange.offset + entityRange.length);
          }
        }
      }
    } else if (entityEntry?.value.type === 'MARKDOWN') {
      // Handle MARKDOWN entities (typically code blocks)
      const markdown = (entityEntry.value.data as { markdown?: string }).markdown || '';
      let markdownHtml: string;

      if (markdown.startsWith('```')) {
        // It's a code block - extract language identifier and content
        const lines = markdown.split('\n');
        // First line is ```language - extract the language
        const firstLine = lines[0];
        const language = firstLine.slice(3).trim(); // Remove ``` and trim
        // Remove first line (```language) and last line (```)
        const codeContent = lines.slice(1, -1).join('\n');
        // Sanitize and wrap in code tag with optional data-language for syntax highlighting
        const langAttr = language ? ` data-language="${sanitizeText(language)}"` : '';
        if (options.fullRenderer) {
          markdownHtml = `<pre${langAttr}>${sanitizeText(codeContent)}</pre>`;
        } else {
          markdownHtml = `<code${langAttr}>${sanitizeText(codeContent)}</code>`;
        }
      } else {
        // Unknown markdown format - render in blockquote as fallback
        markdownHtml = `<blockquote>${sanitizeText(markdown)}</blockquote>`;
      }

      hasMediaHtml = true; // Treat like media to skip style processing
      // Replace the placeholder text with the markdown HTML
      blockText =
        blockText.substring(0, entityRange.offset) +
        markdownHtml +
        blockText.substring(entityRange.offset + entityRange.length);
    } else if (entityEntry?.value.type === 'TWEET') {
      // Handle embedded tweets
      const tweetId = (entityEntry.value.data as { tweetId?: string }).tweetId;
      if (tweetId) {
        if (options.fullRenderer) {
          // For Telegram: use Twitter's embed format which Instant View will process
          const tweetEmbed = `<blockquote class="twitter-tweet"><a href="https://twitter.com/i/status/${tweetId}">Tweet</a></blockquote>`;
          hasMediaHtml = true;
          blockText =
            blockText.substring(0, entityRange.offset) +
            tweetEmbed +
            blockText.substring(entityRange.offset + entityRange.length);
        } else {
          // For Discord: skip embedded tweets (not enough room to display them)
          blockText =
            blockText.substring(0, entityRange.offset) +
            blockText.substring(entityRange.offset + entityRange.length);
        }
      }
    }
  }

  // For atomic blocks with media HTML, return early without style processing
  if (block.type === 'atomic' && hasMediaHtml) {
    return { html: blockText, collectedMedia };
  }

  // Collect inline links (mentions, URLs, hashtags)
  // Pass apiHost for Telegram to wrap foreign links
  const inlineLinks = collectInlineLinks(block, options.apiHost);

  // Apply inline styles and links
  const styledText = applyInlineStylesAndLinks(blockText, block.inlineStyleRanges, inlineLinks);

  // Determine block tag based on type
  // For Discord (fullRenderer = false), render headers as bold text instead of header tags
  let blockTag: string;
  let isHeader = false;
  switch (block.type) {
    case 'header-one':
      if (options.fullRenderer) {
        // Telegram: use actual header tags
        blockTag = 'h1';
      } else {
        // Discord: render as bold text
        blockTag = 'p';
        isHeader = true;
      }
      break;
    case 'header-two':
      if (options.fullRenderer) {
        // Telegram: use actual header tags
        blockTag = 'h2';
      } else {
        // Discord: render as bold text
        blockTag = 'p';
        isHeader = true;
      }
      break;
    case 'blockquote':
      blockTag = 'blockquote';
      break;
    case 'ordered-list-item':
    case 'unordered-list-item':
      blockTag = 'li';
      break;
    case 'atomic':
      // Atomic blocks are typically media placeholders
      // If we're not rendering inline media, skip it
      if (!options.fullRenderer && blockText.trim() === '') {
        return { html: '', collectedMedia };
      }
      // This case should have been handled earlier, but just in case
      blockTag = 'p';
      break;
    case 'unstyled':
    default:
      blockTag = 'p';
      break;
  }

  // Convert newlines to <br/> tags
  const textWithBreaks = styledText.replace(/\n/g, '<br/>');

  // Wrap header text in bold tags for Discord
  const finalText = isHeader ? `<b>${textWithBreaks}</b>` : textWithBreaks;
  const html = `<${blockTag}>${finalText}</${blockTag}>`;

  return { html, collectedMedia };
};

/**
 * Renders Twitter Article content to HTML
 */
export const renderArticleToHtml = (
  content: TwitterArticleContentState,
  options: ArticleRenderOptions
): ArticleRenderResult => {
  const collectedMedia: TwitterApiMedia[] = [];
  const htmlParts: string[] = [];
  let currentLength = 0;
  let wasTruncated = false;

  // Group consecutive list items
  let inList = false;
  let listType: 'ol' | 'ul' | null = null;
  const listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const listHtml = `<${listType}>${listItems.join('')}</${listType}>`;
      if (options.maxLength && currentLength + listHtml.length > options.maxLength) {
        wasTruncated = true;
        return;
      }
      htmlParts.push(listHtml);
      currentLength += listHtml.length;
      listItems.length = 0;
      inList = false;
      listType = null;
    }
  };

  for (const block of content.blocks) {
    if (wasTruncated) {
      break;
    }

    const { html, collectedMedia: blockMedia } = renderBlock(
      block,
      content.entityMap,
      options.mediaEntities,
      options
    );

    collectedMedia.push(...blockMedia);

    // Handle list items
    if (block.type === 'ordered-list-item' || block.type === 'unordered-list-item') {
      const newListType = block.type === 'ordered-list-item' ? 'ol' : 'ul';
      if (!inList || listType !== newListType) {
        flushList();
        if (wasTruncated) {
          break;
        }
        listType = newListType;
        inList = true;
      }
      // Check if adding this item would exceed the limit
      const testListHtml = `<${listType}>${listItems.join('')}${html}</${listType}>`;
      if (options.maxLength && currentLength + testListHtml.length > options.maxLength) {
        // Flush what we have and truncate
        flushList();
        wasTruncated = true;
        break;
      }
      listItems.push(html);
    } else {
      flushList();
      // Check truncation for non-list blocks
      if (options.maxLength && currentLength + html.length > options.maxLength) {
        const remaining = options.maxLength - currentLength;
        if (remaining > 0) {
          // Try to truncate at word boundary if possible
          const truncated = truncateWithEllipsis(html, remaining);
          htmlParts.push(truncated);
        }
        wasTruncated = true;
        break;
      }
      htmlParts.push(html);
      currentLength += html.length;
    }
  }

  // Flush any remaining list items
  flushList();

  return {
    html: htmlParts.join('\n'),
    collectedMedia,
    wasTruncated
  };
};

const MARKDOWN_STYLE_ORDER = ['Bold', 'Italic', 'Strikethrough'];
const MARKDOWN_STYLE_MARKERS: Record<string, string> = {
  Bold: '**',
  Italic: '*',
  Strikethrough: '~~'
};

/**
 * Markdown counterpart of applyInlineStylesAndLinks. Styles are kept on a stack so overlapping
 * ranges nest correctly, and whitespace is moved outside of style markers since Discord
 * won't render e.g. `**bold **`.
 */
const applyInlineMarkdown = (
  text: string,
  styleRanges: StyleRange[],
  links: InlineLink[]
): string => {
  const segments = buildInlineSegments(text, styleRanges, links);
  const openStyles: string[] = [];
  let inLink: InlineLink | null = null;
  let result = '';

  /* Inserts a closing marker before any trailing whitespace */
  const close = (marker: string) => {
    const trailing = result.match(/\s*$/)?.[0] ?? '';
    result = result.slice(0, result.length - trailing.length) + marker + trailing;
  };

  const closeStyle = () => {
    close(MARKDOWN_STYLE_MARKERS[openStyles.pop() as string]);
  };

  const closeLink = () => {
    while (openStyles.length > 0) {
      closeStyle();
    }
    if (inLink !== null) {
      close(`](${escapeMarkdownUrl(inLink.href)})`);
      inLink = null;
    }
  };

  for (const segment of segments) {
    if (segment.text.trim() === '') {
      result += segment.text;
      continue;
    }
    if (segment.link !== inLink) {
      closeLink();
    }
    const firstInactive = openStyles.findIndex(style => !segment.styles.has(style));
    if (firstInactive !== -1) {
      while (openStyles.length > firstInactive) {
        closeStyle();
      }
    }
    const leading = segment.text.match(/^\s*/)?.[0] ?? '';
    result += leading;
    if (segment.link !== null && inLink === null) {
      result += '[';
      inLink = segment.link;
    }
    for (const style of MARKDOWN_STYLE_ORDER) {
      if (segment.styles.has(style) && !openStyles.includes(style)) {
        result += MARKDOWN_STYLE_MARKERS[style];
        openStyles.push(style);
      }
    }
    result += escapeMarkdown(segment.text.slice(leading.length));
  }
  closeLink();

  return result;
};

/** Inline links for markdown; without `linkEntities` only real URLs are kept as links */
const markdownLinks = (block: TwitterArticleContentBlock, linkEntities: boolean): InlineLink[] =>
  collectInlineLinks(block).filter(link => linkEntities || link.kind === 'url');

/** Cuts a text block down to `length` characters, dropping styles and links past the cut */
const truncateBlock = (
  block: TwitterArticleContentBlock,
  length: number,
  linkEntities: boolean
): { text: string; styleRanges: StyleRange[]; links: InlineLink[] } => {
  const text = truncateWithEllipsis(block.text, length);
  const cut = Math.min(length, block.text.length);
  return {
    text,
    styleRanges: block.inlineStyleRanges
      .filter(range => range.offset < cut)
      .map(range => ({ ...range, length: Math.min(range.length, cut - range.offset) })),
    links: markdownLinks(block, linkEntities).filter(link => link.toIndex <= cut)
  };
};

type MarkdownBlock =
  | { kind: 'text'; block: TwitterArticleContentBlock; prefix: (index: number) => string }
  | { kind: 'raw'; markdown: string };

const formatMarkdownBlock = (
  item: MarkdownBlock,
  listIndex: number,
  linkEntities: boolean,
  length?: number
): string => {
  if (item.kind === 'raw') {
    return item.markdown;
  }
  const { block } = item;
  const { text, styleRanges, links } =
    length === undefined
      ? {
          text: block.text,
          styleRanges: block.inlineStyleRanges,
          links: markdownLinks(block, linkEntities)
        }
      : truncateBlock(block, length, linkEntities);
  let markdown = applyInlineMarkdown(text, styleRanges, links);
  if (block.type === 'header-one' || block.type === 'header-two') {
    markdown = markdown.replace(/\n+/g, ' ');
  } else if (block.type === 'blockquote') {
    return markdownBlockquote(markdown);
  }
  return item.prefix(listIndex) + markdown;
};

/**
 * Renders Twitter Article content to Discord markdown (for component embeds).
 * Media blocks are collected rather than rendered, like the Discord HTML renderer.
 * If the article doesn't fit, mention/hashtag/cashtag links are dropped to make room for text.
 */
export const renderArticleToMarkdown = (
  content: TwitterArticleContentState,
  options: { maxLength: number; mediaEntities: TwitterApiMedia[]; linkEntities?: boolean }
): { markdown: string; collectedMedia: TwitterApiMedia[]; wasTruncated: boolean } => {
  const linkEntities = options.linkEntities ?? true;
  const collectedMedia: TwitterApiMedia[] = [];
  const items: MarkdownBlock[] = [];

  for (const block of content.blocks) {
    let codeBlock: string | null = null;
    let blockText = block.text;
    const entityRanges = [...block.entityRanges].sort((a, b) => b.offset - a.offset);

    for (const entityRange of entityRanges) {
      const entityEntry = content.entityMap.find(e => e.key === String(entityRange.key));
      const type = entityEntry?.value.type;
      if (type !== 'MEDIA' && type !== 'MARKDOWN' && type !== 'TWEET') {
        continue;
      }
      if (type === 'MEDIA') {
        const mediaItem = entityEntry?.value.data.mediaItems[0];
        const media = options.mediaEntities.find(m => m.media_id === mediaItem?.mediaId);
        if (media) {
          collectedMedia.push(media);
        }
      } else if (type === 'MARKDOWN') {
        const markdown = (entityEntry?.value.data as { markdown?: string }).markdown || '';
        /* Code fences pass through as-is; anything else is quoted as literal text */
        codeBlock = markdown.startsWith('```')
          ? markdown
          : markdownBlockquote(escapeMarkdown(markdown));
      }
      /* Embedded posts are skipped, there isn't enough room to display them */
      blockText =
        blockText.substring(0, entityRange.offset) +
        blockText.substring(entityRange.offset + entityRange.length);
    }

    if (codeBlock !== null) {
      items.push({ kind: 'raw', markdown: codeBlock });
      continue;
    }
    if (block.type === 'atomic' || blockText.trim() === '') {
      continue;
    }

    const textBlock = { ...block, text: blockText };
    switch (block.type) {
      case 'header-one':
        items.push({ kind: 'text', block: textBlock, prefix: () => '## ' });
        break;
      case 'header-two':
        items.push({ kind: 'text', block: textBlock, prefix: () => '### ' });
        break;
      case 'unordered-list-item':
        items.push({ kind: 'text', block: textBlock, prefix: () => '- ' });
        break;
      case 'ordered-list-item':
        items.push({ kind: 'text', block: textBlock, prefix: index => `${index}. ` });
        break;
      default:
        items.push({ kind: 'text', block: textBlock, prefix: () => '' });
        break;
    }
  }

  const isListItem = (item: MarkdownBlock | undefined) =>
    item?.kind === 'text' &&
    (item.block.type === 'ordered-list-item' || item.block.type === 'unordered-list-item');

  let markdown = '';
  let listIndex = 0;
  let wasTruncated = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const previous = items[i - 1];
    listIndex =
      isListItem(item) && isListItem(previous) && item.kind === 'text' && previous.kind === 'text'
        ? previous.block.type === item.block.type
          ? listIndex + 1
          : 1
        : 1;
    /* Consecutive list items stay on adjacent lines, everything else gets a blank line between */
    const separator =
      markdown === '' ? '' : isListItem(item) && isListItem(previous) ? '\n' : '\n\n';
    const rendered = formatMarkdownBlock(item, listIndex, linkEntities);
    const remaining = options.maxLength - markdown.length - separator.length;

    if (rendered.length <= remaining) {
      markdown += separator + rendered;
      continue;
    }

    wasTruncated = true;
    let partial = '…';
    /* Only bother partially rendering a block if a meaningful amount of it fits */
    if (item.kind === 'text' && remaining > 200) {
      let sourceLength = Math.min(item.block.text.length, remaining);
      for (let attempt = 0; attempt < 8 && sourceLength > 0; attempt++) {
        const rendered = formatMarkdownBlock(item, listIndex, linkEntities, sourceLength);
        if (rendered.length <= remaining) {
          partial = rendered;
          break;
        }
        sourceLength -= Math.max(rendered.length - remaining, 16);
      }
    }
    if (partial.length <= remaining) {
      markdown += separator + partial;
    }
    break;
  }

  if (wasTruncated && linkEntities) {
    return renderArticleToMarkdown(content, { ...options, linkEntities: false });
  }
  return { markdown, collectedMedia, wasTruncated };
};

export { DISCORD_ARTICLE_MAX_LENGTH };
