import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import i18next from 'i18next';
import icu from 'i18next-icu';
import { Constants } from '../constants';
import { handleQuote } from '../helpers/quote';
import { isTombstone, withLocalizedTombstoneMessage } from '../helpers/tombstone';
import { pickPhotoEmbedUrl } from '@fxembed/atmosphere';
import { formatImageUrl, sanitizeText, truncateWithEllipsis } from '../helpers/utils';
import { Strings } from '../strings';
import { getSocialProof } from '../helpers/socialproof';
import { renderPhoto } from '../render/photo';
import { renderVideo } from '../render/video';
import { renderInstantView } from '../render/instantview';
import { constructTwitterThread } from '@fxembed/atmosphere/providers/twitter/conversation';
import { twitterBuildHostFromContext } from '../providers/twitter/build-host-adapter';
import { Experiment, experimentCheck } from '../experiments';
import translationResources from '../../i18n/resources';
import { constructBlueskyThread } from '@fxembed/atmosphere/providers/bluesky/conversation';
import { blueskyBuildHostFromContext } from '../providers/bluesky/build-host-adapter';
import { DataProvider } from '../enum';
import { encodeSnowcode } from '../helpers/snowcode';
import { getBranding } from '../helpers/branding';
import type { APIStatusTombstone, APITwitterStatus } from '../realms/api/schemas';
import type { APIStatus, SocialThread } from '../types/apiStatus';
import { shouldTranscodeGif } from '../helpers/giftranscode';
import { normalizeLanguage } from '../helpers/language';
import { getVideoTranscodeDomain, getVideoTranscodeDomainBluesky } from '../helpers/transcode';
import { constructTikTokVideo } from '@fxembed/atmosphere/providers/tiktok/conversation';
import { InputFlags } from '../types/types';
import { formatRuntime } from '../helpers/runtime';

/**
 * Check if the tweet text is essentially just an article URL with no meaningful additional content.
 * Returns true if we should use the article as the main preview.
 */
const isArticleOnlyTweet = (status: APITwitterStatus): boolean => {
  if (!status.article) {
    return false;
  }

  // Get the raw text, trimmed
  const text = status.text.trim();

  // Check if text is empty or just whitespace
  if (!text) {
    return true;
  }

  // Article URLs look like: https://x.com/i/article/<id> or https://twitter.com/i/article/<id>
  // Also check for t.co shortened links
  const articleUrlPattern = /^https?:\/\/(x\.com|twitter\.com)\/i\/article\/\d+\/?$/;
  const tcoPattern = /^https?:\/\/t\.co\/\w+$/;

  // If text is just the article URL or a t.co link, treat as article-only
  if (articleUrlPattern.test(text) || tcoPattern.test(text)) {
    return true;
  }

  // Check if the text is just the article title (sometimes people just tweet the title)
  if (text === status.article.title) {
    return true;
  }

  return false;
};

export const returnError = (c: Context, error: string): Response => {
  const branding = getBranding(c);
  console.log('branding', JSON.stringify(branding));
  return c.html(
    Strings.BASE_HTML.format({
      runtime: formatRuntime(),
      brandingName: branding.name,
      body: '',
      lang: '',
      headers: [
        `<meta property="og:title" content="${branding.name}"/>`,
        `<meta property="og:description" content="${error}"/>`,
        `<meta property="theme-color" content="${branding.color}"/>`
      ].join('')
    })
  ) as Response;
};
/* Handler for Twitter statuses (Tweets).
   Like Twitter, we use the terminologies interchangably. */
