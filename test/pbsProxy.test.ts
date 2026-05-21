import { describe, expect, it } from 'vitest';
import { proxyTwitterPostPhotoUrl } from '../src/helpers/pbsProxy';

describe('proxyTwitterPostPhotoUrl', () => {
  const mediaUrl = 'https://pbs.twimg.com/media/abc.jpg?name=orig';
  const profileUrl = 'https://pbs.twimg.com/profile_images/1/normal.jpg';

  it('rewrites pbs.twimg.com/media URLs when enabled', () => {
    expect(proxyTwitterPostPhotoUrl(mediaUrl, true)).toBe(
      'https://pbs.fxtwitter.com/media/abc.jpg?name=orig'
    );
  });

  it('leaves profile_images URLs unchanged', () => {
    expect(proxyTwitterPostPhotoUrl(profileUrl, true)).toBe(profileUrl);
  });

  it('leaves non-Twitter hosts unchanged', () => {
    const url = 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc@jpeg';
    expect(proxyTwitterPostPhotoUrl(url, true)).toBe(url);
  });

  it('no-ops when disabled', () => {
    expect(proxyTwitterPostPhotoUrl(mediaUrl, false)).toBe(mediaUrl);
  });
});
