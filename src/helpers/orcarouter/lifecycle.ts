/**
 * Credential lifecycle for a durable OrcaRouter key.
 *
 * An OrcaRouter key is *not* a refresh token: there is no refresh endpoint and no
 * rotation. It is reused until the provider revokes it. When the relay answers `401`,
 * the correct response is terminal reauthentication for the exact credential generation
 * that made the rejected request — never a retry loop and never a fabricated refresh.
 *
 * The generation guard is the important part: a late failure from a request that used an
 * old credential must not mark a credential the user has since replaced as broken.
 */

export type OrcaCredentialStatus = 'active' | 'needs_reauth';

export type OrcaCredentialState = {
  /** Monotonic id of the credential instance currently installed. */
  generation: number;
  status: OrcaCredentialStatus;
  /** Generation that was rejected, when `status` is `needs_reauth`. */
  rejectedGeneration?: number;
  /** Masked key, safe to show in status output. */
  maskedKey?: string;
};

export type OrcaCredentialStore = {
  /** Read the current state. */
  get(): OrcaCredentialState;
  /**
   * Install a freshly obtained credential (from either adapter). Bumping the generation
   * retires every in-flight request's claim on the previous one.
   */
  install(maskedKey?: string): OrcaCredentialState;
  /**
   * Record that a request made with `generation` was rejected with `401`.
   *
   * Ignored when `generation` is no longer current, so a stale async failure cannot
   * poison a newer login. Returns the resulting state.
   */
  markRejected(generation: number): OrcaCredentialState;
  /** True when a request made with `generation` may still mutate credential state. */
  isCurrent(generation: number): boolean;
};

export function createOrcaCredentialStore(
  initial?: Partial<OrcaCredentialState>
): OrcaCredentialStore {
  let state: OrcaCredentialState = {
    generation: initial?.generation ?? 0,
    status: initial?.status ?? 'active',
    ...(initial?.maskedKey ? { maskedKey: initial.maskedKey } : {}),
    ...(initial?.rejectedGeneration !== undefined
      ? { rejectedGeneration: initial.rejectedGeneration }
      : {})
  };

  return {
    get: () => ({ ...state }),

    install(maskedKey) {
      state = {
        generation: state.generation + 1,
        status: 'active',
        ...(maskedKey ? { maskedKey } : {})
      };
      return { ...state };
    },

    markRejected(generation) {
      // A late failure from an old request must never mark a newly reauthorized credential.
      if (generation !== state.generation) {
        return { ...state };
      }
      state = { ...state, status: 'needs_reauth', rejectedGeneration: generation };
      return { ...state };
    },

    isCurrent: generation => generation === state.generation
  };
}

/**
 * Whether a stored credential may be reused without a new login. Reuse until revoked is
 * the whole point — re-authorizing on every launch would burn the 10-keys-per-24-hours
 * allowance.
 */
export function shouldReuseStoredCredential(state: OrcaCredentialState): boolean {
  return state.status === 'active';
}
