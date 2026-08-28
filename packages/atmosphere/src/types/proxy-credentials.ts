/** PDS + app password for anonymous proxy fallback (server-side only; never send to clients). */
export type BlueskyProxyCredentials = {
  identifier: string;
  appPassword: string;
  service: string;
};

/** X / Twitter session for in-process account proxy. */
export type TwitterCredentials = {
  authToken: string;
  csrfToken: string;
  username: string;
};

/**
 * Instagram session for in-process account proxy.
 *
 * `sessionId` is the `sessionid` cookie of a logged-in account. `platform` picks which client
 * fingerprint the proxy presents: `web` (default) matches a `sessionid` harvested from
 * www.instagram.com in a desktop browser, `android` matches one harvested from the Android app
 * (see `INSTAGRAM_ANDROID_*` in `providers/instagram/constants.ts`). Mixing them is what usually
 * trips Instagram's checkpoint, so keep it consistent with where the cookie came from.
 */
export type InstagramCredentials = {
  sessionId: string;
  /** `ds_user_id` cookie — numeric account pk. Sent alongside `sessionid` when present. */
  userId?: string;
  /** `csrftoken` cookie. Required for POST endpoints; harmless to omit for GETs. */
  csrfToken?: string;
  /** `mid` cookie. Optional, but Instagram is happier when the cookie jar looks complete. */
  mid?: string;
  /** `ig_did` cookie (device UUID). Optional, same rationale as `mid`. */
  deviceId?: string;
  /** Android device id in `android-<16 hex>` form; only meaningful with `platform: 'android'`. */
  androidDeviceId?: string;
  /** Screen name, for logging only. */
  username?: string;
  /** Which client fingerprint to present. Defaults to `web`. */
  platform?: 'web' | 'android';
};

/** Per-provider credential buckets. */
export type CredentialStore = {
  twitter?: { accounts: TwitterCredentials[] };
  bluesky?: { accounts: BlueskyProxyCredentials[] };
  instagram?: { accounts: InstagramCredentials[] };
};

export type ErrorResponse = {
  error: string;
  code: number;
};

export type ProxyEnv = {
  CREDENTIAL_KEY?: string;
  EXCEPTION_DISCORD_WEBHOOK?: string;
};
