import { describe, expect, it } from 'vitest';
import {
  mediaItemsFromPrivateFeed,
  nextMaxIdFromPrivateResponse,
  userFromPrivateRecord,
  userFromPrivateUserResponse,
  usersFromPrivateList
} from '@fxembed/atmosphere/providers/instagram/private-processor';

describe('instagram private API normalizers', () => {
  it('maps a full usernameinfo record', () => {
    const user = userFromPrivateUserResponse({
      user: {
        pk: 173560420,
        username: 'cristiano',
        full_name: 'Cristiano Ronaldo',
        biography: 'SIUUU',
        is_verified: true,
        is_private: false,
        follower_count: 650000000,
        following_count: 590,
        media_count: 3800,
        external_url: 'https://example.com/cr7',
        profile_pic_url: 'https://cdn.example/small.jpg',
        hd_profile_pic_url_info: { url: 'https://cdn.example/hd.jpg' }
      }
    });
    expect(user).toMatchObject({
      id: '173560420',
      screen_name: 'cristiano',
      name: 'Cristiano Ronaldo',
      description: 'SIUUU',
      followers: 650000000,
      following: 590,
      statuses: 3800,
      media_count: 3800,
      protected: false,
      url: 'https://www.instagram.com/cristiano/'
    });
    // The HD variant is preferred over the small one when Instagram offers both.
    expect(user?.avatar_url).toBe('https://cdn.example/hd.jpg');
    expect(user?.verification).toEqual({ verified: true, type: 'individual' });
    expect(user?.website).toEqual({
      url: 'https://example.com/cr7',
      display_url: 'example.com/cr7'
    });
  });

  it('maps trimmed follow-list records without inventing counts', () => {
    const users = usersFromPrivateList({
      users: [
        { pk: 1, username: 'alpha', full_name: 'Alpha', is_private: true },
        { pk: 2, username: 'beta', is_verified: true },
        { username: 'no_pk' },
        'garbage'
      ]
    });
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      id: '1',
      screen_name: 'alpha',
      protected: true,
      followers: 0
    });
    // Falls back to the handle when Instagram omits full_name.
    expect(users[1]).toMatchObject({ id: '2', screen_name: 'beta', name: 'beta' });
  });

  it('prefers pk_id when Instagram sends a lossy numeric pk', () => {
    const user = userFromPrivateRecord({
      pk: 9007199254740993,
      pk_id: '9007199254740993',
      username: 'bigid'
    });
    expect(user?.id).toBe('9007199254740993');
  });

  it('reads next_max_id across the shapes Instagram uses', () => {
    expect(nextMaxIdFromPrivateResponse({ next_max_id: 'abc' })).toBe('abc');
    expect(nextMaxIdFromPrivateResponse({ next_max_id: 12345 })).toBe('12345');
    expect(nextMaxIdFromPrivateResponse({ next_max_id: { next_max_id: 'nested' } })).toBe('nested');
    expect(nextMaxIdFromPrivateResponse({})).toBeNull();
  });

  it('stops paginating when Instagram says the list is exhausted', () => {
    // Instagram echoes a cursor back on the last page; the flags are what actually end it.
    expect(nextMaxIdFromPrivateResponse({ next_max_id: 'abc', more_available: false })).toBeNull();
    expect(nextMaxIdFromPrivateResponse({ next_max_id: 'abc', big_list: false })).toBeNull();
    expect(
      nextMaxIdFromPrivateResponse({ next_max_id: 'abc', has_more_comments: false })
    ).toBeNull();
  });

  it('unwraps the { media } entries the tagged feed returns', () => {
    const items = mediaItemsFromPrivateFeed({
      items: [{ media: { code: 'AAA' } }, { code: 'BBB' }, null, { media: [1, 2] }]
    });
    expect(items.map(i => i.code)).toEqual(['AAA', 'BBB', undefined]);
  });
});
