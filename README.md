# FxEmbed <img src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/logos/fxembed.svg" height="24">

## Home of FxTwitter, FixupX, and FxBluesky

### Embed videos, polls, quotes, translations, & more on Discord, Telegram, and others!

![][icons]

[![Crowdin][crowdinbadge]][crowdin]
[![esbuild][buildbadge]][build]
[![Tests][testsbadge]][tests]
[![Status][statusbadge]][status]
[![License][licensebadge]][license]

<!-- Links & Badges -->

[icons]: https://skillicons.dev/icons?i=typescript,workers
[build]: https://github.com/FxEmbed/FxEmbed/actions/workflows/build.yml
[buildbadge]: https://github.com/FxEmbed/FxEmbed/actions/workflows/build.yml/badge.svg
[tests]: https://github.com/FxEmbed/FxEmbed/actions/workflows/tests.yml
[testsbadge]: https://github.com/FxEmbed/FxEmbed/actions/workflows/tests.yml/badge.svg
[license]: https://github.com/FxEmbed/FxEmbed/blob/main/LICENSE.md
[licensebadge]: https://img.shields.io/github/license/FxEmbed/FxEmbed
[status]: https://status.fxtwitter.com
[statusbadge]: https://status.fxtwitter.com/api/badge/8/uptime/720?label=Uptime%2030d
[crowdinbadge]: https://badges.crowdin.net/fxtwitter/localized.svg
[crowdin]: https://crowdin.com/project/fxtwitter

## Written in TypeScript as a Cloudflare Worker to scale, packed with more features and [best-in-class user privacy 🔒](#built-with-privacy-in-mind).

### `twitter.com`: Add `fx` before your `twitter.com` link

### `x.com`: Add `fixup` before your `x.com` link

### `bsky.app`: Add `fx` before your `bsky.app` link

## Embed Videos and GIFs

Videos and GIFs just work, so whether you are sharing memes or cat videos, go crazy!

<img width="477px" src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/videos.png">

On Discord, we can also automatically embed videos linked from some other platforms, like YouTube, so they can play without having to open a browser.

## Embed Polls (X/Twitter)

If you want to share the results of a poll, you can do so by just linking the post using FxTwitter or FixupX. This works even if the poll is still ongoing!

<img width="440px" src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/poll.png">

## Embed Quotes & Media

Quotes and their media can provide important context to a post, so they're automatically displayed. We'll even surface their media if there isn't already media embedded in the quote.

<img width="478px" src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/quote.png">

## Translate Posts (X/Twitter)

You can translate a post into any other supported language, with the original and translated text displayed as space allows.

Just append a post with its 2-letter ISO language code. So for English, add `/en` at the end.

Bluesky support is planned in the future, but this currently depends on X/Twitter's Google Translate endpoint.

<img src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/translate.png">

## Direct media links

Want to link directly to a post's media _without_ the embed? You can easily do that!

<img width="490px" src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/directmedia.png">

There are a few supported ways to do this:

- Add `d.` before the domain (so, `d.fxtwitter.com`)
- Add `.mp4` to the end of videos or `.jpg` to the end of images, after the post ID

Examples from above:

- `https://d.fxbsky.app/profile/wuff.gay/post/3lkordyy77k2a`
- `https://fxtwitter.com/example/status/1548119328498728960.mp4`
- `https://fixupx.com/example/status/1548117889437208581.jpg`

Posts with multiple images are supported, so you can do something like this and it will pick the correct one:

`https://d.fixupx.com/example/status/1547514042146865153/photo/3`

Otherwise, it will default to the first image.

## Combine multiple images into one

By default, FxEmbed will display images using Discord's native multi-image so you can view individual, full-quality images. You can also combine multiple images into one mosaic image, like so:

- `https://m.fxtwitter.com/example/status/123456789123456789`
- `https://m.fixupx.com/example/status/123456789123456789`
- `https://m.fxbsky.app/profile/example.com/post/3lkord123abc`

<img width="790px" src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/mosaic.png">

## Gallery view

Use `g.fxtwitter.com` or `g.fixupx.com` to generate minimal embeds with just the post's media and author information without other distractions. This can be particularly useful for read-only channels dedicated to sharing media.

<img src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/gallery.png">

## Text-only view

Basically the opposite of gallery view, use `t.fxtwitter.com` / `t.fixupx.com` to exclude photos/videos and only display text.

<img src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/readme/textonly.png">

## Telegram Instant View

View entire threads without leaving Telegram or opening a browser! You can unroll threads by just linking any part of the original thread. It will also keep track of any posts being replied to, up until the start of a conversation.

<img width="515px" src="https://github.com/FxEmbed/FxEmbed/blob/main/assets/readme/iv.png">

