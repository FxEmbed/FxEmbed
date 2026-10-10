import { test, expect } from 'vitest';
import type { APIBlueskyStatus, APITwitterStatus } from '../src/realms/api/schemas';
import {
  escapeXml,
  statusesToFeedItems,
  syndicationEnclosureFromStatus,
  toAtomFeedXml,
  toRss20Xml,
  type SyndicationFeedMeta
} from '../src/helpers/syndicationFeeds';

const mockMeta: SyndicationFeedMeta = {
  channelTitle: 'Test channel',
  channelDescription: 'Test description',
  profileWebUrl: 'https://fxtwitter.com/example',
  selfUrlRss: 'https://fxtwitter.com/example/feed.xml',
  selfUrlAtom: 'https://fxtwitter.com/example/feed.atom.xml'
};

const baseStatus = (over: Partial<APITwitterStatus> = {}): APITwitterStatus =>
  ({
    id: '1',
    url: 'https://x.com/example/status/1',
    text: 'Hello <world> & "quotes"',
    created_at: 'Wed Jan 01 12:00:00 +0000 2020',
    created_timestamp: 1577880000,
    likes: 0,
    reposts: 0,
    quotes: 0,
    replies: 0,
    author: {
      id: 'u1',
      name: 'Ex',
      screen_name: 'example',
      avatar_url: null,
      banner_url: null,
      description: '',
      raw_description: { text: '', facets: [] },
      location: '',
      url: 'https://x.com/example',
      protected: false,
      followers: 1,
      following: 1,
      statuses: 1,
      media_count: 0,
      likes: 0,
      joined: '',
      website: null,
      possibly_sensitive: false
    },
    media: { photos: [], videos: [] },
    raw_text: { text: 'Hello', facets: [] },
    lang: 'en',
    possibly_sensitive: false,
    replying_to: null,
    source: null,
    embed_card: 'tweet',
    provider: 'twitter',
    is_note_tweet: false,
    community_note: null,
    reposted_by: null,
    ...over
  }) as APITwitterStatus;

test('escapeXml escapes special characters', () => {
  expect(escapeXml(`a & b < c > d ' e "`)).toBe('a &amp; b &lt; c &gt; d &apos; e &quot;');
});

test('statusesToFeedItems omits sensitive posts when safe mode', () => {
  const items = statusesToFeedItems(
    [
      baseStatus({ possibly_sensitive: true }),
      baseStatus({
        id: '2',
        url: 'https://x.com/example/status/2',
        possibly_sensitive: false
      })
    ],
    { omitSensitive: true }
  );
  expect(items).toHaveLength(1);
  expect(items[0].id).toBe('https://x.com/example/status/2');
});

test('safe mode omits sensitive quoted post body and link from item HTML', () => {
  const sensitiveQuote = baseStatus({
    id: 'q1',
    url: 'https://x.com/example/status/q1',
    text: 'Sensitive quote body',
    possibly_sensitive: true
  });
  const parent = baseStatus({
    id: '3',
    url: 'https://x.com/example/status/3',
    text: 'Commentary on a quote',
    possibly_sensitive: false,
    quote: sensitiveQuote
  });
  const safeItems = statusesToFeedItems([parent], { omitSensitive: true });
  expect(safeItems).toHaveLength(1);
  expect(safeItems[0].htmlContent).toContain('Commentary on a quote');
  expect(safeItems[0].htmlContent).not.toContain('Sensitive quote body');
  expect(safeItems[0].htmlContent).not.toContain('status/q1');

  const unsafeItems = statusesToFeedItems([parent], { omitSensitive: false });
  expect(unsafeItems[0].htmlContent).toContain('Sensitive quote body');
  expect(unsafeItems[0].htmlContent).toContain('status/q1');
});

test('toRss20Xml is well-formed and includes atom self link', () => {
  const xml = toRss20Xml(mockMeta, statusesToFeedItems([baseStatus()], {}));
  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
  expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
  expect(xml).toContain(
    '<atom:link href="https://fxtwitter.com/example/feed.xml" rel="self" type="application/rss+xml" />'
  );
  expect(xml).toContain('<guid isPermaLink="true">https://x.com/example/status/1</guid>');
  expect(xml).toContain('<![CDATA[');
  expect(xml).toContain('&lt;world&gt;');
});

