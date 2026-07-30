import { getTwitterProviderEnv } from '../twitter-runtime.js';
import { hasTwitterAccountProxy } from './accountProxy.js';
import { buildLanguageHeaders } from '../../helpers/language.js';
import { isGraphQLTwitterStatus } from '../../helpers/graphql-twitter.js';
import type { APIStatusTombstone, APITwitterStatus } from '../../types/api-schemas.js';
import type { FetchResults } from '../../types/fetch-results.js';
import { isTombstone, stripTombstones } from '../../helpers/tombstone.js';
import { buildAPITwitterStatus, twitterTweetTombstoneFromGraphQL } from './processor.js';
import type { TwitterBuildHost } from './build-host.js';
import { InputFlags } from '../../types/input-flags.js';
import type { SocialThread, SocialConversation } from '../../types/api-status.js';
import {
  ConversationTimelineQuery,
  TweetDetailQuery,
  TweetResultByIdQuery,
  TweetResultByRestIdQuery,
  TweetResultsByIdsQuery,
  TweetResultsByRestIdsQuery
} from './graphql/queries.js';
import { graphqlRequest } from './graphql/request.js';
import { graphQLOrchestrator } from './graphql/orchestrator.js';
import { isTwitterNumericStatusId } from '../../helpers/snowflake.js';

type TwitterTimelinePiece = GraphQLTwitterStatus | APIStatusTombstone;

/** Some clients send `itemType: TimelineTweet` without `__typename`. */
const isTimelineTweetItem = (itemContent: unknown): boolean => {
  if (!itemContent || typeof itemContent !== 'object') return false;
  const o = itemContent as { __typename?: string; itemType?: string };
  return o.__typename === 'TimelineTweet' || o.itemType === 'TimelineTweet';
};

/**
 * Keep tweet-detail timeline order, including `TweetTombstone` rows between chain tweets.
 * @param chainTweets - Tweet IDs from the reply-chain walk (can omit parents when `in_reply_to`
 *   still points at a deleted id). Pass `timelineTweetSources` with every GraphQL tweet from the
 *   same timeline so tombstones between those tweets are not dropped; those IDs only widen the
 *   bracketing range, they are not emitted as thread output unless they appear in `chainTweets`.
 */
const mergeTimelineOrderPreservingTombstones = (
  ordered: TwitterTimelinePiece[],
  chainTweets: GraphQLTwitterStatus[],
  timelineTweetSources?: GraphQLTwitterStatus[]
): TwitterTimelinePiece[] => {
  const chainIds = new Set(
    chainTweets.map(t => t.rest_id ?? t.legacy?.id_str ?? '').filter(Boolean)
  );
  const boundaryIds = new Set<string>();
  if (timelineTweetSources?.length) {
    for (const t of timelineTweetSources) {
      const id = t.rest_id ?? t.legacy?.id_str;
      if (id) boundaryIds.add(id);
    }
  }
  const isBracketAnchorId = (id: string | undefined) =>
    !!id && (chainIds.has(id) || boundaryIds.has(id));
  const tweetIndices = ordered
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (isTombstone(e)) return false;
      const id = (e as GraphQLTwitterStatus).rest_id ?? (e as GraphQLTwitterStatus).legacy?.id_str;
      return isBracketAnchorId(id);
    })
    .map(x => x.i);
  if (tweetIndices.length === 0) return [...chainTweets];
  let minI = Math.min(...tweetIndices);
  let maxI = Math.max(...tweetIndices);
  /* Tombstones have no GraphQL Tweet row, so their ids are not in chainIds/boundaryIds. A
     suspended/deleted ancestor often appears immediately before the first reachable chain tweet
     in timeline order (constructTwitterThread's reply walk stops at the missing parent). Pull
     those rows in. */
  while (minI > 0 && isTombstone(ordered[minI - 1])) {
    minI--;
  }
  while (maxI + 1 < ordered.length && isTombstone(ordered[maxI + 1])) {
    maxI++;
  }
  return ordered.filter((e, i) => {
    if (i < minI || i > maxI) return false;
    if (isTombstone(e)) return true;
    const id = (e as GraphQLTwitterStatus).rest_id ?? (e as GraphQLTwitterStatus).legacy?.id_str;
    return !!id && chainIds.has(id);
  });
};

/** Position in TweetDetail timeline order (used to pick one branch when several replies share a parent). */
const timelineIndexOfGraphQLTweet = (
  tweet: GraphQLTwitterStatus,
  ordered: TwitterTimelinePiece[]
): number => {
  const tid = tweet.rest_id ?? tweet.legacy?.id_str ?? '';
  if (!tid) return Number.POSITIVE_INFINITY;
  for (let i = 0; i < ordered.length; i++) {
    const piece = ordered[i];
    if (isTombstone(piece)) continue;
    const t = piece as GraphQLTwitterStatus;
    const pid = t.rest_id ?? t.legacy?.id_str;
    if (pid === tid) return i;
  }
  return Number.POSITIVE_INFINITY;
};

/**
 * When `in_reply_to` points at a deleted/missing id, the upward walk cannot reach the thread root,
 * but the root tweet may still appear in TweetDetail `ordered`. Merge that one tweet
 * (`legacy.id_str === conversation_id_str`) so {@link mergeTimelineOrderPreservingTombstones} can
 * emit tombstones between root and focal. Other same-conversation author tweets (side branches) are
 * not included.
 */
const mergeWalkedChainWithThreadRootFromOrdered = (
  ordered: TwitterTimelinePiece[],
  walkedChain: GraphQLTwitterStatus[],
  focal: GraphQLTwitterStatus
): GraphQLTwitterStatus[] => {
  const authorId = focal.core?.user_results?.result?.rest_id;
  const conv = focal.legacy?.conversation_id_str;
  const out = new Map<string, GraphQLTwitterStatus>();
  for (const t of walkedChain) {
    const tid = t.rest_id ?? t.legacy?.id_str;
    if (tid) out.set(tid, t);
  }
  if (!authorId || !conv) {
    return walkedChain;
  }
  for (const piece of ordered) {
    if (isTombstone(piece)) continue;
    const t = piece as GraphQLTwitterStatus;
    if (t.core?.user_results?.result?.rest_id !== authorId) continue;
    if (t.legacy?.conversation_id_str !== conv) continue;
    const lid = t.legacy?.id_str;
    const tid = t.rest_id ?? lid;
    if (!tid || !lid) continue;
    if (lid !== conv) continue;
    if (!out.has(tid)) {
      out.set(tid, t);
    }
  }
  return Array.from(out.values());
};

