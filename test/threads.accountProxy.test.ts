import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasThreadsAccountProxy,
  threadsPrivateApiRequest,
  threadsProxyHeaders
} from '@fxembed/atmosphere/providers/threads/account-proxy';
import {
  setInstagramProviderEnv,
  setInstagramProxyRuntime
} from '@fxembed/atmosphere/providers/instagram-runtime';
import {
  THREADS_ANDROID_APP_ID,
  THREADS_ANDROID_CAPABILITIES,
  THREADS_ANDROID_USER_AGENT,
  THREADS_ORIGIN
} from '@fxembed/atmosphere/providers/threads/constants';
import { INSTAGRAM_ANDROID_APP_ID } from '@fxembed/atmosphere/providers/instagram/constants';
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

function installProxyRuntime(accounts: InstagramCredentials[], hasBundle = true) {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => hasBundle,
    hasInstagramProxyAccounts: () => accounts.length > 0,
    getShuffledInstagramAccounts: () => accounts
  });
}

function clearProxyRuntime() {
  setInstagramProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => false,
    hasInstagramProxyAccounts: () => false,
    getShuffledInstagramAccounts: () => []
  });
}

describe('threads account proxy', () => {
  beforeEach(() => {
    setInstagramProviderEnv({ apiRoot: 'https://i.instagram.com' });
  });

  afterEach(() => {
    clearProxyRuntime();
    vi.unstubAllGlobals();
  });

  it('reuses the Instagram credential pool', () => {
    expect(hasThreadsAccountProxy({ credentialKey: 'key' })).toBe(false);
    installProxyRuntime([webAccount]);
    expect(hasThreadsAccountProxy({ credentialKey: 'key' })).toBe(true);
    expect(hasThreadsAccountProxy({ credentialKey: '  ' })).toBe(false);
  });

  it('presents the Barcelona app id rather than the Instagram one', () => {
    const web = threadsProxyHeaders(webAccount);
    expect(web['X-IG-App-ID']).toBe(THREADS_ANDROID_APP_ID);
    expect(web['X-IG-App-ID']).not.toBe(INSTAGRAM_ANDROID_APP_ID);
    expect(web['X-IG-Capabilities']).toBe(THREADS_ANDROID_CAPABILITIES);
    expect(web['Origin']).toBe(THREADS_ORIGIN);
    expect(web['X-CSRFToken']).toBe('csrf-web');
    expect(web['Cookie']).toContain('sessionid=web-session');
    expect(web['Cookie']).toContain('ds_user_id=1234');

    const android = threadsProxyHeaders(androidAccount);
    expect(android['User-Agent']).toBe(THREADS_ANDROID_USER_AGENT);
    expect(android['User-Agent']).toMatch(/^Barcelona /);
    expect(android['X-IG-Device-ID']).toBe('android-0123456789abcdef');
    expect(android['Origin']).toBeUndefined();
  });

  it('fills path templates and sends the rest as query parameters', async () => {
    installProxyRuntime([webAccount]);
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        seen.push(input);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      })
    );

    const res = await threadsPrivateApiRequest(
      'text_feed/{user_id}/profile/replies/',
      { credentialKey: 'key' },
      { pathParams: { user_id: '99' }, query: { max_id: 'TOKEN', is_app_start: false } }
    );
    expect(res.ok).toBe(true);
    expect(seen[0]).toBe(
      'https://i.instagram.com/api/v1/text_feed/99/profile/replies/?max_id=TOKEN&is_app_start=false'
    );
  });

  it('reports status 0 with no accounts, so callers can answer 501', async () => {
    clearProxyRuntime();
    const res = await threadsPrivateApiRequest('fbsearch/text_app/trends/', {
      credentialKey: 'key'
    });
    expect(res).toEqual({ ok: false, status: 0, json: null });
  });

  it('rotates accounts on 429 and on a soft `status: fail` body', async () => {
    installProxyRuntime([webAccount, androidAccount]);
    const used: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init: RequestInit) => {
        const cookie = String((init.headers as Record<string, string>)['Cookie']);
        used.push(cookie);
        if (cookie.includes('web-session')) {
          return new Response('rate limited', { status: 429 });
        }
        return new Response(JSON.stringify({ status: 'ok', items: [] }), { status: 200 });
      })
    );

    const res = await threadsPrivateApiRequest('fbsearch/text_app/trends/', {
      credentialKey: 'key'
    });
    expect(res.ok).toBe(true);
    expect(res.accountUsed).toBe('android_account');
    expect(used).toHaveLength(2);
  });

  it('treats a 200 `status: fail` body as a failure worth rotating past', async () => {
    installProxyRuntime([webAccount]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'fail', message: 'feedback_required' }), {
            status: 200
          })
      )
    );
    const res = await threadsPrivateApiRequest('fbsearch/text_app/trends/', {
      credentialKey: 'key'
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(502);
  });
});