test('RSS and Atom include enclosure for first photo', () => {
  const s = baseStatus({
    media: {
      photos: [
        {
          type: 'photo',
          url: 'https://pbs.twimg.com/media/abc.jpg',
          width: 100,
          height: 100
        }
      ],
      videos: []
    }
  });
  const items = statusesToFeedItems([s], {});
  expect(items[0].enclosure?.url).toBe('https://pbs.twimg.com/media/abc.jpg');
  expect(items[0].enclosure?.type).toBe('image/jpeg');
  const rss = toRss20Xml(mockMeta, items);
  expect(rss).toContain(
    '<enclosure url="https://pbs.twimg.com/media/abc.jpg" length="0" type="image/jpeg"/>'
  );
  const atom = toAtomFeedXml(mockMeta, items);
  expect(atom).toContain('rel="enclosure"');
  expect(atom).toContain('https://pbs.twimg.com/media/abc.jpg');
});

test('RSS enclosure uses progressive video and media:thumbnail when present', () => {
  const s = baseStatus({
    media: {
      photos: [],
      videos: [
        {
          type: 'video',
          url: 'https://x.com/i/status/1',
          width: 1280,
          height: 720,
          duration: 10,
          thumbnail_url: 'https://pbs.twimg.com/expand_thumb.jpg',
          formats: [
            { url: 'https://video.twimg.com/playlist.m3u8', container: 'm3u8' as const },
            {
              url: 'https://video.twimg.com/vid.mp4',
              container: 'mp4' as const,
              bitrate: 2_000_000
            }
          ]
        }
      ]
    }
  });
  const items = statusesToFeedItems([s], {});
  expect(items[0].enclosure?.url).toBe('https://video.twimg.com/vid.mp4');
  expect(items[0].enclosure?.type).toBe('video/mp4');
  expect(items[0].enclosure?.thumbnailUrl).toBe('https://pbs.twimg.com/expand_thumb.jpg');
  const rss = toRss20Xml(mockMeta, items);
  expect(rss).toContain('type="video/mp4"');
  expect(rss).toContain('<media:thumbnail url="https://pbs.twimg.com/expand_thumb.jpg"/>');
});

test('syndicationEnclosureFromStatus uses link card image when no tweet media', () => {
  const enc = syndicationEnclosureFromStatus(
    baseStatus({
      media: { photos: [], videos: [] },
      card: {
        url: 'https://example.com/article',
        title: 'Hi',
        image: { url: 'https://example.com/card.png', width: 800, height: 400 }
      }
    })
  );
  expect(enc?.url).toBe('https://example.com/card.png');
  expect(enc?.type).toBe('image/png');
});

test('toAtomFeedXml includes self link and entry content', () => {
  const xml = toAtomFeedXml(mockMeta, statusesToFeedItems([baseStatus()], {}));
  expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
  expect(xml).toContain(
    '<link href="https://fxtwitter.com/example/feed.atom.xml" rel="self" type="application/atom+xml"/>'
  );
  expect(xml).toContain('<content type="html">');
  expect(xml).toContain('https://x.com/example/status/1');
});

test('toAtomFeedXml emits feed-level author when authorName is set', () => {
  const xml = toAtomFeedXml(
    { ...mockMeta, authorName: 'Example User' },
    statusesToFeedItems([baseStatus()], {})
  );
  expect(xml).toContain('<author><name>Example User</name></author>');
  expect(xml).not.toMatch(/<entry>[\s\S]*<author>/);
});

test('toAtomFeedXml omits author block when authorName is empty', () => {
  const xml = toAtomFeedXml(
    { ...mockMeta, authorName: '' },
    statusesToFeedItems([baseStatus()], {})
  );
  expect(xml).not.toContain('<author>');
});

test('toRss20Xml includes channel image when channelImageUrl is set', () => {
  const avatar = 'https://pbs.twimg.com/profile_images/1/normal.jpg';
  const xml = toRss20Xml(
    { ...mockMeta, channelImageUrl: avatar },
    statusesToFeedItems([baseStatus()], {})
  );
  expect(xml).toContain('<image>');
  expect(xml).toContain(`<url>${avatar}</url>`);
  expect(xml).toContain('<title>Test channel</title>');
  expect(xml).toContain('<link>https://fxtwitter.com/example</link>');
  expect(xml).toContain('</image>');
});