## Replace link shorteners with original link (X/Twitter)

Default X/Twitter embeds include t.co link shorteners, which make it difficult to know where the link is heading. We automatically replace t.co links with their original links to make things clearer.

<img width="395px" src="https://github.com/FxEmbed/FxEmbed/blob/main/assets/readme/tco.png">

## Redirect to Nitter or other custom instances (X/Twitter)

If you want to redirect to Nitter or another custom interface, you can set your custom redirect domain, like so: `https://fxtwitter.com/set_base_redirect?url=https://nitter.net`

At this time, the cookie is only set on the domain you set it on, so if you set it up using `fxtwitter.com`, `fixupx.com` will not redirect to your custom domain unless you set it there.

## Built with privacy in mind

FxEmbed doesn't save logs of what posts you're sending, nor do we have a public record of what posts are being embedded.

In fact, because our core embedding and API service uses Cloudflare Workers, FxEmbed can only run when you send it a request. Its memory doesn't stick around, and it doesn't have a file system or database to read from at all. That is how we keep our privacy promise by building it into the architecture. We use Cloudflare Analytics Engine to aggregate basic, anonymous statistics, which do not include information that could identify individual users or posts. My goal is always to provide a good public service, and FxEmbed doesn't have any ads or tracking to make money off of, nor do we sell data.

Temporary real-time logging in the terminal (specifically `wrangler tail`) may be used only by the developer while the Worker is being serviced or debugged (to make sure things work as they should), however these logs are only shown in the terminal and are never saved or used for any other purpose. URLs that cause runtime errors in the script (aka Exceptions, usually exceedingly rare unless there was a faulty update pushed) may be logged for a developer to diagnose the issue that is preventing your embed from working.

On a different note, if the person who posted a FxTwitter or FixupX link forgot to strip tracking parameters (like `?s` and `&t`), we strip it upon redirecting to the post as they are only used for telemetry and advertising.

---

## Why use FxEmbed?

Let's compare using FxTwitter / FixupX since it's the most feature-complete. Here's a table comparing some of FxTwitter's features compared to Twitter default embeds as well as other embedding services

|                                        |                  FxTwitter / FixupX                  |      Default       |                  vxTwitter (fixvx)                  |
| -------------------------------------- | :--------------------------------------------------: | :----------------: | :-------------------------------------------------: |
| Embed Posts / Image                    |                  :heavy_check_mark:                  | :heavy_check_mark: |                 :heavy_check_mark:                  |
| Embed profile pictures on posts        |                  :heavy_check_mark:                  |        :x:         |         :ballot_box_with_check: If no media         |
| Embed Videos                           |                  :heavy_check_mark:                  |        :x:         |                 :heavy_check_mark:                  |
| Embed External Videos (YouTube, etc.)  |                 :heavy_check_mark:¹                  |        :x:         |                         :x:                         |
| Embed Poll results                     |                  :heavy_check_mark:                  |        :x:         |                 :heavy_check_mark:                  |
| Embed Quotes                           |                  :heavy_check_mark:                  |        :x:         |        :ballot_box_with_check: Without Media        |
| Embed Multiple Images                  |                  :heavy_check_mark:                  |        :x:         |                 :heavy_check_mark:                  |
| Translate Posts                        |                  :heavy_check_mark:                  |        :x:         |                         :x:                         |
| Replace t.co with original links       |                  :heavy_check_mark:                  |        :x:         |                 :heavy_check_mark:                  |
| Redirect to media file (without embed) |                  :heavy_check_mark:                  |        :x:         | :ballot_box_with_check: Subdomain broken, no images |
| Gallery view                           |                  :heavy_check_mark:                  |        :x:         |                         :x:                         |
| Strip tracking info on redirect        |                  :heavy_check_mark:                  |        :x:         |                 :heavy_check_mark:                  |
| Show date / time of post               |  :heavy_minus_sign: Discord / Telegram Instant View  |        :x:         |                         :x:                         |
| Show retweet, like, reply, view counts |  :heavy_minus_sign: Discord / Telegram Instant View  |        :x:         |     :ballot_box_with_check: No replies / views      |
| Discord sed replace (`s/`) friendly    | :ballot_box_with_check: twittpr.com with twitter.com |        N/A         |                         :x:                         |
| Telegram Instant View                  |                  :heavy_check_mark:                  |        :x:         |                         :x:                         |
| Status fetch API for Developers        |                  :heavy_check_mark:                  |        N/A         |                 :heavy_check_mark:                  |
| Last commit                            |                    [![][flc]][fc]                    |        N/A         |                   [![][vlc]][vc]                    |

