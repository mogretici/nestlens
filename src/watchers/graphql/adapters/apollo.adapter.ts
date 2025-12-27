/**
 * Apollo Server Adapter
 *
 * Implements GraphQL tracking for Apollo Server using the Plugin API.
 * Supports Apollo Server 4.x (@apollo/server)
 */

import { v4 as uuidv4 } from 'uuid';
import { GraphQLPayload } from '../../../types';
import { ResolvedGraphQLConfig, OperationContext } from '../types';
import {
  hashQuery,
  truncateQuery,
  extractOperationType,
  extractOperationName,
} from '../utils/query-parser';
import { sanitizeVariables, sanitizeResponse } from '../utils/variable-sanitizer';
import { N1Detector } from '../utils/n1-detector';
import { calculateDepth } from '../utils/depth-calculator';
import { createFieldTracer, FieldTracer } from '../utils/field-tracer';
import { BaseGraphQLAdapter, isPackageAvailable } from './base.adapter';

/**
 * Apollo Server Plugin interface (minimal type for our usage)
 */
interface ApolloServerPlugin {
  requestDidStart?: (
    requestContext: ApolloRequestContext,
  ) => Promise<ApolloRequestListener | void>;
}

interface ApolloRequestContext {
  request: {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
    http?: {
      headers: Map<string, string>;
    };
  };
  contextValue?: Record<string, unknown>;
}

interface ApolloRequestListener {
  parsingDidStart?: () => Promise<void | (() => void)>;
  validationDidStart?: () => Promise<void | (() => void)>;
  didResolveOperation?: (ctx: { operationName?: string }) => Promise<void>;
  executionDidStart?: () => Promise<
    | void
    | {
        willResolveField?: (params: ApolloFieldResolverParams) => (() => void) | void;
        executionDidEnd?: () => Promise<void>;
      }
  >;
  willSendResponse?: (ctx: ApolloResponseContext) => Promise<void>;
  didEncounterErrors?: (ctx: { errors: readonly GraphQLError[] }) => Promise<void>;
}

/**
 * Parameters passed to willResolveField hook
 * Apollo passes { source, args, contextValue, info } not just info
 */
interface ApolloFieldResolverParams {
  source?: unknown;
  args?: Record<string, unknown>;
  contextValue?: unknown;
  info: GraphQLResolveInfo;
}

/**
 * GraphQL resolve info from graphql-js
 */
interface GraphQLResolveInfo {
  fieldName: string;
  parentType: { name: string };
  returnType: { toString: () => string };
  path: {
    key: string | number;
    prev?: { key: string | number; prev?: unknown };
    typename?: string;
  };
}

interface ApolloResponseContext {
  response: {
    body?: {
      kind: string;
      singleResult?: {
        data?: unknown;
        errors?: readonly GraphQLError[];
      };
    };
    http?: {
      status?: number;
    };
  };
}

interface GraphQLError {
  message: string;
  locations?: readonly { line: number; column: number }[];
  path?: readonly (string | number)[];
  extensions?: Record<string, unknown>;
}

/**
 * Apollo Server Adapter
 */
export class ApolloAdapter extends BaseGraphQLAdapter {
  readonly type = 'apollo' as const;

  /**
   * Check if Apollo Server is available
   */
  isAvailable(): boolean {
    return isPackageAvailable('@apollo/server');
  }