const writeDataPoint = (
  host: TwitterBuildHost,
  language: string | undefined,
  nsfw: boolean | null,
  returnCode: string,
  flags?: InputFlags
) => {
  console.log('Writing data point...');
  if (typeof host.analyticsEngine !== 'undefined') {
    const flagString =
      Object.keys(flags || {})
        // @ts-expect-error - TypeScript doesn't like iterating over the keys, but that's OK
        .filter(flag => flags?.[flag])[0] || 'standard';

    console.log(flagString);

    const cf = host.request?.cf as { colo?: string; country?: string } | undefined;
    host.analyticsEngine?.writeDataPoint({
      blobs: [
        cf?.colo as string /* Datacenter location */,
        cf?.country as string /* Country code */,
        host.request?.userAgent ?? '' /* User agent (for aggregating bots calling) */,
        returnCode /* Return code */,
        flagString /* Type of request */,
        language ?? '' /* For translate feature */
      ],
      doubles: [nsfw ? 1 : 0 /* NSFW media = 1, No NSFW Media = 0 */]
    });
  }
};

const getResultFromResponse = (
  response:
    | TweetResultByRestIdResponse
    | TweetResultsByRestIdsResponse
    | TweetResultsByIdsResponse
    | TweetResultByIdResponse
    | TweetDetailResponse
    | null
) => {
  if ((response as TweetResultByRestIdResponse)?.data?.tweetResult?.result) {
    return (response as TweetResultByRestIdResponse)?.data?.tweetResult
      ?.result as GraphQLTwitterStatus;
  } else if ((response as TweetResultsByRestIdsResponse)?.data?.tweetResult?.[0]?.result) {
    return (response as TweetResultsByRestIdsResponse)?.data?.tweetResult?.[0]
      ?.result as GraphQLTwitterStatus;
  } else if ((response as TweetResultsByIdsResponse)?.data?.tweet_results?.[0]?.result) {
    return (response as TweetResultsByIdsResponse)?.data?.tweet_results?.[0]
      ?.result as GraphQLTwitterStatus;
  } else if ((response as TweetResultByIdResponse)?.data?.tweet_result?.result) {
    return (response as TweetResultByIdResponse)?.data?.tweet_result
      ?.result as GraphQLTwitterStatus;
  }
  return null;
};

const isTweetUnavailable = (response: unknown): response is TweetStub => {
  return (
    typeof response === 'object' &&
    response !== null &&
    '__typename' in response &&
    (response as { __typename?: string }).__typename === 'TweetUnavailable'
  );
};

export type TweetDetailRankingMode = 'Relevance' | 'Recency' | 'Likes';

const validateThreadedConversationResponse = (_conversation: unknown): boolean => {
  const conversation = _conversation as TweetDetailResponse;
  const instructions = conversation?.data?.threaded_conversation_with_injections_v2?.instructions;
  if (Array.isArray(instructions)) {
    return true;
  }
  return Array.isArray(conversation?.errors);
};

/**
 * TweetDetail (50/period) vs ConversationTimeline (150/period) at 1:3 to level rate limits.
 * Uses graphQLOrchestrator weighted selection (same distribution as the former Math.random split).
 * @param processThread - When true, uses the same 1000/3000 weights as fetchSingleStatus for these two endpoints.
 */
export const fetchTweetDetail = async (
  host: TwitterBuildHost,
  status: string,
  cursor: string | null = null,
  rankingMode?: TweetDetailRankingMode,
  language?: string
): Promise<TweetDetailResponse> => {
  const langHeaders = buildLanguageHeaders(language);
  const results = await graphQLOrchestrator(host, [
    {
      key: 'threadedConversation',
      methods: [
        {
          name: 'ConversationTimeline',
          query: ConversationTimelineQuery,
          weight: 150,
          validator: validateThreadedConversationResponse,
          variables: {
            focal_tweet_id: status,
            cursor,
            ...(rankingMode ? { ranking_mode: rankingMode } : {})
          }
        },
        {
          name: 'TweetDetail',
          query: TweetDetailQuery,
          weight: 150,
          validator: validateThreadedConversationResponse,
          variables: {
            focalTweetId: status,
            cursor,
            ...(rankingMode ? { rankingMode } : {})
          }
        }
      ],
      required: true,
      headers: langHeaders
    }
  ]);

  const entry = results.threadedConversation;
  if (entry?.success && entry.data) {
    return entry.data as TweetDetailResponse;
  }
  return (entry?.data ?? { data: undefined }) as TweetDetailResponse;
};

export const fetchByRestId = async (
  status: string,
  host: TwitterBuildHost,
  useElongator = hasTwitterAccountProxy({
    TwitterProxy: host.twitterProxy,
    CREDENTIAL_KEY: host.credentialKey
  }),
  language?: string
): Promise<TweetResultByRestIdResponse> => {
  return graphqlRequest(host, {
    query: TweetResultByRestIdQuery,
    variables: {
      tweetId: status
    },
    useElongator: useElongator,
    headers: buildLanguageHeaders(language),
    validator: (_conversation: unknown) => {
      const conversation = _conversation as TweetResultByRestIdResponse;
      // If we get a not found error it's still a valid response
      const tweet = conversation?.data?.tweetResult?.result;
      if (isGraphQLTwitterStatus(tweet)) {
        return true;
      }
      console.log('invalid graphql tweet');
      if (
        !tweet &&
        typeof conversation.data?.tweetResult === 'object' &&
        Object.keys(conversation.data?.tweetResult || {}).length === 0
      ) {
        console.log('tweet was not found');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable' && tweet.reason === 'NsfwLoggedOut') {
        console.log('status is nsfw');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable' && tweet.reason === 'Protected') {
        console.log('status is protected');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable') {
        console.log('generic tweet unavailable error');
        return true;
      }
      // Final clause for checking if it's valid is if there's errors
      return Array.isArray(conversation.errors);
    }
  }) as Promise<TweetResultByRestIdResponse>;
};

