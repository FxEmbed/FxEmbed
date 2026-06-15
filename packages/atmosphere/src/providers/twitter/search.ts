import { buildLanguageHeaders } from '../../helpers/language.js';
import { buildAPITwitterStatus } from './processor.js';
import { SearchTimelineQuery } from './graphql/queries.js';
import { graphqlRequest } from './graphql/request.js';
import { isTombstone } from '../../helpers/tombstone.js';
import {
  isSearchTimelineClientErrorResponse,
  parseSearchTimelineClientError,
  searchTimelineClientErrorToApiQueryError
} from './searchErrors.js';
import type { APISearchResults, APITwitterStatus, ApiQueryError } from '../../types/api-schemas.js';
import type { FetchResults } from '../../types/fetch-results.js';
import type { TwitterBuildHost } from './build-host.js';

type SearchFeed = 'latest' | 'top' | 'media';

const feedToProduct = (feed: SearchFeed): string => {
  switch (feed) {
    case 'top':
      return 'Top';
    case 'media':
      return 'Media';
    case 'latest':
    default:
      return 'Latest';
  }
};

function isGraphQLTimelineCursor(obj: unknown): obj is GraphQLTimelineCursor {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__typename' in obj &&
    (obj as { __typename?: string }).__typename === 'TimelineTimelineCursor'
  );
}

/** Normalize cursor_type (ProfileTimeline) and cursorType (UserTweets/Search) */
const normalizeCursor = (cursor: GraphQLTimelineCursor): GraphQLTimelineCursor => {
  if (!cursor.cursorType && cursor.cursor_type) {
    cursor.cursorType = cursor.cursor_type;
  }
  return cursor;
};

/** Shared by SearchTimeline, UserTweets, ProfileTimeline, and other GraphQL timeline instruction streams */
export const processTimelineInstructions = (
  instructions: TimelineInstruction[]
): { statuses: GraphQLTwitterStatus[]; cursors: GraphQLTimelineCursor[] } => {
  const statuses: GraphQLTwitterStatus[] = [];
  const cursors: GraphQLTimelineCursor[] = [];

  type ItemContentWithTweet = {
    __typename?: string;
    tweet_results?: { result?: { __typename?: string; tweet?: unknown } };
  };
  const extractTweetFromItemContent = (itemContent: ItemContentWithTweet) => {
    if (itemContent?.__typename !== 'TimelineTweet') return;
    const result = itemContent.tweet_results?.result;
    const entryType = result?.__typename;
    if (entryType === 'Tweet') {
      statuses.push(result as GraphQLTwitterStatus);
    } else if (entryType === 'TweetWithVisibilityResults' && result) {
      const tw = (result as GraphQLTweetWithVisibilityResults).tweet;
      if (tw) statuses.push(tw);
    }
  };

  /** ProfileTimeline nests tweet content as `content`, UserTweets/Search use `itemContent` */
  const getItemContent = (
    item: GraphQLTimelineItem
  ): GraphQLTimelineTweet | GraphQLTimelineCursor | undefined => {
    return item.itemContent ?? item.content;
  };

  instructions?.forEach(instruction => {
    // ProfileTimeline uses __typename, UserTweets/SearchTimeline use type
    const kind =
      (instruction as { type?: string }).type ??
      (instruction as { __typename?: string }).__typename;

    // Paginated responses replace existing cursor entries rather than adding new ones
    if (kind === 'TimelineReplaceEntry') {
      const content = (instruction as TimelineReplaceEntryInstruction).entry?.content;
      if (content?.__typename === 'TimelineTimelineCursor') {
        cursors.push(normalizeCursor(content));
      }
      return;
    }

    // Media feed pagination uses TimelineAddToModule (search-grid) instead of TimelineAddEntries
    if (kind === 'TimelineAddToModule') {
      (instruction as TimelineAddModulesInstruction).moduleItems?.forEach(_moduleItem => {
        const moduleItem = _moduleItem as {
          item?: { itemContent?: unknown; content?: unknown };
        };
        const itemContent = moduleItem?.item?.itemContent ?? moduleItem?.item?.content;
        if (itemContent) {
          extractTweetFromItemContent(itemContent as ItemContentWithTweet);
        }
      });
      return;
    }

    if (kind === 'TimelineAddEntries') {
      (instruction as TimelineAddEntriesInstruction).entries?.forEach(_entry => {
        const entry = _entry as GraphQLTimelineTweetEntry | GraphQLConversationThread;
        const content = (entry as GraphQLTimelineTweetEntry)?.content;

        if (typeof content === 'undefined') return;

        if (content.__typename === 'TimelineTimelineItem') {
          const inner = getItemContent(content as GraphQLTimelineItem);
          if (inner) {
            extractTweetFromItemContent(inner as ItemContentWithTweet);
            if (inner.__typename === 'TimelineTimelineCursor') {
              cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
            }
          }
        } else if (isGraphQLTimelineCursor(content)) {
          // Cursors may appear directly as entry content (SearchTimeline, ProfileTimeline)
          cursors.push(normalizeCursor(content));
        } else if (
          (content as unknown as GraphQLTimelineModule).__typename === 'TimelineTimelineModule'
        ) {
          (content as unknown as GraphQLTimelineModule).items?.forEach(item => {
            const inner = getItemContent(item.item);
            if (!inner) return;
            if (inner.__typename === 'TimelineTweet') {
              extractTweetFromItemContent(inner as ItemContentWithTweet);
            } else if (inner.__typename === 'TimelineTimelineCursor') {
              cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
            }
          });
        }
      });
    }
  });

  return { statuses, cursors };
};

