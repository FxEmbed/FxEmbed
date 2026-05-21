import { renderCard } from './card.js';
import { getTwitterProviderEnv } from '../twitter-runtime.js';
import { linkFixer } from '../../helpers/link-fixer.js';
import { handleMosaic } from '../../helpers/mosaic.js';
import { unescapeText } from '../../helpers/unescape-text.js';
import { processMedia, convertFormatToVariant } from '../../helpers/media.js';
import { convertToApiUser, fetchTwitterGraphQLUserByRestId } from './profile.js';
import { DataProvider } from '../../types/data-provider.js';
import type {
  APIFacet,
  APIPhoto,
  APIRepostedBy,
  APIStatusTombstone,
  APITombstoneReason,
  APITwitterStatus,
  APIUser,
  APIVideo
} from '../../types/api-schemas.js';
import type { FetchResults } from '../../types/fetch-results.js';
import { isTombstone, tombstoneMessageForReason } from '../../helpers/tombstone.js';
import { translateStatusGrok } from '../../helpers/translate-grok.js';
import { normalizeLanguage } from '../../helpers/language.js';
import { tcoResolver } from './tcoResolver.js';
import type { TwitterBuildHost } from './build-host.js';

/** GraphQL sometimes nests the Tweet under `tweet` (ProfileTimeline / other v2 shapes). Merge before retweet logic. */
function mergeTweetShellIntoStatus(status: GraphQLTwitterStatus): void {
  if (typeof status.core === 'undefined' && typeof status.tweet?.core !== 'undefined') {
    status.core = status.tweet.core;
  }
  if (typeof status.legacy === 'undefined' && typeof status.tweet?.legacy !== 'undefined') {
    status.legacy = status.tweet.legacy;
  }
  if (typeof status.views === 'undefined' && typeof status?.tweet?.views !== 'undefined') {
    status.views = status?.tweet?.views;
  }
  if (
    typeof status.view_count_info === 'undefined' &&
    typeof status?.tweet?.view_count_info !== 'undefined'
  ) {
    status.views = status?.tweet?.view_count_info;
  }
  if (typeof status.views === 'undefined' && typeof status?.view_count_info !== 'undefined') {
    status.views = status?.view_count_info;
  }
  const nested = status.tweet as Partial<GraphQLTwitterStatus> | undefined;
  if (typeof status.card === 'undefined' && nested?.card) {
    status.card = nested.card;
  }
  if (typeof status.tweet_card === 'undefined' && nested && 'tweet_card' in nested) {
    const nc = (nested as { tweet_card?: GraphQLTwitterStatus['tweet_card'] }).tweet_card;
    if (nc) status.tweet_card = nc;
  }
  if (
    typeof status.reply_to_user_results === 'undefined' &&
    typeof nested?.reply_to_user_results !== 'undefined'
  ) {
    status.reply_to_user_results = nested.reply_to_user_results;
  }
  if (
    typeof status.grok_translated_post_with_availability === 'undefined' &&
    typeof nested?.grok_translated_post_with_availability !== 'undefined'
  ) {
    status.grok_translated_post_with_availability = nested.grok_translated_post_with_availability;
  }
}

function retweeterUserFromStatus(status: GraphQLTwitterStatus): GraphQLUser | undefined {
  return (status.core?.user_results?.result ?? status.core?.user_result?.result) as
    | GraphQLUser
    | undefined;
}

/** Card `card_url` is usually a t.co short link; tweet URL entities carry the expanded destination. */
function expandedCardUrl(
  cardUrl: string,
  urlEntities: GraphQLTwitterStatus['legacy']['entities']['urls'] | undefined
): string {
  if (!urlEntities?.length) return cardUrl;
  const match = urlEntities.find(e => e.url === cardUrl);
  const expanded = match?.expanded_url;
  return typeof expanded === 'string' && expanded.length > 0 ? expanded : cardUrl;
}

function birdwatchEntitiesToFacets(entities: BirdwatchEntity[], noteText: string): APIFacet[] {
  const facets: APIFacet[] = [];
  for (const entity of entities) {
    if (entity?.ref?.type !== 'TimelineUrl') {
      continue;
    }
    const { fromIndex, toIndex } = entity;
    facets.push({
      type: 'url',
      indices: [fromIndex, toIndex],
      display: noteText.substring(fromIndex, toIndex),
      replacement: entity.ref.url
    });
  }
  facets.sort((a, b) => a.indices[0] - b.indices[0]);
  return facets;
}

/** TweetDetail includes `legacy.in_reply_to_screen_name`; ConversationTimeline uses `reply_to_user_results` only. */
function replyTargetScreenNameFromGraphQL(status: GraphQLTwitterStatus): string | undefined {
  const fromLegacy = status.legacy?.in_reply_to_screen_name;
  if (typeof fromLegacy === 'string' && fromLegacy.length > 0) {
    return fromLegacy;
  }
  const user = status.reply_to_user_results?.result;
  if (user?.__typename === 'User') {
    const sn = user.core?.screen_name ?? user.legacy?.screen_name;
    if (typeof sn === 'string' && sn.length > 0) {
      return sn;
    }
  }
  return undefined;
}

/** Display name for the replied-to author when GraphQL includes `reply_to_user_results` (User). */
function replyTargetDisplayNameFromGraphQL(status: GraphQLTwitterStatus): string | undefined {
  const user = status.reply_to_user_results?.result;
  if (user?.__typename !== 'User') {
    return undefined;
  }
  const name = user.core?.name ?? user.legacy?.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }
  return undefined;
}

