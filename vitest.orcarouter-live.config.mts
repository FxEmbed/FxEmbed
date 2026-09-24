import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { WORKER_TEST_PROCESS_ENV } from './test/helpers/env';
import { workerConfigPlugin } from './test/helpers/worker-config';

/**
 * Live OrcaRouter check.
 *
 * Separate from the default config because the default one deliberately blanks
 * `ORCAROUTER_*` so the ordinary suite stays hermetic and offline. Here the real
 * credential is passed through from the environment, and only the live spec runs:
 *
 *   ORCAROUTER_API_KEY=sk-orca-… ORCAROUTER_MODEL=… \
 *     npx vitest run --config vitest.orcarouter-live.config.mts
 *
 * Without a credential the specs inside skip themselves, so an accidental run is a no-op
 * rather than a failure.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readCompatDateFromWrangler(configPath: string): string | null {
  try {
    const text = fs.readFileSync(configPath, 'utf8');
    const m = text.match(/^\s*compatibility_date\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function resolveWranglerConfigPath(): string | undefined {
  for (const name of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    const p = path.join(__dirname, name);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  const example = path.join(__dirname, 'wrangler.example.toml');
  if (fs.existsSync(example)) {
    return example;
  }
  return undefined;
}

const wranglerConfigPath = resolveWranglerConfigPath();
const compatibilityDate =
  (wranglerConfigPath && readCompatDateFromWrangler(wranglerConfigPath)) ?? '2026-03-21';

export default defineConfig({
  plugins: [
    // Same clean-checkout shim as vitest.config.mts: the live spec imports the worker, which
    // needs the gitignored `branding.json` that only the build materializes.
    workerConfigPlugin(__dirname),
    cloudflareTest({
      remoteBindings: false,
      miniflare: {
        compatibilityDate
      }
    })
  ],
  ssr: {
    keepProcessEnv: true
  },
  test: {
    include: ['test/orcarouter.live.test.ts'],
    globals: true,
    env: {
      ...WORKER_TEST_PROCESS_ENV,
      // The only difference from the default config: a real credential reaches the spec.
      ORCAROUTER_API_KEY: process.env.ORCAROUTER_API_KEY ?? '',
      ORCAROUTER_MODEL: process.env.ORCAROUTER_MODEL ?? '',
      ORCA_BASE_URL: process.env.ORCA_BASE_URL ?? '',
      ORCA_AUTH_BASE_URL: process.env.ORCA_AUTH_BASE_URL ?? '',
      ORCA_API_BASE_URL: process.env.ORCA_API_BASE_URL ?? ''
    }
  }
});