export const fetchByRestIds = async (
  statuses: string[],
  host: TwitterBuildHost,
  useElongator = hasTwitterAccountProxy({
    TwitterProxy: host.twitterProxy,
    CREDENTIAL_KEY: host.credentialKey
  }),
  language?: string
): Promise<TweetResultsByRestIdsResponse> => {
  return graphqlRequest(host, {
    query: TweetResultsByRestIdsQuery,
    variables: {
      tweetIds: statuses
    },
    useElongator: useElongator,
    headers: buildLanguageHeaders(language),
    validator: (_conversation: unknown) => {
      const conversation = _conversation as TweetResultsByRestIdsResponse;
      // If we get a not found error it's still a valid response
      const tweet = conversation?.data?.tweetResult?.[0]?.result;
      if (isGraphQLTwitterStatus(tweet)) {
        return true;
      }
      console.log('invalid graphql tweet');
      if (
        !tweet &&
        typeof conversation.data?.tweetResult === 'object' &&
        Object.keys(conversation.data?.tweetResult || {}).length === 0
      ) {
        console.log('tweet was not found');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable' && tweet.reason === 'NsfwLoggedOut') {
        console.log('status is nsfw');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable' && tweet.reason === 'Protected') {
        console.log('status is protected');
        return true;
      }
      if (tweet?.__typename === 'TweetUnavailable') {
        console.log('generic tweet unavailable error');
        return true;
      }
      // Final clause for checking if it's valid is if there's errors
      return Array.isArray(conversation.errors);
    }
  }) as Promise<TweetResultsByRestIdsResponse>;
};

/**
 * ConversationTimeline returns a compact ArticleEntity (title/preview/cover) without
 * `content_state.blocks`. TweetResultsByRestId usually includes the full body; merge it in
 * without discarding fields from the first parse.
 */
const enrichArticleWithFullContent = async (
  host: TwitterBuildHost,
  status: APITwitterStatus,
  tweetRestId: string,
  language: string | undefined,
  legacyAPI: boolean,
  manualTranslationFallback = true
): Promise<APITwitterStatus> => {
  if (!status.article || (status.article.content?.blocks?.length ?? 0) > 0 || !tweetRestId) {
    return status;
  }

  console.log('Article lacks content blocks, re-fetching with TweetResultsByRestId...');
  const articleResponse = await fetchByRestIds([tweetRestId], host, undefined, language);
  const raw = articleResponse?.data?.tweetResult?.[0]?.result;
  if (!raw || !isGraphQLTwitterStatus(raw)) {
    return status;
  }

  const rebuilt = await buildAPITwitterStatus(
    host,
    raw,
    language,
    null,
    legacyAPI,
    manualTranslationFallback
  );

  if (isTombstone(rebuilt) || (rebuilt as FetchResults)?.status || !rebuilt) {
    return status;
  }

  const enriched = rebuilt as APITwitterStatus;
  if (!enriched.article || (enriched.article.content?.blocks?.length ?? 0) === 0) {
    return status;
  }

  return { ...status, article: enriched.article };
};

export const fetchByIds = async (
  statuses: string[],
  host: TwitterBuildHost,
  useElongator = hasTwitterAccountProxy({
    TwitterProxy: host.twitterProxy,
    CREDENTIAL_KEY: host.credentialKey
  }),
  language?: string
): Promise<TweetResultsByIdsResponse> => {
  return graphqlRequest(host, {
    query: TweetResultsByIdsQuery,
    variables: {
      rest_ids: statuses
    },
    useElongator: useElongator,
    headers: buildLanguageHeaders(language),
    validator: (_conversation: unknown) => {
      const conversation = _conversation as TweetResultsByIdsResponse;
      // If we get a not found error it's still a valid response
      const status = getResultFromResponse(conversation) as unknown;
      if (isGraphQLTwitterStatus(status)) {
        return true;
      }
      console.log('invalid graphql tweet');
      if (
        !status &&
        typeof conversation.data?.tweet_results === 'object' &&
        Object.keys(conversation.data?.tweet_results || {}).length === 0
      ) {
        console.log('status not found');
        return true;
      }
      if (isTweetUnavailable(status) && status.reason === 'NsfwLoggedOut') {
        console.log('status is nsfw');
        return true;
      }
      if (isTweetUnavailable(status) && status.reason === 'Protected') {
        console.log('status is protected');
        return true;
      }
      if (isTweetUnavailable(status)) {
        console.log('generic tweet unavailable error');
        return true;
      }
      // Final clause for checking if it's valid is if there's errors
      return Array.isArray(conversation.errors);
    }
  }) as Promise<TweetResultsByIdsResponse>;
};

