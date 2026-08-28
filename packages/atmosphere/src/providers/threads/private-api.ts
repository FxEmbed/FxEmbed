import {
  threadsPrivateApiRequest,
  type ThreadsPrivateApiResult,
  type ThreadsRequestContext
} from './account-proxy.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import {
  THREADS_ORIGIN,
  THREADS_SEARCH_SURFACE_RECENT,
  THREADS_SEARCH_SURFACE_TOP
} from './constants.js';

/*
 * Endpoint paths and parameter names below are the ones the Threads Android app itself calls
 * (`com.instagram.barcelona` 445.0.0.2.83). The app keeps the `{user_id}` / `{post_id}` templates
 * literally — `ProfileFeedDataSource`, `SerpFeedPagingSource`, `SearchTopicsRepository` and
 * `LikesListRemoteDataSource` are the classes these were read from — so they are reproduced
 * verbatim here and filled in by `threadsPrivateApiRequest`'s `pathParams`.
 *
 * Everything runs against `i.instagram.com/api/v1/…` with a logged-in Instagram session; only the
 * `X-IG-App-ID` distinguishes a Threads request from an Instagram one.
 */

export type ThreadsApiOptions = {
  /** Pre-resolved accounts, so a multi-call flow reuses one shuffle. */
  accounts?: InstagramCredentials[];
};

const profileReferer = (username: string) => `${THREADS_ORIGIN}/@${encodeURIComponent(username)}`;

/** Which profile tab to read. The app models these as four sibling routes, not one parameter. */
export type ThreadsProfileTab = 'threads' | 'replies' | 'reposts' | 'media';

const PROFILE_TAB_PATHS: Record<ThreadsProfileTab, string> = {
  threads: 'text_feed/{user_id}/profile/',
  replies: 'text_feed/{user_id}/profile/replies/',
  reposts: 'text_feed/{user_id}/profile/reposts/',
  media: 'text_feed/{user_id}/profile/media/'
};

/**
 * `text_feed/{user_id}/profile/…` — one page of a profile tab.
 *
 * The app also sends `exclude_reposts` on the main tab so its dedicated Reposts tab doesn't
 * duplicate rows; FxEmbed leaves it off so `/statuses` matches what the logged-out timeline serves.
 */
export function fetchThreadsProfileFeed(
  userId: string,
  tab: ThreadsProfileTab,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & {
    maxId?: string | null;
    username?: string;
  } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest(PROFILE_TAB_PATHS[tab], ctx, {
    pathParams: { user_id: userId },
    query: {
      user_id: userId,
      max_id: options.maxId ?? undefined,
      is_app_start: false
    },
    referer: options.username ? profileReferer(options.username) : undefined,
    accounts: options.accounts
  });
}

/** `text_feed/{post_id}/replies/` — replies to a post. `sortOrder` is the app's `top` / `all`. */
export function fetchThreadsPostReplies(
  postId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & {
    pagingToken?: string | null;
    sortOrder?: 'top' | 'all';
    shortcode?: string;
    username?: string;
  } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('text_feed/{post_id}/replies/', ctx, {
    pathParams: { post_id: postId },
    query: {
      post_id: postId,
      sort_order: options.sortOrder ?? 'top',
      paging_token: options.pagingToken ?? undefined,
      check_for_unavailable_replies: true
    },
    referer:
      options.username && options.shortcode
        ? `${profileReferer(options.username)}/post/${encodeURIComponent(options.shortcode)}`
        : undefined,
    accounts: options.accounts
  });
}

/** `text_feed/{post_id}/single_thread/` — the focal post and its own thread chain, no replies. */
export function fetchThreadsSingleThread(
  postId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('text_feed/{post_id}/single_thread/', ctx, {
    pathParams: { post_id: postId },
    query: { post_id: postId },
    accounts: options.accounts
  });
}

/**
 * `fbsearch/text_app/serp/` — post search.
 *
 * `recent` is the app's `0` / `1` toggle and has to agree with `search_surface`; passing one
 * without the other returns the other tab's ranking.
 */
