/**
 * Fetches OpenAPI specs from FxEmbed API endpoints and writes them to docs/specs/.
 *
 * Usage:
 *   node scripts/extract-openapi.mjs               # fetch from production
 *   node scripts/extract-openapi.mjs --local 8787   # fetch from local wrangler dev on port 8787
 *   node scripts/extract-openapi.mjs --placeholder   # write minimal placeholder specs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specsDir = join(__dirname, '..', 'specs');

const PRODUCTION_ENDPOINTS = [
  {
    name: 'fxtwitter-openapi.json',
    url: 'https://api.fxtwitter.com/2/openapi.json'
  },
  {
    name: 'fxbluesky-openapi.json',
    url: 'https://api.fxbsky.app/2/openapi.json'
  }
];

function makePlaceholder(title, description) {
  return {
    openapi: '3.0.0',
    info: { title, version: '2.0.0', description },
    paths: {},
    components: {}
  };
}

async function fetchSpec(endpoint) {
  const res = await fetch(endpoint.url, {
    headers: { 'User-Agent': 'FxEmbed-Docs-Builder/1.0' }
  });
  if (!res.ok) {
    throw new Error(`${endpoint.url}: HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const usePlaceholder = args.includes('--placeholder');
  const localIdx = args.indexOf('--local');
  const localPort = localIdx !== -1 ? args[localIdx + 1] || '8787' : null;

  mkdirSync(specsDir, { recursive: true });

  if (usePlaceholder) {
    console.log('Writing placeholder specs...');
    const placeholders = [
      { name: 'fxtwitter-openapi.json', title: 'FxTwitter API', desc: 'FxTwitter API v2' },
      { name: 'fxbluesky-openapi.json', title: 'FxBluesky API', desc: 'FxBluesky API v2' }
    ];
    for (const p of placeholders) {
      const path = join(specsDir, p.name);
      writeFileSync(path, JSON.stringify(makePlaceholder(p.title, p.desc), null, 2));
      console.log(`  → ${path}`);
    }
    return;
  }

  const endpoints = localPort
    ? PRODUCTION_ENDPOINTS.map(e => ({
        ...e,
        url: `http://localhost:${localPort}/2/openapi.json`
      }))
    : PRODUCTION_ENDPOINTS;

  for (const endpoint of endpoints) {
    process.stdout.write(`Fetching ${endpoint.name} from ${endpoint.url}...`);
    try {
      const spec = await fetchSpec(endpoint);
      const path = join(specsDir, endpoint.name);
      writeFileSync(path, JSON.stringify(spec, null, 2));
      console.log(` ✓`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      console.log(`  → Writing placeholder for ${endpoint.name}`);
      const path = join(specsDir, endpoint.name);
      writeFileSync(
        path,
        JSON.stringify(makePlaceholder(endpoint.name.replace(/-openapi\.json$/, ''), ''), null, 2)
      );
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
