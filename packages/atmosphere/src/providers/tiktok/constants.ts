/**
 * TikTok provider constants.
 *
 * Two very different surfaces are used here, and the difference matters when adding endpoints:
 *
 * 1. **Public web surfaces** (`www.tiktok.com`) — server-rendered pages that embed their data as
 *    JSON in a `<script>` tag. These need no signature and are what every route below is built on:
 *      - `/@handle/video/:id` and `/@handle`   → `__UNIVERSAL_DATA_FOR_REHYDRATION__`
 *      - `/embed/v2/:id`, `/embed/@handle`,
 *        `/embed/tag/:tag`, `/embed/music/:id`  → `__FRONTITY_CONNECT_STATE__`
 *      - `/oembed?url=…`                        → plain JSON
 *
 * 2. **The Android app's API** (`/aweme/v1/…`). Paths and parameter names below were read out of a
 *    decompiled `com.zhiliaoapp.musically` 46.7.2 (versionCode 2024607020) build. Almost all of it
 *    is gated behind ByteDance's request signing (`X-Gorgon` / `X-Ladon` / `X-Argus`, computed in
 *    `libmetasec_ov.so`): unsigned requests get `HTTP 200` with a zero-length body, or
 *    `{"status_code": 1, "message": "Url does not match"}`. `/aweme/v1/aweme/detail/` and
 *    `/aweme/v1/multi/aweme/detail/` are the exceptions that answer unsigned, and even those are
 *    IP-rate-limited hard (a handful of requests, then `429 ratelimit triggered` followed by empty
 *    bodies for a long cooldown). So the mobile API stays a *fallback* for single videos only —
 *    never the primary path, and never the basis for a new endpoint.
 */

/** Public web origin; source for SSR pages, embeds and oEmbed. */
export const TIKTOK_WEB_HOST = 'https://www.tiktok.com';

/** Short-link origin (`vm.tiktok.com/ZP8yxgATu`). */
export const TIKTOK_SHORT_HOST = 'https://vm.tiktok.com';

/** Android app API origin. See the signing note above before adding endpoints here. */
export const TIKTOK_API_HOST = 'https://api16-normal-c-useast1a.tiktokv.com';

/**
 * App fingerprint from the decompiled `com.zhiliaoapp.musically` 46.7.2 build
 * (`apktool.yml`: versionCode 2024607020, versionName 46.7.2).
 * `aid` 1233 is `musical_ly` (1180 = trill, 1128 = aweme).
 */
export const TIKTOK_APP_CONFIG = {
  appName: 'musical_ly',
  appVersion: '46.7.2',
  manifestVersion: '2024607020',
  aid: '1233',
  deviceType: 'Pixel 8',
  deviceBrand: 'Google',
  osVersion: '14',
  osApi: '34',
  buildId: 'UP1A.231005.007'
} as const;

/** `User-Agent` the app sends on API requests; must stay in sync with {@link TIKTOK_APP_CONFIG}. */
export const TIKTOK_MOBILE_UA =
  `com.zhiliaoapp.musically/${TIKTOK_APP_CONFIG.manifestVersion} (Linux; U; Android ` +
  `${TIKTOK_APP_CONFIG.osVersion}; en_US; ${TIKTOK_APP_CONFIG.deviceType}; ` +
  `Build/${TIKTOK_APP_CONFIG.buildId}; Cronet/58.0.2991.0)`;

/**
 * Android API paths worth knowing about, from the decompiled build. Only the `detail` pair is
 * reachable without a signature today; the rest are listed so a future account proxy (or a
 * signing service) has the exact route names rather than having to re-derive them.
 */
export const TIKTOK_API_PATHS = {
  /** Unsigned-friendly. `?aweme_id=` */
  awemeDetail: '/aweme/v1/aweme/detail/',
  /** Unsigned-friendly. POST `aweme_ids=[id]&request_source=0` */
  multiAwemeDetail: '/aweme/v1/multi/aweme/detail/',
  /** Signed. `?unique_id=` / `?sec_user_id=` / `?user_id=` */
  userProfileOther: '/aweme/v1/user/profile/other/',
  /** Signed. `?sec_user_id=&max_cursor=&count=` */
  awemePost: '/aweme/v1/aweme/post/',
  /** Signed. `?sec_user_id=&max_cursor=&count=` */
  awemeFavorite: '/aweme/v1/aweme/favorite/',
  /** Signed. `?aweme_id=&cursor=&count=` */
  commentList: '/aweme/v2/comment/list/',
  /** Signed. `?comment_id=&item_id=&cursor=&count=` */
  commentReplyList: '/aweme/v1/comment/list/reply/',
  /** Signed + logged in (answers `status_code: 8, "Login expired"` as a guest). */
  diggList: '/aweme/v1/digg/list/',
  /** Signed. `?sec_user_id=&max_time=&count=` */
  followerList: '/aweme/v1/user/follower/list/',
  /** Signed. `?sec_user_id=&max_time=&count=` */
  followingList: '/aweme/v1/user/following/list/',
  /** Signed. `?keyword=&offset=&count=` */
  searchItem: '/aweme/v1/search/item/',
  /** Signed. `?keyword=&cursor=&count=&type=` */
  discoverSearch: '/aweme/v1/discover/search/',
  /** Signed. `?keyword=&source=&count=` */
  searchSug: '/aweme/v1/search/sug/',
  /** Signed. `?detail_list=1` */
  hotSearchList: '/aweme/v1/hot/search/list/',
  /** Signed. `?hashtag_name=&query_type=1` (or `?ch_id=&query_type=0`) */
  challengeDetail: '/aweme/v1/challenge/detail/',
  /** Signed. `?music_id=` */
  musicDetail: '/aweme/v1/music/detail/'
} as const;

/** Browser `User-Agent` for the public web surfaces. TikTok 403s known crawler UAs. */
export const TIKTOK_WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

/** Cookies worth forwarding to the video proxy; `tt_chain_token` is the one the CDN checks. */
export const TIKTOK_PROXY_COOKIES = [
  'tt_chain_token',
  'sid_tt',
  'sessionid',
  'tt_csrf_token',
  'odin_tt'
] as const;

/**
 * How many videos an `/embed/@handle` (or `/embed/tag`, `/embed/music`) page server-renders.
 * The page takes no cursor and no count — its loader hardcodes `count: 10` — so this is both the
 * page size and the hard ceiling for those routes.
 */
export const TIKTOK_EMBED_PAGE_SIZE = 10;
