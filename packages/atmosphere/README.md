# `@fxembed/atmosphere`

Shared **envelope types**, **pure helpers**, **transport** definitions, **relay** helpers, and stubs for authenticated access.

**Providers in this package** (worker keeps Hono/OpenAPI wiring; `src/providers/<name>/` re-exports): Bluesky, Mastodon, Twitter, TikTok, Instagram, Threads.

Mastodon uses `setMastodonProviderEnv` from `./providers/mastodon-runtime` (user agent, mosaic / polyglot lists); the worker sets it at startup.

Twitter uses `setTwitterProviderEnv` from `./providers/twitter-runtime` (API roots, headers, guest token, domain lists). Account proxy credentials stay in the worker: `setTwitterProxyRuntime` registers `initCredentials`, `getRandomTwitterAccount`, etc. (see `src/providers/twitter/proxy/credentials.ts` in FxEmbed).

## Transports

See the [Atmosphere transports guide](https://docs.fxembed.com/deployment/atmosphere-transports/) for transport kinds and fallback behavior.

## Authenticated Bluesky (Horizon / native clients)

OAuth + DPoP + PKCE + PAR (when the auth server advertises it) live under **`@fxembed/atmosphere/providers/bluesky/auth`**. The library is **stateless**: you persist the returned `BlueskyAuthSession` (and short-lived `BlueskyOAuthTransientState` across the redirect).

```ts
import {
  createBlueskyOAuthClient,
  DEFAULT_BLUESKY_OAUTH_SCOPE
} from '@fxembed/atmosphere/providers/bluesky/auth';
import { fetchBlueskyHomeFeed } from '@fxembed/atmosphere/providers/bluesky/home-feed';

const oauth = createBlueskyOAuthClient({
  clientId: 'https://myapp.com/.well-known/oauth-client-metadata.json',
  redirectUris: ['https://myapp.com/auth/callback'],
  scope: DEFAULT_BLUESKY_OAUTH_SCOPE,
  redirectUri: 'https://myapp.com/auth/callback',
  clientName: 'MyApp'
});

const { authUrl, transientState } = await oauth.startAuthorization('user.bsky.social');
// redirect user to authUrl; persist transientState until callback

const { session } = await oauth.completeAuthorization(callbackUrl, transientState);
// persist session

const { response, session: next } = await fetchBlueskyHomeFeed({
  session,
  host: { t: k => k },
  limit: 30
});
// persist next (tokens / DPoP nonce may rotate)
```

- **Feeds / notifications:** `fetchBlueskyHomeFeed`, `fetchBlueskyNotifications`, `getBlueskyNotificationUnreadCount`, `updateBlueskyNotificationSeen` from `providers/bluesky/home-feed` and `providers/bluesky/notifications`.
- **Errors:** `BlueskyAuthError` from `@fxembed/atmosphere/transports` (e.g. `kind: 'refresh_invalid'` → re-run login).

## Scripts

- `npm run openapi:atmosphere` — from the **FxEmbed repo root**; generates OpenAPI path stubs into `src/relay/generated/`.
