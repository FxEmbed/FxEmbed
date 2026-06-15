/* Twitter API error payloads are loosely typed */
import {
  isSearchTimelineClientErrorResponse,
  parseSearchTimelineClientError
} from '../searchErrors.js';
import type { ErrorResponse } from '../../../types/proxy-credentials.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function firstErrorEntry(json: unknown): Record<string, unknown> | undefined {
  const rec = asRecord(json);
  if (!rec) return undefined;
  const errors = rec['errors'];
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  return asRecord(errors[0]);
}

function firstErrorMessageIncludes(json: unknown, substr: string): boolean {
  const m = firstErrorEntry(json)?.['message'];
  return typeof m === 'string' && m.includes(substr);
}

/**
 * True when none of the usual success payload fields are present (same checks as the proxy handler).
 * Used so we do not `ignore` API errors when no tweet/user/data was returned.
 */
export function twitterResponseLooksEmpty(json: unknown): boolean {
  const o = asRecord(json);
  if (!o) return true;
  const result = asRecord(o['result']);
  return (
    typeof o['data'] === 'undefined' &&
    typeof o['translation'] === 'undefined' &&
    typeof o['source'] === 'undefined' &&
    typeof result?.['text'] === 'undefined' &&
    typeof o['num_results'] === 'undefined' &&
    typeof o['status'] === 'undefined' &&
    typeof o['user'] === 'undefined' &&
    typeof o['user_results'] === 'undefined' &&
    typeof o['user_result'] === 'undefined'
  );
}

/** True when the JSON includes tweet/user/graphql success fields; safe to treat NonFatal etc. as ignorable. */
export function responseHasTweetData(json: unknown): boolean {
  return !twitterResponseLooksEmpty(json);
}

/** `json.errors` truthy (including empty array), matching prior `if (json.errors)` checks. */
export function jsonHasTruthyErrorsProperty(json: unknown): boolean {
  const rec = asRecord(json);
  if (!rec) return false;
  return Boolean(rec['errors']);
}

