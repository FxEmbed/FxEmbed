import { GraphQLQuery } from './request.js';
import { graphqlRequest } from './request.js';
import type { TwitterBuildHost } from '../build-host.js';

export interface GraphQLEndpointMethod {
  name: string;
  query: GraphQLQuery;
  weight: number;
  fallbackOnly?: boolean; // If true, never selected randomly, only tried as fallback after others fail
  validator: (response: unknown) => boolean;
  variables?: Record<string, unknown>; // Optional per-method variables (merged with request variables)
  useElongator?: boolean;
  headers?: Record<string, string>;
}

export interface GraphQLOrchestratorRequest {
  key: string; // Identifier for this request
  // Either a single query OR methods (for rate limit leveling)
  query?: GraphQLQuery;
  methods?: GraphQLEndpointMethod[];
  variables?: Record<string, unknown>;
  validator?: (response: unknown) => boolean; // Used for single query
  required?: boolean; // If true, failure = overall failure (default: false for supplementary)
  useElongator?: boolean;
  headers?: Record<string, string>;
}

/** One endpoint method tried for a request, and what X answered if the validator rejected it. */
export interface GraphQLAttempt {
  method: string;
  /** The parsed response the validator rejected. Unset when no response arrived (network or proxy failure). */
  rejectedResponse?: unknown;
}

export interface GraphQLOrchestratorResult {
  [key: string]: {
    success: boolean;
    data: unknown | null;
    error?: Error;
    /** Set on failed `methods` requests, so callers can tell "X said no" from "no usable answer". */
    attempts?: GraphQLAttempt[];
  };
}

type MethodsResult = {
  success: boolean;
  data: unknown | null;
  error?: Error;
  attempts: GraphQLAttempt[];
};

/**
 * `twitterFetch` hands the real response to the validator and then discards it when the
 * validator fails, so remember what the validator rejected.
 */
const recordRejection =
  (method: GraphQLEndpointMethod, attempt: GraphQLAttempt) =>
  (response: unknown): boolean => {
    const valid = method.validator(response);
    if (!valid) {
      attempt.rejectedResponse = response;
    }
    return valid;
  };

/**
 * Execute a request with weighted endpoint methods (for rate limit leveling)
 * Tries the selected endpoint first, then falls back to others on failure
 */
const mergeRequestHeaders = (
  orchestratorHeaders: Record<string, string> | undefined,
  methodHeaders: Record<string, string> | undefined
): Record<string, string> | undefined => {
  if (orchestratorHeaders === undefined && methodHeaders === undefined) {
    return undefined;
  }
  return { ...orchestratorHeaders, ...methodHeaders };
};

