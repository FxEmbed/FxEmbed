import { calculateTimeLeftString, type PollTimeStrings } from '../../helpers/poll-time.js';
import { twitterFetch } from './fetch.js';
import { getTwitterProviderEnv } from '../twitter-runtime.js';
import type { TwitterBuildHost } from './build-host.js';
import { parseUnifiedCard, type UnifiedCardMedia } from './unified-card.js';
import type {
  APIBroadcast,
  APIExternalMedia,
  APIPoll,
  APITwitterStatus
} from '../../types/api-schemas.js';

const enPollTimeStrings: PollTimeStrings = {
  singularDay: 'day',
  pluralDays: 'days',
  singularHour: 'hour',
  pluralHours: 'hours',
  singularMinute: 'minute',
  pluralMinutes: 'minutes',
  singularSecond: 'second',
  pluralSeconds: 'seconds',
  finalResults: 'Final results'
};

const pollTimeEn = (date: Date) => calculateTimeLeftString(date, enPollTimeStrings);

type CardBindingValue = {
  string_value?: string;
  boolean_value?: boolean;
  image_value?: { url?: string; width?: number; height?: number; alt?: string };
};

const WEBSITE_TWITTER_CARD_NAMES = new Set([
  'summary_large_image',
  'summary',
  'summary_photo_image',
  'promo_image',
  'summary_large_image_app'
]);

const WEBSITE_CARD_IMAGE_KEYS = [
  'summary_photo_image_large',
  'photo_image_full_size_large',
  'summary_photo_image',
  'photo_image_full_size',
  'summary_photo_image_x_large',
  'photo_image_full_size_x_large',
  'thumbnail_image_large',
  'thumbnail_image',
  'thumbnail_image_original',
  'summary_photo_image_original',
  'photo_image_full_size_original'
] as const;

