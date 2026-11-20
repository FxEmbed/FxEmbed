#!/usr/bin/env node
/**
 * OrcaRouter credential management for a self-hosted FxEmbed deployment.
 *
 * Two independent ways to get a credential, matching the two adapters in
 * `src/helpers/orcarouter/credential.ts`:
 *
 *   npm run orcarouter:login                 # OAuth 2.0 + PKCE (Flow B, out-of-band code)
 *   npm run orcarouter:key -- sk-orca-…      # paste an existing API key
 *   npm run orcarouter:status                # show which one is configured (masked)
 *   npm run orcarouter:logout                # clear the stored credential
 *
 * Credentials are written to `.env`, which is the project's existing secret mechanism and
 * is already gitignored. The verifier never leaves this process and neither the verifier
 * nor the key is ever printed.
 */
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

import { connectOrcaWithPastedCode, OrcaAuthError } from '../src/helpers/orcarouter/connect.ts';
import {
  maskOrcaKey,
  looksLikeOrcaKey,
  redactOrcaSecrets
} from '../src/helpers/orcarouter/credential.ts';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repoRoot, '.env');

config({ path: envPath, quiet: true });

/** `.env` keys this tool owns. */
const KEY_ENV_NAME = 'ORCAROUTER_API_KEY';
const OAUTH_ENV_NAME = 'ORCAROUTER_OAUTH_KEY';

const APP_NAME = 'FxEmbed';

function readEnvFile() {
  if (!existsSync(envPath)) return [];
  return readFileSync(envPath, 'utf8').split('\n');
}

/**
 * Replace or append one key in `.env` without disturbing any other line. Values are quoted
 * so a key containing `#` or spaces cannot truncate or split the entry.
 */
function writeEnvValue(name, value) {
  const lines = readEnvFile();
  const rendered = `${name} = "${value}"`;
  const index = lines.findIndex(line => new RegExp(`^\\s*${name}\\s*=`).test(line));
  if (index >= 0) {
    lines[index] = rendered;
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(rendered);
  }
  writeFileSync(envPath, lines.join('\n'), 'utf8');
}

function removeEnvValue(name) {
  const lines = readEnvFile().filter(line => !new RegExp(`^\\s*${name}\\s*=`).test(line));
  writeFileSync(envPath, lines.join('\n'), 'utf8');
}

function resolveOriginsOrExit() {
  try {
    return resolveOrcaOrigins(process.env);
  } catch (error) {
    console.error(`✖ ${redactOrcaSecrets(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
}

/** Run the out-of-band flow, printing only the consent URL and the user's own code entry. */
async function login() {
  const origins = resolveOrcaOrigins(process.env);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('Connecting to OrcaRouter with OAuth 2.0 + PKCE (out-of-band code).\n');
    console.log(`Auth origin:  ${origins.authBase}`);
    console.log(`Inference:    ${origins.apiBase}\n`);

    const result = await connectOrcaWithPastedCode({
      origins,
      appName: APP_NAME,
      promptForCode: async authorizeUrl => {
        console.log('Open this URL, approve access, then paste the code shown on the page:\n');
        console.log(`  ${authorizeUrl}\n`);
        const answer = await rl.question('Code (blank to cancel): ');
        return answer.trim() === '' ? null : answer;
      }
    });

    writeEnvValue(OAUTH_ENV_NAME, result.apiKey);
    console.log(`\n✔ Stored a ${result.scope}-scoped OrcaRouter key in .env as ${OAUTH_ENV_NAME}`);
    console.log(`  Key: ${maskOrcaKey(result.apiKey)}`);
    console.log('  This key is reused until you revoke it — no re-authorization on every launch.');
    console.log('  Manage or revoke it at https://www.orcarouter.ai/console/authorized-apps');
  } finally {
    rl.close();
  }
}

/** Store a pasted key. Kept separate from the login path so neither replaces the other. */
function storeApiKey(rawKey) {
  const key = (rawKey ?? '').trim();
  if (!key) {
    console.error(`✖ No key given. Usage: npm run orcarouter:key -- sk-orca-…`);
    process.exit(1);
  }
  if (!looksLikeOrcaKey(key)) {
    // A prefix is not proof of validity, but an obvious typo is worth catching here.
    console.error('✖ That does not look like an OrcaRouter key (expected an `sk-orca-…` value).');
    process.exit(1);
  }
  writeEnvValue(KEY_ENV_NAME, key);
  console.log(`✔ Stored an OrcaRouter API key in .env as ${KEY_ENV_NAME}`);
  console.log(`  Key: ${maskOrcaKey(key)}`);
  console.log('  Validity is established by the first real request.');
}

function status() {
  const origins = resolveOrcaOrigins(process.env);
  const apiKey = process.env[KEY_ENV_NAME]?.trim();
  const oauthKey = process.env[OAUTH_ENV_NAME]?.trim();

  console.log(`Auth origin:  ${origins.authBase}`);
  console.log(`Inference:    ${origins.apiBase}\n`);
  console.log(`API key      (${KEY_ENV_NAME}): ${apiKey ? maskOrcaKey(apiKey) : 'not set'}`);
  console.log(`PKCE login   (${OAUTH_ENV_NAME}): ${oauthKey ? maskOrcaKey(oauthKey) : 'not set'}`);
  console.log(
    `\nIn use: ${
      apiKey
        ? `API key (${KEY_ENV_NAME})`
        : oauthKey
          ? `PKCE login (${OAUTH_ENV_NAME})`
          : 'none — OrcaRouter disabled'
    }`
  );
}

function logout() {
  removeEnvValue(OAUTH_ENV_NAME);
  console.log(`✔ Removed ${OAUTH_ENV_NAME} from .env.`);
  console.log('  Revoke the key itself at https://www.orcarouter.ai/console/authorized-apps');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'login':
      await login();
      break;
    case 'key':
      storeApiKey(rest[0] ?? process.env.ORCAROUTER_KEY_INPUT);
      break;
    case 'status':
      status();
      break;
    case 'logout':
      logout();
      break;
    default:
      console.log(
        [
          'OrcaRouter credential management',
          '',
          '  npm run orcarouter:login              OAuth 2.0 + PKCE (out-of-band code)',
          '  npm run orcarouter:key -- sk-orca-…   store an existing API key',
          '  npm run orcarouter:status             show the configured credential (masked)',
          '  npm run orcarouter:logout             clear the stored credential'
        ].join('\n')
      );
      if (command) process.exit(1);
  }
}

main().catch(error => {
  if (error instanceof OrcaAuthError) {
    // Denial, cancellation, an expired or reused code, and rate limiting all land here
    // with an actionable message — never a hang and never a leaked response body.
    console.error(`\n✖ ${error.message}`);
    process.exit(1);
  }
  console.error(`\n✖ ${redactOrcaSecrets(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
