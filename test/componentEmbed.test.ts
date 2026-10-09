import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { Context } from 'hono';
import i18next from 'i18next';
import icu from 'i18next-icu';
import { app } from '../src/worker';
import harness from './helpers/harness';
import translationResources from '../i18n/resources';
import {
  buildComponentEmbed,
  ComponentType,
  getShouldUseComponentEmbed,
  keepsClassicPlayerEmbed,
  renderComponentEmbed,
  type ComponentEmbedPayload
} from '../src/embed/components';
import {
  escapeMarkdown,
  formatTextMarkdown,
  formatTextMarkdownWithin
} from '../src/helpers/markdown';
import { renderArticleToMarkdown } from '../src/helpers/article';
import { DataProvider } from '../src/enum';
import type { APIStatus } from '../src/types/apiStatus';

/* Rollout stays at 0%. These tests cover the feature once the experiment is enabled. */
vi.mock('../src/experiments', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/experiments')>();
  return {
    ...actual,
    experimentCheck: (experiment: import('../src/experiments').Experiment, condition = true) =>
      experiment === actual.Experiment.COMPONENT_EMBED
        ? condition
        : actual.experimentCheck(experiment, condition)
  };
});

const discordHeaders = {
  'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
};

const COMPONENT_EMBED_REGEX =
  /<script id="discord:component-embed" type="application\/json">(.*?)<\/script>/s;

type AnyComponent = { type: number; [key: string]: unknown };

const flatten = (components: AnyComponent[]): AnyComponent[] =>
  components.flatMap(component => [
    component,
    ...flatten((component.components as AnyComponent[] | undefined) ?? []),
    ...(component.accessory ? [component.accessory as AnyComponent] : [])
  ]);

const allComponents = (payload: ComponentEmbedPayload): AnyComponent[] =>
  flatten(payload.component.components as unknown as AnyComponent[]);

const textContent = (payload: ComponentEmbedPayload): string[] =>
  allComponents(payload)
    .filter(component => component.type === ComponentType.TextDisplay)
    .map(component => component.content as string);

const galleries = (payload: ComponentEmbedPayload) =>
  allComponents(payload).filter(component => component.type === ComponentType.MediaGallery) as {
    type: number;
    items: { media: { url: string }; description?: string }[];
  }[];

const fetchEmbed = async (url: string, headers: Record<string, string> = discordHeaders) => {
  const result = await app.request(new Request(url, { headers }), undefined, harness);
  const html = await result.text();
  const match = html.match(COMPONENT_EMBED_REGEX);
  return {
    status: result.status,
    html,
    payload: match ? (JSON.parse(match[1]) as ComponentEmbedPayload) : null
  };
};

const context = (url = 'https://fxtwitter.com/x/status/1') =>
  ({
    req: {
      url,
      header: (name: string) => (name.toLowerCase() === 'user-agent' ? 'Discordbot/2.0' : undefined)
    }
  }) as unknown as Context;

const makeStatus = (overrides: Record<string, unknown> = {}): APIStatus =>
  ({
    type: 'status',
    id: '1',
    url: 'https://x.com/someone/status/1',
    text: 'hello world',
    created_at: '2024-01-01T12:00:00.000Z',
    created_timestamp: 1704110400,
    likes: 10,
    reposts: 2,
    replies: 1,
    author: {
      id: '42',
      name: 'Some One',
      screen_name: 'some_one',
      url: 'https://x.com/some_one',
      avatar_url: 'https://pbs.twimg.com/profile_images/1/avatar_200x200.jpg'
    },
    media: {},
    raw_text: { text: 'hello world', facets: [] },
    lang: 'en',
    possibly_sensitive: false,
    replying_to: null,
    source: null,
    embed_card: 'tweet',
    provider: DataProvider.Twitter,
    ...overrides
  }) as unknown as APIStatus;

const photo = (n: number, altText?: string) => ({
  type: 'photo',
  url: `https://pbs.twimg.com/media/photo${n}.jpg?name=orig`,
  width: 1200,
  height: 800,
  ...(altText ? { altText } : {})
});

const build = (status: APIStatus, flags = {}, mediaNumber?: number) =>
  buildComponentEmbed({
    context: context(),
    status,
    publicUrl: status.url,
    flags,
    mediaNumber
  });

