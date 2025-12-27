import {
  TwitterArticleContentState,
  TwitterArticleContentBlock,
  TwitterArticleEntityMapEntry,
  TwitterApiMedia,
  TwitterApiImage,
  TwitterApiVideo
} from '../types/vendor/twitter';
import { sanitizeText, truncateWithEllipsis, wrapForeignLinks } from './utils';

const DISCORD_ARTICLE_MAX_LENGTH = 10000;

interface ArticleRenderOptions {
  maxLength?: number; // undefined = no limit (Telegram)
  renderInlineMedia?: boolean; // true for Telegram, false for Discord
  mediaEntities: TwitterApiMedia[];
  apiHost?: string; // Required for Telegram to wrap foreign links
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
  if (data.mentions) {
    for (const mention of data.mentions) {
      links.push({
        fromIndex: mention.fromIndex,
        toIndex: mention.toIndex,
        href: `https://x.com/${mention.text}`,
        text: `@${mention.text}`
      });
    }
  }

  // Process URLs -> use the URL as the link (wrap for Telegram if apiHost provided)
  if (data.urls) {
    for (const url of data.urls) {
      const href = apiHost ? wrapForeignLinks(url.text, apiHost) : url.text;
      links.push({
        fromIndex: url.fromIndex,
        toIndex: url.toIndex,
        href,
        text: url.text
      });
    }
  }

  // Process hashtags -> link to twitter hashtag search
  if (data.hashtags) {
    for (const hashtag of data.hashtags) {
      links.push({
        fromIndex: hashtag.fromIndex,
        toIndex: hashtag.toIndex,
        href: `https://x.com/hashtag/${hashtag.text}`,
        text: `#${hashtag.text}`
      });
    }
  }

  // Process cashtags (symbols) -> link to twitter search
  if (data.cashtags) {
    for (const cashtag of data.cashtags) {
      links.push({
        fromIndex: cashtag.fromIndex,
        toIndex: cashtag.toIndex,
        href: `https://x.com/search?q=%24${cashtag.text}`,
        text: `$${cashtag.text}`
      });
    }
  }

  // Sort by fromIndex in reverse order (so we can replace from end to beginning)
  return links.sort((a, b) => b.fromIndex - a.fromIndex);
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

  // Build segments by tracking style/link changes at each character position
  interface Segment {
    text: string;
    originalStart: number;
    originalEnd: number;
    styles: Set<string>;
    link: InlineLink | null;
  }

  const segments: Segment[] = [];
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
          if (options.renderInlineMedia) {
            // Render inline media for Telegram
            let mediaHtml = '';
            if (media.media_info.__typename === 'ApiImage') {
              const image = media.media_info as TwitterApiImage;
              mediaHtml = `<img src="${image.original_img_url}" alt="" />`;
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
      let markdownHtml = '';

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
        if (options.renderInlineMedia) {
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
        if (options.renderInlineMedia) {
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
  // For Discord (renderInlineMedia = false), render headers as bold text instead of header tags
  let blockTag = 'p';
  let isHeader = false;
  switch (block.type) {
    case 'header-one':
      if (options.renderInlineMedia) {
        // Telegram: use actual header tags
        blockTag = 'h1';
      } else {
        // Discord: render as bold text
        blockTag = 'p';
        isHeader = true;
      }
      break;
    case 'header-two':
      if (options.renderInlineMedia) {
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
      if (!options.renderInlineMedia && blockText.trim() === '') {
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

export { DISCORD_ARTICLE_MAX_LENGTH };
