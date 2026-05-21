/** Keys from `.env` at build (esbuild inlines `process.env.*`) or runtime (Bun reads `.env`). */
declare namespace NodeJS {
  interface ProcessEnv {
    STANDARD_DOMAIN_LIST?: string;
    STANDARD_BSKY_DOMAIN_LIST?: string;
    STANDARD_TIKTOK_DOMAIN_LIST?: string;
    DIRECT_MEDIA_DOMAINS?: string;
    TEXT_ONLY_DOMAINS?: string;
    INSTANT_VIEW_DOMAINS?: string;
    GALLERY_DOMAINS?: string;
    FORCE_MOSAIC_DOMAINS?: string;
    OLD_EMBED_DOMAINS?: string;
    MOSAIC_DOMAIN_LIST?: string;
    MOSAIC_BSKY_DOMAIN_LIST?: string;
    POLYGLOT_DOMAIN_LIST?: string;
    POLYGLOT_ACCESS_TOKEN?: string;
    API_HOST_LIST?: string;
    BLUESKY_API_HOST_LIST?: string;
    ATMOSPHERE_API_HOST_LIST?: string;
    GIF_TRANSCODE_DOMAIN_LIST?: string;
    VIDEO_TRANSCODE_DOMAIN_LIST?: string;
    VIDEO_TRANSCODE_BSKY_DOMAIN_LIST?: string;
    PBS_PROXY_DOMAIN_LIST?: string;
    TWITTER_ROOT?: string;
    SENTRY_DSN?: string;
    RELEASE_NAME?: string;
    /** Inlined from credentials.enc.json at build (see esbuild.config.mjs). */
    ENCRYPTED_CREDENTIALS?: string;
    CREDENTIALS_IV?: string;
  }
}
