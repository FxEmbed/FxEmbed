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
