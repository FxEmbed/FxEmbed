import type { APIStatusTombstone } from '../types/api-schemas.js';
import type { APIStatus } from '../types/api-status.js';
import { isTombstone } from './tombstone.js';

const formatQuotedFrom = (template: string, name: string, screenName: string) =>
  template.replace(/\{name\}/g, name).replace(/\{screen_name\}/g, screenName);

export type QuoteStrings = {
  quotedFromTombstone: string;
  /** e.g. `Quoting {name} (@{screen_name})` */
  quotedFrom: string;
};

export const handleQuote = (
  quote: APIStatus | APIStatusTombstone,
  s: QuoteStrings
): string | null => {
  if (isTombstone(quote)) {
    return `\n${s.quotedFromTombstone}: ${quote.message}`;
  }

  let str = `\n`;
  str += formatQuotedFrom(s.quotedFrom, quote.author?.name || '', quote.author?.screen_name || '');

  str += ` \n\n`;
  str += quote.translation?.text ?? quote.text;

  return str;
};
