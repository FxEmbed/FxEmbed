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

/** Per-provider credential buckets; extend with instagram, etc. */
export type CredentialStore = {
  twitter?: { accounts: TwitterCredentials[] };
  bluesky?: { accounts: BlueskyProxyCredentials[] };
};

export type ErrorResponse = {
  error: string;
  code: number;
};

export type ProxyEnv = {
  CREDENTIAL_KEY?: string;
  EXCEPTION_DISCORD_WEBHOOK?: string;
};
