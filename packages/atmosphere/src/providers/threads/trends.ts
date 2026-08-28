import type { APITrend, APITrendsResponse } from '../../types/api-schemas.js';
import { resolveThreadsAccounts, type ThreadsRequestContext } from './account-proxy.js';
import { fetchThreadsTrends } from './private-api.js';

const empty = (code: number, message?: string): APITrendsResponse => ({
  code,
  ...(message ? { message } : {}),
  timeline_type: 'threads',
  trends: [],
  cursor: { top: null, bottom: null }
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
};

/** Rows land under `trending_topics` or `topics` depending on which tab the surface serves. */
function trendRows(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) return [];
  for (const key of ['trending_topics', 'topics', 'trends', 'items']) {
    const value = json[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function trendFromRow(row: Record<string, unknown>): APITrend | null {
  const name = str(row.trend_title, row.topic_name, row.trend_name, row.trend_keyword, row.name);
  if (!name) return null;
  const rank = row.trend_rank;
  const postCount = row.post_count;
  const context =
    str(row.trend_description) ||
    (typeof postCount === 'number' && Number.isFinite(postCount)
      ? `${postCount} posts`
      : str(row.subtitle));
  const related = row.related_communities;
  const groupedTopics = Array.isArray(related)
    ? related
        .filter(isRecord)
        .map(c => ({ name: str(c.name, c.topic_name, c.title) }))
        .filter(c => c.name.length > 0)
    : [];
  return {
    name,
    rank: typeof rank === 'number' && Number.isFinite(rank) ? String(rank) : null,
    context: context || null,
    ...(groupedTopics.length ? { grouped_topics: groupedTopics } : {})
  };
}

/**
 * Threads trending topics (`fbsearch/text_app/trends/`) — the analogue of X's `/2/trends`.
 *
 * Trends are a logged-in surface on Threads, so this needs the account proxy; without one it
 * reports 501. The endpoint serves a single ranked page and no cursor.
 */
export async function constructThreadsTrends(
  options: { count?: number; ctx?: ThreadsRequestContext } = {}
): Promise<APITrendsResponse> {
  const accounts = await resolveThreadsAccounts(options.ctx);
  if (!accounts.length) {
    return empty(501, 'Threads trends require a proxied account');
  }
  const count =
    options.count === undefined ? undefined : Math.min(100, Math.max(1, Math.floor(options.count)));
  const res = await fetchThreadsTrends(options.ctx, { accounts, first: count });
  if (!res.ok) {
    return empty(res.status === 404 ? 404 : 500);
  }

  const trends: APITrend[] = [];
  for (const row of trendRows(res.json)) {
    const trend = trendFromRow(row);
    if (trend) trends.push(trend);
    if (count !== undefined && trends.length >= count) break;
  }

  return {
    code: 200,
    timeline_type: 'threads',
    trends,
    cursor: { top: null, bottom: null }
  };
}
