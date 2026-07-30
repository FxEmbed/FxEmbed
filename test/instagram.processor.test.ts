import { describe, expect, it } from 'vitest';
import {
  commentRecordToSubstatus,
  estimateInstagramVideoBytes,
  fullUserFromWebProfile,
  instagramNodeToStatus,
  mapCommentEdges
} from '@fxembed/atmosphere/providers/instagram/processor';

describe('instagram processor', () => {
  const ownerFb = {
    id: '173560420',
    username: 'cristiano',
    fullName: 'CR7',
    pic: 'https://cdn.example/p.jpg'
  };

  it('maps graph-style media node to status', () => {
    const node: Record<string, unknown> = {
      shortcode: 'DXeh-kYiIge',
      id: '3881689364048676894_173560420',
      taken_at_timestamp: 1776953871,
      is_video: false,
      owner: { id: '173560420', username: 'cristiano' },
      edge_media_to_caption: {
        edges: [{ node: { text: 'Caption line' } }]
      },
      edge_liked_by: { count: 10 },
      edge_media_to_comment: { count: 3 },
      display_url: 'https://cdn.example/post.jpg',
      dimensions: { width: 640, height: 1136 }
    };
    const s = instagramNodeToStatus(node, ownerFb);
    expect(s).toBeTruthy();
    expect(s!.id).toBe('DXeh-kYiIge');
    expect(s!.provider).toBe('instagram');
    expect(s!.likes).toBe(10);
    expect(s!.replies).toBe(3);
    expect(s!.text).toBe('Caption line');
    expect(s!.media_pk).toBe('3881689364048676894');
  });

  it('maps polaris video product media to status with video URL', () => {
    const node: Record<string, unknown> = {
      __typename: 'XIGPolarisVideoMedia',
      pk: '2913440072144448240',
      code: 'Chunk8-jurw',
      media_type: 2,
      product_type: 'clips',
      taken_at: 1661529231,
      like_count: 980043,
      comment_count: 15928,
      original_width: 720,
      original_height: 1280,
      caption: { text: 'Gingerton' },
      user: {
        pk: '25025320',
        username: 'instagram',
        full_name: 'Instagram',
        profile_pic_url: 'https://cdn.example/u.jpg',
        is_verified: true
      },
      display_uri: 'https://cdn.example/thumb.jpg',
      video_versions: [{ url: 'https://cdn.example/v.mp4', type: 101 }],
      video_dash_manifest: '<MPD mediaPresentationDuration="PT0H0M4.967S"></MPD>'
    };
    const s = instagramNodeToStatus(node, ownerFb);
    expect(s).toBeTruthy();
    expect(s!.id).toBe('Chunk8-jurw');
    expect(s!.url).toContain('/reel/Chunk8-jurw');
    expect(s!.author.screen_name).toBe('instagram');
    expect(s!.likes).toBe(980043);
    expect(s!.media?.videos?.length).toBe(1);
    expect(s!.media?.videos?.[0]?.url).toBe('https://cdn.example/v.mp4');
    expect(s!.media?.videos?.[0]?.thumbnail_url).toBe('https://cdn.example/thumb.jpg');
    expect(s!.media?.videos?.[0]?.duration).toBeCloseTo(4.967, 3);
    expect(s!.media?.videos?.[0]?.width).toBe(720);
    expect(s!.media_pk).toBe('2913440072144448240');
  });

  it('for Telegram prefers a lower-res variant when high-res estimate exceeds ~20MB', () => {
    const node: Record<string, unknown> = {
      pk: '1',
      code: 'LongReel123',
      media_type: 2,
      product_type: 'clips',
      taken_at: 1661529231,
      video_duration: 90,
      original_width: 1080,
      original_height: 1920,
      caption: { text: 'long' },
      user: { pk: '1', username: 'demo' },
      display_uri: 'https://cdn.example/thumb.jpg',
      video_versions: [
        { url: 'https://cdn.example/1080.mp4', type: 103, width: 1080, height: 1920 },
        { url: 'https://cdn.example/360.mp4', type: 101, width: 360, height: 640 }
      ]
    };
    const high = estimateInstagramVideoBytes(1080, 1920, 90)!;
    const low = estimateInstagramVideoBytes(360, 640, 90)!;
    expect(high).toBeGreaterThan(20 * 1024 * 1024);
    expect(low).toBeLessThan(18 * 1024 * 1024);

    const forDiscord = instagramNodeToStatus(node, ownerFb, {
      userAgent: 'Discordbot/2.0'
    });
    expect(forDiscord!.media?.videos?.[0]?.url).toBe('https://cdn.example/1080.mp4');

    const forTelegram = instagramNodeToStatus(node, ownerFb, {
      userAgent: 'TelegramBot (like TwitterBot)'
    });
    expect(forTelegram!.media?.videos?.[0]?.url).toBe('https://cdn.example/360.mp4');
    expect(forTelegram!.media?.videos?.[0]?.filesize).toBe(low);
    expect(forTelegram!.media?.videos?.[0]?.formats?.length).toBe(2);
  });

  it('for Telegram with no size estimates keeps highest-quality variant', () => {
    const node: Record<string, unknown> = {
      pk: '3',
      code: 'NoDurationReel',
      media_type: 2,
      product_type: 'clips',
      taken_at: 1661529231,
      // No video_duration / dash duration → estimates unavailable
      original_width: 1080,
      original_height: 1920,
      caption: { text: 'nodur' },
      user: { pk: '1', username: 'demo' },
      display_uri: 'https://cdn.example/thumb.jpg',
      video_versions: [
        { url: 'https://cdn.example/1080.mp4', type: 103, width: 1080, height: 1920 },
        { url: 'https://cdn.example/360.mp4', type: 101, width: 360, height: 640 }
      ]
    };
    const forTelegram = instagramNodeToStatus(node, ownerFb, {
      userAgent: 'TelegramBot'
    });
    expect(forTelegram!.media?.videos?.[0]?.url).toBe('https://cdn.example/1080.mp4');
    expect(forTelegram!.media?.videos?.[0]?.filesize).toBeUndefined();
  });

  it('uses DASH bandwidth when estimating Telegram-safe variants', () => {
    const node: Record<string, unknown> = {
      pk: '2',
      code: 'DashReel',
      media_type: 2,
      product_type: 'clips',
      taken_at: 1661529231,
      video_duration: 60,
      original_width: 720,
      original_height: 1280,
      caption: { text: 'dash' },
      user: { pk: '1', username: 'demo' },
      display_uri: 'https://cdn.example/thumb.jpg',
      video_versions: [
        { url: 'https://cdn.example/hi.mp4', type: 103, width: 720, height: 1280 },
        { url: 'https://cdn.example/lo.mp4', type: 101, width: 360, height: 640 }
      ],
      video_dash_manifest:
        '<MPD mediaPresentationDuration="PT0H1M0S">' +
        '<Representation bandwidth="5000000" width="720" height="1280"/>' +
        '<Representation bandwidth="400000" width="360" height="640"/>' +
        '</MPD>'
    };
    const forTelegram = instagramNodeToStatus(node, ownerFb, {
      userAgent: 'TelegramBot'
    });
    expect(forTelegram!.media?.videos?.[0]?.url).toBe('https://cdn.example/lo.mp4');
    // 400000 bps * 60s / 8 = 3_000_000 bytes
    expect(forTelegram!.media?.videos?.[0]?.filesize).toBe(3_000_000);
  });

  it('maps polaris carousel with video slides', () => {
    const node: Record<string, unknown> = {
      pk: '1455917559229915856',
      code: 'BQ0eAlwhDrw',
      media_type: 8,
      product_type: 'carousel_container',
      taken_at: 1486140000,
      caption: { text: 'Surprise' },
      user: { pk: '25025320', username: 'instagram', full_name: 'Instagram' },
      carousel_media: [
        {
          pk: '1455917388444111830',
          code: 'BQ0dSaohpPW',
          media_type: 2,
          original_width: 640,
          original_height: 640,
          video_versions: [{ url: 'https://cdn.example/c1.mp4' }],
          image_versions2: {
            candidates: [{ url: 'https://cdn.example/c1.jpg', width: 640, height: 640 }]
          }
        },
        {
          pk: '1455917472833528275',
          code: 'BQ0dTpOhuHT',
          media_type: 2,
          video_versions: [{ url: 'https://cdn.example/c2.mp4' }]
        }
      ]
    };
    const s = instagramNodeToStatus(node, ownerFb);
    expect(s).toBeTruthy();
    expect(s!.media?.videos?.length).toBe(2);
    expect(s!.media?.videos?.[0]?.url).toBe('https://cdn.example/c1.mp4');
    expect(s!.url).toContain('/p/BQ0eAlwhDrw');
  });

  it('maps comment node to substatus', () => {
    const sub = commentRecordToSubstatus(
      {
        pk: '17915753442361302',
        text: 'Great post',
        created_at: 1776954000,
        user: { pk: '99', username: 'fan', profile_pic_url: null }
      },
      'DXeh-kYiIge',
      'cristiano'
    );
    expect(sub).toBeTruthy();
    expect(sub!.type).toBe('substatus');
    expect(sub!.parent_id).toBe('DXeh-kYiIge');
    expect(sub!.provider).toBe('instagram');
    expect(sub!.replying_to?.status).toBe('DXeh-kYiIge');
    expect(sub!.replying_to?.screen_name).toBe('cristiano');
  });

  it('maps comment edges', () => {
    const edges = [
      {
        node: {
          pk: '1',
          text: 'a',
          created_at: 1,
          user: { pk: '2', username: 'u' }
        }
      }
    ];
    const out = mapCommentEdges(edges, 'SC', 'postauthor');
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });

  it('parses web_profile_info envelope to API user', () => {
    const json = {
      data: {
        user: {
          id: '173560420',
          username: 'cristiano',
          full_name: 'Cristiano Ronaldo',
          biography: 'Bio',
          edge_followed_by: { count: 100 },
          edge_follow: { count: 5 },
          edge_owner_to_timeline_media: { count: 10 },
          profile_pic_url: 'https://cdn.example/a.jpg',
          is_verified: true,
          is_private: false
        }
      }
    };
    const u = fullUserFromWebProfile(json as Record<string, unknown>);
    expect(u).toBeTruthy();
    expect(u!.screen_name).toBe('cristiano');
    expect(u!.followers).toBe(100);
    expect(u!.protected).toBe(false);
  });
});
