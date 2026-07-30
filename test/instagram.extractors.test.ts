import { describe, expect, it } from 'vitest';
import {
  extractCommentsConnection,
  extractLsdFromEqmc,
  extractPolarisMediaBundle,
  extractPolarisProductFromGraphqlJson,
  extractPostMediaItem,
  extractShortcodeWebInfo,
  hasUsefulRelayData,
  parseDashBandwidthByHeight,
  parseDashPresentationDurationSec
} from '@fxembed/atmosphere/providers/instagram/extractors';

const MINIMAL_POST_HTML = `<!DOCTYPE html><html><body>
<script type="application/json" data-sjs>{"xdt_api__v1__media__shortcode__web_info":{"items":[{"code":"DXeh-kYiIge","pk":"3881689364048676894","taken_at":1776953871,"caption":{"text":"Hello #world"},"user":{"pk":"173560420","username":"cristiano","full_name":"CR7","profile_pic_url":"https://cdn.example/p.jpg"},"image_versions2":{"candidates":[{"url":"https://cdn.example/i.jpg","width":640,"height":1136}]}}]},"xdt_api__v1__media__media_id__comments__connection":{"edges":[{"node":{"pk":"17915753442361302","text":"Nice","created_at":1776954000,"user":{"pk":"1","username":"fan","profile_pic_url":null}}}],"page_info":{"has_next_page":false,"end_cursor":null}}}</script>
</body></html>`;

const POLARIS_POST_HTML = `<!DOCTYPE html><html><body>
<script id="__eqmc" type="application/json">{"u":"/ajax/qm/","e":"1","s":"/","w":0,"f":null,"l":"AdTestLsdToken123"}</script>
<script type="application/json" data-sjs>{"require":[{"__bbox":{"result":{"data":{"xig_polaris_media":{"__typename":"XIGPolarisMedia","pk":"2913440072144448240","code":"Chunk8-jurw","if_not_gated_logged_out":{"__typename":"XIGPolarisVideoMedia","pk":"2913440072144448240","code":"Chunk8-jurw","media_type":2,"product_type":"clips","taken_at":1661529231,"like_count":10,"comment_count":3,"original_width":720,"original_height":1280,"caption":{"text":"Gingerton"},"user":{"pk":"25025320","username":"instagram","full_name":"Instagram","profile_pic_url":"https://cdn.example/u.jpg","is_verified":true},"display_uri":"https://cdn.example/thumb.jpg","video_versions":[{"url":"https://cdn.example/v.mp4","type":101,"width":720,"height":1280}],"video_dash_manifest":"<MPD mediaPresentationDuration='PT0H0M4.967S'></MPD>"},"comments_connection":{"edges":[{"node":{"pk":"1","text":"hi","created_at":1,"user":{"pk":"2","username":"fan"}}}],"page_info":{"has_next_page":false,"end_cursor":null}}}}}}}]}</script>
</body></html>`;

describe('instagram extractors', () => {
  it('detects relay data in HTML', () => {
    expect(hasUsefulRelayData(MINIMAL_POST_HTML)).toBe(true);
    expect(hasUsefulRelayData(POLARIS_POST_HTML)).toBe(true);
  });

  it('extracts shortcode web info item (legacy)', () => {
    const item = extractShortcodeWebInfo(MINIMAL_POST_HTML);
    expect(item).toBeTruthy();
    expect(item?.code).toBe('DXeh-kYiIge');
    expect(String(item?.pk)).toBe('3881689364048676894');
  });

  it('extracts polaris product media (yt-dlp path)', () => {
    const bundle = extractPolarisMediaBundle(POLARIS_POST_HTML);
    expect(bundle).toBeTruthy();
    expect(bundle!.product.code).toBe('Chunk8-jurw');
    expect(bundle!.product.media_type).toBe(2);
    expect(Array.isArray(bundle!.product.video_versions)).toBe(true);
    expect(bundle!.comments?.edges?.length).toBe(1);
  });

  it('prefers polaris over legacy web_info via extractPostMediaItem', () => {
    const item = extractPostMediaItem(POLARIS_POST_HTML);
    expect(item?.code).toBe('Chunk8-jurw');
    expect(item?.media_type).toBe(2);
  });

  it('extracts LSD from __eqmc', () => {
    expect(extractLsdFromEqmc(POLARIS_POST_HTML)).toBe('AdTestLsdToken123');
  });

  it('parses DASH presentation duration', () => {
    expect(
      parseDashPresentationDurationSec('<MPD mediaPresentationDuration="PT0H0M4.967S"></MPD>')
    ).toBeCloseTo(4.967, 3);
    expect(
      parseDashPresentationDurationSec('<MPD mediaPresentationDuration="PT5.016S"></MPD>')
    ).toBeCloseTo(5.016, 3);
  });

  it('parses DASH representation bandwidth by height', () => {
    const map = parseDashBandwidthByHeight(
      '<MPD><Representation id="1" bandwidth="5000000" width="720" height="1280"/>' +
        '<Representation height="640" width="360" bandwidth="400000"/></MPD>'
    );
    expect(map.get(1280)).toBe(5_000_000);
    expect(map.get(640)).toBe(400_000);
  });

  it('extracts polaris product from GraphQL JSON', () => {
    const bundle = extractPolarisProductFromGraphqlJson({
      data: {
        xig_polaris_media: {
          pk: '1',
          code: 'Abc',
          if_not_gated_logged_out: {
            pk: '1',
            code: 'Abc',
            media_type: 2,
            video_versions: [{ url: 'https://cdn.example/v.mp4' }]
          },
          comments_connection: { edges: [], page_info: {} }
        }
      }
    });
    expect(bundle?.product.code).toBe('Abc');
    expect(bundle?.comments?.edges).toEqual([]);
  });

  it('extracts comments connection (legacy + polaris)', () => {
    const legacy = extractCommentsConnection(MINIMAL_POST_HTML);
    expect(legacy?.edges?.length).toBe(1);
    const node = (legacy!.edges![0] as { node: Record<string, unknown> }).node;
    expect(node.text).toBe('Nice');

    const polaris = extractCommentsConnection(POLARIS_POST_HTML);
    expect(polaris?.edges?.length).toBe(1);
  });
});
