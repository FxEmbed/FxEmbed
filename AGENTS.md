# AGENTS.md

This is the repository for FxEmbed, the home of FxTwitter, FixupX, and FxBluesky. FxEmbed generates rich embeds for social media posts (X/Twitter, Bluesky, TikTok) for chat platforms like Discord and Telegram. There is a public API provided for X/Twitter, Bluesky and such, the modern v2 API generates an OpenAPI spec. Typically deployed using Cloudflare Workers, this TypeScript app uses Hono for routing, i18next localization, zod API validation. 

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

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Lint | `npm run lint:eslint` |
| Format | `npm run prettier` |
| Build (local) | `npm run build-local` |
| Test | `npm run test` |
| Dev server | `npx wrangler dev --local` (serves on `http://localhost:8787`) |

### Dev server testing notes

- The worker routes by `Host` header. Use `-H "Host: fxtwitter.com"` (or `fxbsky.app`, `api.fxtwitter.com`, etc.) with curl to hit different realms.
- Embed responses require a bot User-Agent (e.g. `-H "User-Agent: Discordbot/2.0"`); otherwise the worker redirects to the original platform.
- Tests run inside Miniflare (local Cloudflare Workers simulator) via `@cloudflare/vitest-pool-workers` and use extensive mocks in `test/mocks/` — no real API credentials needed.
- No Cloudflare account or authentication is required for build, test, or local dev.

### Gotchas

- `credentials.enc.json` is optional; build gracefully falls back to empty strings if missing.
- `wrangler dev` triggers a build automatically (via the `[build]` section in `wrangler.toml`).