const block = (
  key: string,
  type: string,
  text: string,
  extra: Partial<{
    inlineStyleRanges: { offset: number; length: number; style: string }[];
    entityRanges: { key: number; offset: number; length: number }[];
    data: Record<string, unknown>;
  }> = {}
) => ({
  key,
  type,
  text,
  data: extra.data ?? {},
  entityRanges: extra.entityRanges ?? [],
  inlineStyleRanges: extra.inlineStyleRanges ?? []
});

const articleMedia = (id: string) => ({
  id,
  media_key: `3_${id}`,
  media_id: id,
  media_info: {
    __typename: 'ApiImage',
    original_img_width: 1600,
    original_img_height: 900,
    original_img_url: `https://pbs.twimg.com/media/${id}.jpg`,
    color_info: { palette: [] }
  }
});

beforeAll(async () => {
  await i18next.use(icu).init({ lng: 'en', resources: translationResources, fallbackLng: 'en' });
});

describe('markdown helpers', () => {
  test('escapes Discord markdown in user text', () => {
    expect(escapeMarkdown('*bold* _it_ ~~s~~ `c` ||sp|| [a](b) <t:1>')).toEqual(
      '\\*bold\\* \\_it\\_ \\~\\~s\\~\\~ \\`c\\` \\|\\|sp\\|\\| \\[a\\](b) \\<t:1\\>'
    );
    expect(escapeMarkdown('# not a heading\n-# not subtext\nmid # fine')).toEqual(
      '\\# not a heading\n\\-# not subtext\nmid # fine'
    );
  });

  test('links mentions and hashtags, leaves URLs bare', () => {
    expect(
      formatTextMarkdown(
        'hi @some_user, see https://example.com/a_b_(c). #tag_1 not@email',
        DataProvider.Twitter
      )
    ).toEqual(
      'hi [@some\\_user](https://x.com/some_user), see https://example.com/a_b_(c). ' +
        '[#tag\\_1](https://x.com/hashtag/tag_1) not@email'
    );
    expect(formatTextMarkdown('@alice.bsky.social.', DataProvider.Bluesky)).toEqual(
      '[@alice.bsky.social](https://bsky.app/profile/alice.bsky.social).'
    );
  });

  test('keeps links when they fit', () => {
    expect(formatTextMarkdownWithin('hi @jack', DataProvider.Twitter, 100)).toEqual({
      markdown: 'hi [@jack](https://x.com/jack)',
      truncated: false
    });
  });

  test('drops mention and hashtag links before cutting any text', () => {
    const text = Array.from({ length: 40 }, (_, i) => `@user${i} #tag${i}`).join(' ');
    const { markdown, truncated } = formatTextMarkdownWithin(text, DataProvider.Twitter, 1000);
    expect(truncated).toBe(false);
    expect(markdown).toEqual(text);
  });

  test('truncation never exceeds the limit', () => {
    const text = Array.from({ length: 200 }, (_, i) => `@user_${i} #tag_${i}`).join(' ');
    const { markdown, truncated } = formatTextMarkdownWithin(text, DataProvider.Twitter, 1000);
    expect(truncated).toBe(true);
    expect(markdown.length).toBeLessThanOrEqual(1000);
    expect(markdown.endsWith('…')).toBe(true);
  });
});

