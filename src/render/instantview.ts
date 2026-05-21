/* eslint-disable no-irregular-whitespace */
import i18next from 'i18next';
import { Constants } from '../constants';
import { getSocialTextIV } from '../helpers/socialproof';
import { sanitizeText, wrapForeignLinks as wrapForeignLinksUtil } from '../helpers/utils';
import { DataProvider } from '../enum';
import { getBranding } from '../helpers/branding';
import { renderArticleToHtml } from '../helpers/article';
import type { APIStatusTombstone, APITwitterStatus } from '../realms/api/schemas';
import { isTombstone } from '../helpers/tombstone';
import { getVideoTranscodeDomain, getVideoTranscodeDomainBluesky } from '../helpers/transcode';
import { experimentCheck, Experiment } from '../experiments';
import { proxyTwitterPostPhotoUrl, shouldProxyTelegramPbsPhotos } from '../helpers/pbsProxy';

/**
 * Check if the tweet text is essentially just an article URL with no meaningful additional content.
 */
const isArticleOnlyTweet = (status: APITwitterStatus): boolean => {
  if (!status.article) {
    return false;
  }

  const text = status.text.trim();

  if (!text) {
    return true;
  }

  // Article URLs look like: https://x.com/i/article/<id>
  const articleUrlPattern = /^https?:\/\/(x\.com|twitter\.com)\/i\/article\/\d+\/?$/;
  const tcoPattern = /^https?:\/\/t\.co\/\w+$/;

  if (articleUrlPattern.test(text) || tcoPattern.test(text)) {
    return true;
  }

  if (text === status.article.title) {
    return true;
  }

  return false;
};

enum AuthorActionType {
  Reply = 'Reply',
  Original = 'Original',
  FollowUp = 'FollowUp'
}

const populateUserLinks = (text: string, status: APIStatus): string => {
  /* TODO: Maybe we can add username splices to our API so only genuinely valid users are linked? */
  let usernamePattern = /@(\w{1,15})/g;

  if (status.provider === DataProvider.Bluesky) {
    usernamePattern = /@(?!-)([\w.-]+(?<!-))/g;
  }

  text.match(usernamePattern)?.forEach(match => {
    const username = match.replace('@', '');
    let url = `${Constants.TWITTER_ROOT}/${username}`;
    if (status.provider === DataProvider.Bluesky) {
      url = `${Constants.BLUESKY_ROOT}/profile/${username}`;
    }
    text = text.replace(
      match,
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`
    );
  });
  return text;
};

const generateStatusMedia = (status: APIStatus, proxyPbs: boolean): string => {
  let media = '';
  if (status.media?.all?.length) {
    status.media.all.forEach(mediaItem => {
      let url = mediaItem.url;

      if (experimentCheck(Experiment.KITCHENSINK_VIDEO, !!Constants.VIDEO_TRANSCODE_DOMAIN_LIST)) {
        const domain =
          status.provider === DataProvider.Twitter
            ? getVideoTranscodeDomain(status.id)
            : getVideoTranscodeDomainBluesky(status.id);
        url = `https://${domain}${new URL(url).pathname}`;
      }
      switch (mediaItem.type) {
        case 'photo':
          // eslint-disable-next-line no-case-declarations
          const { altText } = mediaItem as APIPhoto;
          url = proxyTwitterPostPhotoUrl(url, proxyPbs);
          media += `<img src="{url}" {altText}/>`.format({
            altText: altText ? `alt="${altText}"` : '',
            url: url
          });
          break;
        case 'video':
          media += `<video src="${url}" alt="${i18next.t('videoAltTextUnavailable').format({ author: status.author.name })}"/>`;
          break;
        case 'gif':
          media += `<video src="${url}" alt="${i18next.t('gifAltTextUnavailable').format({ author: status.author.name })}"/>`;
          break;
      }
    });
  }
  return media;
};

