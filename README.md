# FxEmbed <img src="https://raw.githubusercontent.com/FxEmbed/FxEmbed/main/assets/logos/fxembed.svg" height="24">

## Home of FxTwitter, FixupX, and FxBluesky

### Embed videos, polls, quotes, translations, & more on Discord, Telegram, and others!

[![Crowdin][crowdinbadge]][crowdin]
[![esbuild][buildbadge]][build]
[![Tests][testsbadge]][tests]
[![Status][statusbadge]][status]
[![License][licensebadge]][license]

<!-- Links & Badges -->

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

### `twitter.com`: Add `fx` before your `twitter.com` link

### `x.com`: Add `fixup` before your `x.com` link

### `bsky.app`: Add `fx` before your `bsky.app` link

## [Documentation](https://docs.fxembed.com)

## [API Reference](https://docs.fxembed.com/api/introduction)

## [Self-Hosting Guide](https://docs.fxembed.com/deployment)

## Docker

FxEmbed is a Cloudflare Worker, so the Docker image runs the local Workers runtime through Wrangler rather than starting a plain Node.js server. The image uses `node:24-bookworm-slim` because Wrangler's `workerd` binary is glibc-linked and does not run reliably on Alpine/musl.

Before building, copy and edit the local configuration files if you need custom domains, branding, or credentials:

```bash
cp .env.example .env
cp wrangler.example.toml wrangler.toml
cp branding.example.json branding.json
```

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

The worker listens on `http://localhost:8787`. Because FxEmbed routes by the `Host` header, test a specific realm like this:

```bash
curl -H "Host: fxtwitter.com" -H "User-Agent: Discordbot/2.0" "http://localhost:8787/user/status/123"
```

You can also open `http://localhost:8787/` without a `Host` header to see the local realm prefixes.

Environment variables from `.env` are bundled during the Docker build, so rebuild the image after changing domain lists or other build-time configuration:

```bash
docker compose up -d --build
```

Runtime secrets such as `CREDENTIAL_KEY` and `EXCEPTION_DISCORD_WEBHOOK` can be supplied through your shell or Compose `.env` file. Stop the service with:

```bash
docker compose down
```

**Licensed under the permissive MIT license. Feel free to send a pull request!**

## Star History

<a href="https://star-history.dera.page/#FxEmbed/FxEmbed&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=FxEmbed/FxEmbed&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=FxEmbed/FxEmbed&type=Timeline" />
    <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=FxEmbed/FxEmbed&type=Timeline" />
  </picture>
</a>

## Bugs or issues?

Feel free to [open an issue](https://github.com/FxEmbed/FxEmbed/issues)

## Additional Credits

[Mosaic](https://github.com/FxEmbed/mosaic) Multi-image combiner by [Antonio32A](https://github.com/Antonio32A) and improved by [Syfaro](https://github.com/Syfaro), [Deer Spangle](https://github.com/Deer-Spangle), and [dangered wolf](https://github.com/dangeredwolf)

[Everyone else who has contributed to the main project!](https://github.com/FxEmbed/FxEmbed/graphs/contributors)

## Disclaimer

Twitter, Tweet, and X are trademarks of X Corp. This project is not affiliated in any way with X Corp or Twitter.
