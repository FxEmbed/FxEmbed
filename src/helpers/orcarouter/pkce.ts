/**
 * PKCE primitives (RFC 7636) for the OrcaRouter connect flow.
 *
 * The verifier never leaves this process until the code exchange, and is never logged,
 * printed, or placed in a URL. Only its SHA-256 challenge travels on the authorize URL.
 * This is what makes the flow safe without a client secret.
 */

export const PKCE_VERIFIER_MIN_LENGTH = 43;
export const PKCE_VERIFIER_MAX_LENGTH = 128;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Cryptographically random base64url string of `byteLength` bytes. */
export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Fresh verifier for one authorization attempt. Never reused, never derived from anything guessable. */
export function generateCodeVerifier(): string {
  // 32 random bytes → 43 base64url chars, the RFC 7636 minimum and a full 256 bits of entropy.
  return randomBase64Url(32);
}

/** Opaque CSRF token echoed back on the callback and compared before the code is used. */
export function generateState(): string {
  return randomBase64Url(16);
}

/** `base64url(sha256(verifier))`, no padding. */
export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function isValidCodeVerifier(verifier: string): boolean {
  return verifier.length >= PKCE_VERIFIER_MIN_LENGTH && verifier.length <= PKCE_VERIFIER_MAX_LENGTH;
}

/**
 * Constant-time string comparison, so a caller cannot learn the expected `state` one
 * character at a time by timing the rejection.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Compare a fixed number of bytes regardless of length, folding the length difference in.
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
