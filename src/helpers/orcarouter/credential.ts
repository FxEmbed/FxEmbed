/**
 * The OrcaRouter credential seam.
 *
 * Both ways of getting a credential — pasting an existing `sk-orca-…` key, and
 * authorizing with an OrcaRouter account over OAuth 2.0 + PKCE — end up producing the
 * *same kind* of ordinary OrcaRouter API key. They are two adapters on one interface so
 * that inference, model discovery, and every entry point read credentials through a
 * single path instead of each re-implementing authentication.
 *
 * Storage follows the host project's existing convention: secrets live in the
 * environment (`.env` at build time, `wrangler secret` at runtime). No new keychain,
 * no plaintext side file, and no refresh grant — an OrcaRouter key is durable and is
 * reused until the provider revokes it.
 */

export type OrcaCredentialSource = 'api_key' | 'pkce';

/** A resolved credential. `source` is provenance for status/UI only; nothing downstream branches on it. */
export type OrcaCredential = {
  apiKey: string;
  source: OrcaCredentialSource;
  /** Monotonic id for the credential instance, so a late failure cannot poison a newer login. */
  generation: number;
};

export interface OrcaCredentialAdapter {
  readonly source: OrcaCredentialSource;
  /** Returns the credential, or `null` when this adapter has nothing configured. */
  resolve(): OrcaCredential | null;
}

/**
 * Lightweight shape check only. An `sk-orca-` prefix is **not** proof of validity, and
 * OrcaRouter exposes no stable non-billing validation endpoint, so validity is reported
 * as unknown and established by the first real request.
 */
export function looksLikeOrcaKey(value: string): boolean {
  return /^sk-orca-[A-Za-z0-9_-]{8,}$/.test(value.trim());
}

/** Mask a key for display or logging: never more than a short prefix and suffix. */
export function maskOrcaKey(value: string): string {
  const key = value.trim();
  if (!key) return '';
  if (key.length <= 12) return 'sk-orca-…';
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

/**
 * Strip anything key-shaped from a string before it reaches a log, an error message, or
 * a telemetry payload. Applied to upstream error bodies, which may echo the credential.
 *
 * `extraSecrets` lets a caller strip known secret *values* that carry no recognisable
 * prefix — the PKCE verifier in particular, which a transport error may quote verbatim.
 */
export function redactOrcaSecrets(text: string, extraSecrets: readonly string[] = []): string {
  let out = text
    .replace(/sk-orca-[A-Za-z0-9_-]+/g, 'sk-orca-…')
    .replace(/("(?:code_verifier|apiKey|api_key|key)"\s*:\s*")[^"]*(")/gi, '$1…$2');
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 8) {
      out = out.split(secret).join('…');
    }
  }
  return out;
}

function normalize(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/** Adapter for a key the user pasted into configuration. */
export function createApiKeyAdapter(rawKey: string | undefined): OrcaCredentialAdapter {
  const key = normalize(rawKey);
  return {
    source: 'api_key',
    resolve: () => (key ? { apiKey: key, source: 'api_key', generation: 0 } : null)
  };
}

/** Adapter for a key obtained by the PKCE login tool and stored in configuration. */
export function createPkceAdapter(rawKey: string | undefined): OrcaCredentialAdapter {
  const key = normalize(rawKey);
  return {
    source: 'pkce',
    resolve: () => (key ? { apiKey: key, source: 'pkce', generation: 0 } : null)
  };
}

export type OrcaCredentialEnv = {
  /** Key pasted by the user. */
  ORCAROUTER_API_KEY?: string;
  /** Key issued by `npm run orcarouter:login` (OAuth 2.0 + PKCE). */
  ORCAROUTER_OAUTH_KEY?: string;
};

/**
 * Both adapters, in resolution order: an explicitly configured key wins, otherwise the
 * key from the last successful PKCE login is used.
 *
 * Tolerates a missing env: some call sites run without one (a request context that has no
 * bindings), and that must mean "OrcaRouter not configured", not a crash.
 */
export function orcaCredentialAdapters(
  env: OrcaCredentialEnv | undefined
): OrcaCredentialAdapter[] {
  return [
    createApiKeyAdapter(env?.ORCAROUTER_API_KEY),
    createPkceAdapter(env?.ORCAROUTER_OAUTH_KEY)
  ];
}

/**
 * Resolve the credential the worker will actually use. Returns `null` when OrcaRouter is
 * not configured, so callers fall back to their existing provider untouched.
 */
export function resolveOrcaCredential(env: OrcaCredentialEnv | undefined): OrcaCredential | null {
  for (const adapter of orcaCredentialAdapters(env)) {
    const credential = adapter.resolve();
    if (credential) {
      return credential;
    }
  }
  return null;
}
