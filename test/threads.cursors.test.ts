import { describe, expect, it } from 'vitest';
import {
  decodeThreadsConversationCursor,
  decodeThreadsProfileTimelineCursor,
  encodeThreadsConversationCursor,
  encodeThreadsProfileTimelineCursor
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
      count: 20
    });
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
