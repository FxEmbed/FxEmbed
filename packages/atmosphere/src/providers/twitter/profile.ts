import { getTwitterProviderEnv } from '../twitter-runtime.js';
import { linkFixer } from '../../helpers/link-fixer.js';
import type {
  APIFacet,
  APIUser,
  ProfileAboutAPIResponse,
  UserAPIResponse
} from '../../types/api-schemas.js';
import type { TwitterBuildHost } from './build-host.js';
import {
  UserByScreenNameQuery,
  UserResultByScreenNameQuery,
  AboutAccountQuery,
  UserByRestIdQuery,
  UserResultByRestIdQuery,
  UserProfileAboutQuery
} from './graphql/queries.js';
import { validateAboutAccountQuery, validateUserProfileAboutQuery } from './graphql/validators.js';
import { graphQLOrchestrator, type GraphQLOrchestratorRequest } from './graphql/orchestrator.js';

function asUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** Normalize `data.user.result` vs `data.user_results.{rest_id,result}`. */
export function extractUserResultNode(
  response: GraphQLUserResponse | UserResultByScreenNameResponse | null | undefined
): { restId?: string; result: unknown } | null {
  if (!response) {
    return null;
  }
  const d = asUnknownRecord((response as { data?: unknown }).data);
  if (!d) {
    return null;
  }
  const user = asUnknownRecord(d['user']);
  if (user && 'result' in user) {
    const restId = typeof user['rest_id'] === 'string' ? user['rest_id'] : undefined;
    return { restId, result: user['result'] };
  }
  const userResults = asUnknownRecord(d['user_results']);
  if (userResults && 'result' in userResults) {
    const restId = typeof userResults['rest_id'] === 'string' ? userResults['rest_id'] : undefined;
    return { restId, result: userResults['result'] };
  }
  return null;
}

export function isUserUnavailableResult(result: unknown): boolean {
  const r = asUnknownRecord(result);
  return r?.['__typename'] === 'UserUnavailable';
}

export function isSuspendedUserUnavailable(result: unknown): boolean {
  if (!isUserUnavailableResult(result)) {
    return false;
  }
  const r = asUnknownRecord(result)!;
  const reason =
    `${r['unavailable_reason'] ?? ''} ${r['reason'] ?? ''} ${r['message'] ?? ''}`.toLowerCase();
  return reason.includes('suspend');
}

function userByScreenNameResultValid(result: unknown): boolean {
  const r = asUnknownRecord(result);
  if (!r) {
    return false;
  }
  if (r['__typename'] === 'UserUnavailable') {
    return true;
  }
  return r['__typename'] === 'User' || Boolean(r['rest_id'] || r['core']);
}

function userResultByScreenNameResultValid(result: unknown): boolean {
  const r = asUnknownRecord(result);
  if (!r) {
    return false;
  }
  if (r['__typename'] === 'UserUnavailable') {
    return true;
  }
  return r['__typename'] === 'User' && Boolean(r['legacy'] || r['rest_id']);
}

function descriptionEntitiesToFacets(
  entities: UserProfileBioDescriptionEntities | undefined
): APIFacet[] {
  if (!entities) {
    return [];
  }
  const facets: APIFacet[] = [];
  entities.hashtags?.forEach(hashtag => {
    facets.push({
      type: 'hashtag',
      indices: hashtag.indices,
      original: hashtag.text
    });
  });
  entities.symbols?.forEach(symbol => {
    facets.push({
      type: 'symbol',
      indices: symbol.indices,
      original: symbol.text
    });
  });
  entities.urls?.forEach(url => {
    facets.push({
      type: 'url',
      indices: url.indices,
      original: url.url,
      replacement: url.expanded_url,
      display: url.display_url
    });
  });
  entities.user_mentions?.forEach(mention => {
    facets.push({
      type: 'mention',
      indices: mention.indices,
      original: mention.screen_name,
      id: mention.id_str
    });
  });
  facets.sort((a, b) => a.indices[0] - b.indices[0]);
  return facets;
}

