/**
 * Strip sensitive fields from credentials.complete.json → credentials.json
 * Output shape: { "twitter": { "accounts": [...] }, "bluesky": { "accounts": [...] } }
 *
 * Accepts complete file as either:
 *   - { "twitter": { "accounts": [...] } }  (preferred)
 *   - { "accounts": [...] }                  (legacy elongator export)
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const completePath = join(repoRoot, 'credentials.complete.json');
const outPath = join(repoRoot, 'credentials.json');

const raw = JSON.parse(fs.readFileSync(completePath, 'utf8'));
const twitterAccounts = Array.isArray(raw.twitter?.accounts)
  ? raw.twitter.accounts
  : Array.isArray(raw.accounts)
    ? raw.accounts
    : null;

const blueskyAccounts = Array.isArray(raw.bluesky?.accounts) ? raw.bluesky.accounts : null;

if (
  (!Array.isArray(twitterAccounts) || twitterAccounts.length === 0) &&
  (!Array.isArray(blueskyAccounts) || blueskyAccounts.length === 0)
) {
  console.error(
    'credentials.complete.json must have twitter.accounts (or legacy accounts), and/or bluesky.accounts, as non-empty arrays'
  );
  process.exit(1);
}

const out = {};

if (Array.isArray(twitterAccounts) && twitterAccounts.length > 0) {
  const requiredStringFields = ['username', 'authToken', 'csrfToken'];

  for (let i = 0; i < twitterAccounts.length; i++) {
    const cred = twitterAccounts[i];
    const id =
      cred != null &&
      typeof cred === 'object' &&
      !Array.isArray(cred) &&
      typeof cred.username === 'string' &&
      cred.username.length > 0
        ? `twitter.accounts[${i}] (username: ${JSON.stringify(cred.username)})`
        : `twitter.accounts[${i}]`;

    if (cred === null || typeof cred !== 'object' || Array.isArray(cred)) {
      console.error(`${id}: each account must be a plain object`);
      process.exit(1);
    }

    for (const field of requiredStringFields) {
      const v = cred[field];
      if (v === undefined || v === null) {
        console.error(`${id}: missing required field "${field}"`);
        process.exit(1);
      }
      if (typeof v !== 'string') {
        console.error(`${id}: "${field}" must be a non-empty string, got ${typeof v}`);
        process.exit(1);
      }
      if (v.length === 0) {
        console.error(`${id}: "${field}" must be non-empty`);
        process.exit(1);
      }
    }
  }

  out.twitter = {
    accounts: twitterAccounts.map(cred => ({
      username: cred.username,
      authToken: cred.authToken,
      csrfToken: cred.csrfToken
    }))
  };
}

if (Array.isArray(blueskyAccounts) && blueskyAccounts.length > 0) {
  const bskyFields = ['identifier', 'appPassword', 'service'];
  for (let i = 0; i < blueskyAccounts.length; i++) {
    const cred = blueskyAccounts[i];
    const id = `bluesky.accounts[${i}]`;
    if (cred === null || typeof cred !== 'object' || Array.isArray(cred)) {
      console.error(`${id}: each account must be a plain object`);
      process.exit(1);
    }
    for (const field of bskyFields) {
      const v = cred[field];
      if (typeof v !== 'string' || v.length === 0) {
        console.error(`${id}: "${field}" must be a non-empty string`);
        process.exit(1);
      }
    }
  }
  out.bluesky = {
    accounts: blueskyAccounts.map(cred => ({
      identifier: cred.identifier,
      appPassword: cred.appPassword,
      service: cred.service.replace(/\/$/, '')
    }))
  };
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
const parts = [];
if (out.twitter) parts.push(`${out.twitter.accounts.length} twitter account(s)`);
if (out.bluesky) parts.push(`${out.bluesky.accounts.length} bluesky account(s)`);
console.log(`Wrote ${outPath} (${parts.join(', ')})`);
