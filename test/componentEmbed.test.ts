import { beforeAll, describe, expect, test } from 'vitest';
import i18next from 'i18next';
import icu from 'i18next-icu';
import translationResources from '../i18n/resources';
import {
  buildStatusComponentEmbed,
  ComponentEmbedLimits,
  ComponentType,
  escapeMarkdown,
  renderComponentEmbedScript,
  validateComponentEmbed,
  type ComponentEmbedPayload,
  type ContainerChild
} from '../src/embed/components';
import { DataProvider } from '../src/enum';
import type { APIStatus } from '../src/types/apiStatus';

const statusUrl = 'https://x.com/jack/status/20';

const makeStatus = (overrides: Partial<APIStatus> = {}): APIStatus =>
  ({
    id: '20',
    url: statusUrl,
    text: 'just setting up my twttr',
    created_at: 'Tue Mar 21 20:50:14 +0000 2006',
    created_timestamp: 1142974214,
    likes: 1000,
    reposts: 200,
    replies: 30,
    author: {
      id: '12',
      name: 'jack',
      screen_name: 'jack',
      avatar_url: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
      url: 'https://x.com/jack'
    },
    media: {},
    raw_text: { text: 'just setting up my twttr', facets: [] },
    lang: 'en',
    possibly_sensitive: false,
    replying_to: null,
    source: null,
    embed_card: 'tweet',
    provider: DataProvider.Twitter,
    type: 'status',
    ...overrides
  }) as APIStatus;

const photo = (n: number, altText?: string) => ({
  type: 'photo' as const,
  url: `https://pbs.twimg.com/media/photo${n}.jpg`,
  width: 1200,
  height: 800,
  altText
});

const findChild = <T extends ContainerChild['type']>(
  payload: ComponentEmbedPayload | null,
  type: T
): Extract<ContainerChild, { type: T }> | undefined =>
  payload?.component.components.find(child => child.type === type) as
    Extract<ContainerChild, { type: T }> | undefined;

const allText = (payload: ComponentEmbedPayload | null): string =>
  JSON.stringify(payload?.component.components ?? []);

beforeAll(async () => {
  await i18next.use(icu).init({ lng: 'en', resources: translationResources, fallbackLng: 'en' });
});

describe('escapeMarkdown', () => {
  test('escapes inline markdown and mentions', () => {
    expect(escapeMarkdown('**bold** _it_ ~~s~~ `c` ||sp|| [a](b) <@123>')).toBe(
      '\\*\\*bold\\*\\* \\_it\\_ \\~\\~s\\~\\~ \\`c\\` \\|\\|sp\\|\\| \\[a\\](b) \\<@123\\>'
    );
  });

  test('escapes line-start block markers', () => {
    expect(escapeMarkdown('# heading\n- item\n> quote\n1. one')).toBe(
      '\\# heading\n\\- item\n\\> quote\n1\\. one'
    );
  });

  test('escapes multi-character heading and subtext markers', () => {
    expect(escapeMarkdown('## two\n### three\n-# small\n  ## indented')).toBe(
      '\\## two\n\\### three\n\\-# small\n  \\## indented'
    );
  });

  test('leaves URLs intact so they stay clickable', () => {
    expect(escapeMarkdown('see https://example.com/a_b_(c) *now*')).toBe(
      'see https://example.com/a_b_(c) \\*now\\*'
    );
  });
});

