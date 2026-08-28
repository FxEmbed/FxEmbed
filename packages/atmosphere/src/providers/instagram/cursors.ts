export type InstagramProfileCursorV1 = {
  v: 1;
  /** timeline grid vs reels tab */
  k: 't' | 'r';
  uid: string;
  u: string;
  a: string | null;
  c: number;
};

export type InstagramCommentCursorV1 = {
  v: 1;
  mediaId: string;
  shortcode: string;
  sort: 'popular' | 'recent';
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

export function encodeProfileCursor(p: InstagramProfileCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeProfileCursor(raw: string): InstagramProfileCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<InstagramProfileCursorV1>;
    if (o.v !== 1 || (o.k !== 't' && o.k !== 'r')) return null;
    if (typeof o.uid !== 'string' || typeof o.u !== 'string') return null;
    if (typeof o.c !== 'number' || !Number.isFinite(o.c) || o.c < 1 || o.c > 100) return null;
    return {
      v: 1,
      k: o.k,
      uid: o.uid,
      u: o.u,
      a: typeof o.a === 'string' || o.a === null ? o.a : null,
      c: Math.floor(o.c)
    };
  } catch {
    return null;
  }
}

export function encodeCommentCursor(p: InstagramCommentCursorV1): string {
  return b64urlEncode(JSON.stringify(p));
}

export function decodeCommentCursor(raw: string): InstagramCommentCursorV1 | null {
  const json = b64urlDecode(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<InstagramCommentCursorV1>;
    if (o.v !== 1 || typeof o.mediaId !== 'string' || typeof o.shortcode !== 'string') return null;
    if (o.sort !== 'popular' && o.sort !== 'recent') return null;
    if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 1 || o.count > 100) {
      return null;
    }
    return {
      v: 1,
      mediaId: o.mediaId,
      shortcode: o.shortcode,
      sort: o.sort,
      after: typeof o.after === 'string' || o.after === null ? o.after : null,
      count: Math.floor(o.count)
    };
  } catch {
    return null;
  }
}
