import { Context } from 'hono';
import { Constants } from '../../../constants';
import { Strings } from '../../../strings';
import { getBranding } from '../../../helpers/branding';
import { OEmbed } from '../../../types/types';

export const oembed = async (c: Context) => {
  console.log('oembed hit!');
  const { searchParams } = new URL(c.req.url);

  /* Fallbacks */
  const text = searchParams.get('text') ?? '';
  const author = searchParams.get('author') ?? '';
  const status = searchParams.get('status') ?? '';

  const statusUrl = `${Constants.TIKTOK_ROOT}/@${encodeURIComponent(author)}/video/${status}`;
  const branding = getBranding(c);

  const data: OEmbed = {
    author_name: text,
    author_url: statusUrl,
    provider_name: branding.name,
    provider_url: searchParams.get('provider') ? statusUrl : branding.redirect,
    title: Strings.DEFAULT_AUTHOR_TEXT,
    type: 'rich',
    version: '1.0'
  };

  /* Stringify and send it on its way! */
  return c.json(data, 200);
};