/** One timeline row: a single tweet or a grouped conversation module (profile timelines). */
export type GroupedTimelineEntry =
  | { kind: 'status'; status: GraphQLTwitterStatus }
  | {
      kind: 'thread';
      conversation_id: string;
      statuses: GraphQLTwitterStatus[];
      all_status_ids?: string[];
    };

const conversationIdFromModuleEntry = (
  entryId: string | undefined,
  moduleStatuses: GraphQLTwitterStatus[]
): string => {
  if (entryId) {
    const m = entryId.match(/profile-conversation-(\d+)/);
    if (m) return m[1];
    const m2 = entryId.match(/conversationthread-(\d+)/);
    if (m2) return m2[1];
  }
  const conv = moduleStatuses[0]?.legacy?.conversation_id_str;
  if (conv) return conv;
  return moduleStatuses[0]?.rest_id ?? moduleStatuses[0]?.legacy?.id_str ?? 'unknown';
};

/** X sometimes nests `conversationMetadata` under `metadata` or on the module/entry root. */
const conversationMetadataAllTweetIds = (source: unknown): string[] | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  const o = source as Record<string, unknown>;
  const readIds = (cm: unknown): string[] | undefined => {
    if (!cm || typeof cm !== 'object') return undefined;
    const ids = (cm as { allTweetIds?: unknown }).allTweetIds;
    if (Array.isArray(ids) && ids.length > 0 && ids.every(x => typeof x === 'string')) {
      return ids as string[];
    }
    return undefined;
  };
  const fromNested = readIds(o.conversationMetadata);
  if (fromNested) return fromNested;
  const meta = o.metadata;
  if (meta && typeof meta === 'object') {
    const fromMeta = readIds((meta as { conversationMetadata?: unknown }).conversationMetadata);
    if (fromMeta) return fromMeta;
  }
  return undefined;
};

const allTweetIdsForConversationModule = (
  module: GraphQLTimelineModule,
  timelineEntry?: unknown
): string[] | undefined => {
  return conversationMetadataAllTweetIds(module) ?? conversationMetadataAllTweetIds(timelineEntry);
};

/**
 * Like {@link processTimelineInstructions} but preserves `TimelineTimelineModule` groups
 * for profile-style conversation rows.
 */
