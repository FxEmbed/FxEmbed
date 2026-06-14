import type { APIBlueskyStatus, APISearchResultsBluesky } from '../../types/api-schemas.js';
import { buildAPIBlueskyPost } from './processor.js';
import { fetchSearchPosts } from './client.js';
import { isBlueskyGalleryEmbed } from './gallery.js';
import type { BlueskyBuildHost } from './build-host.js';

export type BlueskySearchFeed = 'latest' | 'top' | 'media';

function normalizePostView(post: BlueskyPost): BlueskyPost {
  return {
    ...post,
    labels: post.labels ?? [],
    likeCount: post.likeCount ?? 0,
    repostCount: post.repostCount ?? 0,
    indexedAt: post.indexedAt ?? ''
  };
}

function embedHasVisualMedia(embed: BlueskyEmbed | undefined): boolean {
  if (!embed || typeof embed !== 'object') return false;
  if (isBlueskyGalleryEmbed(embed)) return true;
  if (Array.isArray(embed.images) && embed.images.length > 0) return true;
  if (embed.video || embed.$type?.includes('video')) return true;
  if (embed.external) return true;
  if (embed.media && (embed.media.images?.length || embed.media.video || embed.media.external))
    return true;
  const rec = embed.record;
  if (rec && typeof rec === 'object') {
    const v = rec as BlueskyEmbedViewRecord;
    if (embedHasVisualMedia(v.embed as BlueskyEmbed | undefined)) return true;
    if (v.embeds?.some(e => embedHasVisualMedia(e as BlueskyEmbed))) return true;
  }
  return false;
}

function postHasVisualMedia(post: BlueskyPost): boolean {
  if (embedHasVisualMedia(post.embed)) return true;
  if (post.embeds?.some(e => embedHasVisualMedia(e))) return true;
  const rec = post.record ?? post.value;
  if (rec?.embed) return embedHasVisualMedia(rec.embed);
  return false;
}

const feedToSort = (feed: BlueskySearchFeed): 'latest' | 'top' => {
  if (feed === 'top') return 'top';
  return 'latest';
};

export const blueskySearchAPI = async (
  host: BlueskyBuildHost,
  options: {
    q: string;
    feed: BlueskySearchFeed;
    count: number;
    cursor: string | null;
    language?: string;
  }
): Promise<APISearchResultsBluesky> => {
  const sort = feedToSort(options.feed);
  const result = await fetchSearchPosts(
    {
      q: options.q,
      sort,
      limit: options.count,
      cursor: options.cursor ?? undefined
    },
    { credentialKey: host.credentialKey }
  );

  if (!result.ok) {
    if (result.status === 400 || result.status === 404) {
      return { code: 404, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  let posts = result.data.posts ?? [];
  if (options.feed === 'media') {
    posts = posts.filter(postHasVisualMedia);
  }

  const built = await Promise.all(
    posts.map(async raw => {
      if (!raw?.uri || !raw.cid) return null;
      const post = normalizePostView(raw);
      try {
        return (await buildAPIBlueskyPost(host, post, options.language)) as APIBlueskyStatus;
      } catch (err) {
        console.error('Error building Bluesky search post', err);
        return null;
      }
    })
  );

  const results = built.filter((s): s is APIBlueskyStatus => s !== null);
  const nextCursor = result.data.cursor ?? null;

  return {
    code: 200,
    results,
    cursor: { top: null, bottom: nextCursor }
  };
};
