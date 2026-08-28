import type { APIUser } from '../../types/api-schemas.js';
import type { InstagramCredentials } from '../../types/proxy-credentials.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { fetchThreadsSession, fetchThreadsUserByUsername as fetchWebUser } from './client.js';
import { fetchThreadsUserByUsername } from './private-api.js';
import { threadsUserFromPrivateRecord } from './private-processor.js';
import { userFromThreadsProfilePayload } from './processor.js';

export type ResolvedThreadsUser = {
  code: 200 | 404 | 500;
  user: APIUser | null;
  /** Accounts resolved along the way, so callers can reuse one shuffle across follow-up calls. */
  accounts: InstagramCredentials[];
};

/**
 * Resolve a handle to a Threads profile. Prefers the account proxy
 * (`users/{username}/usernameinfo/`, which carries the Threads-specific privacy flags), and falls
 * back to the logged-out `threads.com` hovercard query.
 */
export async function resolveThreadsUser(
  username: string,
  ctx: ThreadsRequestContext | undefined,
  options: { accounts?: InstagramCredentials[] } = {}
): Promise<ResolvedThreadsUser> {
  const handle = username.replace(/^@/, '');
  const accounts = options.accounts ?? (await resolveThreadsAccounts(ctx));

  if (accounts.length) {
    const res = await fetchThreadsUserByUsername(handle, ctx, { accounts });
    if (res.ok && res.json && typeof res.json === 'object') {
      const rec = (res.json as { user?: unknown }).user;
      if (rec && typeof rec === 'object') {
        const user = threadsUserFromPrivateRecord(rec as Record<string, unknown>);
        if (user) return { code: 200, user, accounts };
      }
    }
    if (res.status === 404) {
      return { code: 404, user: null, accounts };
    }
  }

  const session = await fetchThreadsSession(ctx?.userAgent);
  if (!session) {
    return { code: 500, user: null, accounts };
  }
  const hover = await fetchWebUser({ username: handle, session, userAgent: ctx?.userAgent });
  if (!hover.ok || hover.json == null) {
    return { code: hover.status === 404 ? 404 : 500, user: null, accounts };
  }
  const rec = (hover.json as { data?: { user?: unknown } })?.data?.user;
  if (!rec || typeof rec !== 'object') {
    return { code: 404, user: null, accounts };
  }
  const user = userFromThreadsProfilePayload(rec as Record<string, unknown>);
  return user ? { code: 200, user, accounts } : { code: 404, user: null, accounts };
}