export const fetchById = async (
  status: string,
  host: TwitterBuildHost,
  useElongator = hasTwitterAccountProxy({
    TwitterProxy: host.twitterProxy,
    CREDENTIAL_KEY: host.credentialKey
  }),
  language?: string
): Promise<TweetResultByIdResponse> => {
  return graphqlRequest(host, {
    query: TweetResultByIdQuery,
    variables: {
      rest_id: status
    },
    useElongator: useElongator,
    headers: buildLanguageHeaders(language),
    validator: (_conversation: unknown) => {
      const conversation = _conversation as TweetResultByIdResponse;
      // If we get a not found error it's still a valid response
      const tweet = conversation.data?.tweet_result?.result;
      if (isGraphQLTwitterStatus(tweet)) {
        return true;
      }
      console.log('invalid graphql tweet');
      if (
        !tweet &&
        typeof conversation.data?.tweet_result === 'object' &&
        Object.keys(conversation.data?.tweet_result || {}).length === 0
      ) {
        console.log('status not found');
        return true;
      }
      // Final clause for checking if it's valid is if there's errors
      return Array.isArray(conversation.errors);
    }
  }) as Promise<TweetResultByIdResponse>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ConversationTimeline (iOS) uses snake_case field names while TweetDetail (web)
 * uses camelCase. These helpers normalise access so both formats work.
 */
const getItemContent = (obj: any): any => obj?.itemContent ?? obj?.content;

const getEntryId = (obj: any): string | undefined => obj?.entryId ?? obj?.entry_id;

const getInstructionType = (obj: any): string | undefined => obj?.type ?? obj?.__typename;

const normalizeCursor = (raw: any): GraphQLTimelineCursor => {
  if (raw.cursorType) return raw as GraphQLTimelineCursor;
  return { ...raw, cursorType: raw.cursor_type } as GraphQLTimelineCursor;
};

/* eslint-enable @typescript-eslint/no-explicit-any */

interface GraphQLProcessBucket {
  ordered: TwitterTimelinePiece[];
  statuses: GraphQLTwitterStatus[];
  allStatuses: GraphQLTwitterStatus[];
  cursors: GraphQLTimelineCursor[];
}

const pushTweetFromContent = (
  itemContent:
    | GraphQLTimelineTweet
    | TweetTombstone
    | GraphQLTimelineCursor
    | GraphQLTweetWithVisibilityResults,
  bucket: GraphQLProcessBucket,
  entryId?: string,
  language?: string
) => {
  if (!isTimelineTweetItem(itemContent)) return;
  const result = (itemContent as GraphQLTimelineTweet).tweet_results?.result;
  const entryType = result?.__typename;
  if (entryType === 'Tweet') {
    const tw = result as GraphQLTwitterStatus;
    bucket.statuses.push(tw);
    bucket.ordered.push(tw);
  } else if (entryType === 'TweetWithVisibilityResults') {
    const tw = (result as GraphQLTweetWithVisibilityResults).tweet;
    bucket.statuses.push(tw);
    bucket.ordered.push(tw);
  } else if (entryType === 'TweetTombstone') {
    const idHint = entryId?.match(/^tweet-(\d+)$/)?.[1];
    bucket.ordered.push(
      twitterTweetTombstoneFromGraphQL(result as TweetTombstone, idHint, language)
    );
  }
};

const processResponse = (
  instructions: TimelineInstruction[],
  language?: string
): GraphQLProcessBucket => {
  const bucket: GraphQLProcessBucket = {
    ordered: [],
    statuses: [],
    allStatuses: [],
    cursors: []
  };
  instructions?.forEach?.(instruction => {
    const itype = getInstructionType(instruction);
    if (itype === 'TimelineAddEntries' || itype === 'TimelineAddToModule') {
      (
        (instruction as TimelineAddEntriesInstruction)?.entries ??
        (instruction as TimelineAddModulesInstruction)?.moduleItems
      )?.forEach(_entry => {
        const entry = _entry as
          GraphQLTimelineTweetEntry | GraphQLConversationThread | GraphQLModuleTweetEntry;
        const content =
          (entry as GraphQLModuleTweetEntry)?.item ?? (entry as GraphQLTimelineTweetEntry)?.content;

        if (typeof content === 'undefined') {
          return;
        }

        const typename = (content as { __typename: string }).__typename;
        const entryId = getEntryId(entry);

        if (typename === 'TimelineTimelineCursor') {
          bucket.cursors.push(normalizeCursor(content));
        } else if (typename === 'TimelineTimelineItem') {
          const itemContent = getItemContent(content);
          if (isTimelineTweetItem(itemContent)) {
            pushTweetFromContent(itemContent, bucket, entryId, language);
          } else if (itemContent?.__typename === 'TimelineTimelineCursor') {
            bucket.cursors.push(normalizeCursor(itemContent));
          }
        } else if (typename === 'TimelineTimelineModule') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (content as any).items?.forEach((item: { item: Record<string, unknown> }) => {
            const itemContent = getItemContent(item.item);
            if (isTimelineTweetItem(itemContent)) {
              pushTweetFromContent(itemContent, bucket, entryId, language);
            } else if (itemContent?.__typename === 'TimelineTimelineCursor') {
              bucket.cursors.push(normalizeCursor(itemContent));
            }
          });
        }
      });
    }
  });

  return bucket;
};

interface GraphQLConversationBucket {
  /** Top-level tweet-* entries: ancestor chain + focal tweet (+ tombstones). */
  chainOrdered: TwitterTimelinePiece[];
  chainTweets: GraphQLTwitterStatus[];
  /** Tweets inside conversationthread-* modules: actual replies */
  replyStatuses: GraphQLTwitterStatus[];
  cursors: GraphQLTimelineCursor[];
}

const pushConversationTimelineTweet = (
  itemContent:
    | GraphQLTimelineTweet
    | TweetTombstone
    | GraphQLTimelineCursor
    | GraphQLTweetWithVisibilityResults,
  bucket: GraphQLConversationBucket,
  target: 'chain' | 'reply',
  entryId?: string,
  language?: string
) => {
  if (!isTimelineTweetItem(itemContent)) return;
  const result = (itemContent as GraphQLTimelineTweet).tweet_results?.result;
  const entryType = result?.__typename;
  if (entryType === 'Tweet') {
    const tw = result as GraphQLTwitterStatus;
    if (target === 'chain') {
      bucket.chainTweets.push(tw);
      bucket.chainOrdered.push(tw);
    } else {
      bucket.replyStatuses.push(tw);
    }
  } else if (entryType === 'TweetWithVisibilityResults') {
    const tw = (result as GraphQLTweetWithVisibilityResults).tweet;
    if (target === 'chain') {
      bucket.chainTweets.push(tw);
      bucket.chainOrdered.push(tw);
    } else {
      bucket.replyStatuses.push(tw);
    }
  } else if (entryType === 'TweetTombstone' && target === 'chain') {
    const idHint = entryId?.match(/^tweet-(\d+)$/)?.[1];
    bucket.chainOrdered.push(
      twitterTweetTombstoneFromGraphQL(result as TweetTombstone, idHint, language)
    );
  }
};

/**
 * Processes TweetDetail / ConversationTimeline instructions while preserving
 * the structural distinction between the ancestor chain (top-level tweet-*
 * entries) and replies (conversationthread-* module entries).
 */
