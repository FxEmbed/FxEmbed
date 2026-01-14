import { Context } from 'hono';
import { Constants } from '../../constants';
import { DataProvider } from '../../enum';
import { handleMosaic } from '../../helpers/mosaic';
import { linkFixerBsky } from '../../helpers/linkFixer';
import { APIStatus, APIMedia } from '../../types/types';
import i18next from 'i18next';
import { translateStatusAI } from '../../helpers/translateAI';
import { translateStatus } from '../../helpers/translate';
import { unescapeText } from '../../helpers/utils';

export const buildAPIBskyPost = async (
  c: Context,
  status: BlueskyPost,
  language: string | undefined
): Promise<APIStatus> => {
  const apiStatus: APIStatus = {} as APIStatus;
  apiStatus.id = status.cid;
  apiStatus.text = linkFixerBsky(
    status.record?.facets ?? [],
    status.record?.text ?? status.value?.text
  );
  if (status.author) {
    apiStatus.author = {
      id: status.author.handle,
      name: status.author.displayName,
      screen_name: status.author.handle,
      avatar_url: status.author.avatar,
      banner_url: '', // TODO: Pull this from the actual author endpoint
      description: '',
      location: '',
      followers: 0,
      following: 0,
      media_count: 0,
      likes: 0,
      url: `${Constants.BSKY_ROOT}/profile/${status.author.handle}`,
      protected: false,
      statuses: 0,
      joined: status.author.createdAt,
      birthday: {
        day: 0,
        month: 0,
        year: 0
      },
      website: {
        url: '',
        display_url: ''
      }
    };
  }
  apiStatus.created_at = status.record?.createdAt ?? status.value?.createdAt;
  apiStatus.media = {};

  console.log('embed', status.embed);

  const media = status.embed?.media ?? status.embeds?.[0]?.media;

  if (status.embed?.media?.images || status.embeds?.[0]?.images) {
    apiStatus.embed_card = 'summary_large_image';
    const images = status.embed?.media?.images ?? (status.embeds?.[0]?.images as BlueskyImage[]);
    apiStatus.media.photos = images.map(image => {
      return {
        type: 'photo',
        width: image.aspectRatio?.width,
        height: image.aspectRatio?.height,
        url: image.fullsize,
        altText: image.alt
      };
    });
  }
  if (status.embeds?.[0]?.video) {
    apiStatus.embed_card = 'player';
    const video = status.embed?.video ?? status.embeds[0].video;
    apiStatus.media.videos = [
      {
        type: 'video',
        url: status.embeds[0].playlist ?? '',
        format: video.mimeType ?? 'video/mp4',
        thumbnail_url: status.embeds[0].thumbnail ?? '',
        formats: [
          {
            url: status.embeds[0].playlist ?? '',
            container: 'm3u8' as const // This is awful we should do something better
          }
        ],
        width: status.embeds[0].aspectRatio?.width ?? status.embed.aspectRatio?.width,
        height: status.embeds[0].aspectRatio?.height ?? status.embed.aspectRatio?.height,
        duration: 0
      }
    ];
  }

  if (media?.external || status.record?.embed?.external) {
    const external = media?.external ?? status.record?.embed?.external;
    if (external?.uri.startsWith('https://media.tenor.com')) {
      console.log('tenor gif', external?.uri);
      apiStatus.media.photos = [
        {
          type: 'gif',
          url: external?.uri,
          format: 'image/gif',
          thumbnail_url: external?.thumb?.ref?.$link ?? '',
          width: 0,
          height: 0
        }
      ];
    } else {
      apiStatus.media.photos = [
        {
          type: 'photo',
          url: external?.uri ?? '',
          altText: external?.description ?? '',
          width: 0,
          height: 0
        }
      ];
    }

    apiStatus.embed_card = 'summary_large_image';
    console.log('external image', apiStatus.media.photos);
  }

  if (status.embed?.images?.length) {
    apiStatus.media.photos = status.embed?.images.map(image => {
      apiStatus.embed_card = 'summary_large_image';
      console.log('image', image);

      return {
        type: 'photo',
        width: image.aspectRatio?.width,
        height: image.aspectRatio?.height,
        url: image.fullsize,
        altText: image.alt
      };
    });
  }

  if (
    status?.record?.embed?.video ||
    status?.value?.embed?.video ||
    status?.embed?.media?.$type === 'app.bsky.embed.video#view'
  ) {
    apiStatus.embed_card = 'player';
    const video =
      status.record?.embed?.video ?? status.value?.embed?.video ?? status?.record?.embed?.media;
    // TODO: figure out why this is so awful
    const cid =
      status.record?.embed?.video?.ref?.$link ??
      status.record?.embed?.media?.ref?.$link ??
      status.record?.embed?.media?.video?.ref?.$link ??
      status.value?.embed?.video?.ref?.$link ??
      status.value?.embed?.media?.ref?.$link ??
      status.value?.embed?.media?.video?.ref?.$link ??
      status.embed?.video?.ref?.$link;
    const videoUrl = `https://pds-cache.fxbsky.app/${status.author.did}/${cid}`;
    const aspectRatio =
      status.embed?.aspectRatio ??
      status.embed?.media?.aspectRatio ??
      status.embed?.record?.value?.embed?.aspectRatio;
    apiStatus.media.videos = [
      {
        type: 'video',
        url: videoUrl,
        format: video?.mimeType ?? 'video/mp4',
        thumbnail_url: status.embed?.thumbnail ?? status.embed?.media?.thumbnail ?? '',
        formats: [
          {
            url: videoUrl,
            container: 'mp4' as const, // TODO: Also include original m3u8, even if we can't use them in embeds
            codec: 'h264' as const
          }
        ],
        width: aspectRatio?.width,
        height: aspectRatio?.height,
        duration: 0
      }
    ];
  }
  if (status.embed?.record) {
    const record = status.embed?.record?.record ?? status.embed?.record;
    if (record.author) {
      apiStatus.quote = await buildAPIBskyPost(c, record, language);
      if (apiStatus.quote.embed_card) {
        apiStatus.embed_card = apiStatus.quote.embed_card;
      }
    }
  }
  apiStatus.media.all = ((apiStatus.media.photos as APIMedia[]) || []).concat(
    apiStatus.media.videos ?? []
  );

  /* Handle photos and mosaic if available */
  if ((apiStatus?.media.photos?.length || 0) > 1 && Constants.MOSAIC_BSKY_DOMAIN_LIST.length > 0) {
    apiStatus.embed_card = 'summary_large_image';
    const mosaic = await handleMosaic(apiStatus.media?.photos || [], ':3', DataProvider.Bsky);
    if (typeof apiStatus.media !== 'undefined' && mosaic !== null) {
      apiStatus.media.mosaic = mosaic;
    }
  }

  apiStatus.likes = status.likeCount;
  apiStatus.replies = 0;
  apiStatus.reposts = status.repostCount;
  apiStatus.source = 'Bluesky Social';
  apiStatus.url = `${Constants.BSKY_ROOT}/profile/${status.author.handle}/post/${status.uri.match(/(?<=post\/)(\w*)/g)?.[0]}`;
  apiStatus.provider = DataProvider.Bsky;

  /* If a language is specified by user, let's try translating it! */
  if (
    typeof language === 'string' &&
    (language.length === 2 || language.length === 5) &&
    language !== status.record?.langs?.[0]
  ) {
    console.log(`Attempting to translate status to ${language}...`);
    let didTranslate = false;
    if (Constants.POLYGLOT_DOMAIN_LIST.length > 0) {
      const translatePolyglot = await translateStatus(apiStatus, language, c);
      if (translatePolyglot !== null) {
        apiStatus.translation = {
          text: unescapeText(
            linkFixerBsky(status.record?.facets, translatePolyglot?.translated_text || '')
          ),
          source_lang: translatePolyglot?.source_lang.toLowerCase() ?? 'en',
          target_lang: language.toLowerCase(),
          source_lang_en: i18next.t(`language_${translatePolyglot?.source_lang.toLowerCase()}`, {
            lng: 'en'
          }),
          provider: translatePolyglot?.provider ?? 'polyglot'
        };
        didTranslate = true;
      }
    }
    if (c.env.AI && !didTranslate) {
      console.log('Falling back to LLM translation');
      const translateAPI = await translateStatusAI(apiStatus, language, c);
      if (translateAPI !== null && translateAPI?.translated_text) {
        apiStatus.translation = {
          text: unescapeText(
            linkFixerBsky(status.record?.facets, translateAPI?.translated_text || '')
          ),
          source_lang: apiStatus.lang ?? 'en',
          target_lang: language,
          source_lang_en: i18next.t(`language_${apiStatus.lang ?? 'en'}`, { lng: 'en' }),
          provider: 'llm'
        };
      }
      didTranslate = true;
    }
    if (!didTranslate) {
      console.log('No translation was successful, skipping');
    }
  }

  console.log('quote', apiStatus.quote);

  console.log('apiStatus', apiStatus);

  return apiStatus;
};