describe('article markdown', () => {
  test('renders headings, styles, links, lists, quotes, and code', () => {
    const { markdown, collectedMedia, wasTruncated } = renderArticleToMarkdown(
      {
        blocks: [
          block('a', 'header-one', 'Big heading'),
          block('b', 'unstyled', 'Some bold and a link here', {
            inlineStyleRanges: [{ offset: 5, length: 5, style: 'Bold' }],
            data: { urls: [{ fromIndex: 16, toIndex: 20, text: 'https://example.com' }] }
          }),
          block('c', 'unordered-list-item', 'first'),
          block('d', 'unordered-list-item', 'second'),
          block('e', 'ordered-list-item', 'one'),
          block('f', 'ordered-list-item', 'two'),
          block('g', 'blockquote', 'quoted *text*'),
          block('h', 'atomic', ' ', { entityRanges: [{ key: 0, offset: 0, length: 1 }] }),
          block('i', 'atomic', ' ', { entityRanges: [{ key: 1, offset: 0, length: 1 }] })
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'MEDIA',
              mutability: 'Immutable',
              data: {
                entityKey: '0',
                mediaItems: [{ localMediaId: '0', mediaCategory: 'image', mediaId: 'm1' }]
              }
            }
          },
          {
            key: '1',
            value: {
              type: 'MARKDOWN',
              mutability: 'Mutable',
              data: { entityKey: '1', markdown: '```ts\nconst a = 1;\n```' }
            }
          }
        ]
      } as unknown as TwitterArticleContentState,
      { maxLength: 4000, mediaEntities: [articleMedia('m1')] as unknown as TwitterApiMedia[] }
    );

    expect(markdown).toEqual(
      [
        '## Big heading',
        'Some **bold** and a [link](https://example.com) here',
        '- first\n- second\n1. one\n2. two',
        '> quoted \\*text\\*',
        '```ts\nconst a = 1;\n```'
      ].join('\n\n')
    );
    expect(collectedMedia.map(media => media.media_id)).toEqual(['m1']);
    expect(wasTruncated).toBe(false);
  });

  test('moves whitespace outside of style markers', () => {
    const { markdown } = renderArticleToMarkdown(
      {
        blocks: [
          block('a', 'unstyled', 'a bold  words b', {
            inlineStyleRanges: [
              { offset: 1, length: 6, style: 'Bold' },
              { offset: 7, length: 7, style: 'Italic' }
            ]
          })
        ],
        entityMap: []
      } as unknown as TwitterArticleContentState,
      { maxLength: 4000, mediaEntities: [] }
    );
    expect(markdown).toEqual('a **bold**  *words* b');
  });

  test('truncates long articles within the limit', () => {
    const blocks = Array.from({ length: 50 }, (_, i) =>
      block(`b${i}`, 'unstyled', `Paragraph ${i} `.repeat(30))
    );
    const { markdown, wasTruncated } = renderArticleToMarkdown(
      { blocks, entityMap: [] } as unknown as TwitterArticleContentState,
      { maxLength: 2000, mediaEntities: [] }
    );
    expect(wasTruncated).toBe(true);
    expect(markdown.length).toBeLessThanOrEqual(2000);
    expect(markdown.endsWith('…')).toBe(true);
  });

  test('drops mention links from articles that would otherwise be truncated', () => {
    const mentions = (text: string) => ({
      mentions: [...text.matchAll(/@(\w+)/g)].map(match => ({
        fromIndex: match.index,
        toIndex: match.index! + match[0].length,
        text: match[1]
      }))
    });
    const text = Array.from({ length: 40 }, (_, i) => `@user${i}`).join(' ');
    const render = (maxLength: number) =>
      renderArticleToMarkdown(
        {
          blocks: [block('a', 'unstyled', text, { data: mentions(text) })],
          entityMap: []
        } as unknown as TwitterArticleContentState,
        { maxLength, mediaEntities: [] }
      );
    expect(render(4000).markdown).toContain('[@user0](https://x.com/user0)');
    expect(render(500)).toMatchObject({ markdown: text, wasTruncated: false });
  });
});

