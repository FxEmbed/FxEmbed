import {
  instagramPrivateApiRequest,
  type InstagramPrivateApiResult,
  type InstagramRequestContext
} from './account-proxy.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import { INSTAGRAM_ORIGIN } from './constants.js';

/*
 * Endpoint paths below are the ones the Instagram Android app itself calls
 * (444.0.0.46.85). Two exceptions are marked `@legacy`: they are v1 REST endpoints the current
 * app no longer references (it fetches those surfaces over GraphQL/Bloks instead) but which
 * i.instagram.com still serves. Treat a sudden 404 from those as "Instagram retired it" rather
 * than a bug here.
 */

export type InstagramApiOptions = {
  /** Pre-resolved accounts, so a multi-call flow reuses one shuffle. */
  accounts?: InstagramCredentials[];
};

const profileReferer = (username: string) => `${INSTAGRAM_ORIGIN}/${encodeURIComponent(username)}/`;

/** `users/{username}/usernameinfo/` — profile by handle. */
export function fetchPrivateUserByUsername(
  username: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/users/${encodeURIComponent(username)}/usernameinfo/`, ctx, {
    referer: profileReferer(username),
    accounts: options.accounts
  });
}

/** `users/{pk}/info/` — profile by numeric id. */
export function fetchPrivateUserById(
  userId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/users/${encodeURIComponent(userId)}/info/`, ctx, {
    accounts: options.accounts
  });
}

/** `media/{pk}/info/` — full media object, including video versions Instagram hides logged-out. */
export function fetchPrivateMediaInfo(
  mediaId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { shortcode?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/media/${encodeURIComponent(mediaId)}/info/`, ctx, {
    referer: options.shortcode
      ? `${INSTAGRAM_ORIGIN}/p/${encodeURIComponent(options.shortcode)}/`
      : undefined,
    accounts: options.accounts
  });
}

/** `media/{pk}/comments/` — comment page. `minId`/`maxId` are the app's cursor params. */
export function fetchPrivateMediaComments(
  mediaId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & {
    maxId?: string | null;
    minId?: string | null;
    sortOrder?: 'popular' | 'recent';
    shortcode?: string;
  } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/media/${encodeURIComponent(mediaId)}/comments/`, ctx, {
    query: {
      can_support_threading: 'true',
      permalink_enabled: 'false',
      sort_order: options.sortOrder ?? 'popular',
      max_id: options.maxId ?? undefined,
      min_id: options.minId ?? undefined
    },
    referer: options.shortcode
      ? `${INSTAGRAM_ORIGIN}/p/${encodeURIComponent(options.shortcode)}/`
      : undefined,
    accounts: options.accounts
  });
}

/**
 * `media/{pk}/likers/` — accounts that liked a post.
 * @legacy Not referenced by the 444.x Android build (likers moved to GraphQL), still served by v1.
 */
export function fetchPrivateMediaLikers(
  mediaId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { shortcode?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/media/${encodeURIComponent(mediaId)}/likers/`, ctx, {
    referer: options.shortcode
      ? `${INSTAGRAM_ORIGIN}/p/${encodeURIComponent(options.shortcode)}/`
      : undefined,
    accounts: options.accounts
  });
}

/**
 * `feed/user/{pk}/` — a profile's own posts.
 * @legacy Not referenced by the 444.x Android build (the profile grid moved to GraphQL), still
 * served by v1 and materially better than the logged-out grid for private/age-gated accounts.
 */
export function fetchPrivateUserFeed(
  userId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/feed/user/${encodeURIComponent(userId)}/`, ctx, {
    query: { count: options.count, max_id: options.maxId ?? undefined },
    referer: options.username ? profileReferer(options.username) : undefined,
    accounts: options.accounts
  });
}

/** `usertags/{pk}/feed/` — posts the account is tagged in. */
export function fetchPrivateUserTaggedFeed(
  userId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/usertags/${encodeURIComponent(userId)}/feed/`, ctx, {
    query: { count: options.count, max_id: options.maxId ?? undefined },
    referer: options.username ? `${profileReferer(options.username)}tagged/` : undefined,
    accounts: options.accounts
  });
}

/** `friendships/{pk}/followers/` — follower list page. */
export function fetchPrivateFollowers(
  userId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/friendships/${encodeURIComponent(userId)}/followers/`, ctx, {
    query: {
      count: options.count,
      max_id: options.maxId ?? undefined,
      search_surface: 'follow_list_page'
    },
    referer: options.username ? `${profileReferer(options.username)}followers/` : undefined,
    accounts: options.accounts
  });
}

/** `friendships/{pk}/following/` — following list page. */
export function fetchPrivateFollowing(
  userId: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { maxId?: string | null; count?: number; username?: string } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest(`/friendships/${encodeURIComponent(userId)}/following/`, ctx, {
    query: {
      count: options.count,
      max_id: options.maxId ?? undefined,
      search_surface: 'follow_list_page'
    },
    referer: options.username ? `${profileReferer(options.username)}following/` : undefined,
    accounts: options.accounts
  });
}

/** `users/search/` — user search. */
export function fetchPrivateUserSearch(
  query: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { count?: number } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest('/users/search/', ctx, {
    query: { q: query, count: options.count, search_surface: 'user_search_page' },
    accounts: options.accounts
  });
}

/** `fbsearch/ig_typeahead/` — blended typeahead (users + hashtags + places). */
export function fetchPrivateTypeahead(
  query: string,
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions & { count?: number } = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest('/fbsearch/ig_typeahead/', ctx, {
    query: { query, count: options.count, search_surface: 'top_search_page' },
    accounts: options.accounts
  });
}

/** `feed/reels_media/` — active stories for one or more accounts. */
export function fetchPrivateReelsMedia(
  userIds: string[],
  ctx: InstagramRequestContext | undefined,
  options: InstagramApiOptions = {}
): Promise<InstagramPrivateApiResult> {
  return instagramPrivateApiRequest('/feed/reels_media/', ctx, {
    method: 'POST',
    body: new URLSearchParams({
      user_ids: JSON.stringify(userIds),
      source: 'profile'
    }).toString(),
    accounts: options.accounts
  });
}
