import { Env, Hono } from 'hono';
import { timing } from 'hono/timing';
import { logger } from 'hono/logger';
import { sentry } from '@hono/sentry';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { rewriteFramesIntegration } from 'toucan-js';

import { Strings } from './strings';
import { Constants } from './constants';
import {
  setBlueskyProviderEnv,
  setBlueskyProxyRuntime
} from '@fxembed/atmosphere/providers/bluesky-runtime';
import { setMastodonProviderEnv } from '@fxembed/atmosphere/providers/mastodon-runtime';
import {
  setTwitterProviderEnv,
  setTwitterProxyRuntime
} from '@fxembed/atmosphere/providers/twitter-runtime';
import * as proxyCreds from './providers/twitter/proxy/credentials';

setBlueskyProviderEnv({
  apiRoot: Constants.BLUESKY_API_ROOT,
  webRoot: Constants.BLUESKY_ROOT,
  videoBase: Constants.BLUESKY_VIDEO_BASE,
  mosaicBskyDomainList: Constants.MOSAIC_BSKY_DOMAIN_LIST,
  polyglotDomainList: Constants.POLYGLOT_DOMAIN_LIST
});

setBlueskyProxyRuntime({
  initCredentials: proxyCreds.initCredentials,
  hasBundledEncryptedCredentials: proxyCreds.hasBundledEncryptedCredentials,
  hasBlueskyProxyAccounts: proxyCreds.hasBlueskyProxyAccounts,
  getShuffledBlueskyAccounts: proxyCreds.getShuffledBlueskyAccounts,
  blueskyProxyServiceHostname: proxyCreds.blueskyProxyServiceHostname
});

setMastodonProviderEnv({
  userAgent: Constants.FRIENDLY_USER_AGENT,
  mosaicDomainList: Constants.MOSAIC_DOMAIN_LIST,
  polyglotDomainList: Constants.POLYGLOT_DOMAIN_LIST
});

setTwitterProviderEnv({
  apiRoot: Constants.TWITTER_API_ROOT,
  webRoot: Constants.TWITTER_ROOT,
  friendlyUserAgent: Constants.FRIENDLY_USER_AGENT,
  guestBearerToken: Constants.GUEST_BEARER_TOKEN,
  baseHeaders: Constants.BASE_HEADERS,
  guestTokenMaxAge: Constants.GUEST_TOKEN_MAX_AGE,
  mosaicDomainList: Constants.MOSAIC_DOMAIN_LIST,
  mosaicBskyDomainList: Constants.MOSAIC_BSKY_DOMAIN_LIST,
  polyglotDomainList: Constants.POLYGLOT_DOMAIN_LIST,
  apiHostList: Constants.API_HOST_LIST,
  videoBase: Constants.TWITTER_VIDEO_BASE,
  gifTranscodeDomainList: Constants.GIF_TRANSCODE_DOMAIN_LIST,
  oldEmbedDomains: Constants.OLD_EMBED_DOMAINS,
  blueskyApiHostList: Constants.BLUESKY_API_HOST_LIST
});

setTwitterProxyRuntime({
  initCredentials: proxyCreds.initCredentials,
  hasBundledEncryptedCredentials: proxyCreds.hasBundledEncryptedCredentials,
  hasDecryptedCredentials: proxyCreds.hasDecryptedCredentials,
  getRandomTwitterAccount: proxyCreds.getRandomTwitterAccount
});
import { api } from './realms/api/router';
import { twitter } from './realms/twitter/router';
import { cacheMiddleware } from './caches';
import { bluesky } from './realms/bluesky/router';
import { blueskyApi } from './realms/bluesky-api/router';
import { atmosphere } from './realms/atmosphere/router';
import { getBranding } from './helpers/branding';
import { tiktok } from './realms/tiktok/router';
import { instagram } from './realms/instagram/router';

const noCache = 'max-age=0, no-cache, no-store, must-revalidate';
const embeddingClientRegex =
  /(discordbot|telegrambot|facebook|whatsapp|firefox\/92|vkshare|revoltchat|preview|iframely)/gi;