test('toRss20Xml omits channel image when channelImageUrl is unset', () => {
  const xml = toRss20Xml(mockMeta, statusesToFeedItems([baseStatus()], {}));
  expect(xml).not.toContain('<image>');
});

test('toAtomFeedXml includes icon when channelImageUrl is set', () => {
  const avatar = 'https://pbs.twimg.com/profile_images/1/normal.jpg';
  const xml = toAtomFeedXml(
    { ...mockMeta, channelImageUrl: avatar },
    statusesToFeedItems([baseStatus()], {})
  );
  expect(xml).toContain(`<icon>${avatar}</icon>`);
});

test('tweet text with angle brackets is escaped inside CDATA-wrapped HTML', () => {
  const s = baseStatus({ text: 'a ]]> b' });
  const xml = toRss20Xml(mockMeta, statusesToFeedItems([s], {}));
  expect(xml).toContain('<![CDATA[');
  expect(xml).toContain(']]&gt;');
  expect(xml).not.toMatch(/\]\]>\s*b/);
});

const baseBlueskyStatus = (over: Partial<APIBlueskyStatus> = {}): APIBlueskyStatus =>
  ({
    id: 'rkeybsky',
    cid: 'bafycidbsky',
    url: 'https://bsky.app/profile/handle.test/post/rkeybsky',
    text: 'Hello from ATProto',
    created_at: '2024-01-01T00:00:00.000Z',
    created_timestamp: 1704067200,
    likes: 0,
    reposts: 0,
    replies: 0,
    author: {
      ...baseStatus().author,
      type: 'profile',
      id: 'handle.test',
      name: 'Handle',
      screen_name: 'handle.test',
      url: 'https://bsky.app/profile/handle.test',
      profile_embed: true
    },
    media: { photos: [], videos: [] },
    raw_text: { text: 'Hello from ATProto', facets: [] },
    lang: 'en',
    possibly_sensitive: false,
    replying_to: null,
    source: 'Bluesky Social',
    embed_card: 'tweet',
    provider: 'bluesky',
    type: 'status',
    ...over
  }) as APIBlueskyStatus;

test('statusesToFeedItems accepts APIBlueskyStatus and emits RSS item link', () => {
  const s = baseBlueskyStatus();
  const items = statusesToFeedItems([s], {});
  expect(items).toHaveLength(1);
  expect(items[0].url).toBe('https://bsky.app/profile/handle.test/post/rkeybsky');
  const xml = toRss20Xml(mockMeta, items);
  expect(xml).toContain(
    '<guid isPermaLink="true">https://bsky.app/profile/handle.test/post/rkeybsky</guid>'
  );
});

test('XML serialization removes forbidden characters without damaging emoji or whitespace', () => {
  expect(escapeXml('a\x00\x08\x1b\ufffe\uffff\ud800b\t\n\r😀')).toBe('ab\t\n\r😀');
});

test('RSS and Atom remain well formed with control characters in post and channel text', () => {
  const items = statusesToFeedItems([baseStatus({ text: 'Hello\x00world 😀' })], {});
  const meta = { ...mockMeta, channelTitle: 'Title\x1b', authorName: 'Author\uffff' };
  for (const xml of [toRss20Xml(meta, items), toAtomFeedXml(meta, items)]) {
    expect(xml).not.toContain('\x00');
    expect(xml).not.toContain('\x1b');
    expect(xml).not.toContain('\uffff');
    expect(xml).toContain('Helloworld 😀');
  }
});

test('RSS and Atom filter forbidden characters directly in CDATA content', () => {
  const items = statusesToFeedItems([baseStatus()], {});
  items[0].htmlContent = '<p>Hello\x00\x08\x1b\ufffe\uffff\ud800world 😀</p>';
  for (const xml of [toRss20Xml(mockMeta, items), toAtomFeedXml(mockMeta, items)]) {
    expect(xml).toContain('<![CDATA[<p>Helloworld 😀</p>]]>');
  }
});