describe('component embed builder', () => {
  test('basic layout: author, text, media, footer with link button', () => {
    const payload = build(
      makeStatus({ media: { all: [photo(1, 'alt one'), photo(2)], photos: [photo(1), photo(2)] } })
    );
    const [header, body, mediaGallery, separator, footer] = payload.component
      .components as unknown as AnyComponent[];

    expect(payload.component.type).toEqual(ComponentType.Container);
    expect(header).toEqual({
      type: ComponentType.TextDisplay,
      content: '### [Some One](https://x.com/some_one)\n\n-# @some\\_one'
    });
    expect(body).toEqual({ type: ComponentType.TextDisplay, content: 'hello world' });
    expect(mediaGallery).toEqual({
      type: ComponentType.MediaGallery,
      items: [
        { media: { url: photo(1).url }, description: 'alt one' },
        { media: { url: photo(2).url } }
      ]
    });
    expect(separator.type).toEqual(ComponentType.Separator);
    expect(footer.accessory).toEqual({
      type: ComponentType.Button,
      style: 5,
      url: 'https://x.com/someone/status/1',
      label: 'View on X'
    });
    expect((footer.components as AnyComponent[]).map(component => component.content)).toEqual([
      '-# <:Replies:1554338278545825812> 1    <:Reposts:1554354865013260411> 2    <:Likes:1554338262116737044> 10',
      '-# <:FxTwitter:1554261513970385007> **FxTwitter** · <t:1704110400:f>'
    ]);
  });

  test('button says Twitter or X depending on the domain', () => {
    const label = (flags: object) =>
      (
        (build(makeStatus(), flags).component.components.at(-1) as unknown as AnyComponent)
          .accessory as AnyComponent
      ).label;
    expect(label({ isXDomain: false })).toEqual('View on Twitter');
    expect(label({ isXDomain: true })).toEqual('View on X');
  });

  test('keeps total text within Discord limits for very long posts', () => {
    const longText = 'word '.repeat(3000);
    const status = makeStatus({ text: longText });
    const payload = build(status);
    const total = textContent(payload).reduce((sum, content) => sum + content.length, 0);
    expect(total).toBeLessThanOrEqual(2100);
    expect(textContent(payload).some(content => content.endsWith('…'))).toBe(true);
  });

  test('author avatar is the header accessory when the post has no media', () => {
    const header = build(makeStatus()).component.components[0] as unknown as AnyComponent;
    expect(header.type).toEqual(ComponentType.Section);
    expect(header.accessory).toEqual({
      type: ComponentType.Thumbnail,
      media: { url: 'https://pbs.twimg.com/profile_images/1/avatar_200x200.jpg' }
    });
    expect((header.components as AnyComponent[])[0].content).toEqual(
      '### [Some One](https://x.com/some_one)\n\n-# @some\\_one'
    );
  });

  test('text-only flag drops media and shows the avatar instead', () => {
    const payload = build(makeStatus({ media: { all: [photo(1)] } }), { textOnly: true });
    expect(galleries(payload)).toHaveLength(0);
    expect((payload.component.components[0] as unknown as AnyComponent).type).toEqual(
      ComponentType.Section
    );
  });

  test('media number selects a single item', () => {
    const payload = build(makeStatus({ media: { all: [photo(1), photo(2), photo(3)] } }), {}, 2);
    expect(galleries(payload)[0].items).toEqual([{ media: { url: photo(2).url } }]);
  });

  test('force mosaic uses the mosaic image', () => {
    const payload = build(
      makeStatus({
        media: {
          all: [photo(1), photo(2)],
          mosaic: {
            type: 'mosaic_photo',
            formats: { jpeg: 'https://mosaic.example/1.jpg', webp: 'https://mosaic.example/1.webp' }
          }
        }
      }),
      { forceMosaic: true }
    );
    expect(galleries(payload)[0].items).toEqual([
      { media: { url: 'https://mosaic.example/1.jpg' } }
    ]);
  });

  test('caps galleries at 10 items', () => {
    const all = Array.from({ length: 12 }, (_, i) => photo(i));
    expect(galleries(build(makeStatus({ media: { all } })))[0].items).toHaveLength(10);
  });

  test('shows translation with the original quoted below', () => {
    const payload = build(
      makeStatus({
        text: 'hola mundo',
        translation: { text: 'hello world', source_lang: 'es', target_lang: 'en' }
      })
    );
    expect(textContent(payload)[1]).toEqual(
      '-# 📑 Translated from Spanish\nhello world\n\n> **Original text**\n> hola mundo'
    );
  });

  test('reply and quote with media fallback', () => {
    const payload = build(
      makeStatus({
        replying_to: {
          screen_name: 'other',
          status: '0',
          url: 'https://x.com/other/status/0'
        },
        quote: makeStatus({
          id: '2',
          url: 'https://x.com/quoted/status/2',
          text: 'quoted text',
          author: { name: 'Quoted', screen_name: 'quoted', url: '', avatar_url: null },
          media: { all: [photo(9)] }
        })
      })
    );
    const texts = textContent(payload);
    expect(texts[0]).toContain('-# ↩ [Replying to @other](https://x.com/other/status/0)');
    expect(texts).toContain(
      '> **[Quoting Quoted (@quoted)](https://x.com/quoted/status/2)**\n> quoted text'
    );
    expect(galleries(payload)[0].items).toEqual([{ media: { url: photo(9).url } }]);
  });

  test('articles get a title, cover image, and markdown body', () => {
    const cover = articleMedia('cover');
    const payload = build(
      makeStatus({
        text: 'https://x.com/i/article/123',
        article: {
          id: '123',
          created_at: '2024-01-01T00:00:00.000Z',
          title: 'My *Article*',
          preview_text: 'preview',
          cover_media: cover,
          media_entities: [cover, articleMedia('inline')],
          content: {
            blocks: [
              block('a', 'unstyled', 'Intro paragraph'),
              block('b', 'atomic', ' ', { entityRanges: [{ key: 0, offset: 0, length: 1 }] })
            ],
            entityMap: [
              {
                key: '0',
                value: {
                  type: 'MEDIA',
                  mutability: 'Immutable',
                  data: {
                    entityKey: '0',
                    mediaItems: [{ localMediaId: '0', mediaCategory: 'image', mediaId: 'inline' }]
                  }
                }
              }
            ]
          }
        }
      })
    );
    const components = payload.component.components as unknown as AnyComponent[];
    expect(components[0].type).toEqual(ComponentType.TextDisplay);
    expect(components[1]).toEqual({
      type: ComponentType.TextDisplay,
      content: '## My \\*Article\\*'
    });
    expect(components[2]).toEqual({
      type: ComponentType.MediaGallery,
      items: [{ media: { url: 'https://pbs.twimg.com/media/cover.jpg' } }]
    });
    expect(components[3]).toEqual({ type: ComponentType.TextDisplay, content: 'Intro paragraph' });
    expect(components[4]).toEqual({
      type: ComponentType.MediaGallery,
      items: [{ media: { url: 'https://pbs.twimg.com/media/inline.jpg' } }]
    });
  });

  test('script tag cannot be closed by post content', () => {
    const tag = renderComponentEmbed(build(makeStatus({ text: '</script><script>alert(1)' })));
    const inner = tag.match(COMPONENT_EMBED_REGEX)?.[1] ?? '';
    expect(inner).not.toContain('<');
    expect(inner).not.toContain('>');
    expect(textContent(JSON.parse(inner))[1]).toEqual('\\</script\\>\\<script\\>alert(1)');
  });
});