export const convertToApiUser = (user: GraphQLUser, legacyAPI = false): APIUser => {
  const apiUser = {} as APIUser;
  apiUser.screen_name = user.core?.screen_name ?? user.legacy?.screen_name ?? '';
  /* Populating a lot of the basics */
  apiUser.url = `${getTwitterProviderEnv().webRoot}/${apiUser.screen_name}`;
  apiUser.id = user.rest_id;
  apiUser.followers = user.relationship_counts?.followers ?? user.legacy?.followers_count ?? 0;
  apiUser.following = user.relationship_counts?.following ?? user.legacy?.friends_count ?? 0;
  apiUser.likes = user.action_counts?.favorites_count ?? user.legacy?.favourites_count ?? 0;
  apiUser.media_count = user.tweet_counts?.media_tweets ?? user.legacy?.media_count ?? 0;
  if (legacyAPI) {
    // @ts-expect-error Use tweets for legacy API
    apiUser.tweets = user.tweet_counts?.tweets ?? user.legacy?.statuses_count;
  } else {
    apiUser.statuses = user.tweet_counts?.tweets ?? user.legacy?.statuses_count;
  }
  apiUser.name = user.core?.name ?? user.legacy?.name ?? '';
  const rawDescriptionText = user.profile_bio?.description ?? user.legacy?.description ?? '';
  const descriptionUrlEntities =
    user.legacy?.entities?.description?.urls ?? user.profile_bio?.entities?.description?.urls;
  apiUser.description = rawDescriptionText
    ? linkFixer(descriptionUrlEntities, rawDescriptionText)
    : '';
  const descriptionEntities =
    user.legacy?.entities?.description ?? user.profile_bio?.entities?.description;
  apiUser.raw_description = {
    text: rawDescriptionText,
    facets: descriptionEntitiesToFacets(descriptionEntities)
  };
  apiUser.location = user.location?.location ?? user.legacy?.location ?? '';
  apiUser.banner_url = user.banner?.image_url ?? user.legacy?.profile_banner_url ?? null;
  apiUser.avatar_url = user.avatar?.image_url ?? user.legacy?.profile_image_url_https ?? null;
  apiUser.joined = user.core?.created_at ?? user.legacy?.created_at ?? '';
  apiUser.protected = user.privacy?.protected ?? user.legacy?.protected ?? false;
  // if (user.legacy_extended_profile?.birthdate) {
  //   const { birthdate } = user.legacy_extended_profile;
  //   apiUser.birthday = {};
  //   if (typeof birthdate.day === 'number') apiUser.birthday.day = birthdate.day;
  //   if (typeof birthdate.month === 'number') apiUser.birthday.month = birthdate.month;
  //   if (typeof birthdate.year === 'number') apiUser.birthday.year = birthdate.year;
  // }
  const website =
    user.profile_bio?.entities?.url?.urls?.[0] ?? user.legacy?.entities?.url?.urls?.[0];

  if (website) {
    apiUser.website = {
      url: website.expanded_url,
      display_url: website.display_url
    };
  } else {
    apiUser.website = null;
  }
  /* Fun fact: verification.verified always returns false in Twitter GraphQL even if the account is verified.
     They moved legacy.verified into verification.verified but didn't bother to reimplement it
     with Twitter Blue / X Premium verification */
  if (
    user.verification?.is_blue_verified ||
    user.is_blue_verified ||
    user.verification?.verified_type
  ) {
    apiUser.verification = {
      verified: true,
      verified_at: null,
      type: 'individual'
    };
    if (user.verification?.verified_type === 'Business') {
      apiUser.verification.type = 'organization';
    } else if (user.verification?.verified_type === 'Government') {
      apiUser.verification.type = 'government';
    }
    if (user.verification_info?.verified_since_msec) {
      apiUser.verification.verified_at = new Date(
        Number(user.verification_info.verified_since_msec)
      ).toISOString();
    }
    /* TODO: figure out why one of the user endpoints doesn't have this  */
    if (user.verification_info?.is_identity_verified !== undefined) {
      // apiUser.verification.identity_verified = user.verification_info.is_identity_verified;
    }
  } else {
    apiUser.verification = {
      verified: false,
      verified_at: null,
      type: null
    };
  }

  if (!legacyAPI) {
    apiUser.type = 'profile';
  }

  return apiUser;
};

/**
 * Merges AboutAccountQuery data into an APIUser object
 */