export const processGroupedTimelineInstructions = (
  instructions: TimelineInstruction[]
): { entries: GroupedTimelineEntry[]; cursors: GraphQLTimelineCursor[] } => {
  const entries: GroupedTimelineEntry[] = [];
  const cursors: GraphQLTimelineCursor[] = [];

  type ItemContentWithTweet = {
    __typename?: string;
    tweet_results?: { result?: { __typename?: string; tweet?: unknown } };
  };

  const tweetFromItemContent = (itemContent: ItemContentWithTweet): GraphQLTwitterStatus | null => {
    if (itemContent?.__typename !== 'TimelineTweet') return null;
    const result = itemContent.tweet_results?.result;
    const entryType = result?.__typename;
    if (entryType === 'Tweet') {
      return result as GraphQLTwitterStatus;
    }
    if (entryType === 'TweetWithVisibilityResults') {
      if (!result) return null;
      return (result as GraphQLTweetWithVisibilityResults).tweet;
    }
    return null;
  };

  const getItemContent = (
    item: GraphQLTimelineItem
  ): GraphQLTimelineTweet | GraphQLTimelineCursor | undefined => {
    return item.itemContent ?? item.content;
  };

  const pushModuleAsEntries = (
    module: GraphQLTimelineModule,
    outerEntryId: string | undefined,
    timelineEntry?: unknown
  ): void => {
    const statuses: GraphQLTwitterStatus[] = [];
    module.items?.forEach(item => {
      const inner = getItemContent(item.item);
      if (!inner) return;
      if (inner.__typename === 'TimelineTweet') {
        const st = tweetFromItemContent(inner as ItemContentWithTweet);
        if (st) statuses.push(st);
      } else if (inner.__typename === 'TimelineTimelineCursor') {
        cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
      }
    });
    if (statuses.length === 0) return;

    const allIds = allTweetIdsForConversationModule(module, timelineEntry);
    const useThread =
      statuses.length > 1 || (allIds !== undefined && allIds.length > statuses.length);

    if (useThread) {
      entries.push({
        kind: 'thread',
        conversation_id: conversationIdFromModuleEntry(outerEntryId, statuses),
        statuses,
        all_status_ids: allIds
      });
    } else {
      entries.push({ kind: 'status', status: statuses[0] });
    }
  };

  instructions?.forEach(instruction => {
    const kind =
      (instruction as { type?: string }).type ??
      (instruction as { __typename?: string }).__typename;

    if (kind === 'TimelineReplaceEntry') {
      const content = (instruction as TimelineReplaceEntryInstruction).entry?.content;
      if (content?.__typename === 'TimelineTimelineCursor') {
        cursors.push(normalizeCursor(content));
      }
      return;
    }

    if (kind === 'TimelineAddToModule') {
      (instruction as TimelineAddModulesInstruction).moduleItems?.forEach(_moduleItem => {
        const moduleItem = _moduleItem as {
          item?: { itemContent?: unknown; content?: unknown };
        };
        const itemContent = moduleItem?.item?.itemContent ?? moduleItem?.item?.content;
        if (!itemContent) return;
        const st = tweetFromItemContent(itemContent as ItemContentWithTweet);
        if (st) entries.push({ kind: 'status', status: st });
        if (
          typeof itemContent === 'object' &&
          itemContent !== null &&
          (itemContent as { __typename?: string }).__typename === 'TimelineTimelineCursor'
        ) {
          cursors.push(normalizeCursor(itemContent as GraphQLTimelineCursor));
        }
      });
      return;
    }

    if (kind === 'TimelineAddEntries') {
      (instruction as TimelineAddEntriesInstruction).entries?.forEach(_entry => {
        const entry = _entry as GraphQLTimelineTweetEntry | GraphQLConversationThread;
        const content = entry.content as
          | GraphQLTimelineItem
          | GraphQLTimelineCursor
          | GraphQLTimelineModule
          | undefined;
        const entryId = (entry as { entryId?: string }).entryId;

        if (typeof content === 'undefined') return;

        if ((content as GraphQLTimelineItem).__typename === 'TimelineTimelineItem') {
          const inner = getItemContent(content as GraphQLTimelineItem);
          if (inner) {
            if (inner.__typename === 'TimelineTweet') {
              const st = tweetFromItemContent(inner as ItemContentWithTweet);
              if (st) entries.push({ kind: 'status', status: st });
            } else if (inner.__typename === 'TimelineTimelineCursor') {
              cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
            }
          }
        } else if (isGraphQLTimelineCursor(content)) {
          cursors.push(normalizeCursor(content));
        } else if (
          (content as unknown as GraphQLTimelineModule).__typename === 'TimelineTimelineModule'
        ) {
          pushModuleAsEntries(content as GraphQLTimelineModule, entryId, entry);
        }
      });
    }
  });

  return { entries, cursors };
};

type ItemContentWithUser = {
  __typename?: string;
  user_results?: { result?: { __typename?: string } };
};

const extractUserFromItemContent = (itemContent: unknown, users: GraphQLUser[]): void => {
  const ic = itemContent as ItemContentWithUser;
  if (ic?.__typename !== 'TimelineUser') return;
  const result = ic.user_results?.result;
  if (!result || typeof result !== 'object' || result.__typename !== 'User') return;
  users.push(result as GraphQLUser);
};

