# AGENTS.md

This is the repository for FxEmbed, the home of FxTwitter, FixupX, and FxBluesky. FxEmbed generates rich embeds for social media posts (X/Twitter, Bluesky, TikTok) for chat platforms like Discord and Telegram. There is a public API provided for X/Twitter, Bluesky and such, the modern v2 API generates an OpenAPI spec. Typically deployed using Cloudflare Workers, this TypeScript app uses Hono for routing, i18next localization, zod API validation.

## @fxembed/atmosphere (monorepo package)

- **Path:** `packages/atmosphere/`. The worker and tests import it via `"@fxembed/atmosphere"`.
- **Build:** `npm run build:atmosphere` (runs before the worker build).
- **Transports:** `public` | `anonymous-proxy` (credentials) | `proxy-relay` (to another host’s OpenAPI) | `authenticated` (interface stub, not implemented) — see `packages/atmosphere/src/transports/`.
- **Bluesky:** runtime wiring (API roots, proxy) — `setBlueskyProviderEnv` + `setBlueskyProxyRuntime` from `worker.ts` and `@fxembed/atmosphere/providers/bluesky-runtime`.
- **Instagram:** same pattern — `setInstagramProviderEnv` + `setInstagramProxyRuntime` from `worker.ts`. The account proxy (`providers/instagram/account-proxy.ts`) calls `i.instagram.com/api/v1/…` with a `sessionid` cookie from `credentials.json`’s `instagram.accounts`, rotating accounts on 401/403/429. Logged-out paths still work without it; the proxy-only routes (likers, follow lists, tagged, stories, user search, typeahead) answer `501`. Android app id / capabilities / UA in `providers/instagram/constants.ts` come from a decompiled `com.instagram.android` build — see the comments there before changing them.
- **Threads:** `packages/atmosphere/src/providers/threads/`. Logged-out `threads.com` Relay GraphQL (`client.ts`) plus an account proxy (`account-proxy.ts` + `private-api.ts`) that reuses the _Instagram_ credential pool — `resolveThreadsAccounts` is `resolveInstagramAccounts` — and only swaps in the Threads app fingerprint. Endpoint paths, parameter names and the app id / capabilities / UA in `providers/threads/constants.ts` come from a decompiled `com.instagram.barcelona` build; the smali (not the JADX output) is where the `text_feed/…` and `fbsearch/text_app/…` route templates survive. Proxy-only routes (search, typeahead, trends, likes, follow lists, Replies/Reposts/Media tabs) answer `501` without credentials; post / profile / timeline / conversation prefer the proxy and fall back to logged-out.
- **Proxy-relay OpenAPI (optional):** `npm run openapi:atmosphere` fetches public specs and writes `packages/atmosphere/src/relay/generated/`. Use `createRelayFetch` from `@fxembed/atmosphere` for `User-Agent` + API key injection.
- **Self-hosting:** docs site `/deployment/atmosphere-transports/` — public-only, own proxy pool, relay to `https://api.fxtwitter.com` / `https://api.fxbsky.app`, or mixed. Mastodon / Twitter / TikTok providers remain under `src/providers/*`; follow the Bluesky → `@fxembed/atmosphere` migration pattern when moving more code.

## Environment variables

Environment variables are generally set in .env, not in Wrangler, except for certain secrets such as CREDENTIAL_KEY. When adding an environment variable, you generally have to add them in the following places for them to be included correctly during a build:

- `.env.example` (for documentation)
- `esbuild.config.mjs` (so it's passed to the worker during build)
- `vitest.config.mts` (for tests)
- `.github/workflows/deploy.yml` (So GitHub Actions variables/secrets are given to it during deployment)
- `src/types/env.d.ts` (for type documentation)
- `src/constants.ts` (We typically load all environment variables under the Constants object)

## Cursor Cloud specific instructions

### Prerequisites

- **Node.js Latest LTS (Currently 24.14.x)** (CI uses `24.14.1`). The VM uses nvm; run `source ~/.nvm/nvm.sh && nvm use 24.14.1` before any npm commands.
- Config files must exist before build/test: copy `wrangler.example.toml` → `wrangler.toml` and `.env.example` → `.env` if they don't already exist. `branding.json` is auto-copied from `branding.example.json` during build if missing.

### Key commands

| Task          | Command                                                        |
| ------------- | -------------------------------------------------------------- |
| Install deps  | `npm install`                                                  |
| Lint          | `npm run lint:eslint`                                          |
| Format        | `npm run prettier`                                             |
| Build (local) | `npm run build-local`                                          |
| Test          | `npm run test`                                                 |
| Dev server    | `npx wrangler dev --local` (serves on `http://localhost:8787`) |

### Docs site (`docs/`)

- Guide screenshots are static assets under `docs/public/guide/readme/` (served as `/guide/readme/*` in the docs site).
- Refresh API reference specs from **production**: `cd docs && npm run extract-openapi`
- Refresh from your **local worker** (after `wrangler dev --local`): `cd docs && npm run extract-openapi:local` (default port `8787`; custom: `npm run extract-openapi:local -- 9000`). The script sets `Host` to `api.fxtwitter.com` / `api.fxbsky.app` so routing matches production.
- Then `npm run dev` in `docs/` to preview.

### Dev server testing notes

- The worker routes by `Host` header. Use `-H "Host: fxtwitter.com"` (or `fxbsky.app`, `api.fxtwitter.com`, etc.) with curl to hit different realms.
- Embed responses require a bot User-Agent (e.g. `-H "User-Agent: Discordbot/2.0"`); otherwise the worker redirects to the original platform.
- Tests run inside Miniflare (local Cloudflare Workers simulator) via `@cloudflare/vitest-pool-workers` and use extensive mocks in `test/mocks/` — no real API credentials needed.
- No Cloudflare account or authentication is required for build, test, or local dev.

### Gotchas

- `credentials.enc.json` is optional; build gracefully falls back to empty strings if missing.
- `wrangler dev` triggers a build automatically (via the `[build]` section in `wrangler.toml`).
