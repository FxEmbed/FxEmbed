import { Context } from 'hono';
import branding from '../../branding.json';
import { experimentCheck, Experiment } from '../experiments';

type ActivityIcon = {
  default: string;
  [key: string]: string;
};

export type Branding = {
  name: string;
  domains: string[];
  provider: string;
  favicon: string;
  redirect: string;
  default?: boolean;
  color?: string;
  /** Discord custom emoji ID shown with the branding name in component embeds */
  emojiId?: string;
  activityIcons?: ActivityIcon | ActivityIcon[];
};

export const getBranding = (c: Context | Request): Branding => {
  const zones = branding.zones as Branding[];
  const defaultBranding = zones.find(zone => zone.default) ?? zones[0];
  try {
    const url = new URL(c instanceof Request ? c.url : c.req.url);
    // get domain name, without subdomains
    const domain = url.hostname.split('.').slice(-2).join('.');
    const branding = zones.find(zone => zone.domains.includes(domain)) ?? defaultBranding;
    const fallbackIcon =
      (branding.activityIcons as ActivityIcon)?.default ??
      (branding.activityIcons as ActivityIcon[])?.[0]?.default ??
      '';

    if (experimentCheck(Experiment.ENABLE_CUSTOM_BRANDING)) {
      if (url.searchParams.get('brandingName')) {
        branding.name = url.searchParams.get('brandingName') ?? branding.name;
      }
      if (url.searchParams.get('brandingIcon')) {
        branding.activityIcons = {
          default: decodeURIComponent(url.searchParams.get('brandingIcon') ?? fallbackIcon)
        };
      }
      if (url.searchParams.get('brandingRedirectUrl')) {
        branding.redirect = decodeURIComponent(
          url.searchParams.get('brandingRedirectUrl') ?? branding.redirect
        );
      }
    }

    return branding;
  } catch (_e) {
    return defaultBranding;
  }
};
