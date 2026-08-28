import { describe, expect, it } from 'vitest';
import {
  decodeCommentCursor,
  decodeMaxIdCursor,
  decodeProfileCursor,
  encodeCommentCursor,
  encodeMaxIdCursor,
  encodeProfileCursor
} from '@fxembed/atmosphere/providers/instagram/cursors';

describe('instagram cursors', () => {
  it('roundtrips profile cursor', () => {
    const cur = {
      v: 1 as const,
      k: 't' as const,
      uid: '173560420',
      u: 'cristiano',
      a: 'CURSOR123',
      c: 12
    };
    const enc = encodeProfileCursor(cur);
    expect(decodeProfileCursor(enc)).toEqual(cur);
  });

  it('roundtrips comment cursor', () => {
    const cur = {
      v: 1 as const,
      mediaId: '3881689364048676894',
      shortcode: 'DXeh-kYiIge',
      sort: 'popular' as const,
      after: 'AFTER',
      count: 10,
      src: 'gql' as const
    };
    const enc = encodeCommentCursor(cur);
    expect(decodeCommentCursor(enc)).toEqual(cur);
  });

  it('roundtrips a proxy-minted comment cursor and keeps the two sources apart', () => {
    const proxyCursor = {
      v: 1 as const,
      mediaId: '3881689364048676894',
      shortcode: 'DXeh-kYiIge',
      sort: 'recent' as const,
      after: '17900000000000000_0',
      count: 20,
      src: 'proxy' as const
    };
    expect(decodeCommentCursor(encodeCommentCursor(proxyCursor))).toEqual(proxyCursor);

    // Cursors minted before `src` existed came from the logged-out GraphQL path.
    const legacy = btoa(
      JSON.stringify({
        v: 1,
        mediaId: '3881689364048676894',
        shortcode: 'DXeh-kYiIge',
        sort: 'popular',
        after: 'AFTER',
        count: 10
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeCommentCursor(legacy)?.src).toBe('gql');
  });

  it('roundtrips max_id cursor and rejects mismatched kinds', () => {
    const cur = {
      v: 1 as const,
      k: 'followers' as const,
      id: '173560420',
      u: 'cristiano',
      m: '100|abcdef',
      c: 20
    };
    expect(decodeMaxIdCursor(encodeMaxIdCursor(cur))).toEqual(cur);
    expect(
      decodeMaxIdCursor(
        encodeMaxIdCursor({ v: 1, k: 'feed_videos', id: '1', u: 'a', m: 'x', c: 20 })
      )?.k
    ).toBe('feed_videos');

    const badKind = btoa(JSON.stringify({ v: 1, k: 'likers', id: '1', u: 'a', m: 'x', c: 20 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeMaxIdCursor(badKind)).toBeNull();
    expect(decodeMaxIdCursor('')).toBeNull();
    // An empty `m` would page from the top forever rather than advancing.
    const emptyMax = btoa(JSON.stringify({ v: 1, k: 'feed', id: '1', u: 'a', m: '', c: 20 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeMaxIdCursor(emptyMax)).toBeNull();
  });

  it('decodeProfileCursor returns null for bad input', () => {
    expect(decodeProfileCursor('')).toBeNull();
    expect(decodeProfileCursor('not-valid-base64!!!')).toBeNull();
    const junk = btoa('{"v":2,"k":"t"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeProfileCursor(junk)).toBeNull();
  });

  it('decodeCommentCursor returns null for bad or mismatched structure', () => {
    expect(decodeCommentCursor('')).toBeNull();
    expect(decodeCommentCursor('!!!')).toBeNull();
    const wrongV = btoa(
      JSON.stringify({
        v: 99,
        mediaId: '1',
        shortcode: 'a',
        sort: 'popular',
        after: null,
        count: 1
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeCommentCursor(wrongV)).toBeNull();
  });
});