/* This is the root app which contains route trees for multiple "realms".

   We use the term "realms" rather than domains because of the way FxEmbed is structured.
   fxtwitter.com and fixupx.com both contain the exact same content, but api.fxtwitter.com does not*, despite technically
   being the same domain as fxtwitter.com. Similarly, d.fxtwitter.com and other subdomain flags, etc. 
   And of course, fxbsky.app runs on the separate FxBluesky realm.
   This allows us to connect a single FxEmbed worker to tons of domains and still route them to the correct content.
   

   * Under the old system with itty-router, this was not the case, but it is since adopting Hono. This will be necessary for FxTwitter API v2. */
export const app = new Hono<{
  Bindings: {
    /** Optional: tests use a Fetcher mock; production uses in-process proxy + CREDENTIAL_KEY. */
    TwitterProxy?: Fetcher;
    CREDENTIAL_KEY?: string;
    EXCEPTION_DISCORD_WEBHOOK?: string;
    AnalyticsEngine: AnalyticsEngineDataset;
  };
}>({
  getPath: req => {
    let url: URL;

    try {
      url = new URL(req.url);
    } catch (_e) {
      return '/error';
    }
    const baseHostName = url.hostname.split('.').slice(-2).join('.');
    let realm = 'twitter';
    /* Override if in API_HOST_LIST. Note that we have to check full hostname for this. */
    if (Constants.API_HOST_LIST.includes(url.hostname)) {
      realm = 'api';
      console.log('API realm');
    } else if (Constants.BLUESKY_API_HOST_LIST.includes(url.hostname)) {
      realm = 'blueskyapi';
      console.log('Bluesky API realm');
    } else if (Constants.ATMOSPHERE_API_HOST_LIST.includes(url.hostname)) {
      realm = 'atmosphere';
      console.log('Atmosphere API realm');
    } else if (Constants.STANDARD_DOMAIN_LIST.includes(baseHostName)) {
      realm = 'twitter';
      console.log('Twitter realm');
    } else if (Constants.STANDARD_BSKY_DOMAIN_LIST.includes(baseHostName)) {
      realm = 'bluesky';
      console.log('Bluesky realm');
    } else if (Constants.STANDARD_TIKTOK_DOMAIN_LIST.includes(baseHostName)) {
      realm = 'tiktok';
      console.log('TikTok realm');
    } else if (Constants.STANDARD_INSTAGRAM_DOMAIN_LIST.includes(baseHostName)) {
      realm = 'instagram';
      console.log('Instagram realm');
    } else if (
      baseHostName.includes('workers.dev') ||
      baseHostName.includes('localhost') ||
      baseHostName.includes('127.0.0.1')
    ) {
      realm = '';
      console.log(
        `Domain not assigned to realm, falling back to root as we are on workers.dev: ${url.hostname}`
      );
    } else {
      console.log(`Domain not assigned to realm, falling back to Twitter: ${url.hostname}`);
    }
    /* Defaults to Twitter realm if unknown domain specified (such as the *.workers.dev hostname) */

    if (realm) {
      console.log(`/${realm}${url.pathname}`);
      return `/${realm}${url.pathname}`;
    } else {
      console.log(`${url.pathname}`);
      return `${url.pathname}`;
    }
  }
});

if (process.env.SENTRY_DSN) {
  app.use(
    '*',
    sentry({
      dsn: process.env.SENTRY_DSN,
      requestDataOptions: {
        allowedHeaders: /(.*)/,
        allowedSearchParams: /(.*)/
      },

      integrations: [rewriteFramesIntegration({ root: '/' })],
      release: Constants.RELEASE_NAME
    })
  );
}

