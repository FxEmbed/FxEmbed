import { getBlueskyProviderEnv } from '../bluesky-runtime.js';
import { DataProvider } from '../../types/data-provider.js';
import { handleMosaic } from '../../helpers/mosaic.js';
import { linkFixerBluesky } from '../../helpers/link-fixer.js';
import { unescapeText } from '../../helpers/unescape-text.js';
import { blueskyFacetsToApiFacets } from './facets.js';
import { type BlueskyFetchOpts, fetchPostsByUris, fetchProfilesByActors } from './client.js';
import { blueskyWebPostUrl, didFromAtUri, rkeyFromPostAtUri } from './uris.js';
import type { APIStatusTombstone, APITombstoneReason, APIUser } from '../../types/api-schemas.js';
import type { APIStatus } from '../../types/api-status.js';
import { isTombstone, tombstoneMessageForReason } from '../../helpers/tombstone.js';
import { blueskyVerificationToApiUserVerification } from './verification.js';
import { blueskyPhotosFromEmbed } from './gallery.js';
import type { BlueskyBuildHost } from './build-host.js';

export const buildBlueskyTombstone = (
  reason: APITombstoneReason,
  atUri: string,
  cid?: string
): APIStatusTombstone => {
  const webRoot = getBlueskyProviderEnv().webRoot;
  const rkey = rkeyFromPostAtUri(atUri) ?? undefined;
  const repo = didFromAtUri(atUri) ?? '';
  const url =
    rkey && repo ? `${webRoot}/profile/${encodeURIComponent(repo)}/post/${rkey}` : atUri || webRoot;

  return {
    type: 'tombstone',
    provider: 'bluesky',
    reason,
    message: tombstoneMessageForReason(reason),
    id: rkey,
    url,
    at_uri: atUri || undefined,
    cid
  };
};

const isDetachedRecordView = (vr: BlueskyEmbedViewRecord): boolean => {
  const t = vr.$type ?? '';
  return t.includes('viewDetached') || t.includes('Detached') || vr.detached === true;
};

const isDetachedOuterEmbed = (embedRecord: NonNullable<BlueskyEmbed['record']>): boolean => {
  const t = embedRecord.$type ?? '';
  return t.includes('viewDetached') || t.includes('Detached') || embedRecord.detached === true;
};
const isPossiblySensitive = (labels: ATProtoLabel[] | undefined | null): boolean =>
  !!labels?.some(l => /nsfw|porn|sexual|nudity|graphic|!warn/i.test(l.val ?? ''));

const apiUserFromAuthor = (author: BlueskyAuthor): APIUser => {
  const base: APIUser = {
    id: author.handle,
    name: author.displayName || author.handle,
    screen_name: author.handle,
    avatar_url: author.avatar ?? null,
    banner_url: null,
    description: '',
    raw_description: { text: '', facets: [] },
    location: '',
    followers: 0,
    following: 0,
    media_count: 0,
    likes: 0,
    url: `${getBlueskyProviderEnv().webRoot}/profile/${author.handle}`,
    protected: false,
    statuses: 0,
    joined: author.createdAt,
    birthday: { day: 0, month: 0, year: 0 },
    website: null,
    profile_embed: true,
    type: 'profile'
  };
  const v = blueskyVerificationToApiUserVerification(author.verification);
  if (v) base.verification = v;
  return base;
};

const tombstoneAuthor = (handleOrDid: string): APIUser => ({
  id: handleOrDid,
  name: handleOrDid,
  screen_name: handleOrDid,
  avatar_url: null,
  banner_url: null,
  description: '',
  raw_description: { text: '', facets: [] },
  location: '',
  followers: 0,
  following: 0,
  media_count: 0,
  likes: 0,
  url: `${getBlueskyProviderEnv().webRoot}/profile/${handleOrDid}`,
  protected: false,
  statuses: 0,
  joined: '',
  birthday: { day: 0, month: 0, year: 0 },
  website: null,
  profile_embed: true,
  type: 'profile'
});

/** Map a hydrated record embed view into the `BlueskyPost` shape our pipeline expects. */
const viewRecordToPost = (v: BlueskyEmbedViewRecord): BlueskyPost | null => {
  if (!v.uri || !v.cid || !v.author) return null;
  const rec = (v.value ?? v.record) as BlueskyRecord | undefined;
  return {
    uri: v.uri,
    cid: v.cid,
    author: v.author,
    record: rec,
    value: v.value,
    embed: v.embed,
    embeds: v.embeds,
    indexedAt: v.indexedAt ?? '',
    labels: [],
    likeCount: v.likeCount ?? 0,
    repostCount: v.repostCount ?? 0,
    replyCount: v.replyCount,
    quoteCount: v.quoteCount
  };
};

