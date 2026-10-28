import { buildAPITwitterStatus } from './processor.js';
import {
  FollowersByUserIDTimelineQuery,
  FollowersQuery,
  FollowingByUserIDTimelineQuery,
  FollowingQuery,
  ProfileArticlesTimelineQuery,
  ProfileTimelineQuery,
  ProfileWithRepliesTimelineQuery,
  UserArticlesTweetsQuery,
  UserMediaQuery,
  UserTweetsAndRepliesQuery,
  UserTweetsQuery
} from './graphql/queries.js';
import { graphQLOrchestrator } from './graphql/orchestrator.js';
import {
  getFollowersFollowingInstructions,
  getProfileArticlesTimelineInstructions,
  getProfileStatusesTimelineInstructions,
  validateFollowersByUserIDTimelineResponse,
  validateFollowingByUserIDTimelineResponse,
  validateProfileArticlesTimelineResponse,
  validateProfileTimelineResponse,
  validateProfileWithRepliesTimelineResponse,
  validateUserArticlesTweetsResponse,
  validateUserMediaTimelineResponse,
  validateUserTweetsTimeline
} from './graphql/validators.js';
import { buildLanguageHeaders } from '../../helpers/language.js';
import { isTombstone } from '../../helpers/tombstone.js';
import {
  convertToApiUser,
  getTwitterUserRestIdByScreenName,
  type ProfileHandleOrId
} from './profile.js';
import {
  processTimelineInstructions,
  processGroupedTimelineInstructions,
  processUserRelationshipTimelineInstructions
} from './search.js';
import type { FetchResults } from '../../types/fetch-results.js';
import type { TwitterBuildHost } from './build-host.js';
import type {
  APIProfileRelationshipList,
  APIGroupedSearchResults,
  APISearchResults,
  APITwitterStatus,
  TimelineEntryTwitter
} from '../../types/api-schemas.js';