app.use('*', async (c, next) => {
  /* Apply all headers from Constants.RESPONSE_HEADERS */
  for (const [header, value] of Object.entries(Constants.RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  await next();
});

app.onError((err, c) => {
  c.get('sentry')?.captureException?.(err);
  console.error(err.stack);
  let errorCode = 500;
  if (err.name === 'AbortError') {
    errorCode = 504;
  }
  /* We return it as a 200 so embedded applications can display the error */
  if (c.req.header('User-Agent')?.match(embeddingClientRegex)) {
    errorCode = 200;
  }
  c.header('cache-control', noCache);

  const branding = getBranding(c);

  return c.html(
    Strings.ERROR_HTML.format({ brandingName: branding.name }),
    errorCode as ContentfulStatusCode
  );
});

const customLogger = (message: string, ...rest: string[]) => {
  console.log(message, ...rest);
};

app.use('*', logger(customLogger));

app.use('*', async (c, next) => {
  if (c.req.raw.cf) {
    const cf = c.req.raw.cf;
    console.log(`Hello from ⛅ ${cf.colo ?? 'UNK'}`);
    console.log(
      `📶 ${cf.httpProtocol ?? 'Unknown HTTP Protocol'} 🏓 ${cf.clientTcpRtt ?? 'N/A'} ms RTT 🔒 ${
        cf.tlsVersion ?? 'Unencrypted Connection'
      } (${cf.tlsCipher ?? ''})`
    );
    console.log(
      `🗺️  ${cf.city ?? 'Unknown City'}, ${cf.regionCode ? cf.regionCode + ', ' : ''}${
        cf.country ?? 'Unknown Country'
      } ${cf.isEUCountry ? '(EU)' : ''}`
    );
    console.log(
      `🌐 ${c.req.header('x-real-ip') ?? ''} (${cf.asn ? 'AS' + cf.asn : 'Unknown ASN'}, ${
        cf.asOrganization ?? 'Unknown Organization'
      })`
    );
  } else {
    console.log(`🌐 ${c.req.header('x-real-ip') ?? ''}`);
  }
  console.log('🕵️‍♂️', c.req.header('user-agent'));
  console.log('------------------');
  await next();
});

app.use('*', cacheMiddleware());
app.use('*', timing({ enabled: false }));

app.get('/', c => {
  c.header('cache-control', noCache);
  return c.text(
    `You're running FxEmbed locally without a host header set to a valid realm domain. This means instead of falling back to Twitter realm, we expose all of them for you to poke at.

    To get responses from a particular realm, set the Host header (set in .env), for example:
      curl -H "Host: fxtwitter.com" "http://localhost:8787/user/status/123"
    
    Or you can access all realms by their path prefix:
      /twitter/...     FxTwitter / FixupX
      /bluesky/...     FxBluesky
      /tiktok/...      FixTok
      /instagram/...   FxInstagram
      /api/...         FxTwitter API
      /blueskyapi/...  FxBluesky API
      /atmosphere/...  Atmosphere API (multi-provider)
    `,
    200
  );
});

app.route(`/api`, api);
app.route(`/blueskyapi`, blueskyApi);
app.route(`/atmosphere`, atmosphere);
app.route(`/twitter`, twitter);
app.route(`/bluesky`, bluesky);
app.route(`/tiktok`, tiktok);
app.route(`/instagram`, instagram);

app.all('/error', async c => {
  c.header('cache-control', noCache);

  /* We return it as a 200 so embedded applications can display the error */
  if (c.req.header('User-Agent')?.match(embeddingClientRegex)) {
    const branding = getBranding(c);
    return c.html(Strings.ERROR_HTML.format({ brandingName: branding.name }), 200);
  }
  return c.body('', 400);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return await app.fetch(request, env, ctx);
    } catch (err) {
      console.error(err);
      const e = err as Error;
      console.log(`Ouch, that error hurt so much Sentry couldn't catch it`);
      console.log(e.stack);
      let errorCode = 500;
      if (e.name === 'AbortError') {
        errorCode = 504;
      }
      /* We return it as a 200 so embedded applications can display the error */
      if (request.headers.get('user-agent')?.match(embeddingClientRegex)) {
        errorCode = 200;
      }
      const branding = getBranding(request);

      return new Response(
        e.name === 'AbortError'
          ? Strings.TIMEOUT_ERROR_HTML.format({ brandingName: branding.name })
          : Strings.ERROR_HTML.format({ brandingName: branding.name }),
        {
          headers: {
            ...Constants.RESPONSE_HEADERS,
            'content-type': 'text/html;charset=utf-8',
            'cache-control': noCache
          },
          status: errorCode
        }
      );
    }
  }
};
