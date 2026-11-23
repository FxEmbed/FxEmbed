/**
 * OrcaRouter inference adapter.
 *
 * OrcaRouter is an OpenAI-compatible AI gateway that routes many providers behind one
 * endpoint, so a request here is an ordinary OpenAI chat completion sent with a Bearer
 * token to `{apiBase}/chat/completions`.
 *
 * The credential's *source* (pasted key or PKCE login) is deliberately invisible past this
 * point: the adapter takes a plain key and nothing downstream branches on where it came
 * from.
 */

import { orcaChatCompletionsUrl, type OrcaOrigins } from './config.js';
import { redactOrcaSecrets } from './credential.js';

export type OrcaChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type OrcaChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type OrcaChatResult = {
  text: string;
  usage: OrcaChatUsage;
  model: string;
};

export type OrcaRequestErrorKind =
  'needs_reauth' | 'model_forbidden' | 'forbidden' | 'rate_limited' | 'network' | 'bad_response';

export class OrcaRequestError extends Error {
  readonly kind: OrcaRequestErrorKind;
  readonly status?: number;

  constructor(kind: OrcaRequestErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'OrcaRequestError';
    this.kind = kind;
    this.status = status;
  }
}

export type OrcaChatParams = {
  origins: OrcaOrigins;
  apiKey: string;
  model: string;
  messages: OrcaChatMessage[];
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/**
 * Send one chat completion. A `401` is terminal: the caller must mark the exact credential
 * generation for reauthentication. There is no refresh grant to attempt, so this never
 * retries a rejected credential.
 */
export async function orcaChatCompletion(params: OrcaChatParams): Promise<OrcaChatResult> {
  const fetchImpl = params.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(orcaChatCompletionsUrl(params.origins), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {})
      }),
      signal: params.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OrcaRequestError(
      'network',
      `OrcaRouter request failed: ${redactOrcaSecrets(message, [params.apiKey])}`
    );
  }

  const text = await response.text().catch(() => '');

  if (response.status === 401) {
    // Only a 401 means the credential itself is gone.
    throw new OrcaRequestError(
      'needs_reauth',
      'OrcaRouter rejected the credential. It was revoked or replaced — sign in again.',
      401
    );
  }
  if (response.status === 403) {
    // A 403 is an authorization decision about *this key's scope*, not a revoked key:
    // the credential still authenticates. Treating it as `needs_reauth` would tell the
    // user to sign in again and change nothing.
    const code = errorCode(text);
    if (code === 'model_access_denied') {
      throw new OrcaRequestError(
        'model_forbidden',
        `This OrcaRouter key is not allowed to use model "${params.model}". Grant it access in ` +
          'the OrcaRouter console, or choose another model with `npm run orcarouter:models`.' +
          detail(text),
        403
      );
    }
    throw new OrcaRequestError(
      'forbidden',
      `OrcaRouter refused the request (HTTP 403).${detail(text)}`,
      403
    );
  }
  if (response.status === 429) {
    throw new OrcaRequestError(
      'rate_limited',
      'OrcaRouter rate-limited this request. Try again shortly.',
      429
    );
  }
  if (!response.ok) {
    throw new OrcaRequestError(
      'network',
      `OrcaRouter request failed with HTTP ${response.status}.${detail(text)}`,
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new OrcaRequestError('bad_response', 'OrcaRouter returned a response that was not JSON.');
  }

  const body = payload as Record<string, unknown>;
  const choices = Array.isArray(body?.choices) ? body.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';

  if (!content) {
    throw new OrcaRequestError('bad_response', 'OrcaRouter returned an empty completion.');
  }

  const usage = (body?.usage ?? {}) as Record<string, unknown>;
  return {
    text: content,
    model: typeof body?.model === 'string' ? body.model : params.model,
    usage: {
      promptTokens: numberOrZero(usage.prompt_tokens),
      completionTokens: numberOrZero(usage.completion_tokens),
      totalTokens: numberOrZero(usage.total_tokens)
    }
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Machine-readable error code from OrcaRouter's `{error:{code}}` envelope. */
function errorCode(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const inner = parsed?.error;
    if (typeof inner === 'object' && inner !== null) {
      const code = (inner as Record<string, unknown>).code;
      return typeof code === 'string' ? code : '';
    }
    return '';
  } catch {
    return '';
  }
}

function detail(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const inner = parsed?.error;
    const message =
      typeof inner === 'string'
        ? inner
        : typeof (inner as Record<string, unknown>)?.message === 'string'
          ? ((inner as Record<string, unknown>).message as string)
          : typeof parsed?.message === 'string'
            ? (parsed.message as string)
            : '';
    return message ? ` (${redactOrcaSecrets(message)})` : '';
  } catch {
    return '';
  }
}