[flc]: https://img.shields.io/github/last-commit/FxEmbed/FxEmbed?label
[vlc]: https://img.shields.io/github/last-commit/dylanpdx/BetterTwitFix?label
[fc]: https://github.com/FxEmbed/FxEmbed/commits
[vc]: https://github.com/dylanpdx/BetterTwitFix/commits

¹ External media requiring web containers, such as YouTube, won't embed in Telegram because Telegram doesn't support it. Plain media will work in Telegram, and it works either way inside Discord.

---

## Why FxEmbed is nicer to develop for and deploy

FxEmbed was designed for edge computing in mind, meaning it's easy to run closer to your users (which has significant latency advantages for people in many parts of the world). The way we use it and recommend deployment is using Cloudflare Workers, which are completely free for up to 100,000 requests per day, per account. Cloudflare Workers are [fast to set up](https://developers.cloudflare.com/workers/get-started/guide/) and your script is distributed in their datacenters around the world for lower latency. It may be possible to run it on other platforms that support Hono, but at this time we do not provide documentation to do so yet.

## Deploy FxEmbed yourself

ℹ️ Currently, we only provide assistance with deploying with Cloudflare Workers, [but it may be possible to run on other web standards-compliant runtimes](https://hono.dev/getting-started/basic).

- Clone the repo, install [Node.js](https://nodejs.org/) and run `npm install` in the repo directory.
- Copy `wrangler.example.toml` to `wrangler.toml` and add your [Cloudflare account ID](https://developers.cloudflare.com/fundamentals/get-started/basic-tasks/find-account-and-zone-ids/), and change the name of your worker if you need to.
- Also copy `.env.example` to `.env` and change any domains to your desired domain and whatever else you'd like to configure. You can configure branding by copying `branding.example.json` to `branding.json` and configuring it there.
- - (Hint: `activityIcons` can be an array of icon configs for FxEmbed to pick at random) 
- Authenticate with Cloudflare with `npx wrangler login`, then do `npm run deploy` (or `npx wrangler deploy --no-bundle`). 


[If you have more questions about setting up Cloudflare Workers, check out their Getting Started guide](https://developers.cloudflare.com/workers/get-started/guide/).

Once you're set up with your worker on `*.workers.dev`, [add your worker to your custom domain](https://developers.cloudflare.com/workers/platform/routing/custom-domains/).

Populate Sentry details in your `.env` to use Sentry in your product to catch exceptions.

---

## FAQ

### What's the difference between `fxtwitter.com`, `twittpr.com`, and `fixupx.com`?

They all run the exact same worker and function identically... mostly.

`fxtwitter.com` is the primary domain and `fixupx.com` exists to make it easy to fix `x.com` links as well (Very short .com domains are expensive, sorry I didn't get something shorter). Also, `twittpr.com` made it easy to do quick sed replacement on `twitter.com` links by sending the link and sending `s/e/p` afterward to automatically edit it, and you can still use that domain.

### How come embedding takes so long / is not working in Telegram?

Telegram's embedding servers sometimes never even send us a request to embed a URL, possibly due to their servers being overloaded. Try using [Webpage Bot](https://t.me/WebpageBot) to try to clear the cache of the embed.

### What if I don't want to display all images in a given post?

No problem! You can pick any specific photo from a post using Twitter/X's own URL syntax (`/photo/1` is the first photo of a post) and we'll render you just that image. Bluesky has no such syntax for doing this, but we could implement something similar in the future.

### Is FxEmbed associated with [some other website that starts with fx]?

We only operate on these domains:

- `fxtwitter.com` / `twittpr.com`
- `fixupx.com` (also `xfixup.com`)
- `fxbsky.app`

---

**Licensed under the permissive MIT license. Feel free to send a pull request!**

## Star History

<a href="https://star-history.com/#FxEmbed/FxEmbed&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=FxEmbed/FxEmbed&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=FxEmbed/FxEmbed&type=Timeline" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=FxEmbed/FxEmbed&type=Timeline" />
  </picture>
</a>

## Bugs or issues?

Feel free to [open an issue](https://github.com/FxEmbed/FxEmbed/issues)

## Additional Credits

[Mosaic](https://github.com/FxEmbed/mosaic) Multi-image combiner by [Antonio32A](https://github.com/Antonio32A) and improved by [Syfaro](https://github.com/Syfaro) and [Deer Spangle](https://github.com/Deer-Spangle)

[Everyone else who has contributed to the main project!](https://github.com/FxEmbed/FxEmbed/graphs/contributors)

## Disclaimer

Twitter, Tweet, and X are trademarks of X Corp. This project is not affiliated in any way with X Corp or Twitter.