// const formatDateTime = (date: Date): string => {
//   const yyyy = date.getFullYear();
//   const mm = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
//   const dd = String(date.getDate()).padStart(2, '0');
//   const hh = String(date.getHours()).padStart(2, '0');
//   const min = String(date.getMinutes()).padStart(2, '0');
//   return `${hh}:${min} - ${yyyy}/${mm}/${dd}`;
// }

const formatDate = (date: Date, language: string): string => {
  if (language.startsWith('en')) {
    language = 'en-CA'; // Use ISO dates for English to avoid problems with mm/dd vs. dd/mm
  }
  if (language) {
    console.log('language override:', language);
  }
  const formatter = new Intl.DateTimeFormat(language ?? 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};

const htmlifyLinks = (input: string): string => {
  const urlPattern = /\bhttps?:\/\/(\w+(-\w+)*\.)+[a-z]{2,}(:\d+)?(\/[-\w@:%_+.~#?&/=]*)?/gi;
  return input.replace(urlPattern, url => {
    return `<a href="${wrapForeignLinks(url)}">${url}</a>`;
  });
};

const htmlifyHashtags = (input: string, status: APIStatus): string => {
  const hashtagPattern = /#([a-zA-Z_]\w*)/g;
  return input.replace(hashtagPattern, (match, hashtag) => {
    const encodedHashtag = encodeURIComponent(hashtag);
    const url = `${status.provider === DataProvider.Twitter ? Constants.TWITTER_ROOT : Constants.BLUESKY_ROOT}/hashtag/${encodedHashtag}`;
    return `  <a href="${url}">${match}</a>  `;
  });
};

function paragraphify(text: string, isQuote = false): string {
  const tag = isQuote ? 'blockquote' : 'p';
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<${tag}>${line}</${tag}>`)
    .join('\n');
}

function getTranslatedText(status: APITwitterStatus, isQuote = false): string | null {
  if (!status.translation) {
    return null;
  }
  let text = paragraphify(sanitizeText(status.translation?.text), isQuote);
  text = htmlifyLinks(text);
  text = htmlifyHashtags(text, status as APIStatus);

  if (status.provider === DataProvider.Twitter) {
    text = populateUserLinks(text, status as APIStatus);
  }

  const formatText = `📑 {translation}`.format({
    translation: i18next.t('translatedFrom').format({
      language: i18next.t(`language_${status.translation.source_lang}`)
    })
  });

  return `<h4>${formatText}</h4>${text}<h4>${i18next.t('ivOriginalText')}</h4>`;
}

const notApplicableComment = '<!-- N/A -->';

const truncateSocialCount = (count: number, locale = 'en-US') => {
  const formatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  });

  return formatter.format(count);
};

const generateInlineAuthorHeader = (
  status: APIStatus,
  author: APIUser,
  authorActionType: AuthorActionType | null
): string => {
  if (authorActionType === AuthorActionType.Original) {
    return `<h5><i>${i18next.t('ivAuthorActionOriginal', {
      statusUrl: status.url,
      authorName: author.name,
      authorUrl: author.url,
      authorScreenName: author.screen_name
    })}</i></h5>`;
  } else if (authorActionType === AuthorActionType.FollowUp) {
    return `<h5><i>${i18next.t('ivAuthorActionFollowUp', {
      statusUrl: status.url,
      authorName: author.name,
      authorUrl: author.url,
      authorScreenName: author.screen_name
    })}</i></h5>`;
  }
  // Reply / unknown
  return `<h5><i>${i18next.t('ivAuthorActionReply', {
    statusUrl: status.url,
    authorName: author.name,
    authorUrl: author.url,
    authorScreenName: author.screen_name
  })}</i></h5>`;
};

const wrapForeignLinks = (url: string) => {
  return wrapForeignLinksUtil(url, Constants.API_HOST_LIST[0]);
};

const generateStatusFooter = (
  status: APIStatus,
  isQuote = false,
  author: APIUser,
  language: string
): string => {
  let description = author.description;
  description = htmlifyLinks(description);
  if (status.provider === DataProvider.Twitter) {
    description = htmlifyHashtags(description, status);
    description = populateUserLinks(description, status);
  }

  return `
    <p>{socialText}</p>
    <br>{viewOriginal}
    <!-- Embed profile picture, display name, and screen name in table -->
    <hr/>
    {aboutSection}
    `.format({
    socialText: getSocialTextIV(status as APITwitterStatus) || '',
    viewOriginal:
      !isQuote && status.provider !== DataProvider.Bluesky
        ? `<a href="${status.url}">${i18next.t('ivViewOriginal')}</a>`
        : notApplicableComment,
    aboutSection:
      isQuote || status.provider === DataProvider.Bluesky
        ? ''
        : `<h2>${i18next.t('ivAboutAuthor')}</h2>
        {pfp}
        <h2>${author.name}</h2>
        <p><a href="${author.url}">@${author.screen_name}</a></p>
        <p><b>${description}</b></p>
        <p>{location} {website} {joined}</p>
        <p>
          {following} <b>${i18next.t('ivProfileFollowing', { numFollowing: author.following })}</b> 
          {followers} <b>${i18next.t('ivProfileFollowers', { numFollowers: author.followers })}</b> 
          {statuses} <b>${i18next.t('ivProfileStatuses', { numStatuses: author.statuses })}</b>
        </p>`.format({
            pfp: `<img src="${author.avatar_url?.replace('_200x200', '_400x400')}" alt="${i18next.t('ivProfilePictureAlt', { author: author.name })}" />`,
            location: author.location ? `📌 ${author.location}` : '',
            website: author.website
              ? `🔗 <a rel="nofollow" href="${wrapForeignLinks(author.website.url)}">${author.website.display_url}</a>`
              : '',
            joined: author.joined ? `📆 ${formatDate(new Date(author.joined), language)}` : '',
            following: truncateSocialCount(author.following, language),
            followers: truncateSocialCount(author.followers, language),
            statuses: truncateSocialCount(author.statuses, language)
          })
  });
};

const generatePoll = (poll: APIPoll, language: string): string => {
  const intlFormat = Intl.NumberFormat(language ?? 'en');
  let str = '';

  const barLength = 20;

  poll.choices.forEach(choice => {
    const bar = '█'.repeat((choice.percentage / 100) * barLength);
    str += `${bar}<br>${choice.label}<br>${i18next.t('ivPollChoice', { voteCount: intlFormat.format(choice.count), percentage: intlFormat.format(choice.percentage) })}<br>`;
  });
  /* Finally, add the footer of the poll with # of votes and time left */
  str += `<br>${i18next.t('pollVotes', { voteCount: intlFormat.format(poll.total_votes), timeLeft: poll.time_left_en })}`;

  return str;
};

const generateCommunityNote = (status: APITwitterStatus): string => {
  const note = status.community_note;
  if (!note) {
    return '';
  }

  let lastToIndex = 0;
  let result = '';

  if ('facets' in note) {
    const sorted = [...note.facets].sort((a, b) => a.indices[0] - b.indices[0]);
    for (const facet of sorted) {
      if (facet.type !== 'url') {
        continue;
      }
      const [fromIndex, toIndex] = facet.indices;
      const href = facet.replacement ?? '';
      const label = facet.display ?? note.text.substring(fromIndex, toIndex);
      result += note.text.substring(lastToIndex, fromIndex);
      result += `<a href="${href}">${label}</a>`;
      lastToIndex = toIndex;
    }
  }

  result += note.text.substring(lastToIndex);

  return `<table>
      <thead>
        <th><b>${i18next.t('ivCommunityNoteHeader')}</b></th>
      </thead>
      <tbody>
        <th>${result.replace(/\n/g, '\n<br>')}</th>
      </tbody>
    </table>`;
};

const generateStatus = (
  status: APIStatus | APIStatusTombstone,
  author: APIUser,
  language: string,
  isQuote = false,
  authorActionType: AuthorActionType | null,
  proxyPbs: boolean
): string => {
  if (isTombstone(status)) {
    const inner = `<i>${sanitizeText(status.message)}</i>`;
    return isQuote ? `<blockquote>${inner}</blockquote>` : `<p>${inner}</p>`;
  }

  const twitterStatus = status as APITwitterStatus;

  // Check if this is a Twitter article
  let articleHtml = '';
  let articleCoverMedia = '';
  if (twitterStatus.article) {
    const articleResult = renderArticleToHtml(twitterStatus.article.content, {
      maxLength: undefined, // No limit for Telegram
      fullRenderer: true, // Render inline media for Telegram
      mediaEntities: twitterStatus.article.media_entities,
      apiHost: Constants.API_HOST_LIST[0], // For wrapping foreign links
      photoUrlTransform: url => proxyTwitterPostPhotoUrl(url, proxyPbs)
    });

    // Render cover media if available
    if (twitterStatus.article.cover_media) {
      const coverMedia = twitterStatus.article.cover_media;
      if (coverMedia.media_info.__typename === 'ApiImage') {
        const image = coverMedia.media_info;
        const coverUrl = proxyTwitterPostPhotoUrl(image.original_img_url, proxyPbs);
        articleCoverMedia = `<img src="${coverUrl}" alt="${twitterStatus.article.title}" />`;
      }
    }

    // Build article HTML (title is already in the main h1 header for Telegram)
    articleHtml = `
    ${articleCoverMedia}
    ${articleResult.html}
    <hr/>
    `;
  }

  let text = paragraphify(sanitizeText(status.text), isQuote);
  text = htmlifyLinks(text);
  text = htmlifyHashtags(text, status);
  text = populateUserLinks(text, status);

  const translatedText = getTranslatedText(twitterStatus, isQuote);

  return `<!-- Telegram Instant View -->
  {quoteHeader}
  <!-- Embed article (if applicable) -->
  ${articleHtml || notApplicableComment}
  <!-- Embed media -->
  ${generateStatusMedia(status, proxyPbs)} 
  <!-- Translated text (if applicable) -->
  ${translatedText ? translatedText : notApplicableComment}
  <!-- Inline author (if applicable) -->
  ${authorActionType ? generateInlineAuthorHeader(status, author, authorActionType) : ''}
  <!-- Embed Status text -->
  ${text}
  <!-- Embed Community Note -->
  ${generateCommunityNote(twitterStatus)}
  <!-- Embed poll -->
  ${status.poll ? generatePoll(status.poll, status.lang ?? 'en') : notApplicableComment}
  <!-- Embedded quote status -->
  ${
    !isQuote && status.quote
      ? isTombstone(status.quote)
        ? `<blockquote><i>${sanitizeText(status.quote.message)}</i></blockquote>`
        : generateStatus(status.quote, author, language, true, null, proxyPbs)
      : notApplicableComment
  }`.format({
    quoteHeader: isQuote
      ? '<h4>' +
        i18next.t('ivQuoteHeader').format({
          url: status.url,
          authorName: status.author.name,
          authorHandle: status.author.screen_name,
          authorURL: status.author.url
        }) +
        '</h4>'
      : ''
  });
};

export const renderInstantView = (properties: RenderProperties): ResponseInstructions => {
  console.log('Generating Instant View...');
  const { status, thread, flags, userAgent } = properties;
  const instructions: ResponseInstructions = { addHeaders: [] };
  const isTelegram = (userAgent ?? '').includes('TelegramBot');
  const proxyPbs = shouldProxyTelegramPbsPhotos(isTelegram);

  let previousThreadPieceAuthor: string | null = null;
  let originalAuthor: string | null = null;

  const useThread = thread?.thread ?? [thread?.status];

  if (!status) {
    throw new Error('Status is undefined');
  }

  const twitterStatus = status as APITwitterStatus;
  const articleOnly = twitterStatus.article && isArticleOnlyTweet(twitterStatus);

  /* Use ISO date for Medium template */
  const statusDate = new Date(status.created_at).toISOString();

  /* Pretend to be Medium to allow Instant View to work.
     Thanks to https://nikstar.me/post/instant-view/ for the help!
    
     If you work for Telegram and want to let us build our own templates
     contact me https://t.me/dangeredwolf */
  instructions.addHeaders = [
    `<meta property="al:android:app_name" content="Medium"/>`,
    `<meta property="article:published_time" content="${statusDate}"/>`,
    flags?.archive
      ? `<style>img,video{width:100%;max-width:500px}html{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}</style>`
      : ``
  ];

  // For article-only tweets, use article title as main heading and skip "View full thread" at top
  const mainHeading =
    articleOnly && twitterStatus.article
      ? twitterStatus.article.title
      : `${status.author.name} (@${status.author.screen_name})`;

  const topSection = articleOnly
    ? '' // No top "View full thread" for article-only tweets
    : `<sub><a href="${status.url}">${i18next.t('ivViewOriginal')}</a></sub>`;

  instructions.text = `
    <section class="section-backgroundImage">
      <figure class="graf--layoutFillWidth"></figure>
    </section>
    <section class="section--first">${
      flags?.archive
        ? i18next.t('ivInternetArchiveText').format({
            brandingName: getBranding(properties.context).name
          })
        : i18next.t('ivFallbackText')
    } <a href="${status.url}">${i18next.t('ivViewOriginal')}</a>
    </section>
    <article>
    ${topSection}
    <h1>${mainHeading}</h1>
        ${articleOnly ? `<h2>${status.author.name} (@${status.author.screen_name})</h2>` : ''}

    ${useThread
      .map(item => {
        console.log('previousThreadPieceAuthor', previousThreadPieceAuthor);
        if (!item) {
          return '';
        }
        if (isTombstone(item)) {
          return `<p><i>${sanitizeText(item.message)}</i></p>`;
        }
        const status = item as APIStatus;
        if (originalAuthor === null) {
          originalAuthor = status.author?.id;
        }
        const differentAuthor =
          thread?.author?.id !== status.author?.id ||
          (previousThreadPieceAuthor !== null && previousThreadPieceAuthor !== status.author?.id);
        const isOriginal =
          thread?.author?.id !== status.author?.id && previousThreadPieceAuthor === null;
        const isFollowup =
          thread?.author?.id === status.author?.id &&
          previousThreadPieceAuthor !== null &&
          previousThreadPieceAuthor !== thread?.author?.id &&
          originalAuthor === status.author?.id;
        console.log('differentAuthor', differentAuthor);
        console.log('isOriginal', isOriginal);
        console.log('isFollowup', isFollowup);

        let authorAction = null;

        if (differentAuthor) {
          if (isFollowup) {
            authorAction = AuthorActionType.FollowUp;
          } else if (isOriginal) {
            authorAction = AuthorActionType.Original;
          } else if (previousThreadPieceAuthor !== status.author?.id) {
            authorAction = AuthorActionType.Reply;
          }
        }

        previousThreadPieceAuthor = status.author?.id;

        return generateStatus(
          status,
          status.author ?? thread?.author,
          properties?.targetLanguage ?? 'en',
          false,
          authorAction,
          proxyPbs
        );
      })
      .join('')}
    ${generateStatusFooter(status, false, thread?.author ?? status.author, properties?.targetLanguage ?? 'en')}
    <br>${`<a href="${status.url}">${i18next.t('ivViewOriginal')}</a>`}
  </article>`;

  return instructions;
};
