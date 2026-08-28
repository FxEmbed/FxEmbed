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
      count: Math.floor(o.count)
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
