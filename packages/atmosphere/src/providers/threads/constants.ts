/** Threads logged-out web (same Meta infra as Instagram web). */
export const THREADS_ORIGIN = 'https://www.threads.com';

export const THREADS_WEB_APP_ID = '238260118697367';

/** From captured `www.threads.com` GraphQL traffic (Apr 2026). */
export const THREADS_BLOKS_VERSION_ID =
  '5e29fadab42cb8e08e4a4cb1dfad0df9d86c8aac9c5120ea02ed1380fad4621f';

export const THREADS_ASBD_ID = '359341';

/** Relay `doc_id` values; rotate when Threads ships new bundles. */
export const THREADS_DOC_IDS = {
  BarcelonaPostPageDirectQuery: '35009275178687016',
  BarcelonaUsernameHovercardImplDirectQuery: '26380219401627134',
  BarcelonaProfilePageDirectQuery: '26973787138973936',
  BarcelonaProfileThreadsTabRefetchableDirectQuery: '26687434907534883'
} as const;

/**
 * Relay internal provider flags (logged-out) — copied from a captured
 * `BarcelonaPostPageDirectQuery` so variables match production bundles.
 */
/** Relay flags for `BarcelonaUsernameHovercardImplDirectQuery`. */
export const THREADS_RELAY_USERNAME_HOVERCARD: Record<string, boolean> = {
  __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
  __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMessagingrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldShowFediverseM1Featuresrelayprovider: false,
  __relay_internal__pv__BarcelonaHasEventBadgerelayprovider: false
};

/** Relay flags for `BarcelonaProfilePageDirectQuery`. */
export const THREADS_RELAY_PROFILE_PAGE: Record<string, boolean> = {
  __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMessagingrelayprovider: false,
  __relay_internal__pv__BarcelonaIsLoggedOutrelayprovider: true,
  __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
  __relay_internal__pv__BarcelonaHasEventBadgerelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunitiesrelayprovider: true,
  __relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldShowFediverseM1Featuresrelayprovider: false
};

export const THREADS_RELAY_DEFAULTS: Record<string, boolean> = {
  __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
  __relay_internal__pv__BarcelonaHasPostAuthorNotifControlsrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldShowFediverseM1Featuresrelayprovider: false,
  __relay_internal__pv__BarcelonaHasInlineReplyComposerrelayprovider: false,
  __relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider: true,
  __relay_internal__pv__BarcelonaHasEventBadgerelayprovider: false,
  __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunitiesrelayprovider: true,
  __relay_internal__pv__BarcelonaHasGameScoreSharerelayprovider: true,
  __relay_internal__pv__BarcelonaHasPublicViewCountCardrelayprovider: true,
  __relay_internal__pv__BarcelonaHasCommunityEntityCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasScorecardCommunityrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMusicrelayprovider: false,
  __relay_internal__pv__BarcelonaHasNewspaperLinkStylerelayprovider: false,
  __relay_internal__pv__BarcelonaHasMessagingrelayprovider: false,
  __relay_internal__pv__BarcelonaHasGhostPostEmojiActivationrelayprovider: false,
  __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
  __relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider: false,
  __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider: false,
  __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider: false,
  __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false
};
