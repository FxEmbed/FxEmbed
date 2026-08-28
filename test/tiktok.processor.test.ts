import { describe, expect, it } from 'vitest';
import {
  buildAPITikTokStatusFromEmbedItem,
  buildAPITikTokStatusFromEmbedVideo,
  buildAPITikTokUser,
  buildAPITikTokUserFromEmbed,
  tiktokIdToTimestamp
} from '@fxembed/atmosphere/providers/tiktok/processor';
import {
  extractEmbedState,
  extractUniversalData
} from '@fxembed/atmosphere/providers/tiktok/client';
import {
  isShortCode,
  parseVideoUrl
} from '@fxembed/atmosphere/providers/tiktok/conversation';
import { normalizeTikTokHandle } from '@fxembed/atmosphere/providers/tiktok/profile';

const user: TikTokAuthor = {
  id: '107955',
  uniqueId: 'tiktok',
  nickname: 'TikTok',
  avatarThumb: 'https://cdn.example/thumb.jpg',
  avatarMedium: 'https://cdn.example/medium.jpg',
  avatarLarger: 'https://cdn.example/large.jpg',
  signature: 'One TikTok can make a big impact',
  createTime: 1425144149,
  verified: true,
  secUid: 'MS4wLjABAAAA',
  openFavorite: false,
  relation: 0,
  privateAccount: false,
  bioLink: { link: 'linktr.ee/tiktok', risk: 0 }
};

describe('TikTok profile mapping', () => {
  it('prefers the exact statsV2 counts over the rounded display counts', () => {
    const mapped = buildAPITikTokUser(
      user,
      { followerCount: 95400000, followingCount: 2, heartCount: 462900000, videoCount: 1496 },
      {
        followerCount: '95384989',
        followingCount: '2',
        heart: '462934211',
        heartCount: '462934211',
        videoCount: '1496',
        diggCount: '0',
        friendCount: '1'
      } as TikTokAuthorStatsV2
    );

    expect(mapped.followers).toBe(95384989);
    expect(mapped.likes).toBe(462934211);
    expect(mapped.statuses).toBe(1496);
    expect(mapped.media_count).toBe(1496);
  });

  it('falls back to the rounded counts when statsV2 is missing', () => {
    const mapped = buildAPITikTokUser(user, {
      followerCount: 95400000,
      followingCount: 2,
      heartCount: 462900000,
      videoCount: 1496
    } as TikTokAuthorStats);

    expect(mapped.followers).toBe(95400000);
    expect(mapped.likes).toBe(462900000);
  });

  it('maps the bio link, join date and verification badge', () => {
    const mapped = buildAPITikTokUser(user);
    expect(mapped.website).toEqual({
      url: 'https://linktr.ee/tiktok',
      display_url: 'linktr.ee/tiktok'
    });
    expect(mapped.joined).toBe(new Date(1425144149 * 1000).toISOString());
    expect(mapped.verification?.verified).toBe(true);
    expect(mapped.url).toBe('https://www.tiktok.com/@tiktok');
  });

  it('marks the thinner embed profile so clients know to re-fetch', () => {
    const mapped = buildAPITikTokUserFromEmbed({
      id: '107955',
      uniqueId: 'tiktok',
      nickname: 'TikTok',
      followerCount: 95400000,
      heartCount: 462900000,
      verified: true
    });

    expect(mapped.profile_embed).toBe(true);
    expect(mapped.followers).toBe(95400000);
    // The creator embed carries no video count or join date.
    expect(mapped.statuses).toBe(0);
    expect(mapped.joined).toBe('');
  });
});

describe('TikTok id timestamps', () => {
  it('reads the seconds out of the top 32 bits', () => {
    // Real post; its API create_time is 1762800802, ~31s after the id was minted.
    expect(tiktokIdToTimestamp('7571171661639175454')).toBe(1762800771);
  });

  it('rejects ids that decode to an implausible date', () => {
    expect(tiktokIdToTimestamp('1')).toBe(0);
    expect(tiktokIdToTimestamp('not-an-id')).toBe(0);
  });
});

describe('TikTok embed timeline rows', () => {
  const author = buildAPITikTokUserFromEmbed({
    id: '107955',
    uniqueId: 'tiktok',
    nickname: 'TikTok'
  });

  const item: TikTokEmbedItem = {
    id: '7571171661639175454',
    desc: 'hello',
    width: 720,
    height: 1280,
    coverUrl: 'https://cdn.example/cover.jpg',
    originCoverUrl: 'https://cdn.example/origin.jpg',
    playAddr: 'https://cdn.example/video.mp4',
    playCount: 42800,
    authorUniqueId: 'tiktok'
  };

  it('derives created_at from the id, since embed rows carry no timestamp', () => {
    const status = buildAPITikTokStatusFromEmbedItem(item, author);
    expect(status.created_timestamp).toBe(1762800771);
    expect(status.created_at).toBe(new Date(1762800771 * 1000).toISOString());
  });

  it('keeps views but leaves the counters the embed omits at zero', () => {
    const status = buildAPITikTokStatusFromEmbedItem(item, author);
    expect(status.views).toBe(42800);
    expect(status.likes).toBe(0);
    expect(status.replies).toBe(0);
  });

  it('routes the CDN play URL through the proxy when one is given', () => {
    const status = buildAPITikTokStatusFromEmbedItem(item, author, 'https://fxtwitter.com', 'a=b');
    const url = status.media.videos?.[0]?.url ?? '';
    expect(url.startsWith('https://fxtwitter.com/proxy?')).toBe(true);
    expect(url).toContain(encodeURIComponent('https://cdn.example/video.mp4'));
    expect(url).toContain('videoId=7571171661639175454');
    expect(status.embed_card).toBe('player');
  });

  it('leaves the URL untouched with no proxy base', () => {
    const status = buildAPITikTokStatusFromEmbedItem(item, author);
    expect(status.media.videos?.[0]?.url).toBe('https://cdn.example/video.mp4');
  });
});

