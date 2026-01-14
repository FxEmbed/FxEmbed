import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // Build-time replacements for global variables
    RELEASE_NAME: JSON.stringify('fixtweet-test'),
    TEXT_ONLY_DOMAINS: JSON.stringify('t.fxtwitter.com,t.twittpr.com,t.fixupx.com'),
    INSTANT_VIEW_DOMAINS: JSON.stringify('i.fxtwitter.com,i.twittpr.com,i.fixupx.com'),
    GALLERY_DOMAINS: JSON.stringify('g.fxtwitter.com,g.twittpr.com,g.fixupx.com'),
    FORCE_MOSAIC_DOMAINS: JSON.stringify('m.fxtwitter.com,m.twittpr.com,m.fixupx.com'),
    OLD_EMBED_DOMAINS: JSON.stringify('o.fxtwitter.com,o.twittpr.com,o.fixupx.com'),
    STANDARD_DOMAIN_LIST: JSON.stringify('fxtwitter.com,fixupx.com,twittpr.com'),
    STANDARD_TIKTOK_DOMAIN_LIST: JSON.stringify('dxtiktok.com,cocktiktok.com'),
    STANDARD_BSKY_DOMAIN_LIST: JSON.stringify('fxbsky.app'),
    DIRECT_MEDIA_DOMAINS: JSON.stringify(
      'd.fxtwitter.com,dl.fxtwitter.com,d.fixupx.com,dl.fixupx.com'
    ),
    MOSAIC_DOMAIN_LIST: JSON.stringify('mosaic.fxtwitter.com'),
    POLYGLOT_DOMAIN_LIST: JSON.stringify('polyglot.fxembed.com'),
    POLYGLOT_ACCESS_TOKEN: JSON.stringify('example-token'),
    MOSAIC_BSKY_DOMAIN_LIST: JSON.stringify('mosaic.fxbsky.app'),
    API_HOST_LIST: JSON.stringify('api.fxtwitter.com'),
    GIF_TRANSCODE_DOMAIN_LIST: JSON.stringify('gif.fxtwitter.com'),
    SENTRY_DSN: null
  },
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    include: ['test/*.ts'],
    globals: true,
    poolOptions: {
      workers: {
        miniflare: {
          // Basic configuration needed for tests
          compatibilityDate: '2025-03-21',
          compatibilityFlags: []
        }
      }
    },
    coverage: {
      include: ['src/**/*.{ts,js}']
    }
  }
});