  /**
   * Get the Apollo Server plugin
   */
  getPlugin(): ApolloServerPlugin {
    const adapter = this;

    return {
      async requestDidStart(
        requestContext: ApolloRequestContext,
      ): Promise<ApolloRequestListener | void> {
        const { request } = requestContext;
        const query = request.query;

        // Skip if no query
        if (!query) {
          return;
        }

        // Check sampling
        if (!adapter.shouldSample()) {
          return;
        }

        // Extract operation info
        const operationName =
          request.operationName || extractOperationName(query);
        const operationType = extractOperationType(query);

        // Check if should ignore
        if (adapter.shouldIgnoreOperation(operationName, query)) {
          return;
        }

        // Initialize operation context
        const requestId = uuidv4();
        const startTime = process.hrtime.bigint();
        const queryHash = hashQuery(query);
        const truncatedQuery = truncateQuery(query, adapter.config.maxQuerySize);

        // Initialize trackers
        const n1Detector = adapter.config.detectN1Queries
          ? new N1Detector(adapter.config.n1Threshold)
          : null;

        const fieldTracer = adapter.config.traceFieldResolvers
          ? createFieldTracer(startTime, {
              enabled: true,
              slowThreshold: adapter.config.traceSlowResolvers,
              sampleRate: adapter.config.resolverTracingSampleRate,
              maxTraces: 100,
            })
          : null;

        // Timing trackers
        let parsingStartTime: bigint | undefined;
        let parsingEndTime: bigint | undefined;
        let validationStartTime: bigint | undefined;
        let validationEndTime: bigint | undefined;
        let executionStartTime: bigint | undefined;

        // Error tracking
        let errors: GraphQLError[] = [];
        let resolverCount = 0;

        // Extract request info
        const httpRequest = adapter.extractHttpRequest(requestContext);
        const ip = adapter.getClientIp(httpRequest);
        const userAgent = adapter.getUserAgent(httpRequest);
        const user = adapter.extractUser(httpRequest);

        return {
          async parsingDidStart() {
            parsingStartTime = process.hrtime.bigint();
            return () => {
              parsingEndTime = process.hrtime.bigint();
            };
          },

          async validationDidStart() {
            validationStartTime = process.hrtime.bigint();
            return () => {
              validationEndTime = process.hrtime.bigint();
            };
          },

          async didResolveOperation() {
            // Operation has been resolved - we could do additional checks here
          },

          async executionDidStart() {
            executionStartTime = process.hrtime.bigint();

            return {
              willResolveField({ info }: ApolloFieldResolverParams) {
                resolverCount++;

                // Extract field info from GraphQLResolveInfo
                const parentTypeName = info.parentType.name;
                const fieldName = info.fieldName;
                const returnTypeName = info.returnType.toString();

                // Track for N+1 detection
                if (n1Detector) {
                  n1Detector.recordCall({
                    parentType: parentTypeName,
                    fieldName: fieldName,
                  });
                }

                // Field tracing
                if (fieldTracer && fieldTracer.isActive()) {
                  const path = adapter.buildFieldPath(info.path);
                  const traceId = fieldTracer.startField(
                    path,
                    parentTypeName,
                    fieldName,
                    returnTypeName,
                  );

                  return () => {
                    fieldTracer.endField(traceId);
                  };
                }

                return undefined;
              },

              async executionDidEnd() {
                // Execution completed
              },
            };
          },

          async didEncounterErrors(ctx) {
            errors = [...ctx.errors];
          },

          async willSendResponse(ctx: ApolloResponseContext) {
            const endTime = process.hrtime.bigint();
            const duration = adapter.nsToMs(endTime - startTime);

            // Calculate timing
            const parsingDuration =
              parsingStartTime && parsingEndTime
                ? adapter.nsToMs(parsingEndTime - parsingStartTime)
                : undefined;

            const validationDuration =
              validationStartTime && validationEndTime
                ? adapter.nsToMs(validationEndTime - validationStartTime)
                : undefined;

            const executionDuration =
              executionStartTime
                ? adapter.nsToMs(endTime - executionStartTime)
                : undefined;

            // Get response errors
            const responseErrors =
              ctx.response.body?.singleResult?.errors || errors;

            // Calculate depth
            const depthResult = calculateDepth(query);

            // N+1 detection
            const n1Warnings = n1Detector ? n1Detector.detect().warnings : [];

            // Sanitize variables
            const sanitizedVariables = adapter.config.captureVariables
              ? sanitizeVariables(
                  request.variables,
                  adapter.config.sensitiveVariables,
                )
              : undefined;

            // Sanitize response
            const responseData =
              adapter.config.captureResponse &&
              ctx.response.body?.singleResult?.data
                ? sanitizeResponse(
                    ctx.response.body.singleResult.data,
                    adapter.config.sensitiveVariables,
                    adapter.config.maxResponseSize,
                  )
                : undefined;

            // Get field traces
            const fieldTraces =
              fieldTracer && fieldTracer.isActive()
                ? fieldTracer.getTraces()
                : undefined;

            // Determine status code
            const statusCode =
              ctx.response.http?.status ||
              (responseErrors && responseErrors.length > 0 ? 400 : 200);

            // Build payload
            const payload: GraphQLPayload = {
              operationName,
              operationType,
              query: truncatedQuery,
              queryHash,
              variables: sanitizedVariables,
              duration,
              parsingDuration,
              validationDuration,
              executionDuration,
              statusCode,
              hasErrors: responseErrors && responseErrors.length > 0,
              errors: responseErrors?.map((e) => ({
                message: e.message,
                path: e.path as (string | number)[] | undefined,
                locations: e.locations as
                  | { line: number; column: number }[]
                  | undefined,
                extensions: e.extensions,
              })),
              responseData,
              resolverCount,
              fieldCount: depthResult.maxDepth > 0 ? resolverCount : undefined,
              depthReached: depthResult.maxDepth,
              potentialN1: n1Warnings.length > 0 ? n1Warnings : undefined,
              ip,
              userAgent,
              user,
              fieldTraces,
            };

            // Get custom tags if configured
            if (adapter.config.tags) {
              try {
                const tags = await adapter.config.tags({
                  operationName,
                  operationType,
                  query,
                  variables: request.variables,
                  request: {
                    ip,
                    userAgent,
                  },
                });
                if (tags && tags.length > 0) {
                  (payload as unknown as { tags?: string[] }).tags = tags;
                }
              } catch {
                // Ignore tag errors
              }
            }

            // Collect the entry
            await adapter.collectEntry(payload, requestId);
          },
        };
      },
    };
  }

  /**
   * Build a field path string from Apollo path info
   */
  private buildFieldPath(path: {
    key: string | number;
    prev?: { key: string | number; prev?: unknown };
  }): string {
    const parts: (string | number)[] = [];
    let current: { key: string | number; prev?: unknown } | undefined = path;

    while (current) {
      parts.unshift(current.key);
      current = current.prev as { key: string | number; prev?: unknown } | undefined;
    }

    return parts.join('.');
  }

  /**
   * Extract HTTP request from Apollo context
   */
  private extractHttpRequest(
    requestContext: ApolloRequestContext,
  ): Record<string, unknown> | undefined {
    // Try to get request from context
    const ctx = requestContext.contextValue;
    if (ctx) {
      // Common patterns for accessing request
      if (ctx.req) return ctx.req as Record<string, unknown>;
      if (ctx.request) return ctx.request as Record<string, unknown>;
      if (ctx.http) return ctx.http as Record<string, unknown>;
    }

    return undefined;
  }
}

/**
 * Create an Apollo adapter instance
 */
export function createApolloAdapter(): ApolloAdapter {
  return new ApolloAdapter();
}
