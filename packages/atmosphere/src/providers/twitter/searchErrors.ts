import type { ApiQueryError } from '../../types/api-schemas.js';

/** X SearchTimeline rejects `rawQuery` longer than this; match that cap on FxTwitter `/2/search`. */
export const TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH = 512;

export type SearchTimelineClientErrorKind = 'empty_query' | 'blocklisted' | 'query_too_long';

const QUERY_TOO_LONG_RE = /Raw query length \d+ exceeds max allowed \d+/i;

export function formatSearchQueryTooLongMessage(length: number): string {
  return `Raw query length ${length} exceeds max allowed ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH}`;
}

export function searchQueryTooLongError(length: number): ApiQueryError {
  return {
    code: 400,
    message: formatSearchQueryTooLongMessage(length)
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function firstGraphqlErrorEntry(json: unknown): Record<string, unknown> | undefined {
  const rec = asRecord(json);
  if (!rec) return undefined;
  const errors = rec['errors'];
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  return asRecord(errors[0]);
}

/**
 * Validate if an error path relates to search timeline operations.
 *
 * Note: Returns `true` when path is missing, null, or empty. This permissive behavior
 * is intentional and allows errors without path information to proceed to message-based
 * classification. This defensive design handles API response variations where the path
 * field may be omitted while still containing valid search timeline error messages.
 */
function isSearchTimelineErrorPath(path: unknown): boolean {
  if (!Array.isArray(path) || path.length === 0) return true;
  return path.some(segment => segment === 'search_timeline' || segment === 'search_by_raw_query');
}

/**
 * Detect expected SearchTimeline client validation errors from X GraphQL (`errors[0].message`).
 */
export function parseSearchTimelineClientError(
  json: unknown
): SearchTimelineClientErrorKind | null {
  const entry = firstGraphqlErrorEntry(json);
  if (!entry) return null;

  const message = entry['message'];
  if (typeof message !== 'string') return null;
  if (!isSearchTimelineErrorPath(entry['path'])) return null;

  if (message.includes('ERROR_EMPTY_QUERY')) {
    return 'empty_query';
  }
  if (message.includes('denylisted in Search Content Control tool')) {
    return 'blocklisted';
  }
  if (QUERY_TOO_LONG_RE.test(message)) {
    return 'query_too_long';
  }
  return null;
}

export function isSearchTimelineClientErrorResponse(json: unknown): boolean {
  return parseSearchTimelineClientError(json) !== null;
}

export function searchTimelineClientErrorToApiQueryError(
  kind: SearchTimelineClientErrorKind
): ApiQueryError {
  switch (kind) {
    case 'empty_query':
      return {
        code: 400,
        message: 'Search query is empty or could not be parsed by X'
      };
    case 'blocklisted':
      return {
        code: 400,
        message: 'Search query is blocked by X content controls'
      };
    case 'query_too_long':
      return {
        code: 400,
        message: `Raw query length exceeds max allowed ${TWITTER_SEARCH_RAW_QUERY_MAX_LENGTH}`
      };
  }
}