const nestedLegacyPost = (o: unknown): BlueskyPost | null => {
  if (!o || typeof o !== 'object') return null;
  const p = o as BlueskyPost;
  if (p.uri && p.cid && p.author) return p;
  return null;
};

/** Unwrap `app.bsky.embed.record` shapes to something we can pass to `buildAPIBlueskyPost`. */
const quoteCandidateFromEmbedRecord = (
  embedRecord: NonNullable<BlueskyEmbed['record']>
): { post: BlueskyPost | null; tombstone: APIStatusTombstone | null } => {
  const u = (x?: string) => x ?? '';

  if (embedRecord.notFound) {
    return { post: null, tombstone: buildBlueskyTombstone('deleted', u(embedRecord.uri)) };
  }
  if (embedRecord.blocked) {
    return { post: null, tombstone: buildBlueskyTombstone('blocked', u(embedRecord.uri)) };
  }
  if (isDetachedOuterEmbed(embedRecord)) {
    return { post: null, tombstone: buildBlueskyTombstone('blocked', u(embedRecord.uri)) };
  }

  const inner = embedRecord.record ?? embedRecord.value ?? embedRecord;
  if (inner && typeof inner === 'object') {
    const vr = inner as BlueskyEmbedViewRecord;
    if (vr.notFound) {
      return {
        post: null,
        tombstone: buildBlueskyTombstone('deleted', u(embedRecord.uri ?? vr.uri))
      };
    }
    if (vr.blocked) {
      return {
        post: null,
        tombstone: buildBlueskyTombstone('blocked', u(embedRecord.uri ?? vr.uri))
      };
    }
    if (isDetachedRecordView(vr)) {
      return {
        post: null,
        tombstone: buildBlueskyTombstone('blocked', u(embedRecord.uri ?? vr.uri))
      };
    }
    const asNested = nestedLegacyPost(embedRecord.record);
    if (asNested) return { post: asNested, tombstone: null };
    const asNestedVal = nestedLegacyPost(embedRecord.value);
    if (asNestedVal) return { post: asNestedVal, tombstone: null };
    const fromView = viewRecordToPost(vr);
    if (fromView) return { post: fromView, tombstone: null };
    if (vr.uri && vr.cid && vr.author) {
      const hybrid = viewRecordToPost(vr);
      if (hybrid) return { post: hybrid, tombstone: null };
    }
  }
  if (embedRecord.uri && !embedRecord.notFound && !embedRecord.blocked) {
    return { post: null, tombstone: null };
  }
  return { post: null, tombstone: null };
};

const resolveReplyingTo = async (
  status: BlueskyPost,
  opts?: BlueskyFetchOpts
): Promise<APIStatus['replying_to']> => {
  const parentUri = status.record?.reply?.parent?.uri;
  if (!parentUri) return null;
  const parentRkey = rkeyFromPostAtUri(parentUri);
  const parentDid = didFromAtUri(parentUri);
  if (!parentRkey || !parentDid) return null;
  const profiles = await fetchProfilesByActors([parentDid], opts);
  const profile = profiles.get(parentDid);
  const handle = profile?.handle ?? parentDid;
  const out: NonNullable<APIStatus['replying_to']> = {
    screen_name: handle,
    status: parentRkey,
    url: blueskyWebPostUrl(handle, parentRkey),
    profile_url: `${getBlueskyProviderEnv().webRoot}/profile/${handle}`
  };
  const displayName = profile?.displayName;
  if (typeof displayName === 'string' && displayName.length > 0) {
    out.display_name = displayName;
  }
  return out;
};

