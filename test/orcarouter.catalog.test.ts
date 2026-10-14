import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_MAX_BYTES,
  ORCA_SEED_MODELS,
  discoverOrcaCatalog,
  filterOrcaModels,
  isModelStillCompatible,
  parseOrcaCatalog,
  parseOrcaModel,
  resolveOrcaCatalog
} from '../src/helpers/orcarouter/catalog';
import { resolveOrcaOrigins } from '../src/helpers/orcarouter/config';

const ORIGINS = resolveOrcaOrigins({});
const KEY = 'sk-orca-testonly0000000000000000000001';

/**
 * Catalog fixture covering every shape the filters must distinguish: text-only chat,
 * image-input chat, embedding, image generation, video, and rerank.
 */
const FIXTURE = {
  object: 'list',
  success: true,
  data: [
    {
      id: 'openai/gpt-5.5',
      object: 'model',
      created: 0,
      owned_by: 'openai',
      supported_endpoint_types: ['openai', 'openai-response'],
      context_length: 400000,
      architecture: { input_modalities: ['text'], output_modalities: ['text'] }
    },
    {
      id: 'anthropic/claude-opus-4.8',
      object: 'model',
      owned_by: 'anthropic',
      supported_endpoint_types: ['anthropic', 'openai'],
      context_length: 200000,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }
    },
    {
      id: 'google/gemini-3.5-flash',
      object: 'model',
      owned_by: 'google',
      supported_endpoint_types: ['gemini', 'openai'],
      architecture: { input_modalities: ['text', 'image', 'audio', 'video'] }
    },
    {
      id: 'openai/text-embedding-4',
      object: 'model',
      owned_by: 'openai',
      supported_endpoint_types: ['embeddings'],
      architecture: { input_modalities: ['text'] }
    },
    {
      id: 'openai/gpt-image-2',
      object: 'model',
      owned_by: 'openai',
      supported_endpoint_types: ['image-generation'],
      architecture: { input_modalities: ['text'], output_modalities: ['image'] }
    },
    {
      id: 'openai/sora-3',
      object: 'model',
      owned_by: 'openai',
      supported_endpoint_types: ['openai-video'],
      architecture: { input_modalities: ['text'], output_modalities: ['video'] }
    },
    {
      id: 'jina/jina-reranker-v3',
      object: 'model',
      owned_by: 'jina',
      supported_endpoint_types: ['jina-rerank'],
      architecture: { input_modalities: ['text'] }
    }
  ]
};