/** Followers/following and reposters timelines: TimelineUser rows plus pagination cursors */
const processUserRelationshipTimelineInstructionsImpl = (
  instructions: TimelineInstruction[]
): { users: GraphQLUser[]; cursors: GraphQLTimelineCursor[] } => {
  const users: GraphQLUser[] = [];
  const cursors: GraphQLTimelineCursor[] = [];

  const getItemContent = (
    item: GraphQLTimelineItem
  ): GraphQLTimelineTweet | GraphQLTimelineCursor | undefined => {
    return item.itemContent ?? item.content;
  };

  instructions?.forEach(instruction => {
    const kind =
      (instruction as { type?: string }).type ??
      (instruction as { __typename?: string }).__typename;

    if (kind === 'TimelineReplaceEntry') {
      const content = (instruction as TimelineReplaceEntryInstruction).entry?.content;
      if (content?.__typename === 'TimelineTimelineCursor') {
        cursors.push(normalizeCursor(content));
      }
      return;
    }

    if (kind === 'TimelineAddToModule') {
      (instruction as TimelineAddModulesInstruction).moduleItems?.forEach(_moduleItem => {
        const moduleItem = _moduleItem as {
          item?: { itemContent?: unknown; content?: unknown };
        };
        const itemContent = moduleItem?.item?.itemContent ?? moduleItem?.item?.content;
        if (!itemContent) return;
        extractUserFromItemContent(itemContent, users);
        if (
          typeof itemContent === 'object' &&
          itemContent !== null &&
          (itemContent as { __typename?: string }).__typename === 'TimelineTimelineCursor'
        ) {
          cursors.push(normalizeCursor(itemContent as GraphQLTimelineCursor));
        }
      });
      return;
    }

    if (kind === 'TimelineAddEntries') {
      (instruction as TimelineAddEntriesInstruction).entries?.forEach(_entry => {
        const entry = _entry as GraphQLTimelineTweetEntry | GraphQLConversationThread;
        const content = (entry as GraphQLTimelineTweetEntry)?.content;

        if (typeof content === 'undefined') return;

        if (content.__typename === 'TimelineTimelineItem') {
          const inner = getItemContent(content as GraphQLTimelineItem);
          if (inner) {
            extractUserFromItemContent(inner, users);
            if (inner.__typename === 'TimelineTimelineCursor') {
              cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
            }
          }
        } else if (isGraphQLTimelineCursor(content)) {
          cursors.push(normalizeCursor(content));
        } else if (
          (content as unknown as GraphQLTimelineModule).__typename === 'TimelineTimelineModule'
        ) {
          (content as unknown as GraphQLTimelineModule).items?.forEach(item => {
            const inner = getItemContent(item.item);
            if (!inner) return;
            extractUserFromItemContent(inner, users);
            if (inner.__typename === 'TimelineTimelineCursor') {
              cursors.push(normalizeCursor(inner as GraphQLTimelineCursor));
            }
          });
        }
      });
    }
  });

  return { users, cursors };
};

export const processUserRelationshipTimelineInstructions =
  processUserRelationshipTimelineInstructionsImpl;
export const processRetweetersUserTimelineInstructions =
  processUserRelationshipTimelineInstructionsImpl;

export const searchAPI = async (
  query: string,
  feed: SearchFeed,
  count: number,
  cursor: string | null,
  host: TwitterBuildHost,
  language?: string
): Promise<APISearchResults | ApiQueryError> => {
  const product = feedToProduct(feed);

  let response: TwitterSearchTimelineResponse | null;

  try {
    response = (await graphqlRequest(host, {
      query: SearchTimelineQuery,
      variables: {
        rawQuery: query,
        count,
        product,
        cursor: cursor ?? null
      },
      headers: buildLanguageHeaders(language),
      validator: (_response: unknown) => {
        if (isSearchTimelineClientErrorResponse(_response)) {
          return true;
        }
        const r = _response as TwitterSearchTimelineResponse;
        return Array.isArray(r?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions);
      }
    })) as TwitterSearchTimelineResponse;
  } catch (e) {
    console.error('Search request failed', e);
    return { code: 500, results: [], cursor: { top: null, bottom: null } };
  }

  const clientError = parseSearchTimelineClientError(response);
  if (clientError) {
    return searchTimelineClientErrorToApiQueryError(clientError);
  }

  if (!response?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions) {
    return { code: 404, results: [], cursor: { top: null, bottom: null } };
  }

  const instructions = response.data.search_by_raw_query.search_timeline.timeline.instructions;
  const { statuses, cursors } = processTimelineInstructions(instructions);

  const topCursor = cursors.find(cursor => cursor.cursorType === 'Top')?.value ?? null;
  const bottomCursor = cursors.find(cursor => cursor.cursorType === 'Bottom')?.value ?? null;

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
