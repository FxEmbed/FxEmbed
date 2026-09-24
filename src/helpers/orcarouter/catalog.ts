/**
 * OrcaRouter model discovery and capability filtering.
 *
 * The single source of truth for the model list is `GET {apiBase}/models` on the
 * configured origin. Live discovery is authoritative; the seed below exists only so a
 * fresh install is not left with no models during an outage, and it is never mixed into a
 * successful live result.
 *
 * Every request is bounded — timeout, response bytes, item count, accepted item shape —
 * so a hostile or broken catalog response cannot consume unbounded memory or advertise
 * routes this client cannot speak.
 */

import { NON_TEXT_ENDPOINT_TYPES, TEXT_ENDPOINT_TYPES, orcaModelsUrl } from './config.js';
import type { OrcaOrigins } from './config.js';
import { redactOrcaSecrets } from './credential.js';

export const CATALOG_TIMEOUT_MS = 8_000;
export const CATALOG_MAX_BYTES = 2 * 1024 * 1024;
export const CATALOG_MAX_ITEMS = 5_000;

/** Input modalities a caller can require. `text` is implied by every chat model. */
export type OrcaModality = 'text' | 'image' | 'audio' | 'video';

export type OrcaModel = {
  /** Vendor/model namespace, preserved verbatim from the catalog. */
  id: string;
  /** Human-readable label when the catalog supplies one. */
  name?: string;
  ownedBy?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  supportedEndpointTypes: string[];
  inputModalities: string[];
  outputModalities: string[];
  /** Reasoning effort ladder, when the catalog (or the verified seed) advertises one. */
  reasoningEfforts?: string[];
};

export type OrcaCatalog = {
  models: OrcaModel[];
  /** Where the list came from. `live` is authoritative; the others are degraded. */
  source: 'live' | 'seed' | 'last_known_good';
  fetchedAt?: number;
};

/**
 * Small, verified cold-start seed. Only models confirmed to exist on OrcaRouter with the
 * capability metadata below. Kept deliberately short: a large hand-written list would be
 * an unverified catalogue pretending to be the live one.
 */
export const ORCA_SEED_MODELS: readonly OrcaModel[] = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    ownedBy: 'openai',
    supportedEndpointTypes: ['openai', 'openai-response'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh']
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Anthropic: Claude Opus 4.8',
    ownedBy: 'anthropic',
    supportedEndpointTypes: ['anthropic', 'openai'],
    inputModalities: ['text', 'image'],
    outputModalities: ['text']
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Google: Gemini 3.5 Flash',
    ownedBy: 'google',
    supportedEndpointTypes: ['gemini', 'openai'],
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text']
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: DeepSeek V4 Pro',
    ownedBy: 'deepseek',
    supportedEndpointTypes: ['openai', 'anthropic', 'openai-response'],
    inputModalities: ['text'],
    outputModalities: ['text']
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter: Auto',
    ownedBy: 'orcarouter',
    supportedEndpointTypes: ['openai', 'anthropic', 'gemini', 'openai-response'],
    inputModalities: ['text'],
    outputModalities: ['text']
  }
];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Parse one catalog record, discarding anything that is not a usable model entry. */
export function parseOrcaModel(raw: unknown): OrcaModel | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  // An id is the only strictly required field; without it the entry is unusable.
  if (!id) return null;

  const architecture =
    typeof record.architecture === 'object' && record.architecture !== null
      ? (record.architecture as Record<string, unknown>)
      : undefined;

  const efforts = asStringArray(record.reasoning_efforts ?? record.reasoningEfforts);

  return {
    id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined,
    ownedBy: typeof record.owned_by === 'string' ? record.owned_by : undefined,
    contextLength: asPositiveNumber(record.context_length),
    maxCompletionTokens: asPositiveNumber(record.max_completion_tokens),
    supportedEndpointTypes: asStringArray(record.supported_endpoint_types),
    inputModalities: asStringArray(architecture?.input_modalities),
    outputModalities: asStringArray(architecture?.output_modalities),
    ...(efforts.length ? { reasoningEfforts: efforts } : {})
  };
}

/** Parse a catalog envelope, bounded by item count. Accepts `{data:[…]}` or a bare array. */
export function parseOrcaCatalog(payload: unknown): OrcaModel[] {
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  const models: OrcaModel[] = [];
  for (const item of list.slice(0, CATALOG_MAX_ITEMS)) {
    const parsed = parseOrcaModel(item);
    if (parsed) models.push(parsed);
  }
  return models;
}

