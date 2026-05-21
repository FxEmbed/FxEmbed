/**
 * Vitest `test.env` entries (with `ssr.keepProcessEnv`) so `process.env` in the Workers test runtime
 * matches production shape; production still uses esbuild `define` from `.env` at build time.
 */
export const WORKER_TEST_PROCESS_ENV = {
  RELEASE_NAME: 'fixtweet-test',
  TEXT_ONLY_DOMAINS: 't.fxtwitter.com,t.twittpr.com,t.fixupx.com',
  INSTANT_VIEW_DOMAINS: 'i.fxtwitter.com,i.twittpr.com,i.fixupx.com',
  GALLERY_DOMAINS: 'g.fxtwitter.com,g.twittpr.com,g.fixupx.com',
  FORCE_MOSAIC_DOMAINS: 'm.fxtwitter.com,m.twittpr.com,m.fixupx.com',
  OLD_EMBED_DOMAINS: 'o.fxtwitter.com,o.twittpr.com,o.fixupx.com',
  STANDARD_DOMAIN_LIST: 'fxtwitter.com,fixupx.com,twittpr.com',
  STANDARD_TIKTOK_DOMAIN_LIST: 'dxtiktok.com,cocktiktok.com',
  STANDARD_BSKY_DOMAIN_LIST: 'fxbsky.app',
  DIRECT_MEDIA_DOMAINS: 'd.fxtwitter.com,dl.fxtwitter.com,d.fixupx.com,dl.fixupx.com',
  MOSAIC_DOMAIN_LIST: 'mosaic.fxtwitter.com',
  POLYGLOT_DOMAIN_LIST: 'polyglot.fxembed.com',
  POLYGLOT_ACCESS_TOKEN: 'example-token',
  MOSAIC_BSKY_DOMAIN_LIST: 'mosaic.fxbsky.app',
  API_HOST_LIST: 'api.fxtwitter.com',
  BLUESKY_API_HOST_LIST: 'api.fxbsky.app',
  ATMOSPHERE_API_HOST_LIST: 'api.atmosphere.tools',
  GIF_TRANSCODE_DOMAIN_LIST: 'gif.fxtwitter.com',
  VIDEO_TRANSCODE_DOMAIN_LIST: 'video.fxtwitter.com',
  VIDEO_TRANSCODE_BSKY_DOMAIN_LIST: 'video.fxbsky.app',
  PBS_PROXY_DOMAIN_LIST: 'pbs.fxtwitter.com',
  SENTRY_DSN: '',
  TWITTER_ROOT: 'https://x.com',
  ENCRYPTED_CREDENTIALS: '',
  CREDENTIALS_IV: ''
} as const satisfies Record<string, string>;