export const handleStatus = async (
  c: Context,
  statusId: string,
  authorHandle: string | null,
  mediaNumber: number | undefined,
  userAgent: string,
  flags: InputFlags,
  language: string | undefined,
  provider: DataProvider
): Promise<Response> => {
  console.log('flags', JSON.stringify(flags));

  const isTelegram = (userAgent || '').indexOf('TelegramBot') > -1;
  const isDiscord = (userAgent || '').indexOf('Discordbot') > -1;

  let fetchWithThreads = false;

  if (
    c.req.header('user-agent')?.includes('TelegramBot') &&
    !flags?.direct &&
    flags.instantViewUnrollThreads
  ) {
    fetchWithThreads = true;
  }

  let thread: SocialThread;
  let useLanguage = language;
  // Only request translation for activity embed, otherwise we'll be doing it twice
  if (!flags.noActivity && isDiscord) {
    useLanguage = undefined;
  }

  let useActivity = false;

  if (
    experimentCheck(
      Experiment.ACTIVITY_EMBED,
      c.req.header('user-agent')?.includes('Discordbot')
    ) &&
    !flags.direct &&
    !flags.gallery &&
    !flags.api &&
    !flags.noActivity
  ) {
    useActivity = true;
  }

  let blueskyActivityPdsOut: { pdsHostHint?: string } | undefined;

  if (provider === DataProvider.Twitter) {
    thread = await constructTwitterThread(
      statusId,
      fetchWithThreads,
      twitterBuildHostFromContext(c),
      useActivity ? undefined : useLanguage,
      flags?.api ?? false
    );
  } else if (provider === DataProvider.Bluesky) {
    blueskyActivityPdsOut = useActivity ? {} : undefined;
    thread = (await constructBlueskyThread(
      statusId,
      authorHandle ?? '',
      fetchWithThreads,
      blueskyBuildHostFromContext(c),
      useActivity ? undefined : useLanguage,
      undefined,
      blueskyActivityPdsOut
    )) as SocialThread;
  } else if (provider === DataProvider.TikTok) {
    // Get proxy base URL from the current request for TikTok video proxy
    const requestUrl = new URL(c.req.url);
    const proxyBase = `${requestUrl.protocol}//${requestUrl.host}`;
    thread = await constructTikTokVideo(statusId, proxyBase, userAgent);
  } else {
    return returnError(c, Strings.ERROR_API_FAIL);
  }

  const rawStatus = thread?.status;
  const status: APIStatus | APITwitterStatus | APIStatusTombstone | null =
    rawStatus != null && isTombstone(rawStatus)
      ? await withLocalizedTombstoneMessage(rawStatus, language)
      : ((rawStatus as APIStatus | APITwitterStatus | null) ?? null);

  const api = {
    code: thread.code,
    message: '',
    tweet: status
  };

  switch (api.code) {
    case 200:
      api.message = 'OK';
      break;
    case 401:
      api.message = 'PRIVATE_TWEET';
      break;
    case 404:
      api.message = 'NOT_FOUND';
      break;
    case 503:
      api.message = 'UPSTREAM_UNAVAILABLE';
      break;
    case 500:
      console.log(api);
      api.message = 'API_FAIL';
      break;
  }

  /* Catch this request if it's an API response */
  if (flags?.api) {
    c.status(api.code as ContentfulStatusCode);
    // Add every header from Constants.API_RESPONSE_HEADERS
    for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
      c.header(header, value);
    }
    return c.json(api);
  }

  if (status === null) {
    if (provider === DataProvider.Bluesky) {
      return returnError(
        c,
        thread.code === 404 ? Strings.ERROR_TWEET_NOT_FOUND : Strings.ERROR_BLUESKY_UNAVAILABLE
      );
    } else {
      return returnError(c, Strings.ERROR_TWEET_NOT_FOUND);
    }
  }

  if (isTombstone(status)) {
    return returnError(c, `${status.message} :(`);
  }

  /* If there was any errors fetching the Tweet, we'll return it */
  switch (api.code) {
    case 401:
      return returnError(c, Strings.ERROR_PRIVATE);
    case 404:
      return returnError(c, Strings.ERROR_TWEET_NOT_FOUND);
    case 503:
      if (provider === DataProvider.Bluesky) {
        return returnError(c, Strings.ERROR_BLUESKY_UNAVAILABLE);
      }
      return returnError(c, Strings.ERROR_API_FAIL);
    case 500:
      console.log(api);
      return returnError(c, Strings.ERROR_API_FAIL);
  }
  /* Should sensitive statuses be allowed Instant View? */
  let useIV = false;

  if (
    (status.media?.all?.length ?? 0) <= 0 &&
    (status.media?.external?.url || status.media?.broadcast?.stream?.url)
  ) {
    useActivity = false;
  }

  if (isTelegram && !flags?.direct && !flags?.gallery && !flags?.api) {
    if (status.provider === 'twitter') {
      const twitterStatus = status as APITwitterStatus;
      useIV =
        useIV ||
        !!(
          twitterStatus.is_note_tweet ||
          twitterStatus.translation ||
          twitterStatus.community_note
        );
    }
    useIV =
      useIV ||
      !!(
        status.media?.photos?.[0] || // Force instant view for photos for now https://bugs.telegram.org/c/33679
        status.media?.mosaic ||
        (status.quote && !isTombstone(status.quote)) ||
        flags?.forceInstantView ||
        (status as APITwitterStatus)?.article ||
        (thread?.thread?.length ?? 0) > 1
      );
  }

  /* Force enable IV for archivers */
  if (flags?.archive) {
    useIV = true;
  }

  let ivbody = '';

  let overrideMedia: APIMedia | undefined;

  await i18next.use(icu).init({
    lng: normalizeLanguage(language ?? status.lang ?? 'en'),
    resources: translationResources,
    fallbackLng: 'en'
  });

  // Check if mediaNumber exists, and if that media exists in status.media.all. If it does, we'll store overrideMedia variable
  if (mediaNumber && status.media && status.media.all && status.media.all[mediaNumber - 1]) {
    overrideMedia = status.media.all[mediaNumber - 1] as APIMedia;
  }

  /* Catch direct media request (d.fxtwitter.com, or .mp4 / .jpg) */
  if (flags?.direct && !flags?.textOnly && status.media) {
    let redirectUrl: string | null = null;
    const all = status.media.all || [];
    // if (status.media.videos) {
    //   const { videos } = status.media;
    //   redirectUrl = (videos[(mediaNumber || 1) - 1] || videos[0]).url;
    // } else if (status.media.photos) {
    //   const { photos } = status.media;
    //   redirectUrl = (photos[(mediaNumber || 1) - 1] || photos[0]).url;
    // }

    const selectedMedia = all[(mediaNumber || 1) - 1];
    if (selectedMedia) {
      redirectUrl =
        selectedMedia.type === 'photo'
          ? pickPhotoEmbedUrl(selectedMedia as APIPhoto, userAgent)
          : selectedMedia.url;
    } else if (all.length > 0) {
      const fallback = all[0];
      redirectUrl =
        fallback.type === 'photo'
          ? pickPhotoEmbedUrl(fallback as APIPhoto, userAgent)
          : fallback.url;
    }

    if (redirectUrl) {
      if (selectedMedia?.type === 'gif' && shouldTranscodeGif(c)) {
        redirectUrl = (selectedMedia as APIPhoto).transcode_url ?? redirectUrl;
      }
      if (selectedMedia?.type === 'video') {
        if (
          experimentCheck(Experiment.KITCHENSINK_VIDEO, isTelegram) &&
          status.provider !== DataProvider.TikTok
        ) {
          const domain =
            status.provider === DataProvider.Twitter
              ? getVideoTranscodeDomain(status.id)
              : getVideoTranscodeDomainBluesky(status.author.id);
          redirectUrl = `https://${domain}${new URL(redirectUrl).pathname}`;
        } else if (
          experimentCheck(Experiment.VIDEO_REDIRECT_WORKAROUND, !!Constants.API_HOST_LIST) &&
          status.provider !== DataProvider.TikTok
        ) {
          redirectUrl = `https://${Constants.API_HOST_LIST[0]}/2/go?url=${encodeURIComponent(redirectUrl)}`;
        }
      }
      // Only append name if it's an image
      if (selectedMedia?.type === 'photo' && flags.name !== undefined) {
        redirectUrl = formatImageUrl(redirectUrl, flags.name);
      }
      console.log('redirectUrl', redirectUrl);
      return c.redirect(redirectUrl, 302);
    }
  }

  /* User requested gallery view, but this isn't a status with media */
  if (flags.gallery && (status.media?.all?.length ?? 0) < 1) {
    flags.gallery = false;
  }

  /* At this point, we know we're going to have to create a
     regular embed because it's not an API or direct media request */

  let authorText = getSocialProof(status as APIStatus) || Strings.DEFAULT_AUTHOR_TEXT;
  const engagementText = authorText.replace(/ {4}/g, ' ');
  const originalSiteName = getBranding(c).name;
  let siteName = originalSiteName;

  if ((status as APITwitterStatus).article && isTelegram && useIV) {
    siteName = i18next.t('articleIndicator', { brandingName: siteName });
  } else if (thread.thread && thread.thread.length > 1 && isTelegram && useIV) {
    siteName = i18next.t('threadIndicator', { brandingName: siteName });
  }

  if (
    status.provider === DataProvider.Twitter &&
    (status as APITwitterStatus).card?.domain &&
    (status as APITwitterStatus).embed_card !== 'player'
  ) {
    const d = (status as APITwitterStatus).card!.domain!.replace(/^www\./, '');
    siteName = `${originalSiteName} · ${d}`;
  }

  let newText = status.text;

  /* Base headers included in all responses */
  const headers = [];

  const twitterPublicStatusUrl = flags?.horizon
    ? `${Constants.HORIZON_WEB_ROOT}/${status.author.screen_name}/status/${status.id}`
    : `${Constants.TWITTER_ROOT}/${status.author.screen_name}/status/${status.id}`;
  const bskyPublicStatusUrl = flags?.horizon
    ? `${Constants.HORIZON_WEB_ROOT}/profile/${status.author.screen_name}/post/${status.id}`
    : `${Constants.BLUESKY_ROOT}/profile/${status.author.screen_name}/post/${status.id}`;

  if (status.provider === DataProvider.Twitter) {
    headers.push(
      `<link rel="canonical" href="${twitterPublicStatusUrl}"/>`,
      `<meta property="og:url" content="${twitterPublicStatusUrl}"/>`,
      `<meta property="twitter:site" content="@${status.author.screen_name}"/>`,
      `<meta property="twitter:creator" content="@${status.author.screen_name}"/>`
    );
  } else if (status.provider === DataProvider.Bluesky) {
    headers.push(
      `<link rel="canonical" href="${bskyPublicStatusUrl}"/>`,
      `<meta property="og:url" content="${bskyPublicStatusUrl}"/>`
    );
  }

  if (!flags.gallery) {
    headers.push(`<meta property="theme-color" content="${getBranding(c).color}"/>`);
    headers.push(
      `<meta property="twitter:title" content="${status.author.name} (@${status.author.screen_name})"/>`
    );
  }

  /* This little thing ensures if by some miracle our embed is loaded in a browser,
     it will gracefully redirect to the destination instead of just seeing a blank screen.

     Telegram is dumb and it just gets stuck if this is included, so we never include it for Telegram UAs. */
  if (!isTelegram) {
    if (provider === DataProvider.Twitter) {
      headers.push(`<meta http-equiv="refresh" content="0;url=${twitterPublicStatusUrl}"/>`);
    } else if (provider === DataProvider.Bluesky) {
      headers.push(`<meta http-equiv="refresh" content="0;url=${bskyPublicStatusUrl}"/>`);
    }
  }

  if (useIV) {
    try {
      const instructions = renderInstantView({
        context: c,
        status: status as APIStatus,
        thread: thread,
        text: newText,
        flags: flags,
        targetLanguage: language ?? status.lang ?? 'en',
        userAgent
      });
      headers.push(...instructions.addHeaders);
      if (instructions.authorText) {
        authorText = instructions.authorText;
      }
      ivbody = instructions.text || '';
    } catch (e) {
      console.log('Error rendering Instant View', e, (e as Error)?.stack);
      useIV = false;
    }
  }

  /* This status has a translation attached to it, so we'll render it. */
  if ((status as APITwitterStatus).translation) {
    const { translation } = status as APITwitterStatus;

    const formatText = `📑 {translation}`.format({
      translation: i18next.t('translatedFrom').format({
        language: i18next.t(`language_${translation?.source_lang}`)
      })
    });

    newText = `${formatText}\n\n` + `${translation?.text}\n\n`;
  }

  console.log('overrideMedia', JSON.stringify(overrideMedia));
  console.log('media', JSON.stringify(status.media));

  // Skip for activity to make embed generate faster for mosaic and such
  if (!useActivity && !flags?.textOnly) {
    const media =
      status.media?.all && status.media?.all.length > 0
        ? status.media
        : !isTombstone(status.quote)
          ? status.quote?.media || {}
          : {};
    if (overrideMedia) {
      let instructions: ResponseInstructions;

      switch (overrideMedia.type) {
        case 'photo':
          /* This status has a photo to render. */
          instructions = renderPhoto(
            {
              context: c,
              status: status as APIStatus,
              authorText: authorText,
              engagementText: engagementText,
              userAgent: userAgent,
              isOverrideMedia: true
            },
            overrideMedia as APIPhoto
          );
          headers.push(...instructions.addHeaders);
          if (instructions.authorText) {
            authorText = instructions.authorText;
          }
          if (instructions.siteName) {
            siteName = instructions.siteName;
          }
          /* Overwrite our Twitter Card if overriding media, so it displays correctly in Discord */
          if (status.embed_card === 'player') {
            status.embed_card = 'summary_large_image';
          }
          break;
        case 'video':
          instructions = renderVideo(
            {
              context: c,
              status: status as APIStatus,
              userAgent: userAgent,
              text: newText,
              isOverrideMedia: true
            },
            overrideMedia as APIVideo
          );
          headers.push(...instructions.addHeaders);
          if (instructions.authorText) {
            authorText = instructions.authorText;
          }
          if (instructions.siteName) {
            siteName = instructions.siteName;
          }
          /* Overwrite our Twitter Card if overriding media, so it displays correctly in Discord */
          if (status.embed_card !== 'player') {
            status.embed_card = 'player';
          }
          /* This status has a video to render. */
          break;
      }
    } else if (media?.videos) {
      const instructions = renderVideo(
        { context: c, status: status as APIStatus, userAgent: userAgent, text: newText },
        media.videos[0]
      );
      headers.push(...instructions.addHeaders);
      if (instructions.authorText) {
        authorText = instructions.authorText;
      }
      if (instructions.siteName) {
        siteName = instructions.siteName;
      }
    } else if (media?.mosaic) {
      if (userAgent.match(Constants.NATIVE_MULTI_IMAGE_UA_REGEX) && !flags.forceMosaic) {
        const photos = media?.photos || [];

        photos.forEach(photo => {
          /* Override the card type */
          status.embed_card = 'summary_large_image';
          console.log('set embed_card to summary_large_image');

          const instructions = renderPhoto(
            {
              context: c,
              status: status as APIStatus,
              authorText: authorText,
              engagementText: engagementText,
              userAgent: userAgent
            },
            photo
          );
          headers.push(...instructions.addHeaders);
        });
      } else {
        const instructions = renderPhoto(
          {
            context: c,
            status: status as APIStatus,
            authorText: authorText,
            engagementText: engagementText,
            userAgent: userAgent
          },
          media.mosaic
        );
        headers.push(...instructions.addHeaders);
      }
    } else if (media?.photos) {
      console.log('photos', media?.photos);
      const instructions = renderPhoto(
        {
          context: c,
          status: status as APIStatus,
          authorText: authorText,
          engagementText: engagementText,
          userAgent: userAgent
        },
        media.photos[0]
      );
      headers.push(...instructions.addHeaders);
    }
    if (status.media?.external && !status.media.videos?.length) {
      const { external } = status.media;
      authorText = newText || '';
      headers.push(
        `<meta property="twitter:player" content="${external.url}">`,
        `<meta property="twitter:player:width" content="${external.width}">`,
        `<meta property="twitter:player:height" content="${external.height}">`,
        `<meta property="og:type" content="video.other">`,
        `<meta property="og:video:url" content="${external.url}">`,
        `<meta property="og:video:secure_url" content="${external.url}">`,
        `<meta property="og:video:width" content="${external.width}">`,
        `<meta property="og:video:height" content="${external.height}">`
      );
      if (external.thumbnail_url && !status.media.photos?.length) {
        headers.push(`<meta property="og:image" content="${external.thumbnail_url}">`);
      }
    }
  }

  /* This status contains a poll, so we'll render it */
  if (status.poll) {
    const { poll } = status;
    let barLength = 32;
    let str = '';

    /* Telegram Embeds are smaller, so we use a smaller bar to compensate */
    if (isTelegram) {
      barLength = 24;
    }

    /* Render each poll choice */
    status.poll.choices.forEach(choice => {
      const bar = '█'.repeat((choice.percentage / 100) * barLength);
      // eslint-disable-next-line no-irregular-whitespace
      str += `${bar}\n${choice.label}  (${choice.percentage}%)\n`;
    });

    /* Finally, add the footer of the poll with # of votes and time left */
    str += '\n'; /* TODO: Localize time left */
    str += i18next.t('pollVotes', {
      voteCount: poll.total_votes,
      timeLeft: poll.time_left_en
    });

    /* Check if the poll is ongoing and apply low TTL cache control.
       Yes, checking if this is a string is a hacky way to do this, but
       it can do it in way less code than actually comparing dates */
    if (poll.time_left_en !== 'Final results') {
      c.header('cache-control', Constants.POLL_TWEET_CACHE);
    }

    /* And now we'll put the poll right after the Tweet text! */
    newText += `\n\n${str}`;
  }

  /* This Tweet quotes another Tweet, so we'll render the other Tweet where possible */
  if (status.quote) {
    const quoteText = handleQuote(status.quote as APIStatus | APIStatusTombstone);
    newText += `\n${quoteText}`;
  }

  if (!isDiscord && status.replying_to) {
    newText = `↩ ${status.replying_to.display_name ?? ''} (@${status.replying_to.screen_name})<br>${newText}`;
  }

  const avatar = status.author.avatar_url;
  const twitterStatus = status as APITwitterStatus;

  // Check if this is an article-only tweet (text is just the article URL)
  const articleOnly = twitterStatus.article && isArticleOnlyTweet(twitterStatus);

  const quoteHasDisplayableMedia =
    !!status.quote &&
    !isTombstone(status.quote) &&
    (!!status.quote.media?.photos?.length || !!status.quote.media?.videos?.length);

  /* If we have no media to display, instead we'll display the user profile picture in the embed,
     OR if this is an article-only tweet, use the article cover image */
  if (
    !status.media?.videos &&
    !status.media?.photos &&
    !quoteHasDisplayableMedia &&
    !flags?.textOnly
  ) {
    // Check if we have an article with cover media to use instead
    if (articleOnly && twitterStatus.article?.cover_media?.media_info?.__typename === 'ApiImage') {
      const coverImage = twitterStatus.article.cover_media.media_info as TwitterApiImage;
      headers.push(
        `<meta property="og:image" content="${coverImage.original_img_url}"/>`,
        `<meta property="og:image:width" content="${coverImage.original_img_width}"/>`,
        `<meta property="og:image:height" content="${coverImage.original_img_height}"/>`
      );
      if (!useIV) {
        headers.push(`<meta property="twitter:image" content="0"/>`);
      }
      // Update embed card type to show large image
      status.embed_card = 'summary_large_image';
    } else {
      /* Use a slightly higher resolution image for profile pics */
      if (!useIV) {
        headers.push(
          `<meta property="og:image" content="${avatar}"/>`,
          `<meta property="twitter:image" content="0"/>`
        );
      } else {
        headers.push(`<meta property="twitter:image" content="${avatar}"/>`);
      }
    }
  }

  headers.push(`<link rel="apple-touch-icon" href="${avatar}"/>`);

  /* For supporting Telegram IV, we have to replace newlines with <br> within the og:description <meta> tag because of its weird (undocumented?) behavior.
     If you don't use IV, it uses newlines just fine. Just like Discord and others. But with IV, suddenly newlines don't actually break the line anymore.

     This is incredibly stupid, and you'd think this weird behavior would not be the case. You'd also think embedding a <br> inside the quotes inside
     a meta tag shouldn't work, because that's stupid, but alas it does.
     
     A possible explanation for this weird behavior is due to the Medium template we are forced to use because Telegram IV is not an open platform
     and we have to pretend to be Medium in order to get working IV, but haven't figured if the template is causing issues.  */
  let text = useIV ? sanitizeText(newText).replace(/\n/g, '<br>') : sanitizeText(newText);

  // For article-only tweets, use article title and preview text
  let ogTitle = `${status.author.name} (@${status.author.screen_name})`;
  if (articleOnly && twitterStatus.article && isTelegram) {
    ogTitle = sanitizeText(twitterStatus.article.title);
    text = sanitizeText(twitterStatus.article.preview_text);
  }

  const useCard =
    status.embed_card === 'tweet'
      ? status.quote && !isTombstone(status.quote)
        ? (status.quote as APITwitterStatus).embed_card
        : 'summary'
      : status.embed_card;

  headers.push(`<meta property="twitter:card" content="${useCard}"/>`);

  /* Push basic headers relating to author, Tweet text, and site name */
  if (!flags.gallery) {
    headers.push(
      `<meta property="og:title" content="${ogTitle}"/>`,
      `<meta property="og:description" content="${text}"/>`
    );
    if (!useActivity) {
      headers.push(`<meta property="og:site_name" content="${siteName}"/>`);
    } else {
      headers.push(`<meta property="og:site_name" content="${originalSiteName}"/>`);
    }
  } else {
    if (isTelegram) {
      headers.push(
        `<meta property="og:site_name" content="${status.author.name} (@${status.author.screen_name})"/>`
      );
    } else {
      headers.push(
        `<meta property="og:title" content="${status.author.name} (@${status.author.screen_name})"/>`
      );
    }
  }

  /* Special reply handling if authorText is not overriden */
  if (status.replying_to && authorText === Strings.DEFAULT_AUTHOR_TEXT) {
    authorText = `↪ ${i18next.t('replyingTo').format({ screen_name: status.replying_to.screen_name })}`;
    /* We'll assume it's a thread if it's a reply to themselves */
  } else if (
    status.replying_to?.screen_name === status.author.screen_name &&
    authorText === Strings.DEFAULT_AUTHOR_TEXT
  ) {
    authorText = `↪ ${i18next.t('threadPartHeader').format({ screen_name: status.author.screen_name })}`;
  }

  if (!flags.gallery) {
    /* The additional oembed is pulled by Discord to enable improved embeds.
      Telegram does not use this. */
    let providerEngagementText = getSocialProof(status as APIStatus) ?? Strings.DEFAULT_AUTHOR_TEXT;
    providerEngagementText = providerEngagementText.replace(/ {4}/g, '  ');

    /* Workaround to prevent us from accidentally doubling up the engagement text in both provider and author fields */
    if (status.text.trim().length === 0) {
      providerEngagementText = Strings.DEFAULT_AUTHOR_TEXT;
    }

    let provider = '';
    const mediaType = overrideMedia ?? (status as APITwitterStatus).media.videos?.[0]?.type;
    const branding = getBranding(c);

    if (mediaType === 'gif') {
      provider = i18next.t('gifIndicator', { brandingName: branding.name });
    } else if (
      status.embed_card === 'player' &&
      providerEngagementText !== Strings.DEFAULT_AUTHOR_TEXT
    ) {
      provider = providerEngagementText;
    }

    const iconSet = getBranding(c).activityIcons;
    const icons = Array.isArray(iconSet)
      ? iconSet[Math.floor(Math.random() * iconSet.length)]
      : iconSet;
    const iconSizes = ['svg', '64', '48', '32', '24', '16'];

    for (const size of iconSizes) {
      let icon = icons?.[size];
      // Use default icon if size 32 is not available
      if (size === '32' && !icon) {
        icon = icons?.['default'];
      }
      const iconType = size === 'svg' ? 'image/svg+xml' : 'image/png';
      if (icon) {
        headers.push(`<link href='${icon}' rel='icon' sizes='${size}x${size}' type='${iconType}'>`);
      }
    }

    headers.push(
      `<link rel="alternate" href="{base}/owoembed?text={text}&status={status}&author={author}{provider}" type="application/json+oembed" title="{name}">`.format(
        {
          base: `https://${getBranding(c).domains[0]}`,
          text: flags.gallery
            ? status.author.name
            : encodeURIComponent(truncateWithEllipsis(authorText, 255)),
          status: encodeURIComponent(statusId),
          author: encodeURIComponent(status.author.screen_name || ''),
          name: status.author.name || '',
          provider: provider ? `&provider=${encodeURIComponent(provider)}` : ''
        }
      )
    );
  }

  if (useActivity) {
    const data: {
      i: string;
      l?: string;
      h?: string;
      p?: string;
      t?: number;
      m?: number;
      n?: number;
    } = {
      i: statusId
    };
    /* Convert necessary flags into snowcode data */
    if (language !== status.lang) {
      data.l = language;
    }
    if (status.provider === DataProvider.Bluesky) {
      data.h = status.author.id;
      if (blueskyActivityPdsOut?.pdsHostHint) {
        data.p = blueskyActivityPdsOut.pdsHostHint;
      }
    }
    if (flags.textOnly) {
      data.t = 1;
    }
    if (flags.forceMosaic) {
      data.m = 1;
    }
    if (mediaNumber) {
      data.n = mediaNumber;
    }
    let snowflake: string;
    try {
      snowflake = encodeSnowcode(data);
    } catch (e) {
      if (data.p !== undefined) {
        const { p: _omit, ...rest } = data;
        snowflake = encodeSnowcode(rest);
      } else {
        throw e;
      }
    }
    console.log('snowflake', snowflake);
    let base: string;
    switch (status.provider) {
      case DataProvider.Bluesky:
        base = Constants.STANDARD_BSKY_DOMAIN_LIST[0];
        break;
      case DataProvider.TikTok:
        base = Constants.STANDARD_TIKTOK_DOMAIN_LIST[0];
        break;
      default:
        base = Constants.STANDARD_DOMAIN_LIST[0];
        break;
    }

    try {
      base = new URL(c.req.url).hostname;
    } catch (e) {
      console.log('couldnt parse hostname for some reason', e);
    }

    /* Convince Discord that you are actually a Mastodon link lol */
    headers.push(
      `<link href='{base}/users/{author}/statuses/{status}' rel='alternate' type='application/activity+json'>`.format(
        {
          base: `https://${base}`,
          author: encodeURIComponent(status.author.screen_name || ''),
          status: snowflake
        }
      )
    );
  }

  /* When dealing with a Tweet of unknown lang, fall back to en */
  const lang = status.lang === null ? 'en' : status.lang || 'en';

  /* Finally, after all that work we return the response HTML! */
  return c.html(
    Strings.BASE_HTML.format({
      runtime: formatRuntime(),
      lang: `lang="${lang}"`,
      headers: headers.join(''),
      body: ivbody
    }).replace(/>(\s+)</gm, '><')
  );
};
export { DataProvider };
