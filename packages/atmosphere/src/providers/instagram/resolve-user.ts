import type { APIUser } from '../../types/api-schemas.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import { resolveInstagramAccounts, type InstagramRequestContext } from './account-proxy.js';
import { fetchWebProfileInfo } from './client.js';
import { fetchPrivateUserByUsername } from './private-api.js';
import { fullUserFromWebProfile } from './processor.js';
import { userFromPrivateUserResponse } from './private-processor.js';

export type ResolvedInstagramUser = {
  code: 200 | 404 | 500;
  user: APIUser | null;
  /** Accounts resolved along the way, so callers can reuse one shuffle across follow-up calls. */
  accounts: InstagramCredentials[];
};

/**
 * Resolve a handle to a profile. Prefers the account proxy (`users/{username}/usernameinfo/`),
 * which also works for age-gated accounts, and falls back to logged-out `web_profile_info`.
 */
export async function resolveInstagramUser(
  username: string,
  ctx: InstagramRequestContext | undefined,
  options: { accounts?: InstagramCredentials[] } = {}
): Promise<ResolvedInstagramUser> {
  const accounts = options.accounts ?? (await resolveInstagramAccounts(ctx));

  if (accounts.length) {
    const res = await fetchPrivateUserByUsername(username, ctx, { accounts });
    if (res.ok) {
      const user = userFromPrivateUserResponse(res.json);
      if (user) return { code: 200, user, accounts };
    }
    if (res.status === 404) {
      return { code: 404, user: null, accounts };
    }
  }

  const web = await fetchWebProfileInfo(username, ctx?.userAgent);
  if (!web.ok) {
    return { code: web.status === 404 ? 404 : 500, user: null, accounts };
  }
  const user = fullUserFromWebProfile(web.json as Record<string, unknown>);
  if (!user) {
    return { code: 404, user: null, accounts };
  }
  return { code: 200, user, accounts };
}