describe('buildStatusComponentEmbed', () => {
  test('builds a valid layout with author, text, engagement and a link button', () => {
    const payload = buildStatusComponentEmbed(makeStatus(), {
      statusUrl,
      accentColor: '#6363ff'
    });

    expect(payload).not.toBeNull();
    expect(validateComponentEmbed(payload!)).toEqual([]);
    expect(payload!.component.type).toBe(ComponentType.Container);
    expect(payload!.component.accent_color).toBe(0x6363ff);

    const section = findChild(payload, ComponentType.Section);
    expect(section?.accessory).toEqual({
      type: ComponentType.Thumbnail,
      media: { url: 'https://pbs.twimg.com/profile_images/1/avatar.jpg' }
    });
    expect(section?.components[0].content).toBe(
      '### [jack](https://x.com/jack)\n-# [@jack](https://x.com/jack) · Mar 21, 2006'
    );

    expect(allText(payload)).toContain('just setting up my twttr');
    expect(allText(payload)).toContain('❤️ 1.0K');

    const children = payload!.component.components;
    expect(children.at(-2)).toEqual({ type: ComponentType.Separator, divider: true, spacing: 1 });
    expect(children.at(-1)).toEqual({
      type: ComponentType.Section,
      components: [{ type: ComponentType.TextDisplay, content: '-# 💬 30  ·  🔁 200  ·  ❤️ 1.0K' }],
      accessory: { type: ComponentType.Button, style: 5, url: statusUrl, label: 'View on X' }
    });
  });

  test('puts the link out in its own row when there is no engagement yet', () => {
    const payload = buildStatusComponentEmbed(makeStatus({ likes: 0, reposts: 0, replies: 0 }), {
      statusUrl
    });
    expect(payload!.component.components.at(-1)).toEqual({
      type: ComponentType.ActionRow,
      components: [{ type: ComponentType.Button, style: 5, url: statusUrl, label: 'View on X' }]
    });
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('shows who the post is replying to on its own line', () => {
    const payload = buildStatusComponentEmbed(
      makeStatus({
        replying_to: { screen_name: 'biz', post: '19' }
      } as Partial<APIStatus>),
      { statusUrl }
    );
    expect(findChild(payload, ComponentType.Section)?.components[0].content).toMatch(
      /\n-# ↩ Replying to @biz$/
    );
  });

  test('falls back to a plain header when the author has no avatar', () => {
    const status = makeStatus();
    status.author.avatar_url = null;
    const payload = buildStatusComponentEmbed(status, { statusUrl });
    expect(payload!.component.components[0].type).toBe(ComponentType.TextDisplay);
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('puts photos in a gallery with their alt text', () => {
    const photos = [photo(1, 'a cat'), photo(2)];
    const payload = buildStatusComponentEmbed(
      makeStatus({ media: { photos, all: photos } as APIStatus['media'] }),
      { statusUrl }
    );
    const gallery = findChild(payload, ComponentType.MediaGallery);
    expect(gallery?.items).toEqual([
      { media: { url: 'https://pbs.twimg.com/media/photo1.jpg' }, description: 'a cat' },
      { media: { url: 'https://pbs.twimg.com/media/photo2.jpg' } }
    ]);
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('only shows the requested media when a media number is given', () => {
    const photos = [photo(1), photo(2), photo(3)];
    const payload = buildStatusComponentEmbed(
      makeStatus({ media: { photos, all: photos } as APIStatus['media'] }),
      { statusUrl, mediaNumber: 2 }
    );
    expect(findChild(payload, ComponentType.MediaGallery)?.items).toEqual([
      { media: { url: 'https://pbs.twimg.com/media/photo2.jpg' } }
    ]);
  });

  test('leaves media out for text-only embeds', () => {
    const photos = [photo(1)];
    const payload = buildStatusComponentEmbed(
      makeStatus({ media: { photos, all: photos } as APIStatus['media'] }),
      { statusUrl, textOnly: true }
    );
    expect(findChild(payload, ComponentType.MediaGallery)).toBeUndefined();
  });

  test('uses the transcoded GIF when GIF transcoding is on', () => {
    const gif = {
      type: 'gif' as const,
      url: 'https://video.twimg.com/tweet_video/abc.mp4',
      transcode_url: 'https://gif.fxtwitter.com/tweet_video/abc.gif',
      width: 480,
      height: 270,
      duration: 0,
      formats: []
    };
    const status = makeStatus({ media: { videos: [gif], all: [gif] } as APIStatus['media'] });

    expect(
      findChild(buildStatusComponentEmbed(status, { statusUrl, transcodeGifs: true }), 12)?.items[0]
        .media.url
    ).toBe('https://gif.fxtwitter.com/tweet_video/abc.gif');
    expect(
      findChild(buildStatusComponentEmbed(status, { statusUrl, transcodeGifs: false }), 12)
        ?.items[0].media.url
    ).toBe('https://video.twimg.com/tweet_video/abc.mp4');
  });

  test('caps the gallery at 10 items', () => {
    const photos = Array.from({ length: 12 }, (_, i) => photo(i));
    const payload = buildStatusComponentEmbed(
      makeStatus({ media: { photos, all: photos } as APIStatus['media'] }),
      { statusUrl }
    );
    expect(findChild(payload, ComponentType.MediaGallery)?.items).toHaveLength(10);
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('renders quotes, borrowing their media when the post has none', () => {
    const photos = [photo(9)];
    const quote = makeStatus({
      id: '21',
      url: 'https://x.com/biz/status/21',
      text: 'quoted *text*',
      author: {
        name: 'Biz',
        screen_name: 'biz',
        avatar_url: null,
        url: 'https://x.com/biz'
      } as APIStatus['author'],
      media: { photos, all: photos } as APIStatus['media']
    });
    const payload = buildStatusComponentEmbed(makeStatus({ quote }), { statusUrl });

    expect(allText(payload)).toContain(
      '> **[Quoting Biz (@biz)](https://x.com/biz/status/21)**\\n> quoted \\\\*text\\\\*'
    );
    expect(findChild(payload, ComponentType.MediaGallery)?.items[0].media.url).toBe(
      'https://pbs.twimg.com/media/photo9.jpg'
    );
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('renders translations with the original text quoted below', () => {
    const payload = buildStatusComponentEmbed(
      makeStatus({
        text: 'hola',
        translation: { text: 'hello', source_lang: 'es', target_lang: 'en' }
      } as Partial<APIStatus>),
      { statusUrl }
    );
    const text = allText(payload);
    expect(text).toContain('Translated from Spanish');
    expect(text).toContain('hello');
    expect(text).toContain('> hola');
  });

  test('renders polls', () => {
    const payload = buildStatusComponentEmbed(
      makeStatus({
        poll: {
          choices: [
            { label: 'Yes', count: 3, percentage: 75 },
            { label: 'No', count: 1, percentage: 25 }
          ],
          total_votes: 4,
          ends_at: '',
          time_left_en: 'Final results'
        }
      } as Partial<APIStatus>),
      { statusUrl }
    );
    const text = allText(payload);
    expect(text).toContain('`████████████░░░░` 75%  **Yes**');
    expect(text).toContain('`████░░░░░░░░░░░░` 25%  No');
    expect(text).toContain('4 votes');
  });

  test('keeps very long posts under the text limit', () => {
    const payload = buildStatusComponentEmbed(makeStatus({ text: '*'.repeat(10000) }), {
      statusUrl
    });
    expect(validateComponentEmbed(payload!)).toEqual([]);
  });

  test('skips posts whose only media is a link card', () => {
    expect(
      buildStatusComponentEmbed(
        makeStatus({
          media: { external: { type: 'video', url: 'https://youtube.com/embed/x' } }
        } as Partial<APIStatus>),
        { statusUrl }
      )
    ).toBeNull();
  });

  test('skips broadcasts even when a stream video is in the media list', () => {
    const stream = {
      type: 'video' as const,
      url: 'https://stream-test.fxembed.com/download.mp4?url=x',
      width: 1280,
      height: 720,
      duration: 0,
      formats: []
    };
    expect(
      buildStatusComponentEmbed(
        makeStatus({
          media: {
            broadcast: { url: 'https://x.com/i/broadcasts/1', stream: { url: 'https://a.b/c' } },
            videos: [stream],
            all: [stream]
          }
        } as unknown as Partial<APIStatus>),
        { statusUrl }
      )
    ).toBeNull();
  });

  test('fits every block into the text limit when a post has all of them', () => {
    const long = (label: string) => `${label} *${'_'.repeat(3000)}*`;
    const quote = makeStatus({ id: '21', url: 'https://x.com/biz/status/21', text: long('quote') });
    const payload = buildStatusComponentEmbed(
      makeStatus({
        text: long('original'),
        translation: { text: long('translated'), source_lang: 'es', target_lang: 'en' },
        quote,
        poll: {
          choices: Array.from({ length: 4 }, (_, i) => ({
            label: `*_${i}_*`.repeat(6),
            count: 1,
            percentage: 25
          })),
          total_votes: 4,
          ends_at: '',
          time_left_en: 'Final results'
        },
        article: {
          title: long('title'),
          preview_text: long('preview'),
          cover_media: {}
        },
        community_note: { text: long('note'), facets: [] }
      } as unknown as Partial<APIStatus>),
      { statusUrl }
    );
    expect(validateComponentEmbed(payload!)).toEqual([]);
    expect(allText(payload)).toContain('translated');
  });

  test('uses the platform name for the button', () => {
    const payload = buildStatusComponentEmbed(makeStatus({ provider: DataProvider.Bluesky }), {
      statusUrl: 'https://bsky.app/profile/jack/post/20'
    });
    const footer = payload!.component.components.at(-1) as { accessory?: { label?: string } };
    expect(footer.accessory?.label).toBe('View on Bluesky');
  });
});

describe('validateComponentEmbed', () => {
  const wrap = (...components: unknown[]) =>
    ({ component: { type: ComponentType.Container, components } }) as ComponentEmbedPayload;
  const text = { type: ComponentType.TextDisplay, content: 'hi' };

  test('accepts a minimal container', () => {
    expect(validateComponentEmbed(wrap(text))).toEqual([]);
  });

  test('rejects a top level that is not a container', () => {
    expect(
      validateComponentEmbed({ component: text } as unknown as ComponentEmbedPayload)
    ).not.toEqual([]);
  });

  test('rejects component types that link previews do not support', () => {
    expect(validateComponentEmbed(wrap({ type: 13, file: { url: 'https://a.b/c' } }))).not.toEqual(
      []
    );
  });

  test('rejects non-link buttons and extra button keys', () => {
    const row = (button: object) => ({ type: ComponentType.ActionRow, components: [button] });
    expect(
      validateComponentEmbed(wrap(row({ type: 2, style: 1, label: 'x', url: 'https://a.b' })))
    ).not.toEqual([]);
    expect(
      validateComponentEmbed(
        wrap(row({ type: 2, style: 5, label: 'x', url: 'https://a.b', custom_id: 'y' }))
      )
    ).not.toEqual([]);
    expect(
      validateComponentEmbed(wrap(row({ type: 2, style: 5, url: 'https://a.b' })))
    ).not.toEqual([]);
  });

  test('rejects more than 40 components', () => {
    const texts = Array.from({ length: ComponentEmbedLimits.MAX_COMPONENTS }, () => text);
    expect(validateComponentEmbed(wrap(...texts))).not.toEqual([]);
  });

  test('rejects more than 4000 characters of text', () => {
    expect(
      validateComponentEmbed(wrap({ type: ComponentType.TextDisplay, content: 'a'.repeat(4001) }))
    ).not.toEqual([]);
  });

  test('rejects non-http media URLs', () => {
    expect(
      validateComponentEmbed(
        wrap({ type: ComponentType.MediaGallery, items: [{ media: { url: 'ftp://a.b/c.png' } }] })
      )
    ).not.toEqual([]);
  });
});

describe('renderComponentEmbedScript', () => {
  test('emits a JSON script that cannot close itself early', () => {
    const payload = {
      component: {
        type: ComponentType.Container,
        components: [{ type: ComponentType.TextDisplay, content: '</script><b>&\u2028' }]
      }
    } as ComponentEmbedPayload;
    const html = renderComponentEmbedScript(payload);

    expect(html.startsWith('<script id="discord:component-embed" type="application/json">')).toBe(
      true
    );
    const body = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
    expect(body).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(body)).toEqual(payload);
  });
});
