import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSameOriginHttps, sameOriginHttpsRedirectUrl } from '@fxembed/atmosphere/helpers';

const FROM = 'https://i.instagram.com/api/v1/users/x/usernameinfo/';

describe('sameOriginHttpsRedirectUrl', () => {
  it('accepts https same-origin absolute and relative Location', () => {
    expect(sameOriginHttpsRedirectUrl(FROM, 'https://i.instagram.com/api/v1/canonical/')).toBe(
      'https://i.instagram.com/api/v1/canonical/'
    );
    expect(sameOriginHttpsRedirectUrl(FROM, '/api/v1/canonical/')).toBe(
      'https://i.instagram.com/api/v1/canonical/'
    );
  });

  it('rejects off-origin, http, protocol-relative, and junk Location', () => {
    expect(sameOriginHttpsRedirectUrl(FROM, 'https://evil.example/steal')).toBeNull();
    expect(
      sameOriginHttpsRedirectUrl(FROM, 'http://i.instagram.com/api/v1/users/x/usernameinfo/')
    ).toBeNull();
    expect(sameOriginHttpsRedirectUrl(FROM, '//evil.example/steal')).toBeNull();
    expect(sameOriginHttpsRedirectUrl(FROM, 'https://i.instagram.com.evil.example/')).toBeNull();
    expect(sameOriginHttpsRedirectUrl(FROM, null)).toBeNull();
    expect(sameOriginHttpsRedirectUrl(FROM, '::::')).toBeNull();
  });
});

describe('fetchSameOriginHttps', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forces redirect: manual and stops at an off-origin hop', async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example/steal' }
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await fetchSameOriginHttps(FROM, { headers: { Cookie: 'sessionid=s' } });
    expect(res.status).toBe(302);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
});