const applyEmbedsToStatus = async (apiStatus: APIStatus, status: BlueskyPost): Promise<void> => {
  const primary = status.embed ?? status.embeds?.[0];
  const media = primary?.media ?? status.embeds?.[0]?.media;
  const authorDid = status.author?.did;

  let embedPhotos = blueskyPhotosFromEmbed(primary);
  if (!embedPhotos.length && status.embeds?.[0] && status.embeds[0] !== primary) {
    embedPhotos = blueskyPhotosFromEmbed(status.embeds[0]);
  }
  if (embedPhotos.length) {
    apiStatus.embed_card = 'summary_large_image';
    apiStatus.media.photos = embedPhotos;
  }

  if (status.embeds?.[0]?.video || primary?.video) {
    apiStatus.embed_card = 'player';
    const video = primary?.video ?? status.embeds?.[0]?.video;
    const pl = status.embeds?.[0]?.playlist ?? primary?.playlist ?? '';
    apiStatus.media.videos = [
      {
        type: 'video',
        url: pl,
        format: video?.mimeType ?? 'video/mp4',
        thumbnail_url: status.embeds?.[0]?.thumbnail ?? primary?.thumbnail ?? '',
        formats: [{ url: pl, container: 'm3u8' as const }],
        width: status.embeds?.[0]?.aspectRatio?.width ?? primary?.aspectRatio?.width ?? 0,
        height: status.embeds?.[0]?.aspectRatio?.height ?? primary?.aspectRatio?.height ?? 0,
        duration: 0
      }
    ];
  }

  if (media?.external || status.record?.embed?.external) {
    const external = media?.external ?? status.record?.embed?.external;
    const uri = external?.uri ?? '';
    if (uri.startsWith('https://media.tenor.com')) {
      apiStatus.media.photos = [
        {
          type: 'gif',
          url: uri,
          format: 'image/gif',
          width: 0,
          height: 0
        }
      ];
    } else if (uri) {
      apiStatus.media.photos = [
        {
          type: 'photo',
          url: uri,
          altText: external?.description ?? '',
          width: 0,
          height: 0
        }
      ];
    }
    if (apiStatus.media.photos?.length) {
      apiStatus.embed_card = 'summary_large_image';
    }
  }

  if (status.record?.embed?.video ||
    status.value?.embed?.video ||
    primary?.media?.$type === 'app.bsky.embed.video#view'
  ) {
    const video =
      status.record?.embed?.video ??
      status.value?.embed?.video ??
      status.record?.embed?.media ??
      status.value?.embed?.media;
    const cid =
      status.record?.embed?.video?.ref?.$link ??
      status.record?.embed?.media?.ref?.$link ??
      status.record?.embed?.media?.video?.ref?.$link ??
      status.value?.embed?.video?.ref?.$link ??
      status.value?.embed?.media?.ref?.$link ??
      status.value?.embed?.media?.video?.ref?.$link ??
      primary?.video?.ref?.$link;
    if (cid && authorDid) {
      apiStatus.embed_card = 'player';
      const videoUrl = `https://pds-cache.fxbsky.app/${authorDid}/${cid}`;
      const aspectRatio =
        primary?.aspectRatio ??
        primary?.media?.aspectRatio ??
        primary?.record?.value?.embed?.aspectRatio;
      apiStatus.media.videos = [
        {
          type: 'video',
          url: videoUrl,
          format: (video as BlueskyVideo | undefined)?.mimeType ?? 'video/mp4',
          thumbnail_url: primary?.thumbnail ?? primary?.media?.thumbnail ?? '',
          formats: [
            {
              url: videoUrl,
              container: 'mp4' as const,
              codec: 'h264' as const
            }
          ],
          width: aspectRatio?.width ?? 0,
          height: aspectRatio?.height ?? 0,
          duration: 0
        }
      ];
    }
  }
};

const resolveQuote = async (
  host: BlueskyBuildHost,
  status: BlueskyPost,
  language: string | undefined,
  quoteDepth: number,
  fetchOpts?: BlueskyFetchOpts
): Promise<APIStatus | APIStatusTombstone | undefined> => {
  if (quoteDepth > 10) return undefined;
  const embedRecord = status.embed?.record ?? status.embeds?.find(e => e.record)?.record;
  if (!embedRecord) return undefined;

  const cand = quoteCandidateFromEmbedRecord(embedRecord);
  if (cand.tombstone) {
    return cand.tombstone;
  }

  let { post } = cand;
  if (!post && embedRecord.uri) {
    const fetched = await fetchPostsByUris([embedRecord.uri], fetchOpts);
    post = fetched[0] ?? null;
  }

  if (!post) {
    return embedRecord.uri ? buildBlueskyTombstone('deleted', embedRecord.uri) : undefined;
  }

  return buildAPIBlueskyPost(host, post, language, quoteDepth + 1, fetchOpts);
};

