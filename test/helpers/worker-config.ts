import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Files the worker build materializes from their `.example` counterpart. `esbuild.config.mjs`
 * copies `branding.json` for the bundle, and the deploy docs have operators copy
 * `wrangler.example.toml` and `.env.example`, so a fresh checkout legitimately has none of
 * them. `branding.json` is also imported as a module by `src/helpers/branding.ts`, so without
 * it the whole Worker fails to load and most of the suite cannot run.
 *
 * Tests must pass in a clean checkout, so serve the example content for any of these that is
 * absent instead of requiring the operator to create it first. A real file always wins.
 */
const FALLBACKS: Array<[target: string, example: string]> = [
  ['branding.json', 'branding.example.json'],
  ['wrangler.toml', 'wrangler.example.toml'],
  ['.env', '.env.example']
];

const VIRTUAL_PREFIX = '\0fxembed-config:';

export function workerConfigPlugin(root: string): Plugin {
  const fallbackFor = (id: string): string | null => {
    const file = id.split('?')[0];
    for (const [target, example] of FALLBACKS) {
      if (path.resolve(root, target) !== file) {
        continue;
      }
      if (fs.existsSync(file)) {
        return null;
      }
      const source = path.resolve(root, example);
      return fs.existsSync(source) ? source : null;
    }
    return null;
  };

  return {
    name: 'fxembed:worker-config',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) {
        return null;
      }
      const file = path.resolve(path.dirname(importer.split('?')[0]), source);
      return fallbackFor(file) === null ? null : VIRTUAL_PREFIX + file;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) {
        return null;
      }
      const source = fallbackFor(id.slice(VIRTUAL_PREFIX.length));
      return source === null ? null : fs.readFileSync(source, 'utf8');
    }
  };
}
