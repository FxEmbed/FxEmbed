import type {
  BlueskyProxyCredentials,
  CredentialStore,
  TwitterCredentials
} from '@fxembed/atmosphere/types/proxy-credentials';

let credentialStore: CredentialStore | null = null;
let initOnce: Promise<void> | null = null;

function binaryStringToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  return binaryStringToBytes(atob(b64));
}

function base64ToBytes(b64: string): Uint8Array {
  return binaryStringToBytes(atob(b64));
}

/** True when the worker bundle includes an encrypted credential payload (from credentials.enc.json at build time). */
export function hasBundledEncryptedCredentials(): boolean {
  const enc = process.env.ENCRYPTED_CREDENTIALS;
  const iv = process.env.CREDENTIALS_IV;
  return typeof enc === 'string' && enc.length > 0 && typeof iv === 'string' && iv.length > 0;
}

/**
 * Decrypt and cache the credential store (idempotent). Safe to call multiple times.
 */
export async function initCredentials(credentialKey: string | undefined): Promise<void> {
  if (!credentialKey || !hasBundledEncryptedCredentials()) {
    return;
  }
  if (credentialStore !== null) {
    return;
  }
  if (!initOnce) {
    initOnce = (async () => {
      try {
        const keyBytes = base64UrlToBytes(credentialKey.trim());
        if (keyBytes.byteLength !== 32) {
          throw new Error('CREDENTIAL_KEY must decode to 32 bytes (AES-256, base64url)');
        }
        const iv = base64ToBytes(process.env.CREDENTIALS_IV ?? '');
        const ciphertext = base64ToBytes(process.env.ENCRYPTED_CREDENTIALS ?? '');

        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBytes,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          ciphertext
        );

        const text = new TextDecoder('utf-8').decode(decrypted);
        console.log(`Successfully decrypted credentials (${text.length} bytes)`);
        credentialStore = JSON.parse(text) as CredentialStore;
      } catch (err) {
        initOnce = null;
        throw err;
      }
    })();
  }
  await initOnce;
}

export function getRandomTwitterAccount(): TwitterCredentials {
  const accounts = credentialStore?.twitter?.accounts;
  if (!accounts?.length) {
    throw new Error('Twitter credentials not initialized or empty');
  }
  const randomIndex = Math.floor(Math.random() * accounts.length);
  return accounts[randomIndex];
}

export function hasDecryptedCredentials(): boolean {
  return credentialStore !== null && (credentialStore.twitter?.accounts?.length ?? 0) > 0;
}

export function hasBlueskyProxyAccounts(): boolean {
  return (credentialStore?.bluesky?.accounts?.length ?? 0) > 0;
}

function shuffleBlueskyAccountsCopy(acc: BlueskyProxyCredentials[]): BlueskyProxyCredentials[] {
  const copy = [...acc];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = t;
  }
  return copy;
}

/** Hostname of a Bluesky proxy `service` URL (PDS), lowercased; empty if unparseable. */
export function blueskyProxyServiceHostname(service: string): string {
  try {
    const s = service.trim();
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Fisher–Yates shuffle for spreading load across PDS proxy accounts.
 * When `preferredHostname` matches one or more accounts' service host, those are shuffled first,
 * then the rest (Discord activity hint path).
 */
export function getShuffledBlueskyAccounts(preferredHostname?: string): BlueskyProxyCredentials[] {
  const acc = credentialStore?.bluesky?.accounts ?? [];
  if (!acc.length) return [];
  const pref = preferredHostname?.trim().toLowerCase();
  if (!pref) {
    return shuffleBlueskyAccountsCopy(acc);
  }
  const preferred: BlueskyProxyCredentials[] = [];
  const rest: BlueskyProxyCredentials[] = [];
  for (const a of acc) {
    (blueskyProxyServiceHostname(a.service) === pref ? preferred : rest).push(a);
  }
  if (!preferred.length) {
    return shuffleBlueskyAccountsCopy(acc);
  }
  return [...shuffleBlueskyAccountsCopy(preferred), ...shuffleBlueskyAccountsCopy(rest)];
}