export const buildAPIBlueskyPost = async (
  host: BlueskyBuildHost,
  status: BlueskyPost,
  language: string | undefined,
  quoteDepth = 0,
  fetchOpts?: BlueskyFetchOpts
): Promise<APIStatus> => {
  const bskyFetchOpts: BlueskyFetchOpts = {
    ...fetchOpts,
    credentialKey: host.credentialKey ?? fetchOpts?.credentialKey
  };
  const rkey = rkeyFromPostAtUri(status.uri) ?? status.cid;
  const record = status.record ?? status.value;
  const rawText = record?.text ?? '';
  const facets = record?.facets ?? [];
  const text = linkFixerBluesky(facets, rawText);
  const apiFacets = blueskyFacetsToApiFacets(rawText, facets);

  const author = status.author
    ? apiUserFromAuthor(status.author)
    : tombstoneAuthor(didFromAtUri(status.uri) ?? 'unknown');

  const apiStatus: APIStatus = {
    id: rkey,
    cid: status.cid,
    at_uri: status.uri,
    url: status.author?.handle
      ? blueskyWebPostUrl(status.author.handle, rkey)
      : `${getBlueskyProviderEnv().webRoot}/profile/${didFromAtUri(status.uri) ?? 'unknown'}/post/${rkey}`,
    text,
    raw_text: { text: rawText, facets: apiFacets },
    created_at: record?.createdAt ?? status.indexedAt ?? new Date().toISOString(),
    created_timestamp:
      (record?.createdAt ? new Date(record.createdAt).getTime() : Date.parse(status.indexedAt)) /
        1000 || 0,
    likes: status.likeCount ?? 0,
    reposts: status.repostCount ?? 0,
    quotes: status.quoteCount ?? 0,
    replies: status.replyCount ?? 0,
    author,
    media: {},
    lang: record?.langs?.[0] ?? null,
    possibly_sensitive: isPossiblySensitive(status.labels),
    replying_to: await resolveReplyingTo(status, bskyFetchOpts),
    source: 'Bluesky Social',
    embed_card: 'tweet',
    provider: DataProvider.Bluesky,
    type: 'status'
  };

  await applyEmbedsToStatus(apiStatus, status);

  const quote = await resolveQuote(host, status, language, quoteDepth, bskyFetchOpts);
  if (quote) {
    apiStatus.quote = quote;
    if (!isTombstone(quote) && quote.embed_card && quote.embed_card !== 'tweet') {
      apiStatus.embed_card = quote.embed_card;
    }
  }

  apiStatus.media.all = [...(apiStatus.media.photos ?? []), ...(apiStatus.media.videos ?? [])];

  if (
    (apiStatus.media.photos?.length || 0) > 1 &&
    getBlueskyProviderEnv().mosaicBskyDomainList.length > 0
  ) {
    apiStatus.embed_card = 'summary_large_image';
    const env = getBlueskyProviderEnv();
    const mosaic = await handleMosaic(apiStatus.media?.photos || [], ':3', DataProvider.Bluesky, {
      twitterLikeDomains: [],
      blueskyDomains: env.mosaicBskyDomainList
    });
    if (mosaic !== null) {
      apiStatus.media.mosaic = mosaic;
    }
  }

  if (
    typeof language === 'string' &&
    (language.length === 2 || language.length === 5) &&
    language !== record?.langs?.[0]
  ) {
    let didTranslate = false;
    if (getBlueskyProviderEnv().polyglotDomainList.length > 0 && host.translatePolyglot) {
      const translatePolyglot = await host.translatePolyglot(apiStatus, language);
      if (translatePolyglot !== null) {
        apiStatus.translation = {
          text: unescapeText(linkFixerBluesky([], translatePolyglot?.translated_text || '')),
          source_lang: (translatePolyglot?.source_lang ?? 'en').toLowerCase(),
          target_lang: language.toLowerCase(),
          source_lang_en: host.t(
            `language_${(translatePolyglot?.source_lang ?? 'en').toLowerCase()}`,
            {
              lng: 'en'
            }
          ),
          provider: translatePolyglot?.provider ?? 'polyglot'
        };
        didTranslate = true;
      }
    }
    if (host.aiEnabled && !didTranslate && host.translateAI) {
      const translateAPI = await host.translateAI(apiStatus, language);
      if (translateAPI !== null && translateAPI?.translated_text) {
        apiStatus.translation = {
          text: unescapeText(linkFixerBluesky([], translateAPI.translated_text || '')),
          source_lang: (apiStatus.lang ?? 'en').toLowerCase(),
          target_lang: language.toLowerCase(),
          source_lang_en: host.t(`language_${(apiStatus.lang ?? 'en').toLowerCase()}`, {
            lng: 'en'
          }),
          provider: 'llm'
        };
      }
    }
  }

  return apiStatus;
};