function repostedByFromGraphQLUser(user: GraphQLUser | undefined): APIRepostedBy | null {
  if (!user || typeof user.rest_id !== 'string' || user.rest_id.length === 0) {
    return null;
  }
  const screenName = user.core?.screen_name ?? user.legacy?.screen_name ?? '';
  return {
    id: user.rest_id,
    name: user.core?.name ?? user.legacy?.name ?? '',
    screen_name: screenName,
    avatar_url:
      user.avatar?.image_url?.replace?.('_normal', '_200x200') ??
      user.legacy?.profile_image_url_https?.replace?.('_normal', '_200x200') ??
      null,
    url: screenName ? `${getTwitterProviderEnv().webRoot}/${screenName}` : undefined
  };
}

/** Unwrap `TweetWithVisibilityResults` to the embedded `tweet` when present. */
function asGraphQLTweetNode(
  node: GraphQLTwitterStatus | undefined
): GraphQLTwitterStatus | undefined {
  if (!node) return undefined;
  if (node.__typename === 'TweetWithVisibilityResults') {
    const inner = (node as { tweet?: GraphQLTwitterStatus }).tweet;
    if (inner) return inner;
  }
  return node;
}

/**
 * Original post embedded in a retweet. GraphQL uses either `retweeted_status_result` (older)
 * or `retweeted_status_results` (ProfileTimeline / newer — mirrors `tweet_results` naming).
 */
function getRetweetedOriginalFromLegacy(
  legacy: GraphQLTwitterStatus['legacy'] | undefined
): GraphQLTwitterStatus | undefined {
  if (!legacy) return undefined;
  const singular = legacy.retweeted_status_result?.result;
  if (singular) return asGraphQLTweetNode(singular as GraphQLTwitterStatus);
  const plural = legacy.retweeted_status_results?.result;
  if (plural) return asGraphQLTweetNode(plural as GraphQLTwitterStatus);
  return undefined;
}

/** Retweet card with no embed we can unwrap (rare); infer from text / legacy id. */
function isRetweetWithoutNestedOriginal(
  legacy: GraphQLTwitterStatus['legacy'] | undefined
): boolean {
  if (!legacy) return false;
  if (getRetweetedOriginalFromLegacy(legacy)) return false;
  if (
    typeof legacy.retweeted_status_id_str === 'string' &&
    legacy.retweeted_status_id_str.length > 0
  ) {
    return true;
  }
  const text = legacy.full_text || '';
  return /^\s*RT @\S+/u.test(text);
}

/** Where `buildAPITwitterStatus` is used: root post vs nested quote/thread (affects unavailable handling). */
export type TwitterStatusBuildContext = 'root' | 'quote' | 'thread';

const twitterTombstone = (
  reason: APITombstoneReason,
  partial: { id?: string; url?: string; author?: Partial<APIUser> } = {}
): APIStatusTombstone => ({
  type: 'tombstone',
  provider: 'twitter',
  reason,
  message: tombstoneMessageForReason(reason),
  ...partial
});

const reasonFromTombstoneEntityScan = (entities: unknown): APITombstoneReason | null => {
  if (!Array.isArray(entities)) return null;
  for (const raw of entities) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const fromObj = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v.toLowerCase() : null;
    const hint =
      fromObj(o.reason) ??
      fromObj(o.tombstoneReason) ??
      fromObj(o.tweetUnavailableReason) ??
      fromObj(o.visibilityReason);
    if (!hint) continue;
    if (/suspend|withheld/i.test(hint)) return 'suspended';
    if (/delete|remove/i.test(hint)) return 'deleted';
    if (/protect|private|nsfw|limit|age|login|restricted/i.test(hint)) return 'private';
    if (/block|author/i.test(hint)) return 'blocked';
  }
  return null;
};

const reasonFromTweetTombstoneText = (text: string, language?: string): APITombstoneReason => {
  const t = text.toLowerCase();
  const rawPrimary = (language ?? 'en').split(/[,\s;]+/)[0]?.trim() ?? 'en';
  const lang = normalizeLanguage(rawPrimary.toLowerCase()).split('-')[0] ?? 'en';

  // This is an extremely horrible, terrible, no-good hack, but Twitter genuinely does not provide
  // any other way to determine the state of an unavailable post.

  // It is not going to be perfect. But there isn't a better way to do it right now.
  const suspendedRe =
    lang === 'es'
      ? /cuenta suspendida|suspendid[oa]/i
      : lang === 'ja'
        ? /アカウントが停止|アカウントは停止|アカウントを停止/i
        : lang === 'de'
          ? /gesperrt|suspendiert/i
          : lang === 'fr'
            ? /compte suspendu|suspendu/i
            : lang === 'pt'
              ? /conta suspensa|suspens[oa]/i
              : lang === 'ko'
                ? /계정.*정지|일시적으로.*이용/i
                : lang === 'zh'
                  ? /账号.*停用|账号.*冻结|暂停/i
                  : /suspended account|account suspended|account has been suspended/i;

  const deletedRe =
    lang === 'ja'
      ? /削除/
      : lang === 'es'
        ? /eliminad[oa]|borrad[oa]/
        : lang === 'fr'
          ? /supprim/
          : lang === 'de'
            ? /gelöscht/
            : lang === 'pt'
              ? /excluíd[oa]|apagad[oa]/
              : /\bdeleted\b|no longer available/i;

  const privateRe =
    lang === 'ja'
      ? /非公開|表示できません|鍵/
      : lang === 'es'
        ? /privad[oa]|quién puede ver|protegid[oa]/i
        : lang === 'fr'
          ? /privé|limite qui peut voir/i
          : lang === 'de'
            ? /privat|geschützt|eingeschränkt/i
            : lang === 'pt'
              ? /privad[oa]|protegid[oa]/i
              : lang === 'ko'
                ? /비공개|볼 수 없습니다/i
                : lang === 'zh'
                  ? /私密|无法查看|限制/
                  : /private account|limits who can view|limit who can view|their tweets|protected/i;

  if (suspendedRe.test(t)) return 'suspended';
  if (deletedRe.test(t)) return 'deleted';
  if (privateRe.test(t) || (t.includes('limit') && t.includes('view'))) return 'private';
  return 'unavailable';
};

