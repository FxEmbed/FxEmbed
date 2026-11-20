/**
 * OrcaRouter connect flow — OAuth 2.0 + PKCE, Flow B (out-of-band code).
 *
 * Flow B is used because FxEmbed is self-hosted software whose address differs on every
 * deployment (workers.dev subdomain, custom domain, LAN Docker box), and because the
 * worker is a serverless request handler with no long-lived process to host a loopback
 * listener. The consent screen displays a code, the user pastes it back, and the exchange
 * happens here. `S256` is mandatory for Flow B and is sent unconditionally — a *displayed*
 * code passes through human hands, so it must be redeemable only by the process holding
 * the verifier.
 */

import { orcaAuthorizeUrl, orcaTokenUrl, type OrcaOrigins, assertUsableOrigin } from './config.js';
import { codeChallengeFromVerifier, generateCodeVerifier, generateState } from './pkce.js';
import { redactOrcaSecrets } from './credential.js';

export type OrcaAuthErrorKind =
  | 'cancelled'
  | 'denied'
  | 'state_mismatch'
  | 'code_rejected'
  | 'invalid_request'
  | 'scope_insufficient'
  | 'rate_limited'
  | 'network'
  | 'malformed_response';

/**
 * A connect failure with a kind the caller can branch on, and a message that is safe to
 * show a user. The verifier and the auth code never appear in either field.
 */
export class OrcaAuthError extends Error {
  readonly kind: OrcaAuthErrorKind;
  readonly status?: number;

  constructor(kind: OrcaAuthErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'OrcaAuthError';
    this.kind = kind;
    this.status = status;
  }
}

export type OrcaAuthorizationStart = {
  /** URL to open in the browser. Carries the challenge and state, never the verifier. */
  authorizeUrl: string;
  /** Keep in memory until the exchange; never log or persist this. */
  codeVerifier: string;
  state: string;
};

export type OrcaConnectResult = {
  apiKey: string;
  userId?: string;
  /** The scope that was actually granted, which may be narrower than the one requested. */
  scope: string;
};

export const ORCA_DEFAULT_SCOPE = 'api';

export type StartOrcaAuthorizationParams = {
  origins: OrcaOrigins;
  /** Shown on the consent screen as a claim, not as a verified identity. */
  appName: string;
  scope?: string;
  loginHint?: string;
};

/** Step 1: build the consent URL. No network call, no credential yet. */
export async function startOrcaAuthorization(
  params: StartOrcaAuthorizationParams
): Promise<OrcaAuthorizationStart> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await codeChallengeFromVerifier(codeVerifier);
  const state = generateState();

  const url = new URL(orcaAuthorizeUrl(params.origins));
  url.searchParams.set('callback_url', 'oob');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('app_name', params.appName);
  url.searchParams.set('scope', params.scope ?? ORCA_DEFAULT_SCOPE);
  if (params.loginHint?.trim()) {
    url.searchParams.set('login_hint', params.loginHint.trim());
  }

  return { authorizeUrl: url.toString(), codeVerifier, state };
}

