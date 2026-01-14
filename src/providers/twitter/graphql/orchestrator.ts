import { Context } from 'hono';
import { GraphQLQuery } from './request';
import { graphqlRequest } from './request';

export interface GraphQLEndpointMethod {
  name: string;
  query: GraphQLQuery;
  weight: number;
  fallbackOnly?: boolean; // If true, never selected randomly, only tried as fallback after others fail
  validator: (response: unknown) => boolean;
  variables?: Record<string, unknown>; // Optional per-method variables (merged with request variables)
  useElongator?: boolean;
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
}

export interface GraphQLOrchestratorResult {
  [key: string]: {
    success: boolean;
    data: unknown | null;
    error?: Error;
  };
}

/**
 * Execute a request with weighted endpoint methods (for rate limit leveling)
 * Tries the selected endpoint first, then falls back to others on failure
 */
const executeWithMethods = async (
  c: Context,
  methods: GraphQLEndpointMethod[],
  variables: Record<string, unknown>
): Promise<{ success: boolean; data: unknown | null; error?: Error }> => {
  // Filter methods with weight > 0
  const usableMethods = methods.filter(method => method.weight > 0);

  if (usableMethods.length === 0) {
    return {
      success: false,
      data: null,
      error: new Error('No usable methods available')
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
    try {
      // Merge method-specific variables with request variables (method variables take precedence)
      const mergedVariables = { ...variables, ...selectedMethod.variables };
      const data = await graphqlRequest(c, {
        query: selectedMethod.query,
        variables: mergedVariables,
        validator: selectedMethod.validator,
        useElongator: selectedMethod.useElongator
      });

      if (selectedMethod.validator(data)) {
        return { success: true, data, error: undefined };
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
    try {
      // Merge method-specific variables with request variables (method variables take precedence)
      const mergedVariables = { ...variables, ...method.variables };
      const data = await graphqlRequest(c, {
        query: method.query,
        variables: mergedVariables,
        validator: method.validator,
        useElongator: method.useElongator
      });

      if (method.validator(data)) {
        return { success: true, data, error: undefined };
      }
    } catch (_error) {
      console.log(`Fallback method ${method.name} failed`);
    }
  }

  return {
    success: false,
    data: null,
    error: new Error('All methods failed')
  };
};

/**
 * Execute multiple GraphQL requests in parallel with support for endpoint methods
 * - Primary requests (required=true) must succeed for the function to return successfully
 * - Supplementary requests (required=false) failures are tolerated
 * - Requests with methods use weighted selection for rate limit leveling
 */
export const graphQLOrchestrator = async (
  c: Context,
  requests: GraphQLOrchestratorRequest[]
): Promise<GraphQLOrchestratorResult> => {
  // Fire all requests concurrently
  const promises = requests.map(async request => {
    try {
      let data: unknown;
      // Handle methods (for rate limit leveling)
      if (request.methods && request.methods.length > 0) {
        const result = await executeWithMethods(c, request.methods, request.variables ?? {});
        if (!result.success) {
          throw result.error || new Error(`All methods failed for: ${request.key}`);
        }
        data = result.data;
      } else if (request.query && request.validator) {
        // Handle single query
        data = await graphqlRequest(c, {
          query: request.query,
          variables: request.variables ?? {},
          validator: request.validator,
          useElongator: request.useElongator
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
        error: error instanceof Error ? error : new Error(String(error))
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
