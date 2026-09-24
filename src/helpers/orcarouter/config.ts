/**
 * OrcaRouter origin and path resolution.
 *
 * Authentication and inference live on *different* public origins, so neither may be
 * derived from the other by swapping a hostname or appending `/v1`. A self-hosted
 * deployment may use one shared origin (`ORCA_BASE_URL`) or two explicit overrides
 * (`ORCA_AUTH_BASE_URL`, `ORCA_API_BASE_URL`); explicit values always win.
 */

export const DEFAULT_ORCA_AUTH_BASE = 'https://www.orcarouter.ai';
export const DEFAULT_ORCA_API_BASE = 'https://api.orcarouter.ai/v1';

/** Consent screen. Not an API endpoint — the browser is sent here. */
export const ORCA_AUTHORIZE_PATH = '/auth';
/** Auth-code exchange. Note the `/api/v1/auth` prefix: the relay is at `/v1`, this is not. */
export const ORCA_TOKEN_PATH = '/api/v1/auth/keys';

export type OrcaOrigins = {
  authBase: string;
  apiBase: string;
};

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Remote origins must be HTTPS; plain HTTP is only tolerated for loopback development,
 * matching the callback rules the consent endpoint itself enforces.
 */
export function assertUsableOrigin(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid absolute URL`);
  }
  if (url.protocol === 'https:') {
    return trimTrailingSlash(url.toString());
  }
  if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) {
    return trimTrailingSlash(url.toString());
  }
  throw new Error(`${label} must use HTTPS (plain HTTP is only allowed for loopback)`);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveOrcaOrigins(env: {
  ORCA_AUTH_BASE_URL?: string;
  ORCA_API_BASE_URL?: string;
  ORCA_BASE_URL?: string;
}): OrcaOrigins {
  const shared = env.ORCA_BASE_URL?.trim();
  const authRaw = env.ORCA_AUTH_BASE_URL?.trim() || shared || DEFAULT_ORCA_AUTH_BASE;
  const apiRaw = env.ORCA_API_BASE_URL?.trim() || (shared ? `${shared}/v1` : DEFAULT_ORCA_API_BASE);
  return {
    authBase: assertUsableOrigin(authRaw, 'ORCA_AUTH_BASE_URL'),
    apiBase: assertUsableOrigin(apiRaw, 'ORCA_API_BASE_URL')
  };
}

/** The consent URL a user is sent to. Carries only the challenge and opaque state. */
export function orcaAuthorizeUrl(origins: OrcaOrigins): string {
  return `${origins.authBase}${ORCA_AUTHORIZE_PATH}`;
}

export function orcaTokenUrl(origins: OrcaOrigins): string {
  return `${origins.authBase}${ORCA_TOKEN_PATH}`;
}

export function orcaModelsUrl(origins: OrcaOrigins, capability?: OrcaCapability): string {
  const url = new URL(`${origins.apiBase}/models`);
  if (capability) {
    url.searchParams.set('capability', capability);
  }
  return url.toString();
}

export function orcaChatCompletionsUrl(origins: OrcaOrigins): string {
  return `${origins.apiBase}/chat/completions`;
}

/** Capability names accepted by the catalog's `capability` query parameter. */
export type OrcaCapability = 'chat' | 'embedding' | 'image' | 'video' | 'rerank';

/** Non-text endpoint types that must never appear in a text chat selector. */
export const NON_TEXT_ENDPOINT_TYPES = ['image-generation', 'openai-video', 'jina-rerank'];

/** Endpoint types a text chat entry point can actually speak. */
export const TEXT_ENDPOINT_TYPES = ['openai', 'anthropic', 'gemini', 'openai-response'];