export function jsonError(message: string, status: number): Response {
  const body: ErrorResponse = { error: message, code: status };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export type ClassifyOutcome =
  | { action: 'respond'; response: Response }
  | { action: 'ignore' }
  | { action: 'retry' };

type RuleContext = { json: unknown; body: string; httpStatus: number };

type ErrorRule =
  | { match: (ctx: RuleContext) => boolean; log: string; disposition: 'ignore' }
  | { match: (ctx: RuleContext) => boolean; log: string; disposition: 'retry' }
  | {
      match: (ctx: RuleContext) => boolean;
      log: string;
      disposition: 'respond';
      errorMessage: string;
      status: number;
    };

function ignoreOnlyWithPayload(
  match: (ctx: RuleContext) => boolean
): (ctx: RuleContext) => boolean {
  return ctx => match(ctx) && responseHasTweetData(ctx.json);
}

const NSFW_UNDERAGE_LOG = 'NsfwViewerIsUnderage: Account country may be set to UK or EU';

/** Inner chain when `json.errors` or NSFW underage is present; order matches original worker. */
const ERROR_RULES: ErrorRule[] = [
  {
    match: ({ httpStatus }) => httpStatus === 404,
    disposition: 'respond',
    errorMessage: 'Status not found',
    status: 404,
    log: 'Status not found'
  },
  {
    match: ({ json }) => firstErrorMessageIncludes(json, 'No status found with that ID'),
    disposition: 'respond',
    errorMessage: 'Status not found',
    status: 404,
    log: 'Status not found'
  },
  {
    match: ({ json }) => firstErrorEntry(json)?.code === 366,
    disposition: 'respond',
    errorMessage: 'Status not found',
    status: 404,
    log: 'Status not found'
  },
  {
    match: ({ json }) => firstErrorEntry(json)?.code === 144,
    disposition: 'respond',
    errorMessage: 'Status not found',
    status: 404,
    log: 'Status not found'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) => firstErrorEntry(json)?.code === 29),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Timeout: Unspecified). Ignore this as this is usually not an issue.'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) => firstErrorEntry(json)?.code === 88),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Rate limit exceeded). Ignore this as this is usually not an issue.'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) => firstErrorEntry(json)?.name === 'DependencyError'),
    disposition: 'ignore',
    log: 'Downstream fetch problem (DependencyError). Ignore this as this is usually not an issue.'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) => firstErrorEntry(json)?.kind === 'NonFatal'),
    disposition: 'ignore',
    log: 'Non-Fatal Error reported by server, continuing...'
  },
  {
    match: ({ json }) => firstErrorEntry(json)?.message === 'ServiceUnavailable: Unspecified',
    disposition: 'respond',
    errorMessage: 'Downstream fetch problem (ServiceUnavailable), use fallback methods',
    status: 502,
    log: 'Downstream fetch problem (ServiceUnavailable), use fallback methods'
  },
  {
    match: ({ json }) => firstErrorEntry(json)?.name === 'DownstreamOverCapacityError',
    disposition: 'respond',
    errorMessage: 'Downstream fetch problem (DownstreamOverCapacityError), use fallback methods',
    status: 502,
    log: 'Downstream fetch problem (DownstreamOverCapacityError), use fallback methods'
  },
  {
    match: ignoreOnlyWithPayload(
      ({ json }) => firstErrorEntry(json)?.message === 'Internal: Unspecified'
    ),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Internal: Unspecified). Ignore this as this is usually not an issue.'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) =>
      firstErrorMessageIncludes(json, 'Denied by access control: Missing LdapGroup')
    ),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Authorization: Denied by access control: Missing LdapGroup). Ignore this as this is usually not an issue.'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) =>
      firstErrorMessageIncludes(json, 'Query: Unspecified')
    ),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Query: Unspecified). Ignore this as this is usually not an issue.'
  },
  {
    match: ({ json }) => firstErrorMessageIncludes(json, 'value out of range'),
    disposition: 'respond',
    errorMessage: 'Status not found',
    status: 404,
    log: 'Invalid status ID'
  },
  {
    match: ignoreOnlyWithPayload(({ json }) =>
      firstErrorMessageIncludes(json, 'Internal server error')
    ),
    disposition: 'ignore',
    log: 'Downstream fetch problem (Internal server error); retrying with another account.'
  },
  {
    match: ({ json }) => parseSearchTimelineClientError(json) === 'empty_query',
    disposition: 'ignore',
    log: 'SearchTimeline empty or unparseable query (expected client error)'
  },
  {
    match: ({ json }) => parseSearchTimelineClientError(json) === 'blocklisted',
    disposition: 'ignore',
    log: 'SearchTimeline blocklisted query (expected client error)'
  }
];

export { isSearchTimelineClientErrorResponse };

export function applyNsfwViewerErrorPatch(json: unknown): void {
  const rec = asRecord(json);
  if (!rec) return;
  rec['errors'] = [
    {
      message: 'Account country set to UK or EU and tried to access NSFW content',
      code: 451
    }
  ];
}

/**
 * When the response body has API errors (or NSFW underage), determine retry / ignore / immediate JSON error.
 */
export function classifyAPIErrors(
  json: unknown,
  decodedBody: string,
  httpStatus: number
): ClassifyOutcome {
  const ctx: RuleContext = { json, body: decodedBody, httpStatus };
  const hasNsfw = decodedBody.includes('"reason":"NsfwViewerIsUnderage"');
  if (!(jsonHasTruthyErrorsProperty(json) || hasNsfw)) {
    return { action: 'ignore' };
  }

  if (hasNsfw) {
    applyNsfwViewerErrorPatch(json);
    console.log(NSFW_UNDERAGE_LOG);
    return { action: 'retry' };
  }

  console.log(asRecord(json)?.['errors']);

  for (const rule of ERROR_RULES) {
    if (rule.match(ctx)) {
      console.log(rule.log);
      if (rule.disposition === 'respond') {
        return {
          action: 'respond',
          response: jsonError(rule.errorMessage, rule.status)
        };
      }
      if (rule.disposition === 'retry') {
        return { action: 'retry' };
      }
      return { action: 'ignore' };
    }
  }

  return { action: 'retry' };
}