const processConversationResponse = (
  instructions: TimelineInstruction[],
  language?: string
): GraphQLConversationBucket => {
  const bucket: GraphQLConversationBucket = {
    chainOrdered: [],
    chainTweets: [],
    replyStatuses: [],
    cursors: []
  };

  instructions?.forEach?.(instruction => {
    const itype = getInstructionType(instruction);
    if (itype === 'TimelineAddEntries' || itype === 'TimelineAddToModule') {
      (
        (instruction as TimelineAddEntriesInstruction)?.entries ??
        (instruction as TimelineAddModulesInstruction)?.moduleItems
      )?.forEach(_entry => {
        const entry = _entry as
          GraphQLTimelineTweetEntry | GraphQLConversationThread | GraphQLModuleTweetEntry;
        const entryId = getEntryId(entry);
        const isReplyEntry = entryId?.startsWith('conversationthread-');

        const content =
          (entry as GraphQLModuleTweetEntry)?.item ?? (entry as GraphQLTimelineTweetEntry)?.content;

        if (typeof content === 'undefined') return;

        const typename = (content as { __typename: string }).__typename;

        if (typename === 'TimelineTimelineCursor') {
          bucket.cursors.push(normalizeCursor(content));
        } else if (typename === 'TimelineTimelineItem') {
          const itemContent = getItemContent(content);
          if (isTimelineTweetItem(itemContent)) {
            pushConversationTimelineTweet(
              itemContent,
              bucket,
              isReplyEntry ? 'reply' : 'chain',
              entryId,
              language
            );
          } else if (itemContent?.__typename === 'TimelineTimelineCursor') {
            bucket.cursors.push(normalizeCursor(itemContent));
          }
        } else if (typename === 'TimelineTimelineModule') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (content as any).items?.forEach((item: { item: Record<string, unknown> }) => {
            const itemContent = getItemContent(item.item);
            if (isTimelineTweetItem(itemContent)) {
              pushConversationTimelineTweet(itemContent, bucket, 'reply', entryId, language);
            } else if (itemContent?.__typename === 'TimelineTimelineCursor') {
              bucket.cursors.push(normalizeCursor(itemContent));
            }
          });
        }
      });
    }
  });

  return bucket;
};

/** Focal tweet from TweetDetail: real tweet in `statuses`, or a `TweetTombstone` row (only in `ordered`). */
const findFocalInBucket = (
  id: string,
  bucket: GraphQLProcessBucket
): GraphQLTwitterStatus | APIStatusTombstone | null => {
  const fromStatuses = bucket.statuses.find(s => (s.rest_id ?? s.legacy?.id_str) === id) as
    GraphQLTwitterStatus | undefined;
  if (fromStatuses) {
    return fromStatuses;
  }
  for (const piece of bucket.ordered) {
    if (isTombstone(piece) && piece.id === id) {
      return piece;
    }
  }
  return null;
};

const findNextStatus = (id: string, bucket: GraphQLProcessBucket): number => {
  const indices: number[] = [];
  bucket.statuses.forEach((status, index) => {
    if (status.legacy?.in_reply_to_status_id_str === id) {
      indices.push(index);
    }
  });
  if (indices.length === 0) return -1;
  if (indices.length === 1) return indices[0];
  /* Several author replies to the same tweet (side branches): follow timeline order, then snowflake. */
  indices.sort((a, b) => {
    const ai = timelineIndexOfGraphQLTweet(bucket.statuses[a], bucket.ordered);
    const bi = timelineIndexOfGraphQLTweet(bucket.statuses[b], bucket.ordered);
    if (ai !== bi) return ai - bi;
    const ida = bucket.statuses[a].rest_id ?? bucket.statuses[a].legacy?.id_str ?? '0';
    const idb = bucket.statuses[b].rest_id ?? bucket.statuses[b].legacy?.id_str ?? '0';
    return ida.localeCompare(idb, undefined, { numeric: true });
  });
  return indices[0];
};

const findPreviousStatus = (id: string, bucket: GraphQLProcessBucket): number => {
  const status = bucket.allStatuses.find(
    status => (status.rest_id ?? status.legacy?.id_str ?? status.legacy?.conversation_id_str) === id
  );
  if (!status) {
    console.log('uhhh, we could not even find that tweet, dunno how that happened');
    return -1;
  }
  if (
    (status.rest_id ?? status.legacy?.id_str ?? status.legacy?.conversation_id_str) ===
    status.legacy?.in_reply_to_status_id_str
  ) {
    console.log('Tweet does not have a parent');
    return 0;
  }
  return bucket.allStatuses.findIndex(
    _status =>
      (_status.rest_id ?? _status.legacy?.id_str ?? _status.legacy?.conversation_id_str) ===
      status.legacy?.in_reply_to_status_id_str
  );
};

const consolidateCursors = (
  oldCursors: GraphQLTimelineCursor[],
  newCursors: GraphQLTimelineCursor[]
): GraphQLTimelineCursor[] => {
  /* Update the Bottom/Top cursor with the new one if applicable. Otherwise, keep the old one */
  return oldCursors.map(cursor => {
    const newCursor = newCursors.find(_cursor => _cursor.cursorType === cursor.cursorType);
    if (newCursor) {
      return newCursor;
    }
    return cursor;
  });
};

const filterBucketStatuses = (tweets: GraphQLTwitterStatus[], original: GraphQLTwitterStatus) => {
  return tweets.filter(
    tweet =>
      tweet.core?.user_results?.result?.rest_id === original.core?.user_results?.result?.rest_id
  );
};

/**
 * Fetches a single status using the orchestrator with dynamic endpoint selection
 * @param id - Status ID to fetch
 * @param c - Hono context
 * @param processThread - Whether this is for thread processing (affects TweetDetail priority)
 * @returns The status response or null
 */
const fetchSingleStatus = async (
  id: string,
  host: TwitterBuildHost,
  processThread = false,
  language?: string
): Promise<
  | TweetDetailResponse
  | TweetResultByRestIdResponse
  | TweetResultsByIdsResponse
  | TweetResultsByRestIdsResponse
  | null
