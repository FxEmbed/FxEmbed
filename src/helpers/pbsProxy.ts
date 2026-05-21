import { Constants } from '../constants';
import { experimentCheck, Experiment } from '../experiments';

export const getPbsProxyDomain = (): string | null =>
  Constants.PBS_PROXY_DOMAIN_LIST.map(s => s.trim()).filter(Boolean)[0] ?? null;

export const shouldProxyTelegramPbsPhotos = (isTelegram: boolean): boolean =>
  isTelegram && experimentCheck(Experiment.TELEGRAM_PBS_PROXY, !!getPbsProxyDomain());

export const proxyTwitterPostPhotoUrl = (url: string, enabled: boolean): string => {
  const domain = getPbsProxyDomain();
  if (!enabled || !domain || !url) return url;
  try {
    const u = new URL(url);
    if (u.hostname !== 'pbs.twimg.com') return url;
    if (!u.pathname.includes('/media/')) return url;
    u.hostname = domain;
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return url;
  }
};
