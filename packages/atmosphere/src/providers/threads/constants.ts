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

/*
 * Threads Android app constants, read out of a decompiled `com.instagram.barcelona` build
 * (445.0.0.2.83, versionCode 511505005). The app ships the same `InstagramSpecificHeaderServiceLayer`
 * as Instagram but stamps its own `X-IG-App-ID`, so a proxied Threads request is an Instagram
 * session presenting the Barcelona fingerprint.
 */

/** Threads (Barcelona) app id. Distinct from Instagram's — `X-IG-App-ID` on every app request. */
export const THREADS_ANDROID_APP_ID = '3419628305025917';

/** `X-IG-Capabilities` the app sends; identical to the Instagram build's. */
export const THREADS_ANDROID_CAPABILITIES = '3brTv10=';

export const THREADS_ANDROID_VERSION_NAME = '445.0.0.2.83';
export const THREADS_ANDROID_VERSION_CODE = '511505005';

/**
 * Android `User-Agent`, in the app's own
 * `Barcelona <version> Android (<sdk>/<release>; <dpi>dpi; <w>x<h>; <maker>; <model>; <device>; <chipset>; <locale>; <versionCode>)`
 * shape (built by `AbstractC870503bB.A00` from the `"%s %s Android %s"` /
 * `"(%s/%s; %s; %s; %s; %s; %s; %s; %s)"` format strings — the maker slot collapses to one value
 * when `Build.MANUFACTURER` equals `Build.BRAND`, which it does on the device modelled here).
 * Kept as one fixed, plausible device so a proxied session presents a stable fingerprint.
 */
export const THREADS_ANDROID_USER_AGENT =
  `Barcelona ${THREADS_ANDROID_VERSION_NAME} Android (34/14; 420dpi; 1080x2340; ` +
  `samsung; SM-S911B; dm1q; qcom; en_US; ${THREADS_ANDROID_VERSION_CODE})`;

/** Private API prefix shared with Instagram (`i.instagram.com/api/v1/…`). */
export const THREADS_API_V1 = '/api/v1';

/** `search_surface` values the app sends to `fbsearch/text_app/serp/` (`X.03cj`). */
export const THREADS_SEARCH_SURFACE_TOP = 'ig_text_search_serp_top';
export const THREADS_SEARCH_SURFACE_RECENT = 'ig_text_search_serp_recent';
