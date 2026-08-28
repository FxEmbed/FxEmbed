import type { InstagramCredentials } from '../types/proxy-credentials.js';

/**
 * Configurable Instagram web/private-API roots.
 * The FxEmbed worker calls {@link setInstagramProviderEnv} at startup (see `worker.ts`).
 */
export type InstagramProviderEnv = {
  /** Logged-out web origin (`www.instagram.com`). */
  webRoot: string;
  /** Private API origin used by the account proxy (`i.instagram.com`). */
  apiRoot: string;
  /** Sent as `User-Agent` on logged-out web requests when the caller supplies none. */
  friendlyUserAgent: string;
};

const defaultEnv: InstagramProviderEnv = {
  webRoot: 'https://www.instagram.com',
  apiRoot: 'https://i.instagram.com',
  friendlyUserAgent: 'FxEmbed'
};

let env: InstagramProviderEnv = { ...defaultEnv };

export function setInstagramProviderEnv(partial: Partial<InstagramProviderEnv>): void {
  env = { ...env, ...partial };
}

export function getInstagramProviderEnv(): InstagramProviderEnv {
  return env;
}

/**
 * Encrypted bundle decrypt + account selection lives in the worker; the package only sees this
 * interface (registered from `worker.ts`, same as `setBlueskyProxyRuntime` / `setTwitterProxyRuntime`).
 */
export type InstagramProxyRuntime = {
  initCredentials: (key: string | undefined) => Promise<void>;
  hasBundledEncryptedCredentials: () => boolean;
  hasInstagramProxyAccounts: () => boolean;
  getShuffledInstagramAccounts: () => InstagramCredentials[];
};

/** No-op fallback so logged-out Instagram paths work without worker proxy wiring (and in tests). */
const noopProxy: InstagramProxyRuntime = {
  initCredentials: async () => {},
  hasBundledEncryptedCredentials: () => false,
  hasInstagramProxyAccounts: () => false,
  getShuffledInstagramAccounts: () => []
};

let proxy: InstagramProxyRuntime | null = null;

export function setInstagramProxyRuntime(r: InstagramProxyRuntime): void {
  proxy = r;
}

export function getInstagramProxyRuntime(): InstagramProxyRuntime {
  return proxy ?? noopProxy;
}