export const mergeAboutAccountData = (
  user: APIUser,
  aboutAccount: AboutAccountQueryResponse
): APIUser => {
  const result = aboutAccount?.data?.user_result_by_screen_name?.result;

  if (!result) {
    return user;
  }

  if (result.about_profile) {
    user.about_account = user.about_account ?? ({} as APIUser['about_account']);

    if (result.about_profile?.account_based_in) {
      user.about_account!.based_in = result.about_profile.account_based_in;
    }

    if (result.about_profile?.location_accurate) {
      user.about_account!.location_accurate = result.about_profile.location_accurate;
    }

    if (result.about_profile?.created_country_accurate) {
      user.about_account!.created_country_accurate = result.about_profile.created_country_accurate;
    }

    if (result.about_profile?.source) {
      user.about_account!.source = result.about_profile.source;
    }

    // Merge username_changes
    if (result.about_profile?.username_changes) {
      const usernameChanges = result.about_profile.username_changes;
      user.about_account!.username_changes = {
        count: parseInt(usernameChanges.count || '0', 10),
        last_changed_at: usernameChanges.last_changed_at_msec
          ? new Date(Number(usernameChanges.last_changed_at_msec)).toISOString()
          : null
      };
    }
  }

  return user;
};

export type ProfileHandleOrId =
  { type: 'screenName'; value: string } | { type: 'userId'; value: string };

/**
 * Parses API v2 profile `{handle}`: plain screen name or `id:<numeric rest id>`.
 */
export const parseHandleOrId = (handle: string): ProfileHandleOrId => {
  const trimmed = handle.trim();
  const m = /^id:([0-9]+)$/i.exec(trimmed);
  if (m) {
    return { type: 'userId', value: m[1] };
  }
  return { type: 'screenName', value: trimmed };
};

/**
 * Merges UserProfileAbout (by rest_id) into an APIUser object
 */
export const mergeUserProfileAboutData = (
  user: APIUser,
  aboutResponse: UserProfileAboutResponse
): APIUser => {
  const result =
    aboutResponse?.data?.user_result_by_rest_id?.result ??
    aboutResponse?.data?.user_rest_result_by_rest_id?.result;

  if (!result) {
    return user;
  }

  if (result.about_profile) {
    user.about_account = user.about_account ?? ({} as APIUser['about_account']);

    if (result.about_profile?.account_based_in) {
      user.about_account!.based_in = result.about_profile.account_based_in;
    }

    if (result.about_profile?.location_accurate) {
      user.about_account!.location_accurate = result.about_profile.location_accurate;
    }

    if (result.about_profile?.created_country_accurate) {
      user.about_account!.created_country_accurate = result.about_profile.created_country_accurate;
    }

    if (result.about_profile?.source) {
      user.about_account!.source = result.about_profile.source;
    }

    if (result.about_profile?.username_changes) {
      const usernameChanges = result.about_profile.username_changes;
      user.about_account!.username_changes = {
        count: parseInt(usernameChanges.count || '0', 10),
        last_changed_at: usernameChanges.last_changed_at_msec
          ? new Date(Number(usernameChanges.last_changed_at_msec)).toISOString()
          : null
      };
    }
  }

  return user;
};

/* This function does the heavy lifting of processing data from Twitter API
   and using it to create FxTwitter's streamlined API responses */
const populateUserProperties = async (
  response: GraphQLUserResponse | UserResultByScreenNameResponse,
  legacyAPI = false
): Promise<APIUser | null> => {
  const user =
    (response as GraphQLUserResponse).data?.user?.result ??
    (response as UserResultByScreenNameResponse).data?.user_results?.result;
  if (user && (user as GraphQLUser).__typename === 'User') {
    return convertToApiUser(user as GraphQLUser, legacyAPI);
  }

  return null;
};

/**
 * Fetches user data; optionally runs AboutAccountQuery in parallel via graphQLOrchestrator.
 * Uses weighted endpoint methods for rate limit leveling on user endpoints.
 */
