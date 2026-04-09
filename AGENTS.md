# Agent Guide

## Overview

This is the repo for FxEmbed, the home of FxTwitter, FixupX, and FxBluesky. It is a Cloudflare Worker written in TypeScript using Hono.

The end-user goal is to embed posts on platforms like Discord and Telegram. Internally it is architected to convert different vendor implementations (Twitter, Bluesky, TikTok) into our own API structure to make this happen. 

## Good to know

### Environment variables

We use .env files to store our environment variables rather than using the Wrangler file. To add environment variables, you generally need to add them in a few places:
* The build process [esbuild.config.mjs](esbuild.config.mjs)
* Env variables example file [.env.example](.env.example).
* Deploy CI workflow [deploy.yml](.github/workflows/deploy.yml)
* Test suite [vitest.config.mts](vitest.config.mts)
* Constants file [constants.ts](src/constants.ts)
* Env type declaration file [src/types/env.d.ts](src/types/env.d.ts) file.