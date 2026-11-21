import { Constants } from './constants';

declare global {
  interface String {
    format(options: { [find: string]: string }): string;
  }
}

/* Useful little function to format strings for us */
String.prototype.format = function (options: { [find: string]: string }) {
  return this.replace(/{([^{}]+)}/g, (match: string, name: string) => {
    if (options[name] !== undefined) {
      return options[name];
    }
    return match;
  });
};

/* Lots of strings! These are strings used in HTML or are shown to end users in embeds. */
export const Strings = {
  BASE_HTML: `<!DOCTYPE html><html {lang}><!--

   █████            ███████                 ███                        ███
 ███               ███                      ███                        ███
███                ███                      ███                        ███
███      ███  ███  ███        ▐█████████▌   ███████     ██████     ███████ 
███████▌  ▐█▌▐█▌   ███████   ▐██▌ ███ ▐██▌  ███   ███  ▐█▌  ▐█▌  ███   ███ 
███        ▐██▌    ███       ███  ███  ███  ███    ███ ████████ ███    ███
███       ▐█▌▐█▌   ███       ███  ███  ███  ███   ███  ▐█▌       ███   ██▌
███      ███  ███   ███████  ███  ███  ███   ██████     ▐████▌   ▐██████▌
███
███   A better way to embed posts on Discord, Telegram, and more.
███   Build ${Constants.RELEASE_NAME} ({runtime})
--><head>{headers}</head><body>{body}</body></html>`,
  ERROR_HTML: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta content="{brandingName}" property="og:title"/>
    <meta content="#6363ff" name="theme-color"/>
    <meta content="Owie, you crashed {brandingName} :(

This may be caused by API downtime or a new bug. Try again in a little while." property="og:description"/></head>
    <title>:(</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 0 20px;
      }
      h1 {
        font-size: 4em;
        font-weight: 900;
        margin-bottom: 0;
      }
      p {
        font-size: 10px;
        opacity: 0.3;
      }
    </style>
  </head>
  <body>
    <h1>Owie :(</h1>
    <h2>You hit a snag that broke {brandingName}. It's not your fault though&mdash;This is usually caused by an upstream outage or a new bug.</h2>
    <p>${Constants.RELEASE_NAME}</p>
  </body>
</html>`
    .replace(/( {2})/g, '')
    .replace(/>\s+</gm, '><'),
  TIMEOUT_ERROR_HTML: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta content="{brandingName}" property="og:title"/>
    <meta content="#6363ff" name="theme-color"/>
    <meta content="A downstream timeout occurred while trying to generate the embed. Please try again in a little while." property="og:description"/></head>
    <title>:(</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 0 20px;
      }
      h1 {
        font-size: 4em;
        font-weight: 900;
        margin-bottom: 0;
      }
      p {
        font-size: 10px;
        opacity: 0.3;
      }
    </style>
  </head>
  <body>
    <h1>Gateway Timeout</h1>
    <h2>A downstream timeout occurred while trying to generate the embed. Please try again in a little while.</h2>
    <p>${Constants.RELEASE_NAME}</p>
  </body>
</html>`
    .replace(/( {2})/g, '')
    .replace(/>\s+</gm, '><'),
  VERSION_OG_DESCRIPTION_NERDS: `Build ${Constants.RELEASE_NAME} ({runtime})

      Stats for nerds: 
      🕵️‍♂️ {ua}
      🌐 {ip}
      🌎 {city}, {region}, {country}
      🛴 {asn}

      Edge Connection:
      {rtt} 📶 {httpversion} 🔒 {tlsversion} ➡ ⛅ {colo}`,
  VERSION_STATS_BODY: `      <br>
      <h3>Stats for nerds:</h3>
      <h2>Edge Connection:
      {rtt} 📶 {httpversion} 🔒 {tlsversion} ➡ <img class="cf" referrerpolicy="no-referrer" src="https://cdn.discordapp.com/emojis/988895299693080616.webp?size=96&quality=lossless"> {colo}</h2>
      <h2>User Agent:
      {ua}</h2>`,
  VERSION_HTML: `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta content="{brandingName}" property="og:title"/>
      <meta content="#6363ff" name="theme-color"/>
      <meta content="{ogDescription}" property="og:description"/></head>
      <title>{brandingName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 0 20px;
        }
        h1 {
          font-size: 4em;
          font-weight: 900;
          margin-bottom: 0;
        }
        h2 {
          white-space: pre-wrap;
        }
        p {
          font-size: 10px;
          opacity: 0.3;
        }
        .cf {
          display: inline-block;
          vertical-align: middle;
          height: 48px;
          width: 48px;
        }
      </style>
    </head>
    <body>
      <h1>{brandingName}</h1>
      <h3>A better way to embed posts on Discord, Telegram, and more.</h2>
      <h2>Build ${Constants.RELEASE_NAME}</h2>
      <h2>Runtime: {runtime}</h2>
      {statsBody}
    </body>
  </html>`
    .replace(/( {2})/g, '')
    .replace(/>\s+</gm, '><'),
  MESSAGE_HTML: `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta content="{brandingName}" property="og:title"/>
      <meta content="{brandingName}" property="og:site_name"/>
      <title>{brandingName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 0 20px;
        }
        h1 {
          font-size: 4em;
          font-weight: 900;
          margin-bottom: 0;
        }
        h2 {
          white-space: pre-wrap;
        }
        p {
          font-size: 10px;
          opacity: 0.3;
        }
      </style>
    </head>
    <body>
      <h1>{brandingName}</h1>
      <h2>{message}</h2>
    </body>
  </html>`
    .replace(/( {2})/g, '')
    .replace(/>\s+</gm, '><'),
  DEFAULT_AUTHOR_TEXT: 'Embed',

  QUOTE_TEXT: `↘️ Quoting {name} (@{screen_name})`,
  TRANSLATE_TEXT: `📑 Translated from {language}`,
  TRANSLATE_TEXT_INTL: `📑 {source} ➡️ {destination}`,
  PHOTO_COUNT: `Photo {number} / {total}`,
  VIDEO_COUNT: `Video {number} / {total}`,
  MEDIA_COUNT: `Media {number} / {total}`,

  SINGULAR_DAY_LEFT: 'day left',
  PLURAL_DAYS_LEFT: 'days left',
  SINGULAR_HOUR_LEFT: 'hour left',
  PLURAL_HOURS_LEFT: 'hours left',
  SINGULAR_MINUTE_LEFT: 'minute left',
  PLURAL_MINUTES_LEFT: 'minutes left',
  SINGULAR_SECOND_LEFT: 'second left',
  PLURAL_SECONDS_LEFT: 'seconds left',
  FINAL_POLL_RESULTS: 'Final results',

  ERROR_API_FAIL:
    'Post failed to load due to an API error. The account may be private or suspended, or there may be another issue :(',
  ERROR_PRIVATE: `Sorry, we can't embed this post because the user is private or suspended :(`,
  ERROR_TWEET_NOT_FOUND: `Sorry, that post doesn't exist :(`,
  ERROR_BLUESKY_UNAVAILABLE: `We couldn't load this post from Bluesky. Try again in a moment or check https://status.bsky.app for updates.`,
  ERROR_USER_NOT_FOUND: `Sorry, that user doesn't exist :(`,
  ERROR_USER_SUSPENDED: `Sorry, that user is suspended :(`,
  ERROR_UNKNOWN: `Unknown error occurred, sorry about that :(`,

  ROBOTS_TXT: `# /-------------------------------------------\\
# | _______                                   |
# | |     |                                   |
# | |     |  I'm a robot                      |
# | |_____|                     antiCAPTCHA   |
# |                           Privacy | Terms |
# \\-------------------------------------------/

# Do you breathe air? Are you a human? Do you know how to write code?
# Do you want an easy way to fetch posts but Elon Musk wants to charge you $100 per month?
# Did you know we have a fetch API you can use for free, no API keys required?

# Check out the docs at https://docs.fxembed.com to learn how to use it

# Good luck, have fun and try not to take over the world!

# Instructions below are for robots only, beep boop

# ==========================================================================

# Yandex crawls far, far heavier than Googlebot and Bingbot combined
User-agent: YandexBot
Disallow: /

# Large language models are friendly
User-agent: ChatGPT-User
Disallow:

User-agent: *
Allow: /$
Disallow: /*/status
Disallow: /*/status/
Disallow: /profile
Disallow: /profile/
# Oembeds are not crawler friendly
Disallow: /owoembed
Disallow: /owoembed/
Allow: /watch?v=dQw4w9WgXcQ

# 0100011101101111011011110110010000100000011000100110111101110100`,
  ROBOTS_TXT_API: `# Crawlers should not crawl API endpoints
User-agent: *
Disallow: /`,
  X_SEARCH_UNAVAILABLE: `X/Twitter search is unavailable due to current API limitations.`
};