describe('TikTok embed player payload', () => {
  const data: TikTokEmbedVideoData = {
    itemInfos: {
      id: '7571171661639175454',
      text: 'I really wish i made it stinky...',
      createTime: '1762800802',
      authorId: '6845723898166068230',
      musicId: '7571176808381467422',
      covers: ['https://cdn.example/cover.jpg'],
      coversOrigin: ['https://cdn.example/origin.jpg'],
      video: { urls: ['https://cdn.example/video.mp4'], videoMeta: { width: 576, height: 1024 } },
      diggCount: 24800,
      shareCount: 2449,
      commentCount: 913,
      playCount: 126100
    },
    authorInfos: {
      userId: '6845723898166068230',
      uniqueId: 'harbeehooves',
      nickName: 'Harbee',
      covers: ['https://cdn.example/avatar.jpg'],
      verified: false
    },
    authorStats: { followerCount: 62200, followingCount: 181, heartCount: '1200000', videoCount: 445 },
    musicInfos: { musicName: 'original sound - Harbee', authorName: 'Harbee' }
  };

  it('maps the full counter set the player page carries', () => {
    const status = buildAPITikTokStatusFromEmbedVideo(data);
    expect(status?.likes).toBe(24800);
    expect(status?.reposts).toBe(2449);
    expect(status?.replies).toBe(913);
    expect(status?.views).toBe(126100);
    expect(status?.created_timestamp).toBe(1762800802);
    expect(status?.url).toBe('https://www.tiktok.com/@harbeehooves/video/7571171661639175454');
    expect(status?.source).toBe('♪ original sound - Harbee');
  });

  it('parses the string heart count on the author', () => {
    const status = buildAPITikTokStatusFromEmbedVideo(data);
    expect(status?.author.likes).toBe(1200000);
    expect(status?.author.followers).toBe(62200);
  });

  it('maps an image slideshow to photos rather than a player card', () => {
    const status = buildAPITikTokStatusFromEmbedVideo({
      ...data,
      itemInfos: { ...data.itemInfos!, video: undefined },
      imagePostInfo: {
        images: [
          { imageURL: { urlList: ['https://cdn.example/1.jpg'] }, imageWidth: 1080, imageHeight: 1920 }
        ]
      }
    });
    expect(status?.embed_card).toBe('summary_large_image');
    expect(status?.media.photos).toHaveLength(1);
  });

  it('returns null when the payload has no item', () => {
    expect(buildAPITikTokStatusFromEmbedVideo({})).toBeNull();
  });
});

describe('TikTok identifier parsing', () => {
  it('pulls a handle out of every shape a caller might send', () => {
    expect(normalizeTikTokHandle('tiktok')).toBe('tiktok');
    expect(normalizeTikTokHandle('@tiktok')).toBe('tiktok');
    expect(normalizeTikTokHandle('https://www.tiktok.com/@tiktok')).toBe('tiktok');
    expect(normalizeTikTokHandle('tiktok.com/@tiktok/video/123')).toBe('tiktok');
    expect(normalizeTikTokHandle('')).toBeNull();
    expect(normalizeTikTokHandle('has spaces')).toBeNull();
  });

  it('parses photo posts as well as video posts', () => {
    expect(parseVideoUrl('https://www.tiktok.com/@a/video/7571171661639175454')?.videoId).toBe(
      '7571171661639175454'
    );
    expect(parseVideoUrl('https://www.tiktok.com/@a/photo/7571171661639175454')?.videoId).toBe(
      '7571171661639175454'
    );
    expect(parseVideoUrl('https://m.tiktok.com/v/7571171661639175454')?.videoId).toBe(
      '7571171661639175454'
    );
    expect(parseVideoUrl('https://www.tiktok.com/foundry')).toBeNull();
  });

  it('treats anything non-numeric as a short code', () => {
    expect(isShortCode('7571171661639175454')).toBe(false);
    expect(isShortCode('ZP8yxgATu')).toBe(true);
  });
});

describe('TikTok page payload extraction', () => {
  it('unwraps __DEFAULT_SCOPE__ from the rehydration blob', () => {
    const html = `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
      { __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user } } } }
    )}</script></body></html>`;

    const data = extractUniversalData(html);
    expect(data?.['webapp.user-detail']?.userInfo?.user?.uniqueId).toBe('tiktok');
  });

  it('picks the route entry out of the embed state regardless of its key', () => {
    const html = `<html><body><script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify(
      {
        source: {
          data: {
            strategy: { ignored: true },
            '/embed/@tiktok/': { userInfo: { uniqueId: 'tiktok' }, videoList: [] }
          }
        }
      }
    )}</script></body></html>`;

    expect(extractEmbedState(html)?.userInfo?.uniqueId).toBe('tiktok');
  });

  it('returns null when the page carries no payload at all', () => {
    expect(extractUniversalData('<html></html>')).toBeNull();
    expect(extractEmbedState('<html></html>')).toBeNull();
  });
});