const fetchUser = async (
  host: TwitterBuildHost,
  screenName: string,
  includeAboutAccount = false
): Promise<{
  userResponse: GraphQLUserResponse | UserResultByScreenNameResponse | null;
  aboutAccountResponse: AboutAccountQueryResponse | null;
}> => {
  const userRequest: GraphQLOrchestratorRequest = {
    key: 'user',
    methods: [
      {
        name: 'UserByScreenName',
        query: UserByScreenNameQuery,
        weight: 150,
        validator: (response: unknown) => {
          const userResponse = response as GraphQLUserResponse;
          const result = userResponse?.data?.user?.result;
          return userByScreenNameResultValid(result);
        }
      },
      {
        name: 'UserResultByScreenName',
        query: UserResultByScreenNameQuery,
        weight: 500,
        validator: (response: unknown) => {
          const userResponse = response as UserResultByScreenNameResponse;
          const result = userResponse?.data?.user_results?.result;
          return userResultByScreenNameResultValid(result);
        }
      }
    ],
    variables: { screen_name: screenName },
    required: true
  };

  const aboutAccountRequest: GraphQLOrchestratorRequest = {
    key: 'aboutAccount',
    query: AboutAccountQuery,
    variables: { screenName },
    validator: validateAboutAccountQuery,
    required: false
  };

  const results = await graphQLOrchestrator(
    host,
    includeAboutAccount ? [userRequest, aboutAccountRequest] : [userRequest]
  );

  // Extract user response
  const userData = results.user?.success
    ? (results.user.data as GraphQLUserResponse | UserResultByScreenNameResponse)
    : null;

  // Extract about account response
  const aboutAccountData = results.aboutAccount?.success
    ? (results.aboutAccount.data as AboutAccountQueryResponse)
    : null;

  return {
    userResponse: userData,
    aboutAccountResponse: aboutAccountData
  };
};

const fetchUserById = async (
  host: TwitterBuildHost,
  userId: string,
  includeAboutAccount = false
): Promise<{
  userResponse: GraphQLUserResponse | UserResultByScreenNameResponse | null;
  aboutProfileResponse: UserProfileAboutResponse | null;
}> => {
  const userRequest: GraphQLOrchestratorRequest = {
    key: 'user',
    methods: [
      {
        name: 'UserByRestId',
        query: UserByRestIdQuery,
        weight: 500,
        validator: (response: unknown) => {
          const userResponse = response as GraphQLUserResponse;
          const result = userResponse?.data?.user?.result;
          return userByScreenNameResultValid(result);
        }
      },
      {
        name: 'UserResultByRestId',
        query: UserResultByRestIdQuery,
        weight: 50,
        validator: (response: unknown) => {
          const userResponse = response as UserResultByScreenNameResponse;
          const result = userResponse?.data?.user_results?.result;
          return userResultByScreenNameResultValid(result);
        }
      }
    ],
    variables: { userId, rest_id: userId },
    required: true
  };

  const aboutProfileRequest: GraphQLOrchestratorRequest = {
    key: 'aboutProfile',
    query: UserProfileAboutQuery,
    variables: { rest_id: userId },
    validator: validateUserProfileAboutQuery,
    required: false
  };

  const results = await graphQLOrchestrator(
    host,
    includeAboutAccount ? [userRequest, aboutProfileRequest] : [userRequest]
  );

  const userData = results.user?.success
    ? (results.user.data as GraphQLUserResponse | UserResultByScreenNameResponse)
    : null;

  const aboutProfileData = results.aboutProfile?.success
    ? (results.aboutProfile.data as UserProfileAboutResponse)
    : null;

  return {
    userResponse: userData,
    aboutProfileResponse: aboutProfileData
  };
};

/**
 * GraphQL `TweetResultByRestId` can omit `core.user_results.result` (e.g. when the tweet quotes
 * unavailable/deleted content) while `legacy.user_id_str` is still present. Use this to hydrate
 * the author from a user id query.
 */
export async function fetchTwitterGraphQLUserByRestId(
  host: TwitterBuildHost,
  userId: string
): Promise<GraphQLUser | null> {
  const trimmed = userId.trim();
  if (!trimmed) {
    return null;
  }
  const { userResponse } = await fetchUserById(host, trimmed, false);
  const node = extractUserResultNode(userResponse);
  if (!node || isUserUnavailableResult(node.result)) {
    return null;
  }
  const user = node.result as GraphQLUser;
  if ((user as { __typename?: string }).__typename !== 'User') {
    return null;
  }
  return user;
}

/** Resolve rest_id for timeline queries (e.g. UserTweets, ProfileTimeline) */
export const getTwitterUserRestIdByScreenName = async (
  host: TwitterBuildHost,
  screenName: string
): Promise<string | null> => {
  const { userResponse } = await fetchUser(host, screenName, false);
  if (!userResponse) {
    return null;
  }
  const node = extractUserResultNode(userResponse);
  if (!node || isUserUnavailableResult(node.result)) {
    return null;
  }
  const user = node.result as GraphQLUser;
  return user.rest_id ?? null;
};

/* API for Twitter profiles (Users)
   Available for free using api.fxtwitter.com. */