function stubCatalog(payload: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('catalog parsing', () => {
  it('preserves the vendor/model namespace verbatim', () => {
    const models = parseOrcaCatalog(FIXTURE);
    expect(models.map(m => m.id)).toContain('anthropic/claude-opus-4.8');
    expect(models.map(m => m.id)).toContain('openai/gpt-5.5');
  });

  it('keeps context, modality and reasoning metadata', () => {
    const models = parseOrcaCatalog({
      data: [
        {
          id: 'openai/gpt-5.5',
          context_length: 400000,
          supported_endpoint_types: ['openai'],
          reasoning_efforts: ['low', 'medium', 'high', 'xhigh'],
          architecture: { input_modalities: ['text', 'image'] }
        }
      ]
    });
    expect(models[0].contextLength).toBe(400000);
    expect(models[0].inputModalities).toEqual(['text', 'image']);
    expect(models[0].reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('accepts a bare array envelope and rejects malformed records', () => {
    expect(parseOrcaCatalog([{ id: 'a/b' }]).map(m => m.id)).toEqual(['a/b']);
    expect(parseOrcaModel(null)).toBeNull();
    expect(parseOrcaModel('nope')).toBeNull();
    expect(parseOrcaModel({})).toBeNull();
    expect(parseOrcaModel({ id: '   ' })).toBeNull();
    expect(parseOrcaModel({ id: 'a/b', context_length: -5 })?.contextLength).toBeUndefined();
  });

  it('returns an empty list for a junk envelope rather than throwing', () => {
    expect(parseOrcaCatalog(null)).toEqual([]);
    expect(parseOrcaCatalog({ data: 'nope' })).toEqual([]);
    expect(parseOrcaCatalog({})).toEqual([]);
  });
});

describe('capability filtering', () => {
  const models = parseOrcaCatalog(FIXTURE);

  it('offers only text-capable chat models, excluding non-text endpoint types', () => {
    const ids = filterOrcaModels(models, { capability: 'chat' }).map(m => m.id);
    expect(ids).toEqual(['openai/gpt-5.5', 'anthropic/claude-opus-4.8', 'google/gemini-3.5-flash']);
    expect(ids).not.toContain('openai/gpt-image-2');
    expect(ids).not.toContain('openai/sora-3');
    expect(ids).not.toContain('jina/jina-reranker-v3');
    expect(ids).not.toContain('openai/text-embedding-4');
  });

  it('fails closed on an undeclared modality instead of guessing from the model name', () => {
    const withImage = filterOrcaModels(models, {
      capability: 'chat',
      modalities: ['image']
    }).map(m => m.id);
    expect(withImage).toEqual(['anthropic/claude-opus-4.8', 'google/gemini-3.5-flash']);
    // A text-only model is never admitted to a multimodal list.
    expect(withImage).not.toContain('openai/gpt-5.5');
  });

  it('filters audio and video strictly from declared input modalities', () => {
    expect(
      filterOrcaModels(models, { capability: 'chat', modalities: ['video'] }).map(m => m.id)
    ).toEqual(['google/gemini-3.5-flash']);
    expect(
      filterOrcaModels(models, { capability: 'chat', modalities: ['audio'] }).map(m => m.id)
    ).toEqual(['google/gemini-3.5-flash']);
  });

  it('never mixes an undeclared-modality model into a multimodal list', () => {
    const noModalities = parseOrcaCatalog({
      data: [{ id: 'mystery/model', supported_endpoint_types: ['openai'] }]
    });
    expect(filterOrcaModels(noModalities, { capability: 'chat' }).map(m => m.id)).toEqual([
      'mystery/model'
    ]);
    expect(filterOrcaModels(noModalities, { capability: 'chat', modalities: ['image'] })).toEqual(
      []
    );
  });

  it('matches embedding, image, video and rerank to their own endpoint types', () => {
    expect(filterOrcaModels(models, { capability: 'embedding' }).map(m => m.id)).toEqual([
      'openai/text-embedding-4'
    ]);
    expect(filterOrcaModels(models, { capability: 'image' }).map(m => m.id)).toEqual([
      'openai/gpt-image-2'
    ]);
    expect(filterOrcaModels(models, { capability: 'video' }).map(m => m.id)).toEqual([
      'openai/sora-3'
    ]);
    expect(filterOrcaModels(models, { capability: 'rerank' }).map(m => m.id)).toEqual([
      'jina/jina-reranker-v3'
    ]);
  });

  it('returns nothing when no model matches the capability', () => {
    const textOnly = parseOrcaCatalog({
      data: [{ id: 'a/b', supported_endpoint_types: ['openai'] }]
    });
    expect(filterOrcaModels(textOnly, { capability: 'embedding' })).toEqual([]);
    expect(filterOrcaModels(textOnly, { capability: 'image' })).toEqual([]);
  });
});

describe('live discovery', () => {
  it('requests the catalog from the inference origin with the capability filter', async () => {
    const calls = stubCatalog(FIXTURE);
    const models = await discoverOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat'
    });
    expect(calls[0]).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(models.length).toBe(7);
  });

  it('sends the key as a Bearer token and never in the URL', async () => {
    let seenAuth = '';
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        seenUrl = String(url);
        seenAuth = (init?.headers as Record<string, string>).Authorization ?? '';
        return new Response(JSON.stringify(FIXTURE), { status: 200 });
      })
    );
    await discoverOrcaCatalog({ origins: ORIGINS, apiKey: KEY, capability: 'chat' });
    expect(seenAuth).toBe(`Bearer ${KEY}`);
    expect(seenUrl).not.toContain(KEY);
  });

  it('never calls the auth origin for model discovery', async () => {
    const calls = stubCatalog(FIXTURE);
    await discoverOrcaCatalog({ origins: ORIGINS, apiKey: KEY, capability: 'chat' });
    expect(calls.every(u => u.startsWith('https://api.orcarouter.ai/v1/'))).toBe(true);
    expect(calls.some(u => u.includes('www.orcarouter.ai'))).toBe(false);
  });

  it('fails loudly on a non-OK response', async () => {
    stubCatalog({}, 401);
    await expect(
      discoverOrcaCatalog({ origins: ORIGINS, apiKey: KEY, capability: 'chat' })
    ).rejects.toThrow(/HTTP 401/);
  });

  it('refuses an oversized response instead of buffering it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{}', {
            status: 200,
            headers: { 'content-length': String(CATALOG_MAX_BYTES + 1) }
          })
      )
    );
    await expect(
      discoverOrcaCatalog({ origins: ORIGINS, apiKey: KEY, capability: 'chat' })
    ).rejects.toThrow(/size limit/);
  });

  it('bounds discovery with a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
    );
    await expect(
      discoverOrcaCatalog({ origins: ORIGINS, apiKey: KEY, capability: 'chat', timeoutMs: 10 })
    ).rejects.toThrow(/failed/);
  });
});

