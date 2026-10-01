import type { AtmosphereTransport } from './atmosphere-transport.js';
import type { AtmosphereSocialProvider } from '../types/social-provider.js';

type AttemptResult<T> = { ok: true; value: T } | { ok: false; retriable: boolean; err: unknown };

/**
 * Run `op(transport, index)` for the primary then each fallback until a successful result.
 * The `op` callback decides per transport kind (public, proxy, relay, auth).
 */
export async function runWithTransports<P extends AtmosphereSocialProvider, T>(
  primary: AtmosphereTransport<P>,
  fallbacks: AtmosphereTransport<P>[] | undefined,
  op: (t: AtmosphereTransport<P>, index: number) => Promise<AttemptResult<T>>
): Promise<T> {
  const chain = [primary, ...(fallbacks ?? [])];
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const t = chain[i]!;
    let r: AttemptResult<T>;
    try {
      r = await op(t, i);
    } catch (e) {
      lastErr = e;
      continue;
    }

    if (r.ok) return r.value;
    lastErr = r.err;
    if (!r.retriable) throw r.err;
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
