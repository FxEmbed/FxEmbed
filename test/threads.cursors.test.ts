import { describe, expect, it } from 'vitest';
import {
  decodeThreadsConversationCursor,
  decodeThreadsProfileTimelineCursor,
  decodeThreadsSearchCursor,
  encodeThreadsConversationCursor,
  encodeThreadsProfileTimelineCursor,
  encodeThreadsSearchCursor
} from '@fxembed/atmosphere/providers/threads/cursors';

describe('threads conversation cursor', () => {
  it('round-trips', () => {
    const raw = encodeThreadsConversationCursor({
      v: 1,
      postId: '3882494318431583186',
      shortcode: 'DXhZAMkljvS',
      sort: 'TOP',
      after: 'opaque-cursor',
      count: 20
    });
    expect(decodeThreadsConversationCursor(raw)).toEqual({
      v: 1,
      postId: '3882494318431583186',
      shortcode: 'DXhZAMkljvS',
      sort: 'TOP',
      after: 'opaque-cursor',
      count: 20,
      // A cursor minted before the proxy existed came from the logged-out connection.
      src: 'gql'
    });
  });

  it('keeps proxy and logged-out cursors distinguishable', () => {
    const proxy = decodeThreadsConversationCursor(
      encodeThreadsConversationCursor({
        v: 1,
        postId: '1',
        shortcode: 'a',
        sort: 'TOP',
        after: 'paging-token',
        count: 20,
        src: 'proxy'
      })
    );
    expect(proxy?.src).toBe('proxy');
  });

  it('returns encoded shortcode unchanged (caller must validate mismatch)', () => {
    const cur = decodeThreadsConversationCursor(
      encodeThreadsConversationCursor({
        v: 1,
        postId: '1',
        shortcode: 'a',
        sort: 'RECENT',
        after: null,
        count: 5
      })
    );
    expect(cur?.shortcode).toBe('a');
  });
});

describe('threads profile timeline cursor', () => {
  it('round-trips', () => {
    const raw = encodeThreadsProfileTimelineCursor({
      v: 1,
      userId: '68064311167',
      username: 'deedeeandbridget',
      after: 'QVFD',
      count: 11
    });
    expect(decodeThreadsProfileTimelineCursor(raw)).toEqual({
      v: 1,
      userId: '68064311167',
      username: 'deedeeandbridget',
      after: 'QVFD',
      count: 11
    });
  });
});

describe('threads search cursor', () => {
  it('round-trips UTF-8 query text', () => {
    const payload = {
      v: 1 as const,
      q: 'café 日本語 🧵',
      r: false,
      t: 'PAGE2',
      rt: 'RANK',
      p: 1,
      c: 20
    };
    expect(decodeThreadsSearchCursor(encodeThreadsSearchCursor(payload))).toEqual(payload);
  });

  it('returns null for invalid input', () => {
    expect(decodeThreadsSearchCursor('not-a-cursor')).toBeNull();
    expect(decodeThreadsSearchCursor('')).toBeNull();
  });
});
