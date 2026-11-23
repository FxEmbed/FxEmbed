import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAiTranslationEnabled, resetOrcaCatalogCache } from '../src/helpers/translateAI';
import {
  orcaCredentialAdapters,
  resolveOrcaCredential
} from '../src/helpers/orcarouter/credential';
import { twitterBuildHostFromContext } from '../src/providers/twitter/build-host-adapter';
import { blueskyBuildHostFromContext } from '../src/providers/bluesky/build-host-adapter';
import { mastodonBuildHostFromContext } from '../src/providers/mastodon/build-host-adapter';
import type { Context } from 'hono';

const KEY = 'sk-orca-testonly0000000000000000000001';

function fakeContext(env: Record<string, unknown>): Context {
  return {
    env,
    req: { url: 'https://fxtwitter.com/jack/status/20', header: () => undefined, raw: undefined }
  } as unknown as Context;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetOrcaCatalogCache();
});

/**
 * The AI translation path used to be gated on the Cloudflare Workers AI binding alone.
 * A deployment that configures only OrcaRouter must still reach it, and a deployment with
 * neither must keep its existing behaviour.
 */
describe('aiEnabled covers the OrcaRouter provider', () => {
  it('is enabled by an OrcaRouter API key with no Workers AI binding', () => {
    expect(isAiTranslationEnabled({ ORCAROUTER_API_KEY: KEY })).toBe(true);
  });

  it('is enabled by a PKCE-issued key with no Workers AI binding', () => {
    expect(isAiTranslationEnabled({ ORCAROUTER_OAUTH_KEY: KEY })).toBe(true);
  });

  it('stays enabled by the Workers AI binding alone', () => {
    expect(isAiTranslationEnabled({ AI: { run: () => {} } })).toBe(true);
  });

  it('stays disabled when neither provider is configured', () => {
    expect(isAiTranslationEnabled({})).toBe(false);
    expect(isAiTranslationEnabled({ ORCAROUTER_API_KEY: '  ' })).toBe(false);
  });

  it('treats a missing env as "not configured" instead of throwing', () => {
    // Some request paths run without a bindings object at all.
    expect(resolveOrcaCredential(undefined)).toBeNull();
    expect(orcaCredentialAdapters(undefined).map(a => a.source)).toEqual(['api_key', 'pkce']);
    expect(isAiTranslationEnabled(undefined)).toBe(false);
  });

  it('enables the host adapter for every realm that renders a translated post', () => {
    for (const build of [
      twitterBuildHostFromContext,
      blueskyBuildHostFromContext,
      mastodonBuildHostFromContext
    ]) {
      expect(build(fakeContext({ ORCAROUTER_API_KEY: KEY })).aiEnabled).toBe(true);
      expect(build(fakeContext({})).aiEnabled).toBe(false);
      expect(build(fakeContext({ AI: { run: () => {} } })).aiEnabled).toBe(true);
    }
  });
});
