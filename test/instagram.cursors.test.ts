import { describe, expect, it } from 'vitest';
import {
  decodeCommentCursor,
  decodeProfileCursor,
  encodeCommentCursor,
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
      count: 10
    };
    const enc = encodeCommentCursor(cur);
    expect(decodeCommentCursor(enc)).toEqual(cur);
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