export const userAPI = async (
  username: string,
  host: TwitterBuildHost,
  legacyApiUserCounts = false,
  includeAboutAccount = false
): Promise<UserAPIResponse> => {
  const { userResponse, aboutAccountResponse } = await fetchUser(
    host,
    username,
    includeAboutAccount
  );

  if (!userResponse || !Object.keys(userResponse).length) {
    return {
      code: 404,
      message: 'User not found'
    };
  }

  const node = extractUserResultNode(userResponse);
  if (!node) {
    return {
      code: 404,
      message: 'User not found'
    };
  }
  if (isSuspendedUserUnavailable(node.result)) {
    const id = node.restId;
    return {
      code: 404,
      message: 'User is suspended',
      reason: 'suspended',
      ...(id ? { id } : {})
    };
  }
  if (isUserUnavailableResult(node.result)) {
    return {
      code: 404,
      message: 'User not found'
    };
  }

  /* Creating the response objects */
  const response: UserAPIResponse = { code: 200, message: 'OK' } as UserAPIResponse;
  const apiUser = await populateUserProperties(userResponse, legacyApiUserCounts);
  if (!apiUser) {
    return {
      code: 404,
      message: 'User not found'
    };
  }
  let mergedUser: APIUser = apiUser;

  /* Merge AboutAccountQuery data if available */
  if (aboutAccountResponse) {
    mergedUser = mergeAboutAccountData(mergedUser, aboutAccountResponse);
  }

  /* Finally, staple the User to the response and return it */
  response.user = mergedUser;

  return response;
};

/**
 * Fetches only X “About this account” metadata (`about_account` on full profile), by screen name or `id:<rest_id>`.
 */
export const profileAboutAPI = async (
  handle: string,
  host: TwitterBuildHost
): Promise<ProfileAboutAPIResponse> => {
  const parsed = parseHandleOrId(handle);

  const request: GraphQLOrchestratorRequest =
    parsed.type === 'screenName'
      ? {
          key: 'aboutAccount',
          query: AboutAccountQuery,
          variables: { screenName: parsed.value },
          validator: validateAboutAccountQuery,
          required: true
        }
      : {
          key: 'aboutProfile',
          query: UserProfileAboutQuery,
          variables: { rest_id: parsed.value },
          validator: validateUserProfileAboutQuery,
          required: true
        };

  const results = await graphQLOrchestrator(host, [request]);
  const bucket = parsed.type === 'screenName' ? results.aboutAccount : results.aboutProfile;

  if (!bucket?.success || bucket.data == null) {
    return { code: 404, message: 'User not found' };
  }

  const stub = {} as APIUser;
  if (parsed.type === 'screenName') {
    mergeAboutAccountData(stub, bucket.data as AboutAccountQueryResponse);
  } else {
    mergeUserProfileAboutData(stub, bucket.data as UserProfileAboutResponse);
  }

  const response: ProfileAboutAPIResponse = { code: 200, message: 'OK' };
  if (stub.about_account !== undefined) {
    response.about_account = stub.about_account;
  }
  return response;
};

export const userAPIById = async (
  userId: string,
  host: TwitterBuildHost,
  legacyApiUserCounts = false,
  includeAboutAccount = false
): Promise<UserAPIResponse> => {
  const { userResponse, aboutProfileResponse } = await fetchUserById(
    host,
    userId,
    includeAboutAccount
  );

  if (!userResponse || !Object.keys(userResponse).length) {
    return {
      code: 404,
      message: 'User not found'
    };
  }

  const node = extractUserResultNode(userResponse);
  if (!node) {
    return {
      code: 404,
      message: 'User not found'
    };
  }
  if (isSuspendedUserUnavailable(node.result)) {
    const id = node.restId ?? userId;
    return {
      code: 404,
      message: 'User is suspended',
      reason: 'suspended',
      ...(id ? { id } : {})
    };
  }
  if (isUserUnavailableResult(node.result)) {
    return {
      code: 404,
      message: 'User not found'
    };
  }

  const response: UserAPIResponse = { code: 200, message: 'OK' } as UserAPIResponse;
  const apiUser = await populateUserProperties(userResponse, legacyApiUserCounts);
  if (!apiUser) {
    return {
      code: 404,
      message: 'User not found'
    };
  }
  let mergedUser: APIUser = apiUser;

  if (aboutProfileResponse) {
    mergedUser = mergeUserProfileAboutData(mergedUser, aboutProfileResponse);
  }

  response.user = mergedUser;

  return response;
};
