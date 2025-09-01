import { Constants } from '../../constants';
import { buildAPITwitterStatus } from './processor';
import { Experiment, experimentCheck } from '../../experiments';
import { isGraphQLTwitterStatus } from '../../helpers/graphql';
import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { APITwitterStatus, FetchResults, InputFlags, SocialThread } from '../../types/types';
import {
  TweetDetailQuery,
  TweetResultByIdQuery,
  TweetResultByRestIdQuery,
  TweetResultsByIdsQuery,
  TweetResultsByRestIdsQuery
} from './graphql/queries';
import { graphqlRequest } from './graphql/request';
import { tryBalancedEndpoints, BalancedEndpoint } from '../../helpers/endpointBalancing';

const extractNsfwDetected = (
  response:
    | TweetResultByRestIdResponse
    | TweetResultsByRestIdsResponse
    | TweetResultsByIdsResponse
    | TweetResultByIdResponse
    | TweetDetailResponse
    | null
): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((response as any)?.__fxembed_nsfw_detected);
};

const writeDataPoint = (
  c: Context,
  language: string | undefined,
  nsfw: boolean | null,
  returnCode: string,
  flags?: InputFlags
) => {
  console.log('Writing data point...');
  if (typeof c.env?.AnalyticsEngine !== 'undefined') {
    const flagString =
      Object.keys(flags || {})
        // @ts-expect-error - TypeScript doesn't like iterating over the keys, but that's OK
        .filter(flag => flags?.[flag])[0] || 'standard';

    console.log(flagString);

    c.env?.AnalyticsEngine.writeDataPoint({
      blobs: [
        c.req.raw.cf?.colo as string /* Datacenter location */,
        c.req.raw.cf?.country as string /* Country code */,
        c.req.header('user-agent') ?? '' /* User agent (for aggregating bots calling) */,
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

export const fetchTweetDetail = async (
  c: Context,
  status: string,
  cursor: string | null = null
): Promise<TweetDetailResponse> => {
  return graphqlRequest(c, {
    query: TweetDetailQuery,
    validator: (_conversation: unknown) => {
      const conversation = _conversation as TweetDetailResponse;
      const response = processResponse(
        conversation?.data?.threaded_conversation_with_injections_v2?.instructions
      );
      const tweet = findStatusInBucket(status, response);
      if (tweet && isGraphQLTwitterStatus(tweet)) {
        return true;
      }
      console.log('invalid graphql tweet', tweet);
      console.log('finding status', status);
      console.log('from response', JSON.stringify(response));

      return Array.isArray(conversation?.errors);
    },
    variables: {
      focalTweetId: status,
      cursor: cursor
    }
  }) as Promise<TweetDetailResponse>;
};

export const fetchByRestId = async (
  status: string,
  c: Context,
  useElongator = experimentCheck(
    Experiment.ELONGATOR_BY_DEFAULT,
    typeof c.env?.TwitterProxy !== 'undefined'
  )
): Promise<TweetResultByRestIdResponse> => {
  return graphqlRequest(c, {
    query: TweetResultByRestIdQuery,
    variables: {
      tweetId: status
    },
    useElongator: useElongator,
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
  c: Context,
  useElongator = experimentCheck(
    Experiment.ELONGATOR_BY_DEFAULT,
    typeof c.env?.TwitterProxy !== 'undefined'
  )
): Promise<TweetResultsByRestIdsResponse> => {
  return graphqlRequest(c, {
    query: TweetResultsByRestIdsQuery,
    variables: {
      tweetIds: statuses
    },
    useElongator: useElongator,
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

export const fetchByIds = async (
  statuses: string[],
  c: Context,
  useElongator = experimentCheck(
    Experiment.ELONGATOR_BY_DEFAULT,
    typeof c.env?.TwitterProxy !== 'undefined'
  )
): Promise<TweetResultsByIdsResponse> => {
  return graphqlRequest(c, {
    query: TweetResultsByIdsQuery,
    variables: {
      rest_ids: statuses
    },
    useElongator: useElongator,
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
  c: Context,
  useElongator = experimentCheck(
    Experiment.ELONGATOR_BY_DEFAULT,
    typeof c.env?.TwitterProxy !== 'undefined'
  )
): Promise<TweetResultByIdResponse> => {
  return graphqlRequest(c, {
    query: TweetResultByIdQuery,
    variables: {
      rest_id: status
    },
    useElongator: useElongator,
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

const processResponse = (instructions: ThreadInstruction[]): GraphQLProcessBucket => {
  const bucket: GraphQLProcessBucket = {
    statuses: [],
    allStatuses: [],
    cursors: []
  };
  instructions?.forEach?.(instruction => {
    if (instruction.type === 'TimelineAddEntries' || instruction.type === 'TimelineAddToModule') {
      // @ts-expect-error Use entries or moduleItems depending on the type
      (instruction?.entries ?? instruction?.moduleItems)?.forEach(_entry => {
        const entry = _entry as
          | GraphQLTimelineTweetEntry
          | GraphQLConversationThread
          | GraphQLModuleTweetEntry;
        const content =
          (entry as GraphQLModuleTweetEntry)?.item ?? (entry as GraphQLTimelineTweetEntry)?.content;

        if (typeof content === 'undefined') {
          return;
        }
        if (content.__typename === 'TimelineTimelineItem') {
          const itemContentType = content.itemContent?.__typename;
          if (itemContentType === 'TimelineTweet') {
            const entryType = content.itemContent.tweet_results.result?.__typename;
            if (entryType === 'Tweet') {
              bucket.statuses.push(
                content.itemContent.tweet_results.result as GraphQLTwitterStatus
              );
            }
            if (entryType === 'TweetWithVisibilityResults') {
              bucket.statuses.push(
                content.itemContent.tweet_results.result.tweet as GraphQLTwitterStatus
              );
            }
          } else if (itemContentType === 'TimelineTimelineCursor') {
            bucket.cursors.push(content.itemContent as GraphQLTimelineCursor);
          }
        } else if (
          (content as unknown as GraphQLTimelineModule).__typename === 'TimelineTimelineModule'
        ) {
          content.items.forEach(item => {
            const itemContentType = item.item.itemContent.__typename;
            if (itemContentType === 'TimelineTweet') {
              const entryType = item.item.itemContent.tweet_results?.result?.__typename;
              if (entryType === 'Tweet') {
                bucket.statuses.push(
                  item.item.itemContent.tweet_results.result as GraphQLTwitterStatus
                );
              }
              if (entryType === 'TweetWithVisibilityResults') {
                bucket.statuses.push(
                  item.item.itemContent.tweet_results.result.tweet as GraphQLTwitterStatus
                );
              }
            } else if (itemContentType === 'TimelineTimelineCursor') {
              bucket.cursors.push(item.item.itemContent as GraphQLTimelineCursor);
            }
          });
        }
      });
    }
  });

  return bucket;
};

const findStatusInBucket = (
  id: string,
  bucket: GraphQLProcessBucket
): GraphQLTwitterStatus | null => {
  return bucket.statuses.find(status => (status.rest_id ?? status.legacy?.id_str) === id) ?? null;
};

const findNextStatus = (id: string, bucket: GraphQLProcessBucket): number => {
  return bucket.statuses.findIndex(status => status.legacy?.in_reply_to_status_id_str === id);
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

const fetchSingleStatus = async (
  id: string,
  c: Context
): Promise<
  TweetResultByRestIdResponse | TweetResultsByIdsResponse | TweetResultsByRestIdsResponse | null
> => {
  const endpoints: BalancedEndpoint<
    TweetResultByRestIdResponse | TweetResultsByIdsResponse | TweetResultsByRestIdsResponse
  >[] = [
    {
      name: 'TweetResultByRestId',
      weight: 50,
      handler: () => fetchByRestId(id, c),
      resultCheck: (
        response:
          | TweetResultByRestIdResponse
          | TweetResultsByIdsResponse
          | TweetResultsByRestIdsResponse
      ) => Boolean((response as TweetResultByRestIdResponse)?.data?.tweetResult?.result?.__typename)
    },
    {
      name: 'TweetResultsByIds',
      weight: 500,
      handler: () => fetchByIds([id], c),
      resultCheck: (
        response:
          | TweetResultByRestIdResponse
          | TweetResultsByIdsResponse
          | TweetResultsByRestIdsResponse
      ) => {
        const r = (response as TweetResultsByIdsResponse)?.data?.tweet_results?.[0]?.result as
          | GraphQLTwitterStatus
          | TweetStub
          | undefined;
        return Boolean((r as GraphQLTwitterStatus)?.__typename || (r as TweetStub)?.reason);
      }
    },
    {
      name: 'TweetResultsByRestIds',
      weight: 500,
      handler: () => fetchByRestIds([id], c),
      resultCheck: (
        response:
          | TweetResultByRestIdResponse
          | TweetResultsByIdsResponse
          | TweetResultsByRestIdsResponse
      ) => {
        const r = (response as TweetResultsByRestIdsResponse)?.data?.tweetResult?.[0]?.result as
          | GraphQLTwitterStatus
          | TweetStub
          | undefined;
        return Boolean((r as GraphQLTwitterStatus)?.__typename || (r as TweetStub)?.reason);
      }
    }
  ];

  try {
    const url = new URL(c.req.url);
    if (Constants.API_HOST_LIST.includes(url.hostname)) {
      for (const endpoint of endpoints) {
        if (endpoint.name === 'TweetResultsByIds') {
          endpoint.weight = 0;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (
    !experimentCheck(Experiment.ELONGATOR_BY_DEFAULT, typeof c.env?.TwitterProxy !== 'undefined')
  ) {
    const single = endpoints.find(e => e.name === 'TweetResultByRestId');
    if (!single) return null;
    try {
      const response = await single.handler();
      return single.resultCheck(response) ? response : null;
    } catch (_e) {
      return null;
    }
  }

  return tryBalancedEndpoints(endpoints);
};

/* Fetch and construct a Twitter thread */
export const constructTwitterThread = async (
  id: string,
  processThread = false,
  c: Context,
  language: string | undefined,
  legacyAPI = false
): Promise<SocialThread> => {
  console.log('language', language);

  let response:
    | TweetDetailResponse
    | TweetResultByRestIdResponse
    | TweetResultsByRestIdsResponse
    | TweetResultsByIdsResponse
    | TweetResultByIdResponse
    | null = null;
  let status: APITwitterStatus;

  // Try TweetDetail first under these conditions
  const tryTweetDetailFirst = typeof c.env?.TwitterProxy !== 'undefined' && processThread;
  let triedTweetDetail = false;

  // First attempt with preferred API
  if (tryTweetDetailFirst) {
    triedTweetDetail = true;
    console.log('Using TweetDetail for primary request...');
    try {
      response = (await fetchTweetDetail(c, id)) as TweetDetailResponse;
    } catch (e) {
      console.log('Error fetching TweetDetail', e);
    }

    // If TweetDetail failed, try one of the single status queries as fallback
    if (!response?.data) {
      console.log('TweetDetail failed, falling back to single status...');
      response = await fetchSingleStatus(id, c);

      // If both APIs failed, return 404
      if (!getResultFromResponse(response)) {
        console.log('Single status failed, returning 404');
        writeDataPoint(c, language, null, '404');
        return { status: null, thread: null, author: null, code: 404 };
      }

      let result: GraphQLTwitterStatus | null = null;
      result = getResultFromResponse(response);
      if (!result) {
        writeDataPoint(c, language, null, '404');
        return { status: null, thread: null, author: null, code: 404 };
      }

      const nsfwDetected = extractNsfwDetected(response);
      const buildStatus = await buildAPITwitterStatus(
        c,
        result,
        language,
        null,
        legacyAPI,
        nsfwDetected
      );
      if (buildStatus === null) {
        writeDataPoint(c, language, null, '404');
        return { status: null, thread: null, author: null, code: 404 };
      }

      status = buildStatus as APITwitterStatus;

      // If not processing thread, return single tweet
      return { status: status, thread: null, author: status.author, code: 200 };
    }
  } else {
    // Start with TweetResultByRestId
    // console.log('Using TweetResultByRestId for primary request...');
    // response = (await fetchByRestId(id, c)) as TweetResultByRestIdResponse;
    response = (await fetchSingleStatus(id, c)) as TweetResultByRestIdResponse;

    let result: GraphQLTwitterStatus | null = null;
    result = getResultFromResponse(response);
    // console.log('result', JSON.stringify(result));
    // If TweetResultByRestId failed and we have TwitterProxy available, try TweetDetail as fallback
    if (!result && typeof c.env?.TwitterProxy !== 'undefined') {
      // console.log('TweetResultByRestId failed, falling back to TweetDetail...');
      console.log('Single tweet fetch failed');
      // response = (await fetchTweetDetail(c, id)) as TweetDetailResponse;
      // triedTweetDetail = true;
      // If both APIs failed, return 404
      // if (!response?.data) {
      writeDataPoint(c, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
      // }
    } else if (!result) {
      // No fallback available or both failed
      writeDataPoint(c, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
    }
  }

  if (response && response.data && !triedTweetDetail) {
    let result: GraphQLTwitterStatus | null = null;
    result = getResultFromResponse(response);

    if (!result) {
      writeDataPoint(c, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
    }

    const nsfwDetected = extractNsfwDetected(response);
    const buildStatus = await buildAPITwitterStatus(
      c,
      result,
      language,
      null,
      legacyAPI,
      nsfwDetected
    );

    if ((buildStatus as FetchResults)?.status === 401) {
      writeDataPoint(c, language, null, '401');
      return { status: null, thread: null, author: null, code: 401 };
    } else if (buildStatus === null || (buildStatus as FetchResults)?.status === 404) {
      writeDataPoint(c, language, null, '404');
      return { status: null, thread: null, author: null, code: 404 };
    }

    status = buildStatus as APITwitterStatus;

    // If not processing thread, return single tweet
    if (!processThread) {
      writeDataPoint(c, language, status.possibly_sensitive, '200');
      return { status: status, thread: null, author: status.author, code: 200 };
    }

    // If we need thread but have TweetResultByRestId response, try TweetDetail
    if (processThread && typeof c.env?.TwitterProxy !== 'undefined') {
      console.log('Need thread data, trying TweetDetail...');
      const threadResponse = (await fetchTweetDetail(c, id)) as TweetDetailResponse;
      if (threadResponse?.data) {
        response = threadResponse;
      } else {
        // Return single tweet if TweetDetail fails
        writeDataPoint(c, language, status.possibly_sensitive, '200');
        return { status: status, thread: null, author: status.author, code: 200 };
      }
    } else if (processThread) {
      // Can't process thread without TweetDetail
      writeDataPoint(c, language, status.possibly_sensitive, '200');
      return { status: status, thread: null, author: status.author, code: 200 };
    }
  }

  // Process TweetDetail response for thread data
  // Type guard to ensure we're working with TweetDetailResponse
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

  if (response && !isTweetDetailResponse(response)) {
    writeDataPoint(c, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  const bucket = processResponse(
    (response as TweetDetailResponse).data?.threaded_conversation_with_injections_v2
      ?.instructions ?? []
  );
  const originalStatus = findStatusInBucket(id, bucket);

  /* Don't bother processing thread on a null tweet */
  if (originalStatus === null) {
    writeDataPoint(c, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  const nsfwDetected = extractNsfwDetected(response);
  status = (await buildAPITwitterStatus(
    c,
    originalStatus,
    undefined,
    null,
    legacyAPI,
    nsfwDetected
  )) as APITwitterStatus;

  if (status === null) {
    writeDataPoint(c, language, null, '404');
    return { status: null, thread: null, author: null, code: 404 };
  }

  const author = status.author;

  /* If we're not processing threads, let's be done here */
  if (!processThread) {
    writeDataPoint(c, language, status.possibly_sensitive, '200');
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
        loadCursor = await fetchTweetDetail(c, id, cursor.value);

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
        loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ?? []
      );
      bucket.statuses = bucket.statuses.concat(
        filterBucketStatuses(cursorResponse.statuses, originalStatus)
      );
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
        loadCursor = await fetchTweetDetail(c, id, cursor.value);

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
        loadCursor?.data?.threaded_conversation_with_injections_v2?.instructions ?? []
      );
      bucket.statuses = cursorResponse.statuses.concat(
        filterBucketStatuses(bucket.statuses, originalStatus)
      );
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

  await Promise.all(
    threadStatuses.map(async status => {
      const builtStatus = (await buildAPITwitterStatus(
        c,
        status,
        undefined,
        author,
        false,
        nsfwDetected
      )) as APITwitterStatus;
      socialThread.thread?.push(builtStatus);
    })
  );

  // Sort socialThread.thread by id converted to bigint
  socialThread.thread?.sort((a, b) => {
    const aId = BigInt(a.id);
    const bId = BigInt(b.id);
    if (aId < bId) {
      return -1;
    }
    if (aId > bId) {
      return 1;
    }
    return 0;
  });

  return socialThread;
};

export const threadAPIProvider = async (c: Context) => {
  const id = c.req.param('id') as string;

  const processedResponse = await constructTwitterThread(id, true, c, undefined);

  // Add every header from Constants.API_RESPONSE_HEADERS
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  return c.json(processedResponse, processedResponse.code as ContentfulStatusCode);
};
