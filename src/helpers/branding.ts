import { Context } from 'hono';
import branding from '../../branding.json';

type Branding = {
  name: string;
  domains: string[];
  provider: string;
  favicon: string;
  redirect: string;
  default?: boolean;
  color?: string;
  activityIcons?: {
    [key: string]: string;
  };
};

export const getBranding = (c: Context | Request): Branding => {
  const zones = branding.zones as unknown as Branding[] & {
    activityIcons: { [key: string]: string } | { [key: string]: string }[];
  };
  const defaultBranding = zones.find(zone => zone.default) ?? zones[0];
  try {
    const url = new URL(c instanceof Request ? c.url : c.req.url);
    // get domain name, without subdomains
    const domain = url.hostname.split('.').slice(-2).join('.');
    const zone = zones.find(zone => zone.domains.includes(domain)) ?? defaultBranding;

    const result: Branding = { ...zone };

    let activityIcons = result.activityIcons;
    if (Array.isArray(activityIcons)) {
      result.activityIcons = activityIcons[Math.floor(Math.random() * activityIcons.length)];
    }

    if (url.searchParams.get('brandingName')) {
      result.name = url.searchParams.get('brandingName') ?? result.name;
    }
    if (url.searchParams.get('brandingIcon')) {
      activityIcons = {
        default: decodeURIComponent(
          url.searchParams.get('brandingIcon') ?? activityIcons?.default ?? ''
        )
      };
    }
    if (url.searchParams.get('brandingRedirectUrl')) {
      result.redirect = decodeURIComponent(
        url.searchParams.get('brandingRedirectUrl') ?? result.redirect
      );
    }
    return result;
  } catch (_e) {
    return defaultBranding;
  }
};