describe('fallback behaviour', () => {
  it('treats a successful live catalog as authoritative', async () => {
    stubCatalog(FIXTURE);
    const catalog = await resolveOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat'
    });
    expect(catalog.source).toBe('live');
    expect(catalog.models.map(m => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash'
    ]);
    // The seed is never mixed into a successful live result.
    expect(catalog.models.some(m => m.id === 'orcarouter/auto')).toBe(false);
  });

  it('falls back to the verified seed, labelled, when discovery fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 }))
    );
    const catalog = await resolveOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat'
    });
    expect(catalog.source).toBe('seed');
    expect(catalog.models.map(m => m.id)).toEqual(ORCA_SEED_MODELS.map(m => m.id));
  });

  it('keeps the seed short and verified rather than a hand-written catalogue', () => {
    expect(ORCA_SEED_MODELS.length).toBeLessThanOrEqual(5);
    expect(ORCA_SEED_MODELS.map(m => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto'
    ]);
    for (const model of ORCA_SEED_MODELS) {
      expect(model.supportedEndpointTypes.length).toBeGreaterThan(0);
      expect(model.inputModalities.length).toBeGreaterThan(0);
    }
  });

  it('preserves the verified GPT-5.5 reasoning ladder through the fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    );
    const catalog = await resolveOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat'
    });
    const gpt = catalog.models.find(m => m.id === 'openai/gpt-5.5');
    expect(gpt?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('prefers a last-known-good list over the seed when one exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    );
    const catalog = await resolveOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat',
      lastKnownGood: parseOrcaCatalog(FIXTURE)
    });
    expect(catalog.source).toBe('last_known_good');
    expect(catalog.models.map(m => m.id)).toContain('openai/gpt-5.5');
  });

  it('never degrades to free-text: an empty catalog stays an empty list', async () => {
    stubCatalog({ data: [] });
    const catalog = await resolveOrcaCatalog({
      origins: ORIGINS,
      apiKey: KEY,
      capability: 'chat'
    });
    expect(catalog.source).toBe('live');
    expect(catalog.models).toEqual([]);
  });
});

describe('stored selection revalidation', () => {
  it('clears a model that is no longer in the compatible list', () => {
    const models = filterOrcaModels(parseOrcaCatalog(FIXTURE), { capability: 'chat' });
    expect(isModelStillCompatible(models, 'openai/gpt-5.5')).toBe(true);
    // The selected model became an image model, so it must not survive as a text selection.
    expect(isModelStillCompatible(models, 'openai/gpt-image-2')).toBe(false);
    expect(isModelStillCompatible(models, undefined)).toBe(false);
    expect(isModelStillCompatible(models, '')).toBe(false);
  });

  it('clears a text model once an image attachment makes it incompatible', () => {
    const textModels = filterOrcaModels(parseOrcaCatalog(FIXTURE), { capability: 'chat' });
    const withImage = filterOrcaModels(parseOrcaCatalog(FIXTURE), {
      capability: 'chat',
      modalities: ['image']
    });
    expect(isModelStillCompatible(textModels, 'openai/gpt-5.5')).toBe(true);
    expect(isModelStillCompatible(withImage, 'openai/gpt-5.5')).toBe(false);
    expect(isModelStillCompatible(withImage, 'anthropic/claude-opus-4.8')).toBe(true);
  });
});
