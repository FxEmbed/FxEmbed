#!/usr/bin/env node
/**
 * List the OrcaRouter models a capability selector may offer, straight from the live
 * catalog. Run after configuring a credential:
 *
 *   npm run orcarouter:models
 *   npm run orcarouter:models -- chat
 *   npm run orcarouter:models -- chat image
 *
 * The output is the filtered list the worker would actually use — not a hand-written
 * sample — so it is also the quickest way to check which model id belongs in
 * `ORCAROUTER_MODEL`.
 */
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config.ts';
import { resolveOrcaCredential, redactOrcaSecrets } from '../src/helpers/orcarouter/credential.ts';
import {
  resolveOrcaCatalog,
  type OrcaCapability,
  type OrcaModality
} from '../src/helpers/orcarouter/catalog.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(repoRoot, '.env'), quiet: true });

const CAPABILITIES: OrcaCapability[] = ['chat', 'embedding', 'image', 'video', 'rerank'];
const MODALITIES: OrcaModality[] = ['image', 'audio', 'video'];

const [capabilityArg = 'chat', ...modalityArgs] = process.argv.slice(2);

if (!CAPABILITIES.includes(capabilityArg as OrcaCapability)) {
  console.error(`✖ Unknown capability "${capabilityArg}". Use one of: ${CAPABILITIES.join(', ')}`);
  process.exit(1);
}

const unknownModality = modalityArgs.find(m => !MODALITIES.includes(m as OrcaModality));
if (unknownModality) {
  console.error(`✖ Unknown modality "${unknownModality}". Use one of: ${MODALITIES.join(', ')}`);
  process.exit(1);
}

const capability = capabilityArg as OrcaCapability;
const modalities = modalityArgs as OrcaModality[];

async function main() {
  const credential = resolveOrcaCredential(process.env);
  if (!credential) {
    console.error(
      '✖ No OrcaRouter credential configured. Run `npm run orcarouter:login` or ' +
        '`npm run orcarouter:key -- sk-orca-…` first.'
    );
    process.exit(1);
  }

  const origins = resolveOrcaOrigins(process.env);
  console.log(`Inference origin: ${origins.apiBase}`);
  console.log(`Credential:       ${credential.source}\n`);

  try {
    const catalog = await resolveOrcaCatalog({
      origins,
      apiKey: credential.apiKey,
      capability,
      ...(modalities.length ? { modalities } : {})
    });

    const label = modalities.length ? `${capability} + ${modalities.join('+')}` : capability;
    const degraded = catalog.source !== 'live' ? ` (DEGRADED: ${catalog.source})` : '';

    console.log(`${catalog.models.length} model(s) for ${label}${degraded}:\n`);
    for (const model of catalog.models) {
      const bits = [
        model.ownedBy,
        model.contextLength ? `ctx ${model.contextLength}` : null,
        model.inputModalities.length ? `in ${model.inputModalities.join('/')}` : null,
        model.reasoningEfforts?.length ? `reasoning ${model.reasoningEfforts.join('/')}` : null
      ].filter(Boolean);
      console.log(`  ${model.id}${bits.length ? `  — ${bits.join(', ')}` : ''}`);
    }

    if (catalog.source !== 'live') {
      console.log(
        '\nLive discovery failed, so this is the verified fallback catalog. ' +
          'Set ORCAROUTER_MODEL from the list above and retry when the network recovers.'
      );
    }
  } catch (error) {
    console.error(`✖ ${redactOrcaSecrets(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(
    `\u2716 ${redactOrcaSecrets(error instanceof Error ? error.message : String(error))}`
  );
  process.exit(1);
});