function strBinding(b: Record<string, CardBindingValue>, key: string): string | undefined {
  const v = b[key]?.string_value;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function pickWebsiteCardImage(
  b: Record<string, CardBindingValue>
): { url: string; width: number; height: number; alt?: string } | undefined {
  for (const key of WEBSITE_CARD_IMAGE_KEYS) {
    const img = b[key]?.image_value;
    if (img?.url) {
      return {
        url: img.url,
        width: img.width ?? 0,
        height: img.height ?? 0,
        alt: img.alt
      };
    }
  }
  return undefined;
}

export const renderCard = async (
  host: TwitterBuildHost,
  card: GraphQLTwitterStatus['card']
): Promise<{
  poll?: APIPoll;
  external_media?: APIExternalMedia;
  broadcast?: APIBroadcast;
  media?: UnifiedCardMedia[];
  website_card?: APITwitterStatus['card'];
}> => {
  if (!Array.isArray(card.legacy?.binding_values)) {
    return {};
  }

  const binding_values: Record<string, CardBindingValue> = {};

  card.legacy.binding_values.forEach(value => {
    if (value.key && value.value) {
      binding_values[value.key] = value.value as CardBindingValue;
    }
  });

  if (binding_values.broadcast_url?.string_value) {
    const broadcast: APIBroadcast = {
      url: binding_values.broadcast_url.string_value,
      width: parseInt(binding_values.broadcast_width?.string_value || '1280'),
      height: parseInt(binding_values.broadcast_height?.string_value || '720'),
      state: binding_values.broadcast_state?.string_value as 'LIVE' | 'ENDED',
      broadcaster: {
        username: binding_values.broadcaster_username?.string_value || '',
        display_name: binding_values.broadcaster_display_name?.string_value || '',
        id: binding_values.broadcaster_twitter_id?.string_value || ''
      },
      title: binding_values.broadcast_title?.string_value || '',
      orientation:
        binding_values.broadcast_orientation?.string_value === '1' ? 'portrait' : 'landscape',
      broadcast_id: binding_values.broadcast_id?.string_value || '',
      media_id: binding_values.broadcast_media_id?.string_value || '',
      media_key: binding_values.broadcast_media_key?.string_value || '',
      is_high_latency: binding_values.broadcast_is_high_latency?.boolean_value || false,
      thumbnail: {
        original: {
          url: binding_values.broadcast_thumbnail_original?.image_value?.url || ''
        },
        small: {
          url: binding_values.broadcast_thumbnail_small?.image_value?.url || ''
        },
        medium: {
          url: binding_values.broadcast_thumbnail_medium?.image_value?.url || ''
        },
        large: {
          url: binding_values.broadcast_thumbnail_large?.image_value?.url || ''
        },
        x_large: {
          url: binding_values.broadcast_thumbnail_x_large?.image_value?.url || ''
        }
      },
      source: binding_values.broadcast_source?.string_value || 'Producer'
    };
    const { apiRoot } = getTwitterProviderEnv();
    const broadcastData = (await twitterFetch(host, {
      url: `${apiRoot}/1.1/live_video_stream/status/${broadcast.media_key}?client=web&use_syndication_guest_id=false&cookie_set_host=x.com`
    })) as {
      source: {
        location: string;
        noRedirectPlaybackUrl: string;
        status: string;
        streamType: string;
      };
      sessionId: string;
      chatToken: string;
      lifecycleToken: string;
      shareUrl: string;
    };
    console.log('broadcastData', broadcastData);
    if (broadcastData) {
      console.log('time to load stream data');
      broadcast.stream = {
        url: broadcastData.source.location
      };
    }
    return {
      broadcast: broadcast
    };
  }

  if (binding_values.choice1_count?.string_value) {
    const choices: { [label: string]: number } = {};
    for (let i = 1; i <= 4; i++) {
      choices[binding_values[`choice${i}_label`]?.string_value || ''] = parseInt(
        binding_values[`choice${i}_count`]?.string_value || '0'
      );
    }

    const total_votes = Object.values(choices).reduce((a, b) => a + b, 0);

    return {
      poll: {
        ends_at: binding_values.end_datetime_utc?.string_value || '',
        time_left_en: pollTimeEn(new Date(binding_values.end_datetime_utc?.string_value || '')),
        total_votes,
        choices: Object.keys(choices)
          .filter(label => label !== '')
          .map(label => ({
            label: label,
            count: choices[label],
            percentage: (Math.round((choices[label] / total_votes) * 1000) || 0) / 10
          }))
      }
    };
  }

  if (binding_values.player_url?.string_value) {
    return {
      external_media: {
        type: 'video',
        url: binding_values.player_url.string_value,
        width: parseInt((binding_values.player_width?.string_value || '1280').replace('px', '')),
        height: parseInt((binding_values.player_height?.string_value || '720').replace('px', ''))
      }
    };
  }

  if (binding_values.unified_card?.string_value) {
    try {
      const unified = parseUnifiedCard(JSON.parse(binding_values.unified_card.string_value));
      if (unified && (unified.media.length > 0 || unified.website_card)) {
        return unified;
      }
    } catch (e) {
      console.error('Failed to parse unified card JSON', e);
    }
  }

  const cardMeta = card as GraphQLTwitterCard;
  const cardName = cardMeta.name;
  const cardUrl =
    strBinding(binding_values, 'card_url') ||
    (typeof cardMeta.url === 'string' && cardMeta.url.length > 0 ? cardMeta.url : undefined);

  const namedWebsite =
    cardName &&
    WEBSITE_TWITTER_CARD_NAMES.has(cardName) &&
    cardUrl &&
    !strBinding(binding_values, 'player_url');
  const imagePreview = pickWebsiteCardImage(binding_values);
  const heuristicWebsite =
    !cardName &&
    Boolean(cardUrl) &&
    Boolean(strBinding(binding_values, 'title')) &&
    Boolean(imagePreview) &&
    !binding_values.choice1_count?.string_value &&
    !binding_values.player_url?.string_value;

  if ((namedWebsite || heuristicWebsite) && cardUrl) {
    const title = strBinding(binding_values, 'title');
    const description = strBinding(binding_values, 'description');
    const domain = strBinding(binding_values, 'domain') || strBinding(binding_values, 'vanity_url');
    return {
      website_card: {
        url: cardUrl,
        title,
        description,
        domain,
        card_name: cardName,
        image: imagePreview
      }
    };
  }

  return {};
};
