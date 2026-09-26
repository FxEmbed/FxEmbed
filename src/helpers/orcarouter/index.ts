/**
 * OrcaRouter provider integration.
 *
 * Public surface for the worker: origins, the credential seam with its two adapters,
 * model discovery with capability filtering, the inference adapter, and the durable-key
 * lifecycle. See `src/helpers/translateAI.ts` for the entry point that consumes it.
 */

export {
  DEFAULT_ORCA_API_BASE,
  DEFAULT_ORCA_AUTH_BASE,
  ORCA_AUTHORIZE_PATH,
  ORCA_TOKEN_PATH,
  assertUsableOrigin,
  orcaAuthorizeUrl,
  orcaChatCompletionsUrl,
  orcaModelsUrl,
  orcaTokenUrl,
  resolveOrcaOrigins,
  type OrcaCapability,
  type OrcaOrigins
} from './config.js';

export {
  createApiKeyAdapter,
  createPkceAdapter,
  looksLikeOrcaKey,
  maskOrcaKey,
  orcaCredentialAdapters,
  redactOrcaSecrets,
  resolveOrcaCredential,
  type OrcaCredential,
  type OrcaCredentialAdapter,
  type OrcaCredentialEnv,
  type OrcaCredentialSource
} from './credential.js';

export {
  base64UrlEncode,
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateState,
  isValidCodeVerifier,
  randomBase64Url,
  timingSafeEqual
} from './pkce.js';

export {
  ORCA_DEFAULT_SCOPE,
  OrcaAuthError,
  connectOrcaWithPastedCode,
  exchangeOrcaCode,
  startOrcaAuthorization,
  type OrcaAuthErrorKind,
  type OrcaAuthorizationStart,
  type OrcaConnectResult
} from './connect.js';

export {
  CATALOG_MAX_BYTES,
  CATALOG_MAX_ITEMS,
  CATALOG_TIMEOUT_MS,
  ORCA_SEED_MODELS,
  discoverOrcaCatalog,
  filterOrcaModels,
  isModelStillCompatible,
  parseOrcaCatalog,
  parseOrcaModel,
  resolveOrcaCatalog,
  type OrcaCatalog,
  type OrcaModel,
  type OrcaModality
} from './catalog.js';

export {
  OrcaRequestError,
  orcaChatCompletion,
  type OrcaChatMessage,
  type OrcaChatResult,
  type OrcaRequestErrorKind
} from './provider.js';

export {
  createOrcaCredentialStore,
  shouldReuseStoredCredential,
  type OrcaCredentialState,
  type OrcaCredentialStatus,
  type OrcaCredentialStore
} from './lifecycle.js';
