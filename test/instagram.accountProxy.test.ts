import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasInstagramAccountProxy,
  instagramPrivateApiRequest,
  instagramProxyHeaders,
  resolveInstagramAccounts
} from '@fxembed/atmosphere/providers/instagram/account-proxy';
import {
  setInstagramProviderEnv,
  setInstagramProxyRuntime
} from '@fxembed/atmosphere/providers/instagram-runtime';
import {
  INSTAGRAM_ANDROID_APP_ID,
  INSTAGRAM_ANDROID_CAPABILITIES,
  INSTAGRAM_WEB_APP_ID
} from '@fxembed/atmosphere/providers/instagram/constants';
import type { InstagramCredentials } from '@fxembed/atmosphere/types/proxy-credentials';

const webAccount: InstagramCredentials = {
  sessionId: 'web-session',
  userId: '1234',
  csrfToken: 'csrf-web',
  mid: 'MID',
  username: 'web_account'
};

const androidAccount: InstagramCredentials = {
  sessionId: 'android-session',
  userId: '5678',
  androidDeviceId: 'android-0123456789abcdef',
  username: 'android_account',
  platform: 'android'
};

/** Registers a proxy runtime that hands back exactly `accounts`, in the given order. */
function installProxyRuntime(accounts: InstagramCredentials[], hasBundle = true) {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => hasBundle,
    hasInstagramProxyAccounts: () => accounts.length > 0,
    getShuffledInstagramAccounts: () => accounts
  });
}

/** Restores the package default (no proxy), so other test files see a logged-out world. */
function clearProxyRuntime() {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => false,
    hasInstagramProxyAccounts: () => false,
    getShuffledInstagramAccounts: () => []
  });
}

describe('instagram account proxy', () => {
  beforeEach(() => {
    setInstagramProviderEnv({ apiRoot: 'https://i.instagram.com' });
  });

  afterEach(() => {
    clearProxyRuntime();
    vi.unstubAllGlobals();
  });

  it('reports no proxy without a credential key or without a bundled blob', () => {
    installProxyRuntime([webAccount]);
    expect(hasInstagramAccountProxy(undefined)).toBe(false);
    expect(hasInstagramAccountProxy({ credentialKey: '   ' })).toBe(false);
    expect(hasInstagramAccountProxy({ credentialKey: 'key' })).toBe(true);

    installProxyRuntime([webAccount], false);
    expect(hasInstagramAccountProxy({ credentialKey: 'key' })).toBe(false);
  });

  it('drops accounts with no sessionid', async () => {
    installProxyRuntime([{ sessionId: '' }, webAccount]);
    const accounts = await resolveInstagramAccounts({ credentialKey: 'key' });
    expect(accounts).toEqual([webAccount]);
  });

  it('sends the web fingerprint for web accounts and the Android one for android accounts', () => {
    const web = instagramProxyHeaders(webAccount);
    expect(web['X-IG-App-ID']).toBe(INSTAGRAM_WEB_APP_ID);
    expect(web['X-IG-Capabilities']).toBe(INSTAGRAM_ANDROID_CAPABILITIES);
    expect(web['User-Agent']).toContain('Mozilla/5.0');
    expect(web['X-CSRFToken']).toBe('csrf-web');
    expect(web['Cookie']).toBe(
      'sessionid=web-session; ds_user_id=1234; csrftoken=csrf-web; mid=MID'
    );
    expect(web['X-IG-Device-ID']).toBeUndefined();

    const android = instagramProxyHeaders(androidAccount);
    expect(android['X-IG-App-ID']).toBe(INSTAGRAM_ANDROID_APP_ID);
    expect(android['User-Agent']).toMatch(/^Instagram \d+\.[\d.]+ Android \(/);
    expect(android['X-IG-Device-ID']).toBe('android-0123456789abcdef');
    // Browser-only headers must not leak onto an app-fingerprinted request.
    expect(android['Sec-Fetch-Mode']).toBeUndefined();
    expect(android['Origin']).toBeUndefined();
  });

  it('returns status 0 when no proxy is configured so callers fall back to logged-out paths', async () => {
    clearProxyRuntime();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await instagramPrivateApiRequest('/users/x/usernameinfo/', {
      credentialKey: 'key'
    });
    expect(res).toEqual({ ok: false, status: 0, json: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the v1 URL with query params and returns parsed JSON', async () => {
    installProxyRuntime([webAccount]);
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      })
    );
    const res = await instagramPrivateApiRequest(
      '/friendships/173560420/followers/',
      { credentialKey: 'key' },
      { query: { count: 20, max_id: undefined, search_surface: 'follow_list_page' } }
    );
    expect(res.ok).toBe(true);
    expect(res.json).toEqual({ status: 'ok' });
    expect(seen[0]).toBe(
      'https://i.instagram.com/api/v1/friendships/173560420/followers/?count=20&search_surface=follow_list_page'
    );
  });

  it('rotates to the next account on 401 and reports the account that answered', async () => {
    installProxyRuntime([webAccount, androidAccount]);
    const cookies: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const cookie = (init.headers as Record<string, string>)['Cookie'];
        cookies.push(cookie);
        if (cookie.includes('web-session')) {
          return new Response('nope', { status: 401 });
        }
        return new Response(JSON.stringify({ user: { pk: 1 } }), { status: 200 });
      })
    );
    const res = await instagramPrivateApiRequest('/users/x/usernameinfo/', {
      credentialKey: 'key'
    });
    expect(res.ok).toBe(true);
    expect(res.accountUsed).toBe('android_account');
    expect(cookies).toHaveLength(2);
  });

  it('does not rotate on a 404 — the resource is missing, not the session', async () => {
    installProxyRuntime([webAccount, androidAccount]);
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await instagramPrivateApiRequest('/media/1/info/', { credentialKey: 'key' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats an HTML login page as a dead session and tries the next account', async () => {
    installProxyRuntime([webAccount, androidAccount]);
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const cookie = (init.headers as Record<string, string>)['Cookie'];
      if (cookie.includes('web-session')) {
        return new Response('<!DOCTYPE html><html>login</html>', { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await instagramPrivateApiRequest('/media/1/info/', { credentialKey: 'key' });
    expect(res.ok).toBe(true);
    expect(res.accountUsed).toBe('android_account');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
