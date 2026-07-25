import type { SocialThreadInstagram } from '../../types/api-schemas.js';
import { fetchInstagramPageWithWebInfo } from './fetch-shortcode-page.js';
import { instagramNodeToStatus } from './processor.js';

export async function constructInstagramPost(
  shortcode: string,
  userAgent: string | undefined
): Promise<SocialThreadInstagram> {
  const page = await fetchInstagramPageWithWebInfo(shortcode, userAgent);
  if (!page.ok) {
    return { code: page.status === 404 ? 404 : 500, status: null, thread: null, author: null };
  }
  const item = page.item;
  const owner =
    (item.user as Record<string, unknown> | undefined) ??
    (item.owner as Record<string, unknown> | undefined);
  const fb = {
    id: String(owner?.pk ?? owner?.id ?? ''),
    username: String(owner?.username ?? ''),
    fullName: typeof owner?.full_name === 'string' ? owner.full_name : undefined,
    pic:
      (typeof owner?.profile_pic_url === 'string' && owner.profile_pic_url) ||
      (typeof owner?.profile_image_uri === 'string' && owner.profile_image_uri) ||
      null
  };
  const status = instagramNodeToStatus(item, fb);
  if (!status) {
    return { code: 404, status: null, thread: null, author: null };
  }
  return {
    code: 200,
    status,
    thread: [status],
    author: status.author
  };
}