const reasonFromTweetTombstone = (tomb: TweetTombstone, language?: string): APITombstoneReason => {
  const structured =
    reasonFromTombstoneEntityScan(tomb.tombstone?.text?.entities) ??
    reasonFromTombstoneEntityScan(tomb.tombstone?.richText?.entities);
  if (structured) return structured;

  const text = [tomb.tombstone?.richText?.text, tomb.tombstone?.text?.text]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n');
  if (!text) return 'unavailable';
  return reasonFromTweetTombstoneText(text, language);
};

/** TweetDetail / timeline `TweetTombstone` → API v2 tombstone (also used from `conversation.ts`). */
export const twitterTweetTombstoneFromGraphQL = (
  tomb: TweetTombstone,
  idHint?: string,
  language?: string
): APIStatusTombstone => {
  const reason = reasonFromTweetTombstone(tomb, language);
  const id = idHint;
  return twitterTombstone(reason, {
    id,
    url: id ? `${getTwitterProviderEnv().webRoot}/i/status/${id}` : undefined
  });
};

const tweetUnavailableToTombstone = (
  status: TweetStub | GraphQLTwitterStatus,
  idHint?: string,
  urlHint?: string
): APIStatusTombstone => {
  const id =
    idHint ??
    (typeof (status as GraphQLTwitterStatus).rest_id === 'string'
      ? (status as GraphQLTwitterStatus).rest_id
      : undefined) ??
    (status as GraphQLTwitterStatus).legacy?.id_str;
  const url = urlHint ?? (id ? `${getTwitterProviderEnv().webRoot}/i/status/${id}` : undefined);
  const meta = { id, url };

  if ((status as TweetStub).__typename !== 'TweetUnavailable') {
    return twitterTombstone('unavailable', meta);
  }
  const stub = status as TweetStub;
  switch (stub.reason) {
    case 'Protected':
      return twitterTombstone('private', meta);
    case 'NsfwLoggedOut':
      return twitterTombstone('unavailable', meta);
    case 'Suspended':
      return twitterTombstone('suspended', meta);
    case 'Deleted':
      return twitterTombstone('deleted', meta);
    default:
      return twitterTombstone('unavailable', meta);
  }
};

/** Unwrap `quoted_*` GraphQL wrappers to an inner tweet node (or empty object). */
const unwrapQuoteGraphql = (quote: unknown): unknown => {
  if (!quote || typeof quote !== 'object') return quote;
  let q: Record<string, unknown> = quote as Record<string, unknown>;
  if ('result' in q && q.result !== undefined) q = q.result as Record<string, unknown>;
  if (q.__typename === 'TweetWithVisibilityResults' && q.tweet) {
    q = q.tweet as Record<string, unknown>;
  }
  return q;
};

