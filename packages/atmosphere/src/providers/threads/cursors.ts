export type ThreadsConversationCursorV1 = {
  v: 1;
  /** Numeric post pk (GraphQL `postID`). */
  postId: string;
  /** Shortcode for parent_id in replies. */
  shortcode: string;
  sort: 'TOP' | 'RECENT';
  /** Upstream Relay `end_cursor` for the replies connection (opaque). */
  after: string | null;
  count: number;
  /**
   * Which reply source minted this cursor. The logged-out Relay connection and the proxied
   * `text_feed/{post_id}/replies/` route hand back incompatible tokens, so a cursor can only be
   * replayed against the source it came from.
   */
  src?: 'gql' | 'proxy';
};

export type ThreadsProfileTimelineCursorV1 = {
  v: 1;
  userId: string;
  username: string;
  after: string | null;
  count: number;
};

const b64urlEncode = (json: string): string => {
  try {
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) {
      bin += String.fromCharCode(b);
    }
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
};

const b64urlDecode = (raw: string): string | null => {
  try {
    let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return atob(b64);
  } catch {
    return null;
  }
};

export function encodeThreadsConversationCursor(p: ThreadsConversationCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeThreadsConversationCursor(raw: string): ThreadsConversationCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<ThreadsConversationCursorV1>;
    if (o.v !== 1 || typeof o.postId !== 'string' || typeof o.shortcode !== 'string') return null;
    if (o.sort !== 'TOP' && o.sort !== 'RECENT') return null;
    if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 1 || o.count > 100) {
      return null;
    }
    return {
      v: 1,
      postId: o.postId,
      shortcode: o.shortcode,
      sort: o.sort,
      after: typeof o.after === 'string' || o.after === null ? o.after : null,
      count: Math.floor(o.count),
      src: o.src === 'proxy' ? 'proxy' : 'gql'
    };
  } catch {
    return null;
  }
}

export function encodeThreadsProfileTimelineCursor(p: ThreadsProfileTimelineCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeThreadsProfileTimelineCursor(
  raw: string
): ThreadsProfileTimelineCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<ThreadsProfileTimelineCursorV1>;
    if (o.v !== 1 || typeof o.userId !== 'string' || typeof o.username !== 'string') return null;
    if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 1 || o.count > 100) {
      return null;
    }
    return {
      v: 1,
      userId: o.userId,
      username: o.username,
      after: typeof o.after === 'string' || o.after === null ? o.after : null,
      count: Math.floor(o.count)
    };
  } catch {
    return null;
  }
}

/**
 * Token cursor for the proxy-backed list surfaces (profile tabs, likes, follow lists). They all
 * paginate the same way — an opaque upstream token plus the resolved user/media id — so one cursor
 * shape covers them, with `k` keeping a cursor from being replayed against a different surface.
 */
export type ThreadsTokenCursorV1 = {
  v: 1;
  /** Which surface minted this cursor. */
  k: 'threads' | 'replies' | 'reposts' | 'media' | 'followers' | 'following' | 'likes';
  /** Numeric user pk (profile tabs, follow lists) or media pk (likes). */
  id: string;
  /** Handle the caller asked for, so a cursor can't be swapped onto another profile. */
  u: string;
  /** Upstream `paging_tokens.downwards` / `next_max_id`. */
  t: string | null;
  c: number;
};

export type ThreadsSearchCursorV1 = {
  v: 1;
  q: string;
  /** `recent` tab vs `top` tab; the two rank differently and their tokens aren't interchangeable. */
  r: boolean;
  /** Upstream `page_token`. */
  t: string | null;
  /** Upstream `rank_token`, replayed on every page of one search session. */
  rt: string | null;
  /** Page ordinal the app sends as `page_num`. */
  p: number;
  c: number;
};

const validCount = (c: unknown): c is number =>
  typeof c === 'number' && Number.isFinite(c) && c >= 1 && c <= 100;

export function encodeThreadsTokenCursor(p: ThreadsTokenCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeThreadsTokenCursor(
  raw: string,
  kind: ThreadsTokenCursorV1['k']
): ThreadsTokenCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<ThreadsTokenCursorV1>;
    if (o.v !== 1 || o.k !== kind) return null;
    if (typeof o.id !== 'string' || typeof o.u !== 'string') return null;
    if (!validCount(o.c)) return null;
    return {
      v: 1,
      k: kind,
      id: o.id,
      u: o.u,
      t: typeof o.t === 'string' || o.t === null ? o.t : null,
      c: Math.floor(o.c)
    };
  } catch {
    return null;
  }
}

export function encodeThreadsSearchCursor(p: ThreadsSearchCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeThreadsSearchCursor(raw: string): ThreadsSearchCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const bytes = new Uint8Array(json.length);
    for (let i = 0; i < json.length; i++) {
      bytes[i] = json.charCodeAt(i);
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    const o = JSON.parse(text) as Partial<ThreadsSearchCursorV1>;
    if (o.v !== 1 || typeof o.q !== 'string' || typeof o.r !== 'boolean') return null;
    if (!validCount(o.c)) return null;
    if (typeof o.p !== 'number' || !Number.isFinite(o.p) || o.p < 0) return null;
    return {
      v: 1,
      q: o.q,
      r: o.r,
      t: typeof o.t === 'string' || o.t === null ? o.t : null,
      rt: typeof o.rt === 'string' || o.rt === null ? o.rt : null,
      p: Math.floor(o.p),
      c: Math.floor(o.c)
    };
  } catch {
    return null;
  }
}

/** Handles differ only by case / a leading `@`; a cursor should survive both. */
export function sameThreadsHandle(a: string, b: string): boolean {
  return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}