> => {
  // Determine weights based on context
  const isApiHost = (() => {
    try {
      const url = new URL(host.request?.url ?? 'https://localhost/');
      return getTwitterProviderEnv().apiHostList.includes(url.hostname);
    } catch (e) {
      console.error(e);
      return false;
    }
  })();

  const hasElongator = hasTwitterAccountProxy({
    TwitterProxy: host.twitterProxy,
    CREDENTIAL_KEY: host.credentialKey
  });

  const langHeaders = buildLanguageHeaders(language);

  // If account proxy is not available, only use TweetResultByRestId
  if (!hasElongator) {
    try {
      return await fetchByRestId(id, host, undefined, language);
    } catch (_e) {
      return null;
    }
  }

  // Build methods with dynamic weights
  const results = await graphQLOrchestrator(host, [
    {
      key: 'status',
      headers: langHeaders,
      methods: [
        {
          name: 'TweetDetail',
          query: TweetDetailQuery,
          weight: 150,
          fallbackOnly: !processThread,
          variables: { focalTweetId: id },
          validator: (response: unknown) => {
            const conversation = response as TweetDetailResponse;
            const instructions =
              conversation?.data?.threaded_conversation_with_injections_v2?.instructions;
            return Boolean(instructions && Array.isArray(instructions));
          }
        },
        {
          name: 'ConversationTimeline',
          query: ConversationTimelineQuery,
          weight: 150,
          fallbackOnly: !processThread,
          variables: { focal_tweet_id: id },
          validator: (response: unknown) => {
            const conversation = response as TweetDetailResponse;
            const instructions =
              conversation?.data?.threaded_conversation_with_injections_v2?.instructions;
            return Boolean(instructions && Array.isArray(instructions));
          }
        },
        {
          name: 'TweetResultByRestId',
          query: TweetResultByRestIdQuery,
          weight: 500,
          fallbackOnly: processThread,
          variables: { tweetId: id },
          validator: (response: unknown) => {
            const r = response as TweetResultByRestIdResponse;
            return Boolean(r?.data?.tweetResult?.result?.__typename);
          }
        },
        {
          name: 'TweetResultsByIdsQuery',
          query: TweetResultsByIdsQuery,
          weight: 500,
          fallbackOnly: processThread || isApiHost,
          variables: { rest_ids: [id] },
          validator: (response: unknown) => {
            const r = (response as TweetResultsByIdsResponse)?.data?.tweet_results?.[0]?.result as
              GraphQLTwitterStatus | TweetStub | undefined;
            return Boolean((r as GraphQLTwitterStatus)?.__typename || (r as TweetStub)?.reason);
          }
        },
        {
          name: 'TweetResultsByRestIds',
          query: TweetResultsByRestIdsQuery,
          weight: 500,
          fallbackOnly: processThread,
          variables: { tweetIds: [id] },
          validator: (response: unknown) => {
            const r = (response as TweetResultsByRestIdsResponse)?.data?.tweetResult?.[0]
              ?.result as GraphQLTwitterStatus | TweetStub | undefined;
            return Boolean((r as GraphQLTwitterStatus)?.__typename || (r as TweetStub)?.reason);
          }
        }
      ],
      required: true
    }
  ]);

  return results.status?.success
    ? (results.status.data as
        | TweetDetailResponse
        | TweetResultByRestIdResponse
        | TweetResultsByIdsResponse
        | TweetResultsByRestIdsResponse)
    : null;
};