function isTextChatModel(model: OrcaModel): boolean {
  const endpoints = model.supportedEndpointTypes;
  // Non-text-only routes must never reach a text selector.
  if (endpoints.some(t => NON_TEXT_ENDPOINT_TYPES.includes(t))) return false;
  return endpoints.some(t => TEXT_ENDPOINT_TYPES.includes(t));
}

/**
 * Filter models for one entry point.
 *
 * `chat` requires a text endpoint type. Any additional `modalities` are enforced strictly
 * against `architecture.input_modalities`: a model that does not *declare* the modality is
 * excluded rather than guessed at, so the selector fails closed.
 */
export function filterOrcaModels(
  models: readonly OrcaModel[],
  options: {
    capability: 'chat' | 'embedding' | 'image' | 'video' | 'rerank';
    modalities?: OrcaModality[];
  }
): OrcaModel[] {
  const required = (options.modalities ?? []).filter(m => m !== 'text');

  return models.filter(model => {
    const endpoints = model.supportedEndpointTypes;
    switch (options.capability) {
      case 'chat':
        if (!isTextChatModel(model)) return false;
        break;
      case 'embedding':
        if (!endpoints.includes('embeddings')) return false;
        break;
      case 'image':
        if (!endpoints.includes('image-generation')) return false;
        break;
      case 'video':
        if (!endpoints.includes('openai-video')) return false;
        break;
      case 'rerank':
        if (!endpoints.includes('jina-rerank')) return false;
        break;
    }

    if (required.length) {
      const declared = new Set(model.inputModalities);
      if (!required.every(modality => declared.has(modality))) return false;
    }

    return true;
  });
}

export type DiscoverOrcaCatalogParams = {
  origins: OrcaOrigins;
  apiKey: string;
  capability?: 'chat' | 'embedding' | 'image' | 'video' | 'rerank';
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Fetch the live catalog. Throws on any failure so the caller decides whether to fall back
 * to the seed or to a last-known-good list.
 */
export async function discoverOrcaCatalog(params: DiscoverOrcaCatalogParams): Promise<OrcaModel[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? CATALOG_TIMEOUT_MS;

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = params.signal
    ? AbortSignal.any([params.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    let response: Response;
    try {
      response = await fetchImpl(orcaModelsUrl(params.origins, params.capability), {
        headers: { Authorization: `Bearer ${params.apiKey}`, Accept: 'application/json' },
        signal
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OrcaRouter model discovery failed: ${redactOrcaSecrets(message)}`, {
        cause: error
      });
    }

    if (!response.ok) {
      throw new Error(`OrcaRouter model discovery failed with HTTP ${response.status}`);
    }

    const text = await readBoundedText(response, CATALOG_MAX_BYTES);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('OrcaRouter model discovery returned a response that was not JSON');
    }

    return parseOrcaCatalog(payload);
  } finally {
    clearTimeout(timer);
  }
}

/** Read at most `maxBytes` of a response body, refusing to buffer an unbounded payload. */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('OrcaRouter model discovery response exceeded the size limit');
  }
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error('OrcaRouter model discovery response exceeded the size limit');
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('OrcaRouter model discovery response exceeded the size limit');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Resolve a catalog for an entry point, falling back to a degraded source when live
 * discovery fails. The fallback is always labelled so the caller can surface a
 * degraded/refresh state instead of silently pretending it is current.
 */
export async function resolveOrcaCatalog(
  params: DiscoverOrcaCatalogParams & {
    lastKnownGood?: readonly OrcaModel[];
    capability: 'chat' | 'embedding' | 'image' | 'video' | 'rerank';
    modalities?: OrcaModality[];
  }
): Promise<OrcaCatalog> {
  try {
    const live = await discoverOrcaCatalog(params);
    return {
      models: filterOrcaModels(live, {
        capability: params.capability,
        modalities: params.modalities
      }),
      source: 'live',
      fetchedAt: Date.now()
    };
  } catch {
    const fallback = params.lastKnownGood?.length ? params.lastKnownGood : ORCA_SEED_MODELS;
    return {
      models: filterOrcaModels(fallback, {
        capability: params.capability,
        modalities: params.modalities
      }),
      source: params.lastKnownGood?.length ? 'last_known_good' : 'seed'
    };
  }
}

/**
 * Re-validate a stored model id against a freshly resolved catalog. A restored selection
 * that is no longer compatible must be cleared rather than kept silently.
 */
export function isModelStillCompatible(
  catalog: readonly OrcaModel[],
  modelId: string | undefined
): boolean {
  if (!modelId) return false;
  return catalog.some(model => model.id === modelId);
}
