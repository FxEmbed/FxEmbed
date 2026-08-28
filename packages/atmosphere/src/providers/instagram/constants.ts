/** Instagram web app id (logged-out GraphQL / REST). */
export const INSTAGRAM_WEB_APP_ID = '936619743392459';

/** Meta ASBD id used by Instagram / Threads logged-out GraphQL (matches yt-dlp). */
export const INSTAGRAM_ASBD_ID = '359341';

/** Legacy GraphQL query hash for `edge_owner_to_timeline_media` pagination (may break if Instagram rotates). */
export const INSTAGRAM_TIMELINE_QUERY_HASH = '472f257a40c653c64c666ce877d59d2b';

/**
 * Doc id for comment pagination (`PolarisPostCommentsPaginationQuery`); from captured web traffic.
 * May need periodic updates when Instagram ships new bundles.
 */
export const INSTAGRAM_COMMENT_PAGINATION_DOC_ID = '25516980651312394';

/**
 * Doc id for logged-out post media (`PolarisLoggedOutDesktopWWWPostRootContentQuery`).
 * Ported from yt-dlp `InstagramIE` (2026-06 rework). May need periodic updates.
 */
export const INSTAGRAM_POST_ROOT_DOC_ID = '27130156389949648';

export const INSTAGRAM_POST_ROOT_FRIENDLY_NAME =
  'PolarisLoggedOutDesktopWWWPostRootContentQuery' as const;

export const INSTAGRAM_ORIGIN = 'https://www.instagram.com';

/*
 * Android app constants, read out of a decompiled `com.instagram.android` build
 * (444.0.0.46.85, versionCode 385104942). `InstagramSpecificHeaderServiceLayer` stamps
 * `X-IG-Capabilities` and the default `X-IG-App-ID` onto every first-party request.
 */

/** Instagram Android app id. Distinct from {@link INSTAGRAM_WEB_APP_ID}. */
export const INSTAGRAM_ANDROID_APP_ID = '567067343352427';

/** `X-IG-Capabilities` value the app sends on every first-party request. */
export const INSTAGRAM_ANDROID_CAPABILITIES = '3brTv10=';

export const INSTAGRAM_ANDROID_VERSION_NAME = '444.0.0.46.85';
export const INSTAGRAM_ANDROID_VERSION_CODE = '385104942';

/**
 * Android `User-Agent`, in the app's own
 * `Instagram <version> Android (<sdk>/<release>; <dpi>dpi; <w>x<h>; <maker>; <model>; <device>; <chipset>; <locale>; <versionCode>)`
 * shape (the app builds the middle section with the `"%sdpi; %sx%s"` format string).
 * Kept as one fixed, plausible device so a proxied session presents a stable fingerprint.
 */
export const INSTAGRAM_ANDROID_USER_AGENT =
  `Instagram ${INSTAGRAM_ANDROID_VERSION_NAME} Android (34/14; 420dpi; 1080x2340; ` +
  `samsung; SM-S911B; dm1q; qcom; en_US; ${INSTAGRAM_ANDROID_VERSION_CODE})`;

/** Private API origin the Android app talks to. */
export const INSTAGRAM_API_ORIGIN = 'https://i.instagram.com';

/** Private API prefix (`i.instagram.com/api/v1/…`). */
export const INSTAGRAM_API_V1 = '/api/v1';