/* Fetch and construct a Twitter thread */
export const constructTwitterThread = async (
  id: string,
  processThread = false,
  host: TwitterBuildHost,
  language: string | undefined,
  legacyAPI = false
): Promise<SocialThread> => {
  if (!isTwitterNumericStatusId(id)) {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  // Fetch status using orchestrator with appropriate method prioritization
  let response:
    | TweetDetailResponse
    | TweetResultByRestIdResponse
    | TweetResultsByRestIdsResponse
    | TweetResultsByIdsResponse
    | TweetResultByIdResponse
    | null = await fetchSingleStatus(id, host, processThread, language);
  let status: APITwitterStatus;

  if (!response) {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  // Check if we got TweetDetail response (for thread processing)
  const triedTweetDetail = !!(response as TweetDetailResponse)?.data
    ?.threaded_conversation_with_injections_v2;

  const isTweetDetailResponse = (
    resp:
      | TweetDetailResponse
      | TweetResultByRestIdResponse
      | TweetResultsByRestIdsResponse
      | TweetResultsByIdsResponse
      | TweetResultByIdResponse
      | null
  ) => {
    return (
      resp &&
      'data' in resp &&
      resp.data !== null &&
      'threaded_conversation_with_injections_v2' in (resp.data || {})
    );
  };

  if (response && response.data && !triedTweetDetail) {
    const result = getResultFromResponse(response);

    if (!result) {
      writeDataPoint(host, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
    }

    const buildStatus = await buildAPITwitterStatus(
      host,
      result,
      language,
      null,
      legacyAPI,
      true,
      'root',
      id
    );

    if (isTombstone(buildStatus)) {
      writeDataPoint(host, language, null, '404');
      return {
        status: await (host.withLocalizedTombstone ?? (async (t, _l) => t))(buildStatus, language),
        thread: null,
        author: null,
        code: 404
      };
    }

    if ((buildStatus as FetchResults)?.status === 401) {
      writeDataPoint(host, language, null, '401');
      return { status: null, thread: null, author: null, code: 401 };
    } else if (buildStatus === null || (buildStatus as FetchResults)?.status === 404) {
      writeDataPoint(host, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
    }

    status = await enrichArticleWithFullContent(
      host,
      buildStatus as APITwitterStatus,
      id,
      language,
      legacyAPI,
      true
    );

    // If not processing thread, return single tweet
    if (!processThread) {
      writeDataPoint(host, language, status.possibly_sensitive, '200');
      return { status: status, thread: null, author: status.author, code: 200 };
    } // If we need thread but have TweetResultByRestId response, try TweetDetail
    else if (
      hasTwitterAccountProxy({
        TwitterProxy: host.twitterProxy,
        CREDENTIAL_KEY: host.credentialKey
      })
    ) {
      console.log('Need thread data, trying TweetDetail...');
      if (host.tweetDetailApi) {
        const threadResponse = await fetchTweetDetail(host, id, null, undefined, language);
        if (threadResponse?.data) {
          response = threadResponse;
        }
      }
      // Return single tweet if TweetDetail fails; otherwise fall through to thread processing
      if (!isTweetDetailResponse(response)) {
        writeDataPoint(host, language, status.possibly_sensitive, '200');
        return { status: status, thread: null, author: status.author, code: 200 };
      }
    } else if (processThread) {
      // Can't process thread without TweetDetail
      writeDataPoint(host, language, status.possibly_sensitive, '200');
      return { status: status, thread: null, author: status.author, code: 200 };
    }
  }

  // Process TweetDetail response for thread data
  if (response && !isTweetDetailResponse(response)) {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  const bucket = processResponse(
    (response as TweetDetailResponse).data?.threaded_conversation_with_injections_v2
      ?.instructions ?? [],
    language
  );
  const originalPiece = findFocalInBucket(id, bucket);

  if (originalPiece === null) {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  if (isTombstone(originalPiece)) {
    writeDataPoint(host, language, null, '404');
    return {
      status: await (host.withLocalizedTombstone ?? (async (t, _l) => t))(originalPiece, language),
      thread: null,
      author: null,
      code: 404
    };
  }

  const originalStatus = originalPiece as GraphQLTwitterStatus;
  const builtFocal = await buildAPITwitterStatus(host, originalStatus, language, null, legacyAPI);

  if ((builtFocal as FetchResults)?.status === 401) {
    writeDataPoint(host, language, null, '401');
    return { status: null, thread: null, author: null, code: 401 };
  }
  if (builtFocal === null || (builtFocal as FetchResults)?.status === 404) {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }
  if (typeof builtFocal === 'object' && typeof (builtFocal as FetchResults).status === 'number') {
    writeDataPoint(host, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  if (isTombstone(builtFocal)) {
    writeDataPoint(host, language, null, '404');
    return {
      status: await (host.withLocalizedTombstone ?? (async (t, _l) => t))(builtFocal, language),
      thread: null,
      author: null,
      code: 404
    };
  }

  status = builtFocal as APITwitterStatus;

  status = await enrichArticleWithFullContent(host, status, id, language, legacyAPI, true);

  const author = status.author;

  /* If we're not processing threads, let's be done here */
  if (!processThread) {
    writeDataPoint(host, language, status.possibly_sensitive, '200');
    return { status: status, thread: null, author: author, code: 200 };
  }

  const threadStatuses = [originalStatus];
  bucket.allStatuses = bucket.statuses;
  bucket.statuses = filterBucketStatuses(bucket.statuses, originalStatus);

  let currentId = id;

  /* Process tweets that are following the current one in the thread */
  while (findNextStatus(currentId, bucket) !== -1) {
    const index = findNextStatus(currentId, bucket);
    const tweet = bucket.statuses[index];

    const newCurrentId = tweet.rest_id ?? tweet.legacy?.id_str;

    console.log(
      'adding next tweet to thread',
      newCurrentId,
      'from',
      currentId,
      'at index',
      index,
      'in bucket'
    );

    threadStatuses.push(tweet);

    currentId = newCurrentId;

    console.log('Current index', index, 'of', bucket.statuses.length);

    /* Reached the end of the current list of statuses in thread) */
    if (index >= bucket.statuses.length - 1) {
      /* See if we have a cursor to fetch more statuses */
      const cursor = bucket.cursors.find(
        cursor => cursor.cursorType === 'Bottom' || cursor.cursorType === 'ShowMore'
      );
      console.log('current cursors: ', bucket.cursors);
      if (!cursor) {
        console.log('No cursor present, stopping pagination down');
        break;
      }
      console.log('Cursor present, fetching more tweets down');

      let loadCursor: TweetDetailResponse;

      try {
        loadCursor = await fetchTweetDetail(host, id, cursor.value, undefined, language);

        if (
          typeof loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ===
          'undefined'
        ) {
          console.log('Unknown data while fetching cursor', loadCursor);
          break;
        }
      } catch (e) {
        console.log('Error fetching cursor', e);
        break;
      }

      const cursorResponse = processResponse(
        loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ?? [],
        language
      );
      bucket.statuses = bucket.statuses.concat(
        filterBucketStatuses(cursorResponse.statuses, originalStatus)
      );
      bucket.ordered = bucket.ordered.concat(cursorResponse.ordered);
      /* Remove old cursor and add new bottom cursor if necessary */
      consolidateCursors(bucket.cursors, cursorResponse.cursors);
      console.log('updated bucket of cursors', bucket.cursors);
    }

    console.log('Preview of next status:', findNextStatus(currentId, bucket));
  }

  currentId = id;

  while (findPreviousStatus(currentId, bucket) !== -1) {
    const index = findPreviousStatus(currentId, bucket);
    const status = bucket.allStatuses[index];
    const newCurrentId =
      status.rest_id ?? status.legacy?.id_str ?? status.legacy?.conversation_id_str;

    console.log(
      'adding previous status to thread',
      newCurrentId,
      'from',
      currentId,
      'at index',
      index,
      'in bucket'
    );

    threadStatuses.unshift(status);

    currentId = newCurrentId;

    if (index === 0) {
      /* See if we have a cursor to fetch more statuses */
      const cursor = bucket.cursors.find(
        cursor => cursor.cursorType === 'Top' || cursor.cursorType === 'ShowMore'
      );
      console.log('current cursors: ', bucket.cursors);
      if (!cursor) {
        console.log('No cursor present, stopping pagination up');
        break;
      }
      console.log('Cursor present, fetching more statuses up');

      let loadCursor: TweetDetailResponse;

      try {
        loadCursor = await fetchTweetDetail(host, id, cursor.value, undefined, language);

        if (
          typeof loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ===
          'undefined'
        ) {
          console.log('Unknown data while fetching cursor', loadCursor);
          break;
        }
      } catch (e) {
        console.log('Error fetching cursor', e);
        break;
      }
      const cursorResponse = processResponse(
        loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ?? [],
        language
      );
      bucket.statuses = cursorResponse.statuses.concat(
        filterBucketStatuses(bucket.statuses, originalStatus)
      );
      bucket.ordered = cursorResponse.ordered.concat(bucket.ordered);
      /* Remove old cursor and add new top cursor if necessary */
      consolidateCursors(bucket.cursors, cursorResponse.cursors);

      // console.log('updated bucket of statuses', bucket.statuses);
      console.log('updated bucket of cursors', bucket.cursors);
    }

    console.log('Preview of previous status:', findPreviousStatus(currentId, bucket));
  }

  const socialThread: SocialThread = {
    status: status,
    thread: [],
    author: author,
    code: 200
  };

  const chainForMerge = mergeWalkedChainWithThreadRootFromOrdered(
    bucket.ordered,
    threadStatuses,
    originalStatus
  );
  const mergedTimeline = mergeTimelineOrderPreservingTombstones(
    bucket.ordered,
    chainForMerge,
    bucket.allStatuses
  );

  const mergedThreadResults = await Promise.all(
    mergedTimeline.map(async piece => {
      if (isTombstone(piece)) {
        return piece;
      }
      const graphqlStatus = piece as GraphQLTwitterStatus;
      const tweetId = graphqlStatus.rest_id ?? graphqlStatus.legacy?.id_str ?? '';
      if (tweetId === id) {
        return status;
      }
      const built = await buildAPITwitterStatus(
        host,
        graphqlStatus,
        language,
        author,
        legacyAPI,
        true,
        'thread'
      );
      if (isTombstone(built)) {
        return built;
      }
      if ((built as FetchResults)?.status || built === null) {
        return null;
      }
      let builtStatus = built as APITwitterStatus;
      builtStatus = await enrichArticleWithFullContent(
        host,
        builtStatus,
        tweetId,
        language,
        legacyAPI,
        true
      );
      return builtStatus;
    })
  );

  for (const entry of mergedThreadResults) {
    if (entry !== null) {
      socialThread.thread?.push(entry);
    }
  }

  if (legacyAPI) {
    stripTombstones(socialThread);
  }

  return socialThread;
};

/* Fetch and construct a conversation view: full ancestor chain + replies from others */
export const constructTwitterConversation = async (
  id: string,
  host: TwitterBuildHost,
  rankingMode: TweetDetailRankingMode = 'Likes',
  cursor: string | null = null,
  language?: string
): Promise<SocialConversation> => {
  if (!isTwitterNumericStatusId(id)) {
    return { status: null, thread: null, replies: null, author: null, cursor: null, code: 404 };
  }

  const response = await fetchTweetDetail(host, id, cursor, rankingMode, language);

  if (!response?.data?.threaded_conversation_with_injections_v2?.instructions) {
    return { status: null, thread: null, replies: null, author: null, cursor: null, code: 404 };
  }

  const bucket = processConversationResponse(
    response.data.threaded_conversation_with_injections_v2.instructions,
    language
  );

  const fromChain = bucket.chainTweets.find(s => (s.rest_id ?? s.legacy?.id_str) === id) ?? null;
  const fromOrderedTomb =
    fromChain === null
      ? (bucket.chainOrdered.find((p): p is APIStatusTombstone => isTombstone(p) && p.id === id) ??
        null)
      : null;

  if (fromOrderedTomb) {
    return {
      status: await (host.withLocalizedTombstone ?? (async (t, _l) => t))(
        fromOrderedTomb,
        language
      ),
      thread: null,
      replies: null,
      author: null,
      cursor: null,
      code: 404
    };
  }

  if (fromChain === null) {
    return { status: null, thread: null, replies: null, author: null, cursor: null, code: 404 };
  }

  const originalStatus = fromChain;
  const built = await buildAPITwitterStatus(host, originalStatus, language, null, false, false);
  if (isTombstone(built)) {
    return {
      status: await (host.withLocalizedTombstone ?? (async (t, _l) => t))(built, language),
      thread: null,
      replies: null,
      author: null,
      cursor: null,
      code: 404
    };
  }
  if ((built as FetchResults)?.status === 401) {
    return { status: null, thread: null, replies: null, author: null, cursor: null, code: 401 };
  }
  if (built === null || (built as FetchResults)?.status === 404) {
    return { status: null, thread: null, replies: null, author: null, cursor: null, code: 404 };
  }

  let status = built as APITwitterStatus;
  status = await enrichArticleWithFullContent(host, status, id, language, false, false);

  const author = status.author;

  /*
   * Thread = all chain tweets (ancestor chain from TweetDetail top-level entries),
   * preserving `TweetTombstone` rows. On cursor pages, only the focal tweet.
   */
  const threadPieces: TwitterTimelinePiece[] = cursor
    ? [originalStatus]
    : mergeTimelineOrderPreservingTombstones(bucket.chainOrdered, bucket.chainTweets);

  /* Build the thread */
  const socialConversation: SocialConversation = {
    status: status,
    thread: [],
    replies: [],
    author: author,
    cursor: null,
    code: 200
  };

  const conversationThreadResults = await Promise.all(
    threadPieces.map(async piece => {
      if (isTombstone(piece)) {
        return piece;
      }
      const s = piece as GraphQLTwitterStatus;
      const tweetId = s.rest_id ?? s.legacy?.id_str ?? '';
      if (tweetId === id) {
        return status;
      }
      const built = await buildAPITwitterStatus(host, s, language, author, false, false, 'thread');
      if (isTombstone(built)) {
        return built;
      }
      if ((built as FetchResults)?.status || built === null) {
        return null;
      }
      let builtStatus = built as APITwitterStatus;
      builtStatus = await enrichArticleWithFullContent(
        host,
        builtStatus,
        tweetId,
        language,
        false,
        false
      );
      return builtStatus;
    })
  );

  for (const entry of conversationThreadResults) {
    if (entry !== null) {
      socialConversation.thread?.push(entry);
    }
  }

  /* Build the replies (from conversationthread-* modules) */
  await Promise.all(
    bucket.replyStatuses.map(async s => {
      const tweetId = s.rest_id ?? s.legacy?.id_str ?? '';
      let builtStatus = (await buildAPITwitterStatus(
        host,
        s,
        language,
        null,
        false,
        false
      )) as APITwitterStatus;
      if (builtStatus) {
        builtStatus = await enrichArticleWithFullContent(
          host,
          builtStatus,
          tweetId,
          language,
          false,
          false
        );
        socialConversation.replies?.push(builtStatus);
      }
    })
  );

  /* Expose the bottom cursor for reply pagination */
  const bottomCursor = bucket.cursors.find(
    c => c.cursorType === 'Bottom' || c.cursorType === 'ShowMore'
  );
  if (bottomCursor) {
    socialConversation.cursor = { bottom: bottomCursor.value };
  }

  return socialConversation;
};
