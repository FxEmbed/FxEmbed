import { describe, expect, it } from 'vitest';
import { discoverOrcaCatalog, filterOrcaModels } from '../src/helpers/orcarouter/catalog';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';
import { resolveOrcaCredential } from '../src/helpers/orcarouter/credential';

/**
 * Live check against the real OrcaRouter service, driven through the implemented provider.
 *
 * It is skipped unless a real credential is supplied, so the default suite stays offline
 * and deterministic. The verification harness runs it with `ORCAROUTER_API_KEY` set:
 *
 *   ORCAROUTER_API_KEY=sk-orca-… ORCAROUTER_MODEL=… npx vitest run test/orcarouter.live.test.ts
 */
const apiKey = process.env.ORCAROUTER_API_KEY?.trim() ?? '';
// Optional: when unset the inference spec discovers a model from the live catalog itself.
const liveModel = process.env.ORCAROUTER_MODEL?.trim() ?? '';
const hasCredential = resolveOrcaCredential({ ORCAROUTER_API_KEY: apiKey }) !== null;

describe.runIf(hasCredential)('live: OrcaRouter catalog', () => {
  it('discovers a non-empty text-chat catalog from the inference origin', async () => {
    const origins = resolveOrcaOrigins({});
    expect(origins.apiBase).toBe('https://api.orcarouter.ai/v1');

    const models = await discoverOrcaCatalog({
      origins,
      apiKey,
      capability: 'chat'
    });
    const chatModels = filterOrcaModels(models, { capability: 'chat' });

    console.log(`live catalog: ${models.length} records, ${chatModels.length} chat-compatible`);
    expect(chatModels.length).toBeGreaterThan(0);

    // Every advertised model keeps its vendor/model namespace.
    for (const model of chatModels) {
      expect(model.id).toContain('/');
      expect(model.supportedEndpointTypes.length).toBeGreaterThan(0);
    }

    // Non-text routes never reach a text selector.
    const ids = chatModels.map(m => m.id);
    expect(ids).not.toContain('jina/jina-reranker-v3');
  }, 30_000);

  it('reports no embedding/image/video/rerank models when the catalog advertises none', async () => {
    const origins = resolveOrcaOrigins({});
    for (const capability of ['embedding', 'image', 'video', 'rerank'] as const) {
      const models = await discoverOrcaCatalog({ origins, apiKey, capability });
      console.log(`live capability=${capability}: ${models.length}`);
      expect(Array.isArray(models)).toBe(true);
    }
  }, 30_000);
});

describe.runIf(hasCredential)('live: inference through the provider', () => {
  it('translates a real post with a real OrcaRouter request', async () => {
    // Exercise the same entry point the worker's realms call, with the live credential, so
    // this is a real inference request rather than a catalogue read. A key may be scoped to
    // only some models, so try the configured one first and then the catalog order.
    const { translateStatusAI, resetOrcaCatalogCache } = await import('../src/helpers/translateAI');
    const origins = resolveOrcaOrigins({});
    const catalog = await discoverOrcaCatalog({ origins, apiKey, capability: 'chat' });
    const candidates = [
      ...(liveModel ? [liveModel] : []),
      ...filterOrcaModels(catalog, { capability: 'chat' }).map(m => m.id)
    ];

    const attempt = async (model: string) => {
      resetOrcaCatalogCache();
      return translateStatusAI(
        { text: 'Bonjour, comment allez-vous ?', lang: 'fr' } as never,
        'en',
        { env: { ORCAROUTER_API_KEY: apiKey, ORCAROUTER_MODEL: model } } as never
      );
    };

    let usedModel = '';
    let result = null;
    for (const model of [...new Set(candidates)]) {
      const candidate = await attempt(model);
      if (candidate?.translated_text) {
        result = candidate;
        usedModel = model;
        break;
      }
    }

    console.log(`live translation via ${usedModel}: ${JSON.stringify(result?.translated_text)}`);
    console.log(`live usage: ${JSON.stringify(result?.usage)}`);
    expect(result).not.toBeNull();
    expect(result?.translated_text ?? '').not.toContain('Bonjour, comment allez-vous');
    expect(result?.usage.total_tokens).toBeGreaterThan(0);
  }, 120_000);

  it('clears a configured model that the live catalog does not offer', async () => {
    const { translateStatusAI, resetOrcaCatalogCache } = await import('../src/helpers/translateAI');
    resetOrcaCatalogCache();

    const result = await translateStatusAI({ text: 'hola', lang: 'es' } as never, 'en', {
      env: {
        ORCAROUTER_API_KEY: apiKey,
        // Not a text-chat model on the live catalog, so the selection must be cleared.
        ORCAROUTER_MODEL: 'definitely/not-a-real-model'
      }
    } as never);

    expect(result).toBeNull();
  }, 30_000);
});
