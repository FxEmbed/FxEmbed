import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import * as esbuild from 'esbuild';

import fs from 'fs';

config();

// check if no-sentry-upload command line argument is set
const noSentryUpload = process.argv.includes('--no-sentry-upload');

// check if we're in wrangler dev mode (wrangler sets WRANGLER_COMMAND=dev)
const isWranglerDev = process.env.WRANGLER_COMMAND === 'dev';

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
const gitUrl = execSync('git remote get-url origin').toString().trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD')
  .toString()
  .trim()
  .replace(/[\\\/]/g, '-');

let workerName = 'fixtweet';

// Get worker name from wrangler.toml

try {
  workerName = fs
    .readFileSync('wrangler.toml')
    .toString()
    .match(/name ?= ?"(.+?)"/)[1];
} catch (e) {
  console.error(`Error reading wrangler.toml to find worker name, using 'fixtweet' instead.`);
}

const releaseName = `${workerName}-${gitBranch}-${gitCommit}-${new Date()
  .toISOString()
  .substring(0, 19)}`;

let envVariables = [
  'STANDARD_DOMAIN_LIST',
  'STANDARD_BSKY_DOMAIN_LIST',
  'STANDARD_TIKTOK_DOMAIN_LIST',
  'DIRECT_MEDIA_DOMAINS',
  'TEXT_ONLY_DOMAINS',
  'INSTANT_VIEW_DOMAINS',
  'GALLERY_DOMAINS',
  'FORCE_MOSAIC_DOMAINS',
  'MOSAIC_DOMAIN_LIST',
  'MOSAIC_BSKY_DOMAIN_LIST',
  'POLYGLOT_DOMAIN_LIST',
  'POLYGLOT_ACCESS_TOKEN',
  'API_HOST_LIST',
  'SENTRY_DSN',
  'GIF_TRANSCODE_DOMAIN_LIST',
  'OLD_EMBED_DOMAINS'
];

// Create defines for all environment variables
let defines = {};
for (let envVar of envVariables) {
  defines[envVar] = `"${process.env[envVar]}"`;
}

defines['RELEASE_NAME'] = `"${releaseName}"`;

const plugins = [];

if (process.env.SENTRY_DSN && !noSentryUpload && !isWranglerDev) {
  plugins.push(
    sentryEsbuildPlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      telemetry: false,

      release: {
        name: releaseName,
        create: true,
        vcsRemote: gitUrl,
        setCommits: {
          auto: true,
          ignoreMissing: true
        }
      },

      // Auth tokens can be obtained from
      // https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
      authToken: process.env.SENTRY_AUTH_TOKEN
    })
  );
}

// if branding.json doesn't exist, copy branding.example.json to branding.json, we need this for CI tests
if (!fs.existsSync('branding.json')) {
  fs.copyFileSync('branding.example.json', 'branding.json');
}

await esbuild.build({
  entryPoints: ['src/worker.ts'],
  sourcemap: 'external',
  outdir: 'dist',
  minify: true,
  bundle: true,
  format: 'esm',
  plugins: plugins,
  define: defines
});
