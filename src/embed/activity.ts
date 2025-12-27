/* eslint-disable no-case-declarations */
import { Strings } from '../strings';
import { DataProvider, returnError } from './status';
import { constructTwitterThread } from '../providers/twitter/conversation';
import { constructBlueskyThread } from '../providers/bsky/conversation';
import { Constants } from '../constants';
import { getActivitySocialProof } from '../helpers/socialproof';
import i18next from 'i18next';
import icu from 'i18next-icu';
import { escapeRegex } from '../helpers/utils';
import { decodeSnowcode } from '../helpers/snowcode';
import translationResources from '../../i18n/resources';
import { Experiment, experimentCheck } from '../experiments';
import {
  ActivityMediaAttachment,
  ActivityStatus,
  APIPhoto,
  APIPoll,
  APIStatus,
  APITwitterStatus,
  APIVideo,
  SocialThread
} from '../types/types';
import { Context } from 'hono';
import { shouldTranscodeGif } from '../helpers/giftranscode';
import { normalizeLanguage } from '../helpers/language';
import { renderArticleToHtml, DISCORD_ARTICLE_MAX_LENGTH } from '../helpers/article';
import { TwitterApiMedia, TwitterApiImage, TwitterApiVideo } from '../types/vendor/twitter';

const convertArticleMediaToAttachment = (
  media: TwitterApiMedia
): ActivityMediaAttachment | null => {
  if (media.media_info.__typename === 'ApiImage') {
    const image = media.media_info as TwitterApiImage;
    return {
      id: media.media_id,
      type: 'image',
      url: image.original_img_url,
      preview_url: null,
      remote_url: null,
      preview_remote_url: null,
      text_url: null,
      description: null,
      meta: {
        original: {
          width: image.original_img_width,
          height: image.original_img_height,
          size: `${image.original_img_width}x${image.original_img_height}`,
          aspect: image.original_img_width / image.original_img_height
        }
      }
    } as ActivityMediaAttachment;
  } else if (
    media.media_info.__typename === 'ApiVideo' ||
    media.media_info.__typename === 'ApiGif'
  ) {
    const video = media.media_info as TwitterApiVideo;
    const videoUrl = video.video_info?.variants?.[0]?.url || video.media_url_https;
    let sizeMultiplier = 1;
    const width = video.original_info.width;
    const height = video.original_info.height;

    if (width > 1920 || height > 1920) {
      sizeMultiplier = 0.5;
    }
    if (width < 400 || height < 400) {
      sizeMultiplier = 2;
    }

    if (experimentCheck(Experiment.VIDEO_REDIRECT_WORKAROUND, !!Constants.API_HOST_LIST)) {
      const redirectedUrl = `https://${Constants.API_HOST_LIST[0]}/2/go?url=${encodeURIComponent(videoUrl)}`;
      return {
        id: media.media_id,
        type: 'video',
        url: redirectedUrl,
        preview_url: video.media_url_https,
        remote_url: null,
        preview_remote_url: null,
        text_url: null,
        description: video.ext_alt_text ?? undefined,
        meta: {
          original: {
            width: width * sizeMultiplier,
            height: height * sizeMultiplier,
            size: `${width * sizeMultiplier}x${height * sizeMultiplier}`,
            aspect: width / height
          }
        }
      } as ActivityMediaAttachment;
    }

    return {
      id: media.media_id,
      type: 'video',
      url: videoUrl,
      preview_url: video.media_url_https,
      remote_url: null,
      preview_remote_url: null,
      text_url: null,
      description: video.ext_alt_text ?? undefined,
      meta: {
        original: {
          width: width * sizeMultiplier,
          height: height * sizeMultiplier,
          size: `${width * sizeMultiplier}x${height * sizeMultiplier}`,
          aspect: width / height
        }
      }
    } as ActivityMediaAttachment;
  }

  return null;
};

const generatePoll = (poll: APIPoll): string => {
  let str = '<blockquote>';

  const barLength = 32;

  poll.choices.forEach(choice => {
    const bar = '█'.repeat((choice.percentage / 100) * barLength);
    str += `${bar}<br><b>${choice.label}</b>&emsp;${choice.percentage}%<br>︀︀︀<br>︀`;
  });

  /* Finally, add the footer of the poll with # of votes and time left */
  str += ''; /* TODO: Localize time left */
  str += i18next.t('pollVotes', {
    voteCount: poll.total_votes,
    timeLeft: poll.time_left_en ?? ''
  });

  return str + '</blockquote>';
};

interface StatusTextResult {
  text: string;
  articleMedia: TwitterApiMedia[];
}

const getStatusText = (status: APIStatus): StatusTextResult => {
  let text = '';
  const twitterStatus = status as APITwitterStatus;

  // Check if this is a Twitter article
  if (twitterStatus.article) {
    const articleResult = renderArticleToHtml(twitterStatus.article.content, {
      maxLength: DISCORD_ARTICLE_MAX_LENGTH,
      renderInlineMedia: false,
      mediaEntities: twitterStatus.article.media_entities
    });

    // Prepend article title
    text = `<b>📰 ${twitterStatus.article.title}</b>${articleResult.html}`;

    return { text, articleMedia: articleResult.collectedMedia };
  }

  const convertedStatusText = status.text.trim().replace(/\n/g, '<br>︀︀');
  if (twitterStatus.translation) {
    console.log('translation', JSON.stringify(twitterStatus.translation));
    const { translation } = twitterStatus;

    const formatText = `<b>📑 {translation}</b>`.format({
      translation: i18next.t('translatedFrom').format({
        language: i18next.t(`language_${translation?.source_lang}`)
      })
    });

    text = `${formatText}<br><br>${formatStatus(translation?.text ?? '', status)}<br><br>`;
    text += `<blockquote><b>${i18next.t('ivOriginalText')}</b><br>${formatStatus(convertedStatusText, status)}</blockquote>`;
  } else {
    text = formatStatus(convertedStatusText, status) + '<br><br>';
  }
  if (status.quote) {
    // console.log('quote!!', status.quote);
    const quoteText = (status.quote.translation?.text ?? status.quote.text)
      .trim()
      .replace(/\n/g, '<br>︀︀');
    text += `<blockquote><b>${i18next.t('ivQuoteHeader').format({
      authorName: status.quote.author.name,
      authorURL: status.quote.author.url,
      authorHandle: status.quote.author.screen_name,
      url: status.quote.url
    })}</b><br>︀<br>${formatStatus(quoteText, status.quote)}</blockquote>`;
  }
  if (status.poll) {
    text += `${generatePoll(status.poll)}`;
  }
  const socialProof = getActivitySocialProof(status);
  if (socialProof) {
    text += socialProof;
  }
  return { text, articleMedia: [] };
};