const executeWithMethods = async (
  host: TwitterBuildHost,
  methods: GraphQLEndpointMethod[],
  variables: Record<string, unknown>,
  requestHeaders?: Record<string, string>
): Promise<MethodsResult> => {
  const attempts: GraphQLAttempt[] = [];
  // Filter methods with weight > 0
  const usableMethods = methods.filter(method => method.weight > 0);

  if (usableMethods.length === 0) {
    return {
      success: false,
      data: null,
      error: new Error('No usable methods available'),
      attempts
    };
  }

  // Filter out fallbackOnly methods for initial selection
  const selectableMethods = usableMethods.filter(method => !method.fallbackOnly);

  if (selectableMethods.length === 0) {
    // All methods are fallbackOnly, just try them in weight order
    console.log(`All methods are fallbackOnly, let's try them in weight order`);
  }

  // Weighted random selection from selectable methods
  let selectedMethod: GraphQLEndpointMethod | null = null;

  if (selectableMethods.length > 0) {
    const totalWeight = selectableMethods.reduce((sum, method) => sum + method.weight, 0);
    const random = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    selectedMethod = selectableMethods[0];

    for (const method of selectableMethods) {
      cumulativeWeight += method.weight;
      if (random <= cumulativeWeight) {
        selectedMethod = method;
        break;
      }
    }
  }

  // Try selected method (if one was selected)
  if (selectedMethod) {
    const attempt: GraphQLAttempt = { method: selectedMethod.name };
    attempts.push(attempt);
    try {
      // Merge method-specific variables with request variables (method variables take precedence)
      const mergedVariables = { ...variables, ...selectedMethod.variables };
      const data = await graphqlRequest(host, {
        query: selectedMethod.query,
        variables: mergedVariables,
        validator: recordRejection(selectedMethod, attempt),
        useElongator: selectedMethod.useElongator,
        headers: mergeRequestHeaders(requestHeaders, selectedMethod.headers)
      });

      if (selectedMethod.validator(data)) {
        return { success: true, data, error: undefined, attempts };
      }
    } catch (_error) {
      console.log(`Method ${selectedMethod.name} failed, trying fallbacks...`);
    }
  }

  // Try remaining methods as fallback, sorted by weight (highest first)
  const fallbackMethods = usableMethods
    .filter(method => method.name !== selectedMethod?.name)
    .sort((a, b) => b.weight - a.weight); // Sort descending by weight

  for (const method of fallbackMethods) {
    const attempt: GraphQLAttempt = { method: method.name };
    attempts.push(attempt);
    try {
      // Merge method-specific variables with request variables (method variables take precedence)
      const mergedVariables = { ...variables, ...method.variables };
      const data = await graphqlRequest(host, {
        query: method.query,
        variables: mergedVariables,
        validator: recordRejection(method, attempt),
        useElongator: method.useElongator,
        headers: mergeRequestHeaders(requestHeaders, method.headers)
      });

      if (method.validator(data)) {
        return { success: true, data, error: undefined, attempts };
      }
    } catch (_error) {
      console.log(`Fallback method ${method.name} failed`);
    }
  }

  return {
    success: false,
    data: null,
    error: new Error('All methods failed'),
    attempts
  };
};

/**
 * Execute multiple GraphQL requests in parallel with support for endpoint methods
 * - Primary requests (required=true) must succeed for the function to return successfully
 * - Supplementary requests (required=false) failures are tolerated
 * - Requests with methods use weighted selection for rate limit leveling
 */
export const graphQLOrchestrator = async (
  host: TwitterBuildHost,
  requests: GraphQLOrchestratorRequest[]
): Promise<GraphQLOrchestratorResult> => {
  // Fire all requests concurrently
  const promises = requests.map(async request => {
    let attempts: GraphQLAttempt[] | undefined;
    try {
      let data: unknown;
      // Handle methods (for rate limit leveling)
      if (request.methods && request.methods.length > 0) {
        const result = await executeWithMethods(
          host,
          request.methods,
          request.variables ?? {},
          request.headers
        );
        attempts = result.attempts;
        if (!result.success) {
          throw result.error || new Error(`All methods failed for: ${request.key}`);
        }
        data = result.data;
      } else if (request.query && request.validator) {
        // Handle single query
        data = await graphqlRequest(host, {
          query: request.query,
          variables: request.variables ?? {},
          validator: request.validator,
          useElongator: request.useElongator,
          headers: request.headers
        });

        // Validate the response
        if (!request.validator(data)) {
          throw new Error(`Validation failed for request: ${request.key}`);
        }
      } else {
        throw new Error(`Request ${request.key} must have either query+validator or methods`);
      }

      return {
        key: request.key,
        success: true,
        data,
        error: undefined
      };
    } catch (error) {
      return {
        key: request.key,
        success: false,
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts
      };
    }
  });

  const results = await Promise.allSettled(promises);

  // Build result object
  const result: GraphQLOrchestratorResult = {};

  results.forEach((settled, index) => {
    const request = requests[index];
    if (settled.status === 'fulfilled') {
      result[request.key] = settled.value;
    } else {
      result[request.key] = {
        success: false,
        data: null,
        error: settled.reason instanceof Error ? settled.reason : new Error(String(settled.reason))
      };
    }
  });

  // Check if any required requests failed
  const failedRequired = requests.some(
    request => request.required && !result[request.key]?.success
  );

  if (failedRequired) {
    // If a required request failed, we still return the results but the caller should check
    // This allows for graceful error handling at the call site
    return result;
  }

  return result;
};