describe('component embed eligibility', () => {
  test('only Discord gets component embeds, and embed-shaping flags opt out', () => {
    expect(getShouldUseComponentEmbed(discordHeaders['User-Agent'], {})).toEqual(true);
    expect(getShouldUseComponentEmbed('TelegramBot (like TwitterBot)', {})).toEqual(false);
    for (const flag of ['direct', 'gallery', 'api', 'noActivity', 'archive']) {
      expect(getShouldUseComponentEmbed(discordHeaders['User-Agent'], { [flag]: true })).toEqual(
        false
      );
    }
  });

  test('external-player-only posts keep the player embed', () => {
    const status = makeStatus({
      media: { external: { type: 'video', url: 'https://www.youtube.com/embed/x' } }
    });
    expect(keepsClassicPlayerEmbed(status)).toBe(true);
    expect(
      keepsClassicPlayerEmbed(makeStatus({ media: { all: [photo(1)], photos: [photo(1)] } }))
    ).toBe(false);
  });
});

describe('component embed responses', () => {
  test('Discord gets a component embed alongside the Open Graph fallback', async () => {
    const { status, html, payload } = await fetchEmbed('https://fxtwitter.com/jack/status/20');
    expect(status).toEqual(200);
    expect(payload?.component.type).toEqual(ComponentType.Container);
    expect(textContent(payload!)).toContain('just setting up my twttr');
    expect(JSON.stringify(payload)).toContain('"label":"View on Twitter"');

    const fixupx = await fetchEmbed('https://fixupx.com/jack/status/20');
    expect(JSON.stringify(fixupx.payload)).toContain('"label":"View on X"');
    expect(html).toMatch(/<meta property="og:title"/);
    expect(html).toMatch(/<meta property="og:description"/);
    expect(html).not.toMatch(/application\/activity\+json/);
  });

  test('media posts include a media gallery', async () => {
    const { payload } = await fetchEmbed('https://fxtwitter.com/x/status/1841206275088290279');
    expect(galleries(payload!)).toHaveLength(1);
  });

  test('polls are rendered', async () => {
    const { payload } = await fetchEmbed('https://fxtwitter.com/x/status/1899954694652309701');
    expect(textContent(payload!).some(content => content.includes('**Origin 600i** · 40.9%'))).toBe(
      true
    );
  });

  test('text-only domain has no media gallery', async () => {
    const { payload } = await fetchEmbed('https://t.fxtwitter.com/x/status/1841206275088290279');
    expect(payload).not.toBeNull();
    expect(galleries(payload!)).toHaveLength(0);
  });

  test('old embed and gallery domains keep their classic embeds', async () => {
    const old = await fetchEmbed('https://o.fxtwitter.com/jack/status/20');
    expect(old.status).toEqual(200);
    expect(old.payload).toBeNull();

    const gallery = await fetchEmbed('https://g.fxtwitter.com/x/status/1841206275088290279');
    expect(gallery.status).toEqual(200);
    expect(gallery.payload).toBeNull();
  });

  test('non-Discord clients do not get a component embed', async () => {
    const { payload } = await fetchEmbed('https://fxtwitter.com/jack/status/20', {
      'User-Agent': 'TelegramBot (like TwitterBot)'
    });
    expect(payload).toBeNull();
  });
});