export function fetchThreadsSearchSerp(
  query: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & {
    recent?: boolean;
    pageToken?: string | null;
    pageNum?: number | null;
    rankToken?: string | null;
    tagId?: string | null;
  } = {}
): Promise<ThreadsPrivateApiResult> {
  const recent = options.recent === true;
  return threadsPrivateApiRequest('fbsearch/text_app/serp/', ctx, {
    query: {
      query,
      search_surface: recent ? THREADS_SEARCH_SURFACE_RECENT : THREADS_SEARCH_SURFACE_TOP,
      recent: recent ? '1' : '0',
      is_from_pull_to_refresh: '0',
      tag_id: options.tagId ?? undefined,
      page_token: options.pageToken ?? undefined,
      page_num: options.pageNum ?? undefined,
      rank_token: options.rankToken ?? undefined
    },
    referer: `${THREADS_ORIGIN}/search?q=${encodeURIComponent(query)}`,
    accounts: options.accounts
  });
}

/** `fbsearch/text_app/trends/` — the Threads trending topic list. */
export function fetchThreadsTrends(
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { first?: number } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('fbsearch/text_app/trends/', ctx, {
    query: {
      first: options.first ?? undefined,
      serp_prefetch: false,
      should_fetch_related_communities: false
    },
    accounts: options.accounts
  });
}

/** `text_feed/{user_id}/liked_posts/` — posts an account liked (only its own, session-scoped). */
export function fetchThreadsLikedPosts(
  userId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { maxId?: string | null } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('text_feed/{user_id}/liked_posts/', ctx, {
    pathParams: { user_id: userId },
    query: { user_id: userId, max_id: options.maxId ?? undefined },
    accounts: options.accounts
  });
}

/** `media/{pk}/likers/` — accounts that liked a post; the Threads app shares Instagram's route. */
export function fetchThreadsMediaLikers(
  mediaId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { shortcode?: string; username?: string } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest(`media/${encodeURIComponent(mediaId)}/likers/`, ctx, {
    referer:
      options.username && options.shortcode
        ? `${profileReferer(options.username)}/post/${encodeURIComponent(options.shortcode)}`
        : undefined,
    acceptHint: 'user_list',
    accounts: options.accounts
  });
}

/** `friendships/{pk}/followers/` — follower list page (shared Instagram graph). */
export function fetchThreadsFollowers(
  userId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest(`friendships/${encodeURIComponent(userId)}/followers/`, ctx, {
    query: {
      count: options.count,
      max_id: options.maxId ?? undefined,
      search_surface: 'follow_list_page'
    },
    referer: options.username ? `${profileReferer(options.username)}/followers` : undefined,
    acceptHint: 'user_list',
    accounts: options.accounts
  });
}

/** `friendships/{pk}/following/` — following list page (shared Instagram graph). */
export function fetchThreadsFollowing(
  userId: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest(`friendships/${encodeURIComponent(userId)}/following/`, ctx, {
    query: {
      count: options.count,
      max_id: options.maxId ?? undefined,
      search_surface: 'follow_list_page'
    },
    referer: options.username ? `${profileReferer(options.username)}/following` : undefined,
    acceptHint: 'user_list',
    accounts: options.accounts
  });
}

/** `users/search/` — user search, filtered to Threads-active accounts by the caller. */
export function fetchThreadsUserSearch(
  query: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions & { count?: number } = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('users/search/', ctx, {
    query: { q: query, count: options.count, search_surface: 'user_search_page' },
    acceptHint: 'user_list',
    accounts: options.accounts
  });
}

/** `users/{username}/usernameinfo/` — handle → numeric pk, shared with Instagram. */
export function fetchThreadsUserByUsername(
  username: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest(`users/${encodeURIComponent(username)}/usernameinfo/`, ctx, {
    referer: profileReferer(username),
    accounts: options.accounts
  });
}

/** `fbsearch/text_app/keyword/search/` — keyword suggestions behind the search box. */
export function fetchThreadsKeywordSearch(
  query: string,
  ctx: ThreadsRequestContext | undefined,
  options: ThreadsApiOptions = {}
): Promise<ThreadsPrivateApiResult> {
  return threadsPrivateApiRequest('fbsearch/text_app/keyword/search/', ctx, {
    query: { query },
    referer: `${THREADS_ORIGIN}/search?q=${encodeURIComponent(query)}`,
    accounts: options.accounts
  });
}
