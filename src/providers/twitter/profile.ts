import { Context } from 'hono';
import { Constants } from '../../constants';
import { linkFixer } from '../../helpers/linkFixer';
import { APIUser, UserAPIResponse } from '../../types/types';
import {
  UserByScreenNameQuery,
  UserResultByScreenNameQuery,
  AboutAccountQuery
} from './graphql/queries';
import { validateAboutAccountQuery } from './graphql/validators';
import { graphQLOrchestrator } from './graphql/orchestrator';

export const convertToApiUser = (user: GraphQLUser, legacyAPI = false): APIUser => {
  const apiUser = {} as APIUser;
  apiUser.screen_name = user.core?.screen_name ?? user.legacy?.screen_name ?? '';
  /* Populating a lot of the basics */
  apiUser.url = `${Constants.TWITTER_ROOT}/${apiUser.screen_name}`;
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
  const description = user.profile_bio?.description ?? user.legacy?.description;
  apiUser.description = description
    ? linkFixer(user.profile_bio?.entities?.url?.urls, description)
    : '';
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
  if (user.verification?.is_blue_verified || user.is_blue_verified) {
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

/* This function does the heavy lifting of processing data from Twitter API
   and using it to create FxTwitter's streamlined API responses */
const populateUserProperties = async (
  response: GraphQLUserResponse | UserResultByScreenNameResponse,
  legacyAPI = false
): Promise<APIUser | null> => {
  const user =
    (response as GraphQLUserResponse).data?.user?.result ??
    (response as UserResultByScreenNameResponse).data?.user_results?.result;
  if (user) {
    return convertToApiUser(user, legacyAPI);
  }

  return null;
};

/**
 * Fetches user data with AboutAccountQuery in parallel using graphQLOrchestrator
 * Uses weighted endpoint methods for rate limit leveling on user endpoints
 */
const fetchUserWithAboutAccount = async (
  c: Context,
  screenName: string
): Promise<{
  userResponse: GraphQLUserResponse | UserResultByScreenNameResponse | null;
  aboutAccountResponse: AboutAccountQueryResponse | null;
}> => {
  // Use orchestrator to run requests in parallel with endpoint methods
  const results = await graphQLOrchestrator(c, [
    {
      key: 'user',
      methods: [
        {
          name: 'UserByScreenName',
          query: UserByScreenNameQuery,
          weight: 150,
          validator: (response: unknown) => {
            const userResponse = response as GraphQLUserResponse;
            const result = userResponse?.data?.user?.result;
            return Boolean(
              result && (result.__typename === 'User' || result.rest_id || result.core)
            );
          }
        },
        {
          name: 'UserResultByScreenName',
          query: UserResultByScreenNameQuery,
          weight: 500,
          validator: (response: unknown) => {
            const userResponse = response as UserResultByScreenNameResponse;
            const result = userResponse?.data?.user_results?.result;
            return Boolean(
              result && result.__typename === 'User' && (result.legacy || result.rest_id)
            );
          }
        }
      ],
      variables: { screen_name: screenName },
      required: true
    },
    {
      key: 'aboutAccount',
      query: AboutAccountQuery,
      variables: { screenName },
      validator: validateAboutAccountQuery,
      required: false // Supplementary request - failure is OK
    }
  ]);

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

/* API for Twitter profiles (Users)
   Available for free using api.fxtwitter.com. */
export const userAPI = async (
  username: string,
  c: Context
  // flags?: InputFlags
): Promise<UserAPIResponse> => {
  // Fetch user data and AboutAccountQuery in parallel
  const { userResponse, aboutAccountResponse } = await fetchUserWithAboutAccount(c, username);

  if (!userResponse || !Object.keys(userResponse).length) {
    return {
      code: 404,
      message: 'User not found'
    };
  }

  /* Creating the response objects */
  const response: UserAPIResponse = { code: 200, message: 'OK' } as UserAPIResponse;
  let apiUser: APIUser = (await populateUserProperties(userResponse, true)) as APIUser;

  /* Merge AboutAccountQuery data if available */
  if (aboutAccountResponse) {
    apiUser = mergeAboutAccountData(apiUser, aboutAccountResponse);
  }

  /* Finally, staple the User to the response and return it */
  response.user = apiUser;

  return response;
};