export const buildAPITwitterStatus = async (
  host: TwitterBuildHost,
  status: GraphQLTwitterStatus,
  language: string | undefined,
  threadAuthor: null | APIUser,
  legacyAPI = false,
  /** When false (timelines, search, conversation), only use GraphQL inline translation — no Grok/Polyglot/AI calls. */
  manualTranslationFallback = true,
  buildContext: TwitterStatusBuildContext = 'root',
  tombstoneIdHint?: string
): Promise<APITwitterStatus | APIStatusTombstone | FetchResults | null> => {
  const apiStatus = {} as APITwitterStatus;
  let repostedBy: APIRepostedBy | null = null;

  /* Sometimes, Twitter returns a different kind of type called 'TweetWithVisibilityResults'.
     It has slightly different attributes from the regular 'Tweet' type. We fix that up here. */

  if (typeof status.core === 'undefined' && typeof status.result !== 'undefined') {
    status = status.result;
  }

  mergeTweetShellIntoStatus(status);

  /* Retweet: use embedded original when present (`retweeted_status_result` or `retweeted_status_results`). */
  const retweetOriginal = getRetweetedOriginalFromLegacy(status.legacy);
  if (typeof retweetOriginal !== 'undefined') {
    repostedBy = repostedByFromGraphQLUser(retweeterUserFromStatus(status));
    status = retweetOriginal;
    mergeTweetShellIntoStatus(status);
  } else if (isRetweetWithoutNestedOriginal(status.legacy)) {
    repostedBy = repostedByFromGraphQLUser(retweeterUserFromStatus(status));
  }

  if ((status as unknown as { __typename?: string }).__typename === 'TweetTombstone') {
    if (legacyAPI) return null;
    return twitterTweetTombstoneFromGraphQL(
      status as unknown as TweetTombstone,
      tombstoneIdHint ?? status.rest_id,
      language
    );
  }

  if (typeof status.core === 'undefined') {
    console.log('Status still not valid', status);
    if (buildContext !== 'root' && !legacyAPI) {
      if ((status as unknown as TweetStub).__typename === 'TweetUnavailable') {
        const g = status as GraphQLTwitterStatus;
        const id = tombstoneIdHint ?? g.rest_id ?? g.legacy?.id_str;
        return tweetUnavailableToTombstone(
          status as TweetStub,
          id,
          id ? `${getTwitterProviderEnv().webRoot}/i/status/${id}` : undefined
        );
      }
      const id = tombstoneIdHint ?? status.rest_id;
      return twitterTombstone('unavailable', {
        id,
        url: id ? `${getTwitterProviderEnv().webRoot}/i/status/${id}` : undefined
      });
    }
    if (status.__typename === 'TweetUnavailable' && status.reason === 'Protected') {
      return { status: 401 };
    }
    if (!legacyAPI && (status as unknown as TweetStub).__typename === 'TweetUnavailable') {
      const g = status as GraphQLTwitterStatus;
      const id = tombstoneIdHint ?? g.rest_id ?? g.legacy?.id_str;
      return tweetUnavailableToTombstone(
        status as TweetStub,
        id,
        id ? `${getTwitterProviderEnv().webRoot}/i/status/${id}` : undefined
      );
    }
    return { status: 404 };
  }

  // console.log('status', JSON.stringify(status));

  let graphQLUser = (status.core.user_results?.result ?? status.core.user_result?.result) as
    | GraphQLUser
    | undefined;
  if (!graphQLUser && typeof status.legacy?.user_id_str === 'string') {
    graphQLUser =
      (await fetchTwitterGraphQLUserByRestId(host, status.legacy.user_id_str)) ?? undefined;
  }
  if (!graphQLUser) {
    console.log('Tweet missing author on core', status.rest_id ?? status.legacy?.id_str);
    return null;
  }
  const apiUser = convertToApiUser(graphQLUser, legacyAPI);

  /* Sometimes, `rest_id` is undefined for some reason. Inconsistent behavior. See: https://github.com/FxEmbed/FxEmbed/issues/416 */
  const id = status.rest_id ?? status.legacy.id_str ?? status.legacy?.conversation_id_str;

  if (status.legacy.entities?.urls) {
    status.legacy.entities.urls = status.legacy.entities.urls.filter(
      /* Yes this uses http:// not https://. Don't know why. Hesitant to also include https
         because we just want to get rid of the extraneous article url at the end, not eliminate all article urls */
      url => url.expanded_url.match(/^http:\/\/x\.com\/i\/article\/\w+/g) === null
    );
  }

  /* Populating a lot of the basics */
  if (!legacyAPI) {
    apiStatus.type = 'status';
  }
  apiStatus.url = `${getTwitterProviderEnv().webRoot}/${apiUser.screen_name}/status/${id}`;
  apiStatus.id = id;
  apiStatus.text = unescapeText(
    linkFixer(status.legacy.entities?.urls, status.legacy.full_text || '')
  );
  // If article linked and that's the only thing in the status, use the article preview instead
  // if (status.article && status.legacy.full_text.length < 25) {
  //   apiStatus.text = status.article.article_results?.result?.preview_text ?? '';
  // }
  apiStatus.raw_text = {
    text: status.legacy.full_text,
    display_text_range: status.legacy.display_text_range,
    facets: []
  };
  // if (threadAuthor && threadAuthor.id !== apiUser.id) {
  apiStatus.author = apiUser;
  if (apiStatus.author.avatar_url) {
    apiStatus.author.avatar_url =
      apiStatus.author.avatar_url.replace?.('_normal', '_200x200') ?? null;
  }
  // }
  apiStatus.replies = status.legacy.reply_count;
  if (legacyAPI) {
    // @ts-expect-error Use retweets for legacy API
    apiStatus.retweets = status.legacy.retweet_count;

    // @ts-expect-error `tweets` is only part of legacy API
    apiStatus.author.tweets = apiStatus.author.statuses;
    // @ts-expect-error Part of legacy API that we no longer are able to track
    apiStatus.author.avatar_color = null;
    // @ts-expect-error Use retweets for legacy API
    delete apiStatus.reposts;
    // @ts-expect-error Use tweets and not posts for legacy API
    delete apiStatus.author.statuses;
  } else {
    apiStatus.reposts = status.legacy.retweet_count;
  }
  apiStatus.likes = status.legacy.favorite_count;
  apiStatus.bookmarks = status.legacy.bookmark_count;
  apiStatus.quotes = status.legacy.quote_count;
  apiStatus.embed_card = 'tweet';
  apiStatus.created_at = status.legacy.created_at;
  apiStatus.created_timestamp = new Date(status.legacy.created_at).getTime() / 1000;

  apiStatus.possibly_sensitive = status.legacy.possibly_sensitive;

  if (status.views?.state === 'EnabledWithCount') {
    apiStatus.views = parseInt(status.views.count || '0') ?? null;
  } else {
    apiStatus.views = null;
  }
  const noteTweetText = status.note_tweet?.note_tweet_results?.result?.text;

  if (noteTweetText) {
    apiStatus.raw_text.text = noteTweetText;
    // Note tweets don't have this and don't need it since they already exclude preceding mentions etc
    apiStatus.raw_text.display_text_range = [0, noteTweetText.length];
    status.legacy.entities.urls = status.note_tweet?.note_tweet_results?.result?.entity_set.urls;
    status.legacy.entities.hashtags =
      status.note_tweet?.note_tweet_results?.result?.entity_set.hashtags;
    status.legacy.entities.symbols =
      status.note_tweet?.note_tweet_results?.result?.entity_set.symbols;
    status.legacy.entities.user_mentions =
      status.note_tweet?.note_tweet_results?.result?.entity_set.user_mentions;

    apiStatus.text = unescapeText(linkFixer(status.legacy.entities.urls, noteTweetText));
    apiStatus.is_note_tweet = true;
  } else {
    apiStatus.is_note_tweet = false;
  }

  if (status.note_tweet?.note_tweet_results?.result?.richtext?.richtext_tags) {
    status.note_tweet.note_tweet_results.result.richtext.richtext_tags.forEach(richtext => {
      richtext.richtext_types.forEach(type => {
        let facetType: string = '';
        switch (type) {
          case 'Bold':
            facetType = 'bold';
            break;
          case 'Italic':
            facetType = 'italic';
            break;
          case 'Underline':
            facetType = 'underline';
            break;
          case 'Strikethrough':
            facetType = 'strikethrough';
            break;
        }

        if (facetType) {
          apiStatus.raw_text.facets.push({
            type: facetType,
            indices: [richtext.from_index, richtext.to_index]
          });
        }
      });
    });
  }
  if (status.note_tweet?.note_tweet_results?.result?.media?.inline_media) {
    status.note_tweet.note_tweet_results.result.media.inline_media.forEach(inlineMedia => {
      apiStatus.raw_text.facets.push({
        type: 'inline_media',
        indices: [inlineMedia.index, inlineMedia.index + inlineMedia.media_id.length]
      });
    });
  }
  if (status.legacy?.entities) {
    status.legacy.entities.hashtags?.forEach(hashtag => {
      apiStatus.raw_text.facets.push({
        type: 'hashtag',
        indices: hashtag.indices,
        original: hashtag.text
      });
    });
    status.legacy.entities.symbols?.forEach(symbol => {
      apiStatus.raw_text.facets.push({
        type: 'symbol',
        indices: symbol.indices,
        original: symbol.text
      });
    });
    status.legacy.entities.urls?.forEach(url => {
      apiStatus.raw_text.facets.push({
        type: 'url',
        indices: url.indices,
        original: url.url,
        replacement: url.expanded_url,
        display: url.display_url
      });
    });
    status.legacy.entities.user_mentions?.forEach(mention => {
      apiStatus.raw_text.facets.push({
        type: 'mention',
        indices: mention.indices,
        original: mention.screen_name,
        id: mention.id_str
      });
    });
  }

  if (status.birdwatch_pivot?.subtitle?.text) {
    const noteText = unescapeText(status.birdwatch_pivot.subtitle.text ?? '');
    const rawEntities = status.birdwatch_pivot.subtitle.entities ?? [];

    if (legacyAPI) {
      apiStatus.community_note = {
        text: noteText,
        entities: rawEntities
      };
    } else {
      const facets = birdwatchEntitiesToFacets(rawEntities, noteText);
      const tcoList = [
        ...new Set(
          facets.flatMap(f =>
            f.type === 'url' && typeof f.replacement === 'string' ? [f.replacement] : []
          )
        )
      ];
      if (tcoList.length > 0) {
        const resolved = await tcoResolver(tcoList);
        for (const f of facets) {
          if (f.type === 'url' && typeof f.replacement === 'string') {
            const expanded = resolved[f.replacement];
            if (typeof expanded === 'string') {
              f.replacement = expanded;
            }
          }
        }
      }
      apiStatus.community_note = {
        text: noteText,
        facets
      };
    }
  } else {
    apiStatus.community_note = null;
  }

  if (
    status.legacy.lang !== 'unk' &&
    status.legacy.lang !== 'und' &&
    status.legacy.lang !== 'zxx'
  ) {
    apiStatus.lang = status.legacy.lang;
  } else {
    apiStatus.lang = null;
  }

  if (status.author_community_relationship?.community_results?.result?.id_str) {
    apiStatus.community = {
      id: status.author_community_relationship.community_results.result.id_str,
      name: status.author_community_relationship.community_results.result.name,
      description: status.author_community_relationship.community_results.result.description,
      created_at: new Date(
        status.author_community_relationship.community_results.result.created_at
      ).toISOString(),
      search_tags: status.author_community_relationship.community_results.result.search_tags,
      is_nsfw: status.author_community_relationship.community_results.result.is_nsfw,
      topic:
        status.author_community_relationship.community_results.result.primary_community_topic
          ?.topic_name ?? null,
      join_policy: status.author_community_relationship.community_results.result.join_policy,
      invites_policy: status.author_community_relationship.community_results.result.invites_policy,
      is_pinned: status.author_community_relationship.community_results.result.is_pinned,
      admin: null,
      creator: null
    };

    if (status.author_community_relationship.community_results.result.admin_results?.result) {
      apiStatus.community.admin = convertToApiUser(
        status.author_community_relationship.community_results.result.admin_results.result,
        legacyAPI
      );
    }
    if (status.author_community_relationship.community_results.result.creator_results?.result) {
      apiStatus.community.creator = convertToApiUser(
        status.author_community_relationship.community_results.result.creator_results.result,
        legacyAPI
      );
    }
  }

  const replyScreenName = replyTargetScreenNameFromGraphQL(status);
  const replyStatusId = status.legacy?.in_reply_to_status_id_str;

  if (legacyAPI) {
    // @ts-expect-error Use replying_to string for legacy API
    apiStatus.replying_to = replyScreenName || null;
    // @ts-expect-error Use replying_to_status string for legacy API
    apiStatus.replying_to_status = replyStatusId || null;
  } else if (replyScreenName && replyStatusId) {
    const displayName = replyTargetDisplayNameFromGraphQL(status);
    apiStatus.replying_to = {
      screen_name: replyScreenName,
      status: replyStatusId,
      url: `${getTwitterProviderEnv().webRoot}/${replyScreenName}/status/${replyStatusId}`,
      profile_url: `${getTwitterProviderEnv().webRoot}/${replyScreenName}`,
      ...(displayName ? { display_name: displayName } : {})
    };
  } else {
    apiStatus.replying_to = null;
  }

  apiStatus.media = {};

  /* ConversationTimeline uses quoted_tweet_results; TweetDetail uses quoted_status_result (both unwrap via status.result). */
  const quote =
    status.quoted_status_result ??
    status.tweet?.quoted_status_result ??
    status.quoted_tweet_results ??
    status.tweet?.quoted_tweet_results;
  if (quote) {
    const unwrapped = unwrapQuoteGraphql(quote) as Record<string, unknown>;
    const isEmptyUnwrapped =
      unwrapped && typeof unwrapped === 'object' && Object.keys(unwrapped).length === 0;
    const qid = status.legacy?.quoted_status_id_str;
    const qPerm = status.legacy?.quoted_status_permalink?.expanded;

    if (isEmptyUnwrapped && !legacyAPI) {
      apiStatus.quote = twitterTombstone('unavailable', {
        id: qid,
        url: qPerm ?? (qid ? `${getTwitterProviderEnv().webRoot}/i/status/${qid}` : undefined)
      });
    } else if (unwrapped?.__typename === 'TweetTombstone' && !legacyAPI) {
      apiStatus.quote = twitterTweetTombstoneFromGraphQL(
        unwrapped as unknown as TweetTombstone,
        qid,
        language
      );
    } else if (!isEmptyUnwrapped) {
      const buildQuote = await buildAPITwitterStatus(
        host,
        quote as GraphQLTwitterStatus,
        language,
        threadAuthor,
        legacyAPI,
        manualTranslationFallback,
        'quote',
        qid
      );
      if (buildQuote == null) {
        if (!legacyAPI && qid) {
          apiStatus.quote = twitterTombstone('unavailable', {
            id: qid,
            url: qPerm ?? `${getTwitterProviderEnv().webRoot}/i/status/${qid}`
          });
        } else {
          apiStatus.quote = undefined;
        }
      } else if (isTombstone(buildQuote)) {
        apiStatus.quote = buildQuote;
      } else if ((buildQuote as FetchResults).status) {
        if (!legacyAPI && qid) {
          apiStatus.quote = twitterTombstone('unavailable', {
            id: qid,
            url: qPerm ?? `${getTwitterProviderEnv().webRoot}/i/status/${qid}`
          });
        } else {
          apiStatus.quote = undefined;
        }
      } else {
        apiStatus.quote = buildQuote as APITwitterStatus;
      }
    }

    /* Only override the embed_card if it's a basic status, since media always takes precedence  */
    if (apiStatus.embed_card === 'tweet' && apiStatus.quote && !isTombstone(apiStatus.quote)) {
      apiStatus.embed_card = apiStatus.quote.embed_card;
    }
  }

  const mediaList = Array.from(
    status.legacy.extended_entities?.media || status.legacy.entities?.media || []
  );

  /* Populate status media */
  mediaList.forEach(media => {
    apiStatus.raw_text.facets.push({
      type: 'media',
      indices: media.indices,
      id: media.id_str,
      display: media.display_url,
      original: media.url,
      replacement: media.expanded_url
    });
    const mediaObject = processMedia(host, media);
    if (mediaObject) {
      apiStatus.media.all = apiStatus.media?.all ?? [];
      const shouldTranscodeGifs = host.shouldTranscodeGif?.() ?? false;
      apiStatus.media?.all?.push(mediaObject);
      if (mediaObject.type === 'photo' || (mediaObject.type === 'gif' && shouldTranscodeGifs)) {
        apiStatus.embed_card = 'summary_large_image';
        apiStatus.media.photos = apiStatus.media?.photos ?? [];
        apiStatus.media.photos?.push(mediaObject as APIPhoto);
      } else if (
        mediaObject.type === 'video' ||
        (mediaObject.type === 'gif' && !shouldTranscodeGifs)
      ) {
        apiStatus.embed_card = 'player';
        apiStatus.media.videos = apiStatus.media?.videos ?? [];
        apiStatus.media.videos?.push(mediaObject as APIVideo);
      } else {
        console.log('Unknown media type', mediaObject.type);
      }
    }
  });

  /* Grab color palette data */
  /*
  if (mediaList[0]?.ext_media_color?.palette) {
    apiStatus.color = colorFromPalette(mediaList[0].ext_media_color.palette);
  }
  */

  /* Handle photos and mosaic if available */
  if (
    (apiStatus?.media.photos?.length || 0) > 1 &&
    !threadAuthor &&
    getTwitterProviderEnv().mosaicDomainList.length > 0
  ) {
    const twEnv = getTwitterProviderEnv();
    const mosaic = await handleMosaic(apiStatus.media?.photos || [], id, DataProvider.Twitter, {
      twitterLikeDomains: twEnv.mosaicDomainList,
      blueskyDomains: twEnv.mosaicBskyDomainList
    });
    if (typeof apiStatus.media !== 'undefined' && mosaic !== null) {
      apiStatus.media.mosaic = mosaic;
    }
  }

  // Add source but remove the link HTML tag
  if (status.source) {
    apiStatus.source = (status.source || '').replace(
      /<a href="(.+?)" rel="nofollow">(.+?)<\/a>/,
      '$2'
    );
  }

  /* Populate a Twitter card */

  if (status.card ?? status.tweet_card) {
    const card = await renderCard(host, status.card ?? status.tweet_card);
    if (card.external_media) {
      apiStatus.embed_card = 'player';
      apiStatus.media.external = card.external_media;
      if (apiStatus.media.external?.url.match('https://www.youtube.com/embed/')) {
        /* Add YouTube thumbnail URL */
        apiStatus.media.external.thumbnail_url = `https://img.youtube.com/vi/${apiStatus.media.external.url.replace(
          'https://www.youtube.com/embed/',
          ''
        )}/maxresdefault.jpg`;
      }
    }
    if (card.broadcast && host.broadcastStreamApi) {
      apiStatus.media = apiStatus.media ?? { all: [] };
      apiStatus.embed_card = 'player';
      apiStatus.media.broadcast = card.broadcast;
      apiStatus.media.videos = apiStatus.media?.videos ?? [];
      console.log('card.broadcast.thumbnail', JSON.stringify(card.broadcast.thumbnail));
      apiStatus.media.videos?.push({
        type: 'video',
        url: `https://stream-test.fxembed.com/download.mp4?url=${encodeURIComponent(
          card.broadcast.stream?.url ?? ''
        )}`,
        thumbnail_url: card.broadcast.thumbnail.original.url,
        format: 'video/mp4',
        width: card.broadcast.width,
        height: card.broadcast.height,
        duration: 0,
        formats: []
      });
      apiStatus.media.all = apiStatus.media?.all ?? [];
      apiStatus.media.all?.push({
        type: 'video',
        url: `https://stream-test.fxembed.com/download.mp4?url=${encodeURIComponent(
          card.broadcast.stream?.url ?? ''
        )}`,
        thumbnail_url: card.broadcast.thumbnail.original.url,
        format: 'video/mp4',
        width: card.broadcast.width,
        height: card.broadcast.height,
        duration: 0,
        formats: []
      } as APIVideo);
    }
    if (card.poll) {
      apiStatus.poll = card.poll;
    }
    /* TODO: Right now, we push them after native photos and videos but should we prepend them instead? */
    if (card.media) {
      if (card.media.videos) {
        card.media.videos.forEach(video => {
          const mediaObject = processMedia(host, video) as APIVideo;
          if (mediaObject) {
            apiStatus.media.all = apiStatus.media?.all ?? [];
            apiStatus.media?.all?.push(mediaObject);
            apiStatus.media.videos = apiStatus.media?.videos ?? [];
            apiStatus.media.videos?.push(mediaObject);
          }
        });
      }
      if (card.media.photos) {
        card.media.photos.forEach(photo => {
          const mediaObject = processMedia(host, photo) as APIPhoto;
          if (mediaObject) {
            apiStatus.media.all = apiStatus.media?.all ?? [];
            apiStatus.media?.all?.push(mediaObject);
            apiStatus.media.photos = apiStatus.media?.photos ?? [];
            apiStatus.media.photos?.push(mediaObject);
          }
        });
      }
    }
    if (card.website_card) {
      const wc = card.website_card;
      apiStatus.card = {
        url: expandedCardUrl(wc.url, status.legacy.entities?.urls),
        title: wc.title,
        description: wc.description,
        domain: wc.domain,
        card_name: wc.card_name,
        image: {
          width: wc.image?.width,
          height: wc.image?.height,
          url: wc.image?.url,
          alt: wc.image?.alt
        }
      };
    }
  } else {
    /* Determine if the status contains a YouTube link (either youtube.com or youtu.be) so we can include it */
    const youtubeIdRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([^\s&]+)/;
    const matches = apiStatus.text.match(youtubeIdRegex);

    const youtubeId = matches ? matches[4] : null;

    if (youtubeId) {
      apiStatus.media.external = {
        type: 'video',
        url: `https://www.youtube.com/embed/${youtubeId}`,
        thumbnail_url: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
        width: 1280,
        height: 720
      };

      apiStatus.embed_card = 'player';
    }
  }

  if (
    apiStatus.media?.videos &&
    apiStatus.media?.videos.length > 0 &&
    apiStatus.embed_card !== 'player'
  ) {
    apiStatus.embed_card = 'player';
  }

  if (language) {
    console.log('language override:', language);
  }

  if (status.article) {
    apiStatus.article = {
      created_at: new Date(
        (status.article.article_results?.result?.metadata?.first_published_at_secs ?? 0) * 1000
      ).toISOString(),
      modified_at: new Date(
        (status.article.article_results?.result?.lifecycle_state?.modified_at_secs ?? 0) * 1000
      ).toISOString(),
      id: status.article.article_results?.result?.rest_id ?? '',
      title: status.article.article_results?.result?.title ?? '',
      preview_text: status.article.article_results?.result?.preview_text ?? '',
      cover_media: status.article.article_results?.result?.cover_media ?? ({} as TwitterApiMedia),
      content: status.article.article_results?.result?.content_state ?? {
        blocks: [],
        entityMap: []
      },
      media_entities:
        status.article.article_results?.result?.media_entities ?? ([] as TwitterApiMedia[])
    };
  }

  /* If a language is specified in API or by user, let's try translating it! */
  if (
    typeof language === 'string' &&
    (language.length === 2 || language.length === 5) && // Only translate if the language is a valid ISO 639-1 or ISO 639-5 code
    normalizeLanguage(language) !== normalizeLanguage(status.legacy?.lang || '') &&
    apiStatus.text.length > 1 // Don't translate if the status text is too short
  ) {
    const normalizedTarget = normalizeLanguage(language);
    console.log(`Attempting to translate status to ${normalizedTarget}...`);
    let didTranslate = false;
    const inline = status.grok_translated_post_with_availability;
    if (
      inline?.is_available === true &&
      inline.data &&
      typeof inline.data.translation === 'string' &&
      inline.data.translation.trim().length > 0 &&
      normalizeLanguage(inline.data.destination_language) === normalizedTarget
    ) {
      const srcLang = (inline.data.source_language || apiStatus.lang || 'en').toLowerCase();
      apiStatus.translation = {
        text: unescapeText(
          linkFixer(status.legacy?.entities?.urls, inline.data.translation.trim())
        ),
        source_lang: srcLang,
        target_lang: normalizedTarget,
        source_lang_en: host.t(`language_${srcLang}`, { lng: 'en' }),
        provider: 'grok'
      };
      didTranslate = true;
    }
    if (manualTranslationFallback) {
      try {
        if (!didTranslate) {
          const translateGrok = await translateStatusGrok(apiStatus, language, host);
          console.log('Grok translation response:', JSON.stringify(translateGrok));
          if (translateGrok !== null) {
            apiStatus.translation = {
              text: unescapeText(
                linkFixer(status.legacy?.entities?.urls, translateGrok?.result?.text || '')
              ),
              source_lang: apiStatus.lang ?? 'en',
              target_lang: normalizedTarget,
              source_lang_en: host.t(`language_${apiStatus.lang ?? 'en'}`, { lng: 'en' }),
              provider: 'grok'
            };
            didTranslate = true;
          }
        }
      } catch (error) {
        console.error('Error translating status with Grok:', error);
      }

      if (getTwitterProviderEnv().polyglotDomainList.length > 0 && !didTranslate) {
        const translatePolyglot = await host.translatePolyglot?.(apiStatus, language);
        if (translatePolyglot != null) {
          apiStatus.translation = {
            text: unescapeText(
              linkFixer(status.legacy?.entities?.urls, translatePolyglot?.translated_text || '')
            ),
            source_lang: (translatePolyglot?.source_lang ?? 'en').toLowerCase(),
            target_lang: normalizedTarget,
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
      if (host.aiEnabled && !didTranslate) {
        console.log('Falling back to LLM translation');
        const translateAPI = await host.translateAI?.(apiStatus, language);
        if (translateAPI !== null && translateAPI?.translated_text) {
          apiStatus.translation = {
            text: unescapeText(
              linkFixer(status.legacy?.entities?.urls, translateAPI?.translated_text || '')
            ),
            source_lang: apiStatus.lang ?? 'en',
            target_lang: normalizedTarget,
            source_lang_en: host.t(`language_${apiStatus.lang ?? 'en'}`, { lng: 'en' }),
            provider: 'llm'
          };
          didTranslate = true;
        }
      }
    }
    if (!didTranslate) {
      console.log('No translation was successful, skipping');
    }
  }

  if (legacyAPI) {
    // @ts-expect-error Use twitter_card for legacy API
    apiStatus.twitter_card = apiStatus.embed_card;
    // @ts-expect-error Part of legacy API that we no longer are able to track
    apiStatus.color = null;
    // @ts-expect-error Use twitter_card for legacy API
    delete apiStatus.embed_card;
    if ((apiStatus.media.all?.length ?? 0) < 1 && !apiStatus.media.external) {
      // @ts-expect-error media is not required in legacy API if empty
      delete apiStatus.media;
    }

    // Populate variants from formats for legacy API compatibility
    if (apiStatus.media?.videos) {
      apiStatus.media.videos.forEach(video => {
        if (video.formats && video.formats.length > 0) {
          // @ts-expect-error Part of legacy API that is deprecated
          video.variants = video.formats.map(convertFormatToVariant);
        }
      });
    }
    if (apiStatus.media?.all) {
      apiStatus.media.all.forEach(media => {
        if (media.type === 'video' || media.type === 'gif') {
          const video = media as APIVideo;
          if (video.formats && video.formats.length > 0) {
            // @ts-expect-error Part of legacy API that is deprecated
            video.variants = video.formats.map(convertFormatToVariant);
          }
        }
      });
    }
    if (apiStatus.quote && !isTombstone(apiStatus.quote) && apiStatus.quote.media?.videos) {
      apiStatus.quote.media.videos.forEach(video => {
        if (video.formats && video.formats.length > 0) {
          // @ts-expect-error Part of legacy API that is deprecated
          video.variants = video.formats.map(convertFormatToVariant);
        }
      });
    }
    if (apiStatus.quote && !isTombstone(apiStatus.quote) && apiStatus.quote.media?.all) {
      apiStatus.quote.media.all.forEach(media => {
        if (media.type === 'video' || media.type === 'gif') {
          const video = media as APIVideo;
          if (video.formats && video.formats.length > 0) {
            // @ts-expect-error Part of legacy API that is deprecated
            video.variants = video.formats.map(convertFormatToVariant);
          }
        }
      });
    }

    const stripPhotoFormats = (photo: APIPhoto) => {
      delete photo.formats;
    };
    if (apiStatus.media?.photos) {
      apiStatus.media.photos.forEach(stripPhotoFormats);
    }
    if (apiStatus.media?.all) {
      apiStatus.media.all.forEach(media => {
        if (media.type === 'photo' || media.type === 'gif') {
          stripPhotoFormats(media as APIPhoto);
        }
      });
    }
    if (apiStatus.quote && !isTombstone(apiStatus.quote)) {
      apiStatus.quote.media?.photos?.forEach(stripPhotoFormats);
      apiStatus.quote.media?.all?.forEach(media => {
        if (media.type === 'photo' || media.type === 'gif') {
          stripPhotoFormats(media as APIPhoto);
        }
      });
    }
  }

  if (apiStatus.raw_text.facets) {
    // Sort from lowest to highest index
    apiStatus.raw_text.facets.sort((a, b) => a.indices[0] - b.indices[0]);
  }

  apiStatus.provider = DataProvider.Twitter;
  apiStatus.reposted_by = repostedBy;

  return apiStatus;
};