export type ExchangeOrcaCodeParams = {
  origins: OrcaOrigins;
  code: string;
  codeVerifier: string;
  /** Required for Flow B; compared server-side against the value sent at authorize time. */
  scope?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/**
 * Step 2: exchange the pasted code for an API key.
 *
 * Every terminal condition ends here with an actionable message: the code is single-use
 * with a 10 minute TTL, so a rejection is never retried in a loop.
 */
export async function exchangeOrcaCode(params: ExchangeOrcaCodeParams): Promise<OrcaConnectResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const code = params.code.trim();
  if (!code) {
    throw new OrcaAuthError('invalid_request', 'No authorization code was provided.');
  }

  let response: Response;
  try {
    response = await fetchImpl(orcaTokenUrl(params.origins), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: params.codeVerifier,
        code_challenge_method: 'S256'
      }),
      signal: params.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OrcaAuthError(
      'network',
      `Could not reach OrcaRouter to exchange the code: ${redactOrcaSecrets(message, [
        params.codeVerifier
      ])}`
    );
  }

  const text = await response.text().catch(() => '');

  if (!response.ok) {
    throw orcaExchangeError(response.status, text, params.codeVerifier);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new OrcaAuthError(
      'malformed_response',
      'OrcaRouter returned a response that was not JSON.'
    );
  }

  const body = payload as Record<string, unknown> | null;
  const apiKey = typeof body?.key === 'string' ? body.key : '';
  if (!apiKey) {
    throw new OrcaAuthError(
      'malformed_response',
      'OrcaRouter did not return a key. Run the login again.'
    );
  }

  // Read the granted scope back: it is what was granted, not what was asked for.
  const grantedScope = typeof body?.scope === 'string' ? body.scope : '';
  const requiredScope = params.scope ?? ORCA_DEFAULT_SCOPE;
  if (grantedScope !== requiredScope) {
    throw new OrcaAuthError(
      'scope_insufficient',
      `OrcaRouter granted the "${grantedScope || 'unknown'}" scope, not "${requiredScope}". ` +
        'Ask a workspace owner to widen your role, then run the login again.'
    );
  }

  return {
    apiKey,
    userId: typeof body?.user_id === 'string' ? body.user_id : undefined,
    scope: grantedScope
  };
}

function orcaExchangeError(status: number, body: string, codeVerifier?: string): OrcaAuthError {
  const detail = redactOrcaSecrets(extractErrorDetail(body), codeVerifier ? [codeVerifier] : []);
  switch (status) {
    case 400:
      // The challenge method was unrecognised, or differs from the one sent at authorize time.
      return new OrcaAuthError(
        'invalid_request',
        'OrcaRouter rejected the request format (PKCE method mismatch). ' +
          'Start the login again from the beginning.' +
          detail,
        400
      );
    case 403:
      // Unknown, expired, or already-used code — or the verifier does not match the challenge.
      return new OrcaAuthError(
        'code_rejected',
        'That code is unknown, expired, or already used. Codes are single-use and last ' +
          '10 minutes; start the login again to get a new one.' +
          detail,
        403
      );
    case 429:
      return new OrcaAuthError(
        'rate_limited',
        'OrcaRouter is rate-limiting new authorizations (10 keys per user per 24 hours). ' +
          'Reuse the key you already have, or try again later.' +
          detail,
        429
      );
    default:
      return new OrcaAuthError(
        'network',
        `OrcaRouter could not complete the exchange (HTTP ${status}). Try again in a moment.` +
          detail,
        status
      );
  }
}

function extractErrorDetail(body: string): string {
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
    const description =
      typeof parsed?.error_description === 'string' ? parsed.error_description : '';
    const combined = [message, description].filter(Boolean).join(': ');
    return combined ? ` (${combined})` : '';
  } catch {
    return '';
  }
}

/**
 * Run the whole out-of-band flow with a caller-supplied prompt function. Kept free of any
 * terminal I/O so the CLI and the tests drive it the same way.
 */
export async function connectOrcaWithPastedCode(params: {
  origins: OrcaOrigins;
  appName: string;
  scope?: string;
  /** Receives the consent URL and returns the code the user pasted, or `null` to cancel. */
  promptForCode: (authorizeUrl: string) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): Promise<OrcaConnectResult> {
  const start = await startOrcaAuthorization({
    origins: params.origins,
    appName: params.appName,
    scope: params.scope
  });

  const pasted = await params.promptForCode(start.authorizeUrl);
  if (pasted === null || pasted.trim() === '') {
    throw new OrcaAuthError('cancelled', 'Login cancelled before a code was provided.');
  }

  return exchangeOrcaCode({
    origins: params.origins,
    code: pasted,
    codeVerifier: start.codeVerifier,
    scope: params.scope,
    fetchImpl: params.fetchImpl
  });
}

/** Re-exported so callers validating an override get the same rules as the flow itself. */
export { assertUsableOrigin };
