import { z } from 'zod';
import {
  APIMediaLinkSchema,
  type APIMediaLink,
  type APITwitterStatus
} from '../../types/api-schemas.js';

const mediaShape = z.object({
  id_str: z.string(),
  type: z.enum(['photo', 'video', 'animated_gif']),
  media_url_https: z.string(),
  original_info: z.object({ width: z.number(), height: z.number() }).optional(),
  video_info: z
    .object({
      variants: z.array(
        z.object({ url: z.string(), content_type: z.string(), bitrate: z.number().optional() })
      ),
      duration_millis: z.number().optional()
    })
    .optional()
});

const componentSchema = z.object({
  type: z.string(),
  data: z
    .object({
      id: z.string().optional(),
      destination: z.string().optional(),
      title: z.object({ content: z.string().optional() }).optional().catch(undefined)
    })
    .optional()
    .catch(undefined)
});

const destinationSchema = z.object({
  type: z.string(),
  data: z
    .object({
      url_data: z.object({ url: z.string(), vanity: z.string().optional() }).optional()
    })
    .optional()
});

const unifiedCardSchema = z.object({
  type: z.string().optional(),
  components: z.array(z.string()).catch([]).default([]),
  layout: z
    .object({
      type: z.string(),
      data: z.object({ slides: z.array(z.array(z.string()).catch([])) })
    })
    .optional()
    .catch(undefined),
  component_objects: z
    .record(z.string(), componentSchema.optional().catch(undefined))
    .catch({})
    .default({}),
  destination_objects: z
    .record(z.string(), destinationSchema.optional().catch(undefined))
    .catch({})
    .default({}),
  media_entities: z
    .record(
      z.string(),
      z
        .custom<TweetMedia>(value => mediaShape.safeParse(value).success)
        .optional()
        .catch(undefined)
    )
    .catch({})
    .default({})
});

export type UnifiedCardMedia = { media: TweetMedia; link?: APIMediaLink };

export function parseUnifiedCard(value: unknown):
  | {
      media: UnifiedCardMedia[];
      website_card?: APITwitterStatus['card'];
    }
  | undefined {
  const parsed = unifiedCardSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const card = parsed.data;
  const singleWebsite = card.type === 'image_website' || card.type === 'video_website';
  const carousel =
    card.type === 'image_multi_dest_carousel_website' && card.layout?.type === 'swipeable';
  const collection = card.type === 'image_collection_website' && card.layout?.type === 'collection';
  const groups = singleWebsite
    ? [card.components]
    : carousel || collection
      ? (card.layout?.data.slides ?? [])
      : [];
  const media: UnifiedCardMedia[] = [];
  const referencedMedia = new Set<string>();
  let website_card: APITwitterStatus['card'];

  for (const group of groups) {
    const components = group
      .map(key => card.component_objects[key])
      .filter(component => component !== undefined);
    for (const component of components) {
      if (component.type !== 'media' || !component.data?.id) continue;
      const mediaItem = card.media_entities[component.data.id];
      const destinationId = component.data.destination;
      const destination = destinationId ? card.destination_objects[destinationId] : undefined;
      const urlData = destination?.type === 'browser' ? destination.data?.url_data : undefined;
      const details = components.find(
        item => item.type === 'details' && item.data?.destination === destinationId
      );
      const parsedLink = APIMediaLinkSchema.safeParse({
        url: urlData?.url,
        title: details?.data?.title?.content,
        domain: urlData?.vanity
      });
      const link = parsedLink.success ? parsedLink.data : undefined;

      if (mediaItem) {
        referencedMedia.add(component.data.id);
        media.push({ media: mediaItem, ...(link ? { link } : {}) });
      }
      if (singleWebsite && link && !website_card) {
        website_card = {
          ...link,
          card_name: 'unified_card',
          image: mediaItem?.media_url_https
            ? {
                url: mediaItem.media_url_https,
                width: mediaItem.original_info?.width,
                height: mediaItem.original_info?.height,
                alt: mediaItem.ext_alt_text
              }
            : undefined
        };
      }
    }
  }

  for (const [key, mediaItem] of Object.entries(card.media_entities)) {
    if (mediaItem && !referencedMedia.has(key)) media.push({ media: mediaItem });
  }
  return { media, website_card };
}