export const profileStatusesAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost,
  withReplies = false,
  language?: string,
  groupThreads = false
): Promise<APISearchResults | APIGroupedSearchResults> => {
  const userId =
    handleOrId.type === 'userId'
      ? handleOrId.value
      : await getTwitterUserRestIdByScreenName(host, handleOrId.value);
  if (!userId) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const results = await graphQLOrchestrator(host, [
    {
      key: 'tweets',
      required: true,
      headers: buildLanguageHeaders(language),
      methods: withReplies
        ? [
            {
              name: 'ProfileWithRepliesTimeline',
              query: ProfileWithRepliesTimelineQuery,
              weight: 10,
              validator: validateProfileWithRepliesTimelineResponse
            },
            {
              name: 'UserTweetsAndReplies',
              query: UserTweetsAndRepliesQuery,
              weight: 1,
              validator: validateUserTweetsTimeline
            }
          ]
        : [
            {
              name: 'ProfileTimeline',
              query: ProfileTimelineQuery,
              weight: 10,
              validator: validateProfileTimelineResponse
            },
            {
              name: 'UserTweets',
              query: UserTweetsQuery,
              weight: 1,
              validator: validateUserTweetsTimeline
            }
          ],
      variables: {
        userId,
        rest_id: userId,
        count,
        cursor: cursor ?? null
      }
    }
  ]);

  if (!results.tweets?.success) {
    console.error('Profile statuses timeline request failed', results.tweets?.error);
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const instructions = getProfileStatusesTimelineInstructions(results.tweets.data);
  if (!instructions) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  if (groupThreads) {
    const { entries, cursors } = processGroupedTimelineInstructions(instructions);
    const topCursor = cursors.find(cur => cur.cursorType === 'Top')?.value ?? null;
    const bottomCursor = cursors.find(cur => cur.cursorType === 'Bottom')?.value ?? null;

    const builtResults = (
      await Promise.all(
        entries.map(async (e): Promise<TimelineEntryTwitter | null> => {
          if (e.kind === 'status') {
            const s = await buildAPITwitterStatus(
              host,
              e.status,
              language,
              null,
              false,
              false
            ).catch(err => {
              console.error('Error building status', err);
              return null;
            });
            return s !== null && !isTombstone(s) && !(s as FetchResults)?.status ? s : null;
          }
          const built = (
            await Promise.all(
              e.statuses.map(st =>
                buildAPITwitterStatus(host, st, language, null, false, false).catch(err => {
                  console.error('Error building status', err);
                  return null;
                })
              )
            )
          ).filter(
            (s): s is APITwitterStatus =>
              s !== null && !isTombstone(s) && !(s as FetchResults)?.status
          );

          if (built.length === 0) return null;

          if (built.length === 1 && (!e.all_status_ids || e.all_status_ids.length <= 1)) {
            return built[0];
          }

          const allIds = e.all_status_ids;
          const truncated = allIds !== undefined && allIds.length > built.length;

          return {
            type: 'thread' as const,
            conversation_id: e.conversation_id,
            statuses: built,
            truncated,
            ...(allIds && allIds.length > 0 ? { all_status_ids: allIds } : {})
          };
        })
      )
    ).filter((x): x is TimelineEntryTwitter => x !== null);

    return {
      code: 200,
      results: builtResults,
      cursor: {
        top: topCursor,
        bottom: bottomCursor
      }
    };
  }

  const { statuses, cursors } = processTimelineInstructions(instructions);
  const topCursor = cursors.find(cur => cur.cursorType === 'Top')?.value ?? null;
  const bottomCursor = cursors.find(cur => cur.cursorType === 'Bottom')?.value ?? null;

  const builtStatuses = (
    await Promise.all(
      statuses.map(status =>
        buildAPITwitterStatus(host, status, language, null, false, false).catch(err => {
          console.error('Error building status', err);
          return null;
        })
      )
    )
  ).filter(
    (s): s is APITwitterStatus => s !== null && !isTombstone(s) && !(s as FetchResults)?.status
  );

  return {
    code: 200,
    results: builtStatuses,
    cursor: {
      top: topCursor,
      bottom: bottomCursor
    }
  };
};

/**
 * The media tab timeline mixes replies in with the author's own posts; `in_reply_to_status_id_str`
 * is the same marker the processor uses to populate `replying_to`.
 */
const isReplyStatus = (status: GraphQLTwitterStatus): boolean =>
  Boolean(
    status.legacy?.in_reply_to_status_id_str || status.tweet?.legacy?.in_reply_to_status_id_str
  );

/** Max timeline pages to merge for feeds (100 posts × ~20/slice → cap rounds). */
const PROFILE_STATUSES_FEED_MAX_PAGES = 10;

const PROFILE_STATUSES_FEED_PER_PAGE = 100;
const PROFILE_STATUSES_FEED_TARGET_CAP = 100;

async function paginateAndMerge(
  fetchPage: (cursor: string | null) => Promise<APISearchResults>,
  target: number,
  maxPages = PROFILE_STATUSES_FEED_MAX_PAGES,
  options: { stopOnEmptyPage?: boolean } = {}
): Promise<APISearchResults> {
  const merged: APITwitterStatus[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let lastCursors: APISearchResults['cursor'] = { top: null, bottom: null };
  let pages = 0;
  let anySuccessfulPage = false;

  while (merged.length < target && pages < maxPages) {
    pages += 1;
    const page = await fetchPage(cursor);

    if (page.code === 404) {
      if (merged.length === 0) {
        return page;
      }
      break;
    }

    if (page.code !== 200) {
      if (merged.length === 0) {
        return page;
      }
      break;
    }

    anySuccessfulPage = true;
    lastCursors = page.cursor;

    if (options.stopOnEmptyPage !== false && page.results.length === 0) {
      break;
    }

    for (const s of page.results) {
      if (seenIds.has(s.id)) continue;
      seenIds.add(s.id);
      merged.push(s);
      if (merged.length >= target) break;
    }

    if (merged.length >= target) break;

    const bottom = page.cursor.bottom;
    if (!bottom || bottom === cursor) break;
    cursor = bottom;
  }

  if (merged.length === 0) {
    if (anySuccessfulPage) {
      return { code: 200, results: [], cursor: { top: null, bottom: null } };
    }
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  return {
    code: 200,
    results: merged.slice(0, target),
    cursor: lastCursors
  };
}

/**
 * Fetches up to `maxTotal` statuses (cap 100) by walking `cursor.bottom` across
 * multiple `profileStatusesAPI` calls. Dedupes by tweet id. Stops when the
 * target count is reached, there is no bottom cursor, or a page returns no rows.
 */
export const profileStatusesAPIPaginated = async (
  handleOrId: ProfileHandleOrId,
  maxTotal: number,
  host: TwitterBuildHost,
  withReplies = false,
  language?: string
): Promise<APISearchResults> => {
  const target = Math.min(PROFILE_STATUSES_FEED_TARGET_CAP, Math.max(1, maxTotal));
  return paginateAndMerge(
    cursor =>
      profileStatusesAPI(
        handleOrId,
        PROFILE_STATUSES_FEED_PER_PAGE,
        cursor,
        host,
        withReplies,
        language
      ),
    target
  );
};

export const profileArticlesAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost,
  language?: string
): Promise<APISearchResults> => {
  const userId =
    handleOrId.type === 'userId'
      ? handleOrId.value
      : await getTwitterUserRestIdByScreenName(host, handleOrId.value);
  if (!userId) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const results = await graphQLOrchestrator(host, [
    {
      key: 'articles',
      required: true,
      headers: buildLanguageHeaders(language),
      methods: [
        {
          name: 'ProfileArticlesTimeline',
          query: ProfileArticlesTimelineQuery,
          weight: 500,
          validator: validateProfileArticlesTimelineResponse
        },
        {
          name: 'UserArticlesTweets',
          query: UserArticlesTweetsQuery,
          weight: 500,
          validator: validateUserArticlesTweetsResponse
        }
      ],
      variables: {
        userId,
        rest_id: userId,
        count,
        cursor: cursor ?? null
      }
    }
  ]);

  if (!results.articles?.success) {
    console.error('Profile articles timeline request failed', results.articles?.error);
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const instructions = getProfileArticlesTimelineInstructions(results.articles.data);
  if (!instructions) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const { statuses, cursors } = processTimelineInstructions(instructions);
  const topCursor = cursors.find(cur => cur.cursorType === 'Top')?.value ?? null;
  const bottomCursor = cursors.find(cur => cur.cursorType === 'Bottom')?.value ?? null;

  const builtStatuses = (
    await Promise.all(
      statuses.map(status =>
        buildAPITwitterStatus(host, status, language, null, false, false).catch(err => {
          console.error('Error building status', err);
          return null;
        })
      )
    )
  ).filter(
    (s): s is APITwitterStatus => s !== null && !isTombstone(s) && !(s as FetchResults)?.status
  );

  return {
    code: 200,
    results: builtStatuses,
    cursor: {
      top: topCursor,
      bottom: bottomCursor
    }
  };
};

/**
 * `withReplies` is opt-out here (rather than defaulted to `false`) so the v2 JSON API keeps
 * returning replies from the media tab; only the paginated feed wrapper asks for them to be
 * dropped by default.
 */
export const profileMediaAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost,
  language?: string,
  withReplies?: boolean
): Promise<APISearchResults> => {
  const userId =
    handleOrId.type === 'userId'
      ? handleOrId.value
      : await getTwitterUserRestIdByScreenName(host, handleOrId.value);
  if (!userId) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const results = await graphQLOrchestrator(host, [
    {
      key: 'media',
      required: true,
      headers: buildLanguageHeaders(language),
      query: UserMediaQuery,
      validator: validateUserMediaTimelineResponse,
      variables: {
        userId,
        count,
        cursor: cursor ?? null
      }
    }
  ]);

  if (!results.media?.success) {
    console.error('Profile media timeline request failed', results.media?.error);
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const instructions = getProfileStatusesTimelineInstructions(results.media.data);
  if (!instructions) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const { statuses, cursors } = processTimelineInstructions(instructions);
  const topCursor = cursors.find(cur => cur.cursorType === 'Top')?.value ?? null;
  const bottomCursor = cursors.find(cur => cur.cursorType === 'Bottom')?.value ?? null;

  const includeReplies = withReplies !== false;
  const included = includeReplies ? statuses : statuses.filter(status => !isReplyStatus(status));

  const builtStatuses = (
    await Promise.all(
      included.map(status =>
        buildAPITwitterStatus(host, status, language, null, false, false).catch(err => {
          console.error('Error building status', err);
          return null;
        })
      )
    )
  ).filter(
    (s): s is APITwitterStatus => s !== null && !isTombstone(s) && !(s as FetchResults)?.status
  );

  return {
    code: 200,
    results: builtStatuses,
    cursor: {
      top: topCursor,
      bottom: bottomCursor
    }
  };
};

/**
 * Same pagination strategy as `profileStatusesAPIPaginated`, for the profile media tab timeline.
 */
export const profileMediaAPIPaginated = async (
  handleOrId: ProfileHandleOrId,
  maxTotal: number,
  host: TwitterBuildHost,
  withReplies = false,
  language?: string
): Promise<APISearchResults> => {
  const target = Math.min(PROFILE_STATUSES_FEED_TARGET_CAP, Math.max(1, maxTotal));
  return paginateAndMerge(
    cursor =>
      profileMediaAPI(
        handleOrId,
        PROFILE_STATUSES_FEED_PER_PAGE,
        cursor,
        host,
        language,
        withReplies
      ),
    target,
    PROFILE_STATUSES_FEED_MAX_PAGES,
    // Reply filtering happens per page, so an all-reply page yields nothing and must not end the walk.
    { stopOnEmptyPage: withReplies }
  );
};

const relationshipListUserNotFound = (): APIProfileRelationshipList => ({
  code: 404,
  results: [],
  cursor: { top: null, bottom: null }
});

const emptySuccessRelationshipList = (): APIProfileRelationshipList => ({
  code: 200,
  results: [],
  cursor: { top: null, bottom: null }
});

const profileRelationshipListAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost,
  kind: 'followers' | 'following'
): Promise<APIProfileRelationshipList> => {
  const userId =
    handleOrId.type === 'userId'
      ? handleOrId.value
      : await getTwitterUserRestIdByScreenName(host, handleOrId.value);
  if (!userId) {
    return relationshipListUserNotFound();
  }

  const methods =
    kind === 'followers'
      ? [
          {
            name: 'Followers',
            query: FollowersQuery,
            weight: 500,
            validator: validateUserTweetsTimeline
          },
          {
            name: 'FollowersByUserIDTimeline',
            query: FollowersByUserIDTimelineQuery,
            weight: 500,
            validator: validateFollowersByUserIDTimelineResponse
          }
        ]
      : [
          {
            name: 'Following',
            query: FollowingQuery,
            weight: 500,
            validator: validateUserTweetsTimeline
          },
          {
            name: 'FollowingByUserIDTimeline',
            query: FollowingByUserIDTimelineQuery,
            weight: 500,
            validator: validateFollowingByUserIDTimelineResponse
          }
        ];

  const results = await graphQLOrchestrator(host, [
    {
      key: 'list',
      required: true,
      methods,
      variables: {
        userId,
        rest_id: userId,
        count,
        cursor: cursor ?? null
      }
    }
  ]);

  if (!results.list?.success) {
    console.error(`Profile ${kind} request failed`, results.list?.error);
    return {
      code: 500,
      results: [],
      cursor: { top: null, bottom: null }
    };
  }

  const instructions = getFollowersFollowingInstructions(results.list.data, kind);
  if (!instructions) {
    return emptySuccessRelationshipList();
  }

  const { users, cursors } = processUserRelationshipTimelineInstructions(instructions);
  const topCursor = cursors.find(cur => cur.cursorType === 'Top')?.value ?? null;
  const bottomCursor = cursors.find(cur => cur.cursorType === 'Bottom')?.value ?? null;

  const builtUsers = users
    .map(u => {
      try {
        return convertToApiUser(u, false);
      } catch (err) {
        console.error('Error building user for relationship list', err);
        return null;
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  return {
    code: 200,
    results: builtUsers,
    cursor: {
      top: topCursor,
      bottom: bottomCursor
    }
  };
};

export const profileFollowersAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost
): Promise<APIProfileRelationshipList> =>
  profileRelationshipListAPI(handleOrId, count, cursor, host, 'followers');

export const profileFollowingAPI = async (
  handleOrId: ProfileHandleOrId,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost
): Promise<APIProfileRelationshipList> =>
  profileRelationshipListAPI(handleOrId, count, cursor, host, 'following');