const linkifyMentions = (text: string, status: APIStatus) => {
  const baseUrl =
    status.provider === DataProvider.Bsky
      ? `${Constants.BSKY_ROOT}/profile`
      : `${Constants.TWITTER_ROOT}`;
  const matches = text.match(/(?<!https?:\/\/[\w.\-_%$@&?!:;/'()*]+)@([\w.]+)(?=\W|$)/g);

  console.log('matches', matches);
  // deduplicate mentions
  [...new Set(matches ?? [])]?.forEach(mention => {
    text = text.replace(
      new RegExp(`(?<!https?:\\/\\/[\\w.:/]+)${mention}(?=\\W|$)`, 'g'),
      `<a href="${baseUrl}/${mention.slice(1)}">${mention}</a>`
    );
  });
  console.log('text', text);
  return text;
};

const linkifyHashtags = (text: string, status: APIStatus) => {
  const baseUrl =
    status.provider === DataProvider.Bsky
      ? `${Constants.BSKY_ROOT}/hashtag`
      : `${Constants.TWITTER_ROOT}/hashtag`;
  const matches = text.match(/(?<!https?:\/\/[\w.\-_%$@&?!:;/'()*]+)#([\w.]+)(?=\W|$)/g);
  console.log('matches', matches);
  // deduplicate hashtags
  [...new Set(matches ?? [])]?.forEach(hashtag => {
    text = text.replace(
      new RegExp(`(?<!https?:\\/\\/[\\w.:/]+)${hashtag}(?=\\W|$)`, 'g'),
      `<a href="${baseUrl}/${hashtag.slice(1)}">${hashtag}</a>`
    );
  });
  console.log('text', text);
  return text;
};

const statusLinkWrapper = (text: string) => {
  const matches = text.match(
    /(?<!href=")https?:\/\/(?:www\.)?[-\w@:%.+~#=]{1,256}\.[a-zA-Z\d()]{1,6}\b([-\w()@:%+.~#?&/=]*)(?=\W|$)/g
  );
  [...new Set(matches ?? [])]?.forEach(url => {
    text = text.replace(
      new RegExp(`${escapeRegex(url)}(?=\\W|$)`, 'g'),
      `<a href="${url}">${url}</a>`
    );
  });
  return text;
};

const formatStatus = (text: string, status: APIStatus) => {
  const enableFacets = false;

  if (status.raw_text && enableFacets) {
    text = status.raw_text.text;

    const baseHashtagUrl =
      status.provider === DataProvider.Bsky
        ? `${Constants.BSKY_ROOT}/hashtag`
        : `${Constants.TWITTER_ROOT}/hashtag`;
    const baseSymbolUrl = `${Constants.TWITTER_ROOT}/search?q=%24`;
    const baseMentionUrl =
      status.provider === DataProvider.Bsky
        ? `${Constants.BSKY_ROOT}/profile`
        : `${Constants.TWITTER_ROOT}`;
    let offset = 0;
    status.raw_text.facets.forEach(facet => {
      let newFacet = '';
      switch (facet.type) {
        case 'bold':
          newFacet = `<b>${text.slice(facet.indices[0] + offset, facet.indices[1] + offset)}</b>`;
          text =
            text.slice(0, facet.indices[0] + offset) +
            newFacet +
            text.slice(facet.indices[1] + offset);
          offset += newFacet.length - (facet.indices[1] - facet.indices[0]);
          break;
        case 'italic':
          text =
            text.slice(0, facet.indices[0] + offset) +
            `<i>${text.slice(facet.indices[0] + offset, facet.indices[1] + offset)}</i>` +
            text.slice(facet.indices[1] + offset);
          offset += 14;
          break;
        case 'underline':
          text =
            text.slice(0, facet.indices[0] + offset) +
            `<u>${text.slice(facet.indices[0] + offset, facet.indices[1] + offset)}</u>` +
            text.slice(facet.indices[1] + offset);
          offset += 14;
          break;
        case 'strikethrough':
          text =
            text.slice(0, facet.indices[0] + offset) +
            `<s>${text.slice(facet.indices[0] + offset, facet.indices[1] + offset)}</s>` +
            text.slice(facet.indices[1] + offset);
          offset += 14;
          break;
        case 'url':
          newFacet = `<a href="${facet.replacement}">${facet.display}</a>`;
          text =
            text.slice(0, facet.indices[0] + offset) +
            newFacet +
            text.slice(facet.indices[1] + offset);
          offset += newFacet.length - (facet.indices[1] - facet.indices[0]);
          break;
        case 'hashtag':
          newFacet = `<a href="${baseHashtagUrl}/${facet.original}">#${facet.original}</a>`;
          text =
            text.slice(0, facet.indices[0] + offset) +
            newFacet +
            text.slice(facet.indices[1] + offset);
          offset += newFacet.length - (facet.indices[1] - facet.indices[0]);
          break;
        case 'symbol':
          newFacet = `<a href="${baseSymbolUrl}/${facet.original}">$${facet.original}</a>`;
          text =
            text.slice(0, facet.indices[0] + offset) +
            newFacet +
            text.slice(facet.indices[1] + offset);
          offset += newFacet.length - (facet.indices[1] - facet.indices[0]);
          break;
        case 'mention':
          newFacet = `<a href="${baseMentionUrl}/${facet.original}">@${facet.original}</a>`;
          text =
            text.slice(0, facet.indices[0] + offset) +
            newFacet +
            text.slice(facet.indices[1] + offset);
          offset += newFacet.length - (facet.indices[1] - facet.indices[0]);
          break;
        case 'media':
          text = text.slice(0, facet.indices[0] + offset) + text.slice(facet.indices[1] + offset);
          offset -= facet.indices[1] - facet.indices[0];
          break;
      }
      console.log('text next step', text);
    });
    text = text.trim().replace(/\n/g, '<br>︀︀');
  } else {
    text = statusLinkWrapper(text);
    text = linkifyMentions(text, status);
    text = linkifyHashtags(text, status);
  }
  return text;
};

export const handleActivity = async (
  c: Context,
  snowcode: string,
  provider: DataProvider
): Promise<Response> => {
  let language: string | null = null;
  let authorHandle: string | null = null;
  let mediaNumber: number | null = null;
  let textOnly = false;
  let forceMosaic = false;
  const decoded = decodeSnowcode(snowcode);
  const statusId = decoded.i;
  if (decoded.l) {
    language = decoded.l;
  }
  if (decoded.h) {
    authorHandle = decoded.h;
  }
  if (decoded.t) {
    textOnly = true;
  }
  if (decoded.m) {
    forceMosaic = true;
  }
  if (decoded.n) {
    mediaNumber = decoded.n;
  }

  let thread: SocialThread;
  if (provider === DataProvider.Twitter) {
    thread = await constructTwitterThread(statusId, false, c, language ?? undefined, false);
  } else if (provider === DataProvider.Bsky) {
    thread = await constructBlueskyThread(
      statusId,
      authorHandle ?? '',
      false,
      c,
      language ?? undefined
    );
  } else {
    return returnError(c, Strings.ERROR_API_FAIL);
  }

  await i18next.use(icu).init({
    lng: normalizeLanguage(language ?? thread.status?.lang ?? 'en'),
    resources: translationResources,
    fallbackLng: 'en'
  });

  if (!thread.status) {
    return returnError(c, Strings.ERROR_API_FAIL);
  }

  // Get status text and article media
  const statusResult = getStatusText(thread.status);
  const statusText = statusResult.text;
  const articleMedia = statusResult.articleMedia;

  // Map FxEmbed API to Mastodon API v1
  const response: ActivityStatus = {
    id: statusId,
    url: thread.status.url,
    uri: thread.status.url,
    created_at: new Date(thread.status.created_at).toISOString(),
    edited_at: null,
    reblog: null,
    in_reply_to_id: thread.status.replying_to?.post,
    in_reply_to_account_id: null,
    language: thread.status.lang,
    // TODO: Do formatting
    content: statusText,
    spoiler_text: '',
    visibility: 'public',
    application: {
      name: thread.status.source,
      website: null
    },
    media_attachments: [],
    account: {
      id: thread.status.author.id,
      display_name: thread.status.author.name,
      username: thread.status.author.screen_name,
      acct: thread.status.author.screen_name,
      url: thread.status.url,
      uri: thread.status.url,
      created_at: new Date(thread.status.author.joined).toISOString(),
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      avatar: thread.status.author.avatar_url ?? undefined,
      avatar_static: thread.status.author.avatar_url ?? undefined,
      header: thread.status.author.banner_url ?? undefined,
      header_static: thread.status.author.banner_url ?? undefined,
      followers_count: thread.status.author.followers,
      following_count: thread.status.author.following,
      statuses_count: thread.status.author.statuses,
      hide_collections: false,
      noindex: false,
      emojis: [],
      roles: [],
      fields: []
    },
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null
  };

  console.log('regular media', thread.status.media?.all);
  console.log('quote media', thread.status.quote?.media?.all);

  // Convert article media to attachments format
  const articleAttachments = articleMedia
    .map((media: TwitterApiMedia) => convertArticleMediaToAttachment(media))
    .filter(Boolean) as ActivityMediaAttachment[];

  const rawMediaList =
    (thread.status.media?.all?.length ?? 0) > 0
      ? thread.status.media?.all
      : (thread.status.quote?.media?.all ?? []);
  let mediaList = rawMediaList;

  console.log('mediaList', mediaList);

  if (!textOnly) {
    if (mediaNumber) {
      console.log('we have a media number', mediaNumber);
      const newMedia = rawMediaList?.[mediaNumber - 1];
      if (newMedia) {
        mediaList = [newMedia];
      } else {
        console.log('wtf there is no media #', mediaNumber);
      }
      console.log('updated mediaList', mediaList);
    }
    if (
      forceMosaic &&
      mediaList?.length !== 1 &&
      (thread.status.media?.mosaic || thread.status.quote?.media?.mosaic)
    ) {
      const mosaic = thread.status.media?.mosaic || thread.status.quote?.media?.mosaic;
      response.media_attachments = [
        {
          id: '114163769487684704',
          type: 'image',
          url: mosaic?.formats?.jpeg || '',
          remote_url: null,
          preview_url: null,
          preview_remote_url: null,
          text_url: null,
          description: null,
          meta: {
            original: {
              width: mosaic?.width || 0,
              height: mosaic?.height || 0
            }
          }
        }
      ];
    } else if (mediaList && mediaList.length > 0) {
      // Cast results to ActivityMediaAttachment[]
      response.media_attachments = mediaList
        .map(media => {
          if (media.type === 'gif') {
            const videoMedia = media as APIVideo;
            const photoMedia = media as APIPhoto;
            const shouldTranscodeGifs = shouldTranscodeGif(c);

            if (videoMedia.format === 'image/gif') {
              media.type = 'photo';
            } else if (shouldTranscodeGifs && photoMedia.transcode_url) {
              media.type = 'photo';
              media.url = photoMedia.transcode_url;
            }
          }
          switch (media.type) {
            case 'photo':
              const image = media as APIPhoto;
              return {
                id: '114163769487684704',
                type: 'image',
                url: image.url,
                preview_url: null,
                remote_url: null,
                preview_remote_url: null,
                text_url: null,
                description: image.altText ?? null,
                meta: {
                  original: {
                    width: image.width,
                    height: image.height,
                    size: `${image.width}x${image.height}`,
                    aspect: image.width / image.height
                  }
                }
              } as ActivityMediaAttachment;
            case 'video':
            case 'gif':
              const video = media as APIVideo;
              let sizeMultiplier = 1;

              if (video.width > 1920 || video.height > 1920) {
                sizeMultiplier = 0.5;
              }
              if (video.width < 400 || video.height < 400) {
                sizeMultiplier = 2;
              }
              if (
                experimentCheck(Experiment.VIDEO_REDIRECT_WORKAROUND, !!Constants.API_HOST_LIST)
              ) {
                video.url = `https://${Constants.API_HOST_LIST[0]}/2/go?url=${encodeURIComponent(video.url)}`;
              }
              return {
                id: '114163769487684704',
                type: 'video',
                url: video.url,
                preview_url: video.thumbnail_url,
                remote_url: null,
                preview_remote_url: null,
                text_url: null,
                description: null,
                meta: {
                  original: {
                    width: video.width * sizeMultiplier,
                    height: video.height * sizeMultiplier,
                    size: `${video.width * sizeMultiplier}x${video.height * sizeMultiplier}`,
                    aspect: video.width / video.height
                  }
                }
              } as ActivityMediaAttachment;
            default:
              return null;
          }
        })
        .filter(Boolean) as ActivityMediaAttachment[];

      // Merge article media attachments, excluding duplicates by id
      const existingIds = new Set(response.media_attachments.map(a => a.id));
      const uniqueArticleAttachments = articleAttachments.filter(a => !existingIds.has(a.id));
      response.media_attachments.push(...uniqueArticleAttachments);
    } else if (thread.status.media?.external) {
      const external = thread.status.media.external;
      // Cast the response media attachments to correct type
      response.media_attachments = [
        {
          id: '114163769487684704',
          type: 'video',
          url: external.url,
          preview_url: external.thumbnail_url,
          remote_url: null,
          preview_remote_url: null,
          text_url: null,
          description: null,
          meta: {
            original: {
              width: external.width,
              height: external.height,
              size: `${external.width}x${external.height}`,
              aspect: 1
            }
          }
        } as ActivityMediaAttachment
      ];
    } else if (articleAttachments.length > 0) {
      // If no regular media but we have article media, use article media
      response.media_attachments = articleAttachments;
    }
  }

  return c.json(response);
};
