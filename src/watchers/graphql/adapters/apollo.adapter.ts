/**
 * Apollo Server Adapter
 *
 * Implements GraphQL tracking for Apollo Server using the Plugin API.
 * Supports Apollo Server 4.x (@apollo/server)
 */

import { v4 as uuidv4 } from 'uuid';
import { MAX_RECORDED_ERRORS, GraphQLPayload } from '../../../types';
import {
  hashQuery,
  truncateQuery,
  extractOperationType,
  extractOperationName,
} from '../utils/query-parser';
import { sanitizeVariables, sanitizeResponse } from '../utils/variable-sanitizer';
import { N1Detector } from '../utils/n1-detector';
import { calculateDepth } from '../utils/depth-calculator';
import { createFieldTracer } from '../utils/field-tracer';
import { BaseGraphQLAdapter, isPackageAvailable } from './base.adapter';
import { capturePayload } from '../../capture-payload';
import { recording, recordingSync, recordingValue } from '../never-breaks-the-response';

/**
 * Apollo Server Plugin interface (minimal type for our usage)
 */
interface ApolloServerPlugin {
  requestDidStart?: (requestContext: ApolloRequestContext) => Promise<ApolloRequestListener | void>;
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
  executionDidStart?: () => Promise<void | {
    willResolveField?: (params: ApolloFieldResolverParams) => (() => void) | void;
    executionDidEnd?: () => Promise<void>;
  }>;
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
 * Whether a field could be fetching something.
 *
 * Every counted call used to be a candidate, so a query over sixteen order
 * items reported three findings of equal weight:
 *
 *     OrderItem.id       16 times   "consider using DataLoader"
 *     OrderItem.product  16 times   "consider using DataLoader"
 *     Product.name       16 times   "consider using DataLoader"
 *
 * One of those is the query's actual problem and two are property reads. A
 * DataLoader for `id` is advice a reader has to know to ignore, and the finding
 * that matters is buried among them.
 *
 * Having a resolver does not separate them: `@nestjs/graphql` attaches one to
 * every field in a code-first schema, which was measured before this was
 * written. What does separate them is what the field returns. A scalar or an
 * enum is a leaf — whatever produced it, there is nothing further to fetch —
 * while an object or a list of them is the shape an N+1 takes.
 *
 * Read structurally rather than by importing `graphql`, which is not a
 * dependency of this package: unwrap the wrappers, and a named type that can
 * be asked for its fields is not a leaf.
 */
const returnsSomethingFetchable = (info: GraphQLResolveInfo): boolean => {
  try {
    let type = info.returnType as { ofType?: unknown; getFields?: unknown } | undefined;

    // `[Order!]!` is a non-null of a list of a non-null of Order.
    while (type && typeof (type as { ofType?: unknown }).ofType === 'object') {
      type = (type as { ofType?: { ofType?: unknown; getFields?: unknown } }).ofType;
    }

    return typeof type?.getFields === 'function';
  } catch {
    // An unreadable type is not a reason to stop recording the operation.
    return false;
  }
};

/**
 * GraphQL resolve info from graphql-js
 */
interface GraphQLResolveInfo {
  fieldName: string;
  parentType: { name: string };
  returnType: { toString: () => string; ofType?: unknown; getFields?: unknown };
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
  /**
   * Operations already picked up, so a second plugin cannot record them again.
   *
   * A `WeakSet` because the key is Apollo's request context: it lives exactly
   * as long as the operation, and nothing here keeps it alive a moment longer.
   * See `getPlugin()`.
   */
  private readonly startedRequests = new WeakSet<object>();

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
        // Contained, because this runs inside Apollo's own pipeline: a throw
        // here is not a lost entry, it is the application's answer replaced by
        // `Internal server error`. See `never-breaks-the-response`.
        return recordingValue<ApolloRequestListener | void>(
          'starting an operation',
          () => adapter.startOperation(requestContext),
          undefined,
        );
      },
    };
  }

  /**
   * Everything the plugin does for one operation.
   *
   * A method rather than the hook body itself so the whole of it sits behind
   * one guard: Apollo calls the hook, and what the hook returns is the
   * listener for the rest of the operation.
   */
  private startOperation(requestContext: ApolloRequestContext): ApolloRequestListener | void {
    const adapter = this;

    // One entry per operation, however many plugins reach it.
    //
    // NestLens registers itself with Apollo automatically, and
    // `getPlugin()` still exists for the manual wiring that used to be
    // required. An application carrying both — every installation written
    // before auto-registration, including this repository's own example —
    // hands Apollo two plugins that delegate to this adapter, and Apollo
    // calls each of them: two entries per request, storage filling twice as
    // fast, and every operation listed twice on the dashboard. Measured at
    // 10 requests in, 20 entries out.
    //
    // Keyed on the request context, which Apollo creates per operation, so
    // it does not matter which plugin arrives first or how many there are.
    if (adapter.startedRequests.has(requestContext)) {
      return;
    }
    adapter.startedRequests.add(requestContext);

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
    const operationName = extractOperationName(query, request.operationName);
    // Which operation ran, for a document that declares more than one.
    const operationType = extractOperationType(query, request.operationName);

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
    const headers = adapter.extractHeaders(requestContext, httpRequest);

    const record = async (ctx: ApolloResponseContext): Promise<void> => {
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

      const executionDuration = executionStartTime
        ? adapter.nsToMs(endTime - executionStartTime)
        : undefined;

      // Get response errors
      const responseErrors = ctx.response.body?.singleResult?.errors ?? errors;

      // Calculate depth
      const depthResult = calculateDepth(query);

      // N+1 detection
      const n1Warnings = n1Detector ? n1Detector.detect().warnings : [];

      // Sanitized, then bounded: the query is truncated at
      // `maxQuerySize` and the response at `maxResponseSize`, and the
      // variables were bounded only in depth — a 100KB argument was
      // stored whole, on every request that carried one.
      const sanitizedVariables = adapter.config.captureVariables
        ? (capturePayload(
            sanitizeVariables(request.variables, adapter.config.sensitiveVariables),
            adapter.config.maxVariablesSize,
          ) as Record<string, unknown> | undefined)
        : undefined;

      // Sanitize response
      const responseData =
        adapter.config.captureResponse && ctx.response.body?.singleResult?.data
          ? sanitizeResponse(
              ctx.response.body.singleResult.data,
              adapter.config.sensitiveVariables,
              adapter.config.maxResponseSize,
            )
          : undefined;

      // Get field traces
      const fieldTraces = fieldTracer?.isActive() ? fieldTracer.getTraces() : undefined;

      // Determine status code
      const statusCode =
        ctx.response.http?.status ?? (responseErrors && responseErrors.length > 0 ? 400 : 200);

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
        // The first few, and how many there were. graphql-js stops
        // validating at a hundred and each error carries a message, a
        // path and a position: one rejected query recorded a
        // 152,749-byte entry, repeatable by anyone who can reach the
        // endpoint. See `MAX_RECORDED_ERRORS`.
        errors: responseErrors?.slice(0, MAX_RECORDED_ERRORS).map((e) => ({
          message: e.message,
          path: e.path as (string | number)[] | undefined,
          locations: e.locations as { line: number; column: number }[] | undefined,
          extensions: e.extensions,
        })),
        errorCount:
          responseErrors && responseErrors.length > MAX_RECORDED_ERRORS
            ? responseErrors.length
            : undefined,
        responseData,
        resolverCount,
        fieldCount: depthResult.maxDepth > 0 ? resolverCount : undefined,
        depthReached: depthResult.maxDepth,
        potentialN1: n1Warnings.length > 0 ? n1Warnings : undefined,
        ip,
        userAgent,
        headers,
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
              headers,
            },
          });
          if (tags && tags.length > 0) {
            payload.tags = tags;
          }
        } catch {
          // Ignore tag errors
        }
      }

      // Collect the entry
      await adapter.collectEntry(payload, requestId);

      // And what it threw, if anything: a failed operation is an exception the
      // application had, and everything that reads exceptions was blind to it.
      await adapter.recordErrors(responseErrors, {
        name: operationName,
        type: operationType,
        requestId,
      });
    };

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
            // This one runs per field. A throw here fails the field it was
            // only watching, so what it returns on failure is what a schema
            // without NestLens returns: nothing.
            return recordingSync<(() => void) | void>(
              'watching a field',
              () => watchField(info),
              undefined,
            );
          },

          async executionDidEnd() {
            // Execution completed
          },
        };

        function watchField(info: ApolloFieldResolverParams['info']): (() => void) | void {
          resolverCount++;

          // Extract field info from GraphQLResolveInfo
          const parentTypeName = info.parentType.name;
          const fieldName = info.fieldName;
          const returnTypeName = info.returnType.toString();

          // Track for N+1 detection, for fields that return something
          // there is more to fetch from. See `N1Detector.recordCall`.
          if (n1Detector && returnsSomethingFetchable(info)) {
            n1Detector.recordCall({
              parentType: parentTypeName,
              fieldName: fieldName,
            });
          }

          // Field tracing
          if (fieldTracer?.isActive()) {
            const path = adapter.buildFieldPath(info.path);
            const traceId = fieldTracer.startField(path, parentTypeName, fieldName, returnTypeName);

            return () => {
              fieldTracer.endField(traceId);
            };
          }

          return undefined;
        }
      },

      async didEncounterErrors(ctx) {
        errors = [...ctx.errors];
      },

      async willSendResponse(ctx: ApolloResponseContext) {
        // Contained for the same reason as the hook above it, and measured:
        // a throw from here replaces the operation's result with
        // `Internal server error`.
        return recording('recording an operation', () => record(ctx));
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
   * Extract request headers from the HTTP request or Apollo's header map
   */
  private extractHeaders(
    requestContext: ApolloRequestContext,
    httpRequest: Record<string, unknown> | undefined,
  ): Record<string, string> | undefined {
    if (!this.config.captureHeaders) {
      return undefined;
    }

    // Prefer the underlying HTTP request (Express/Fastify req from context)
    const fromRequest = this.captureRequestHeaders(httpRequest);
    if (fromRequest) {
      return fromRequest;
    }

    // Fallback to Apollo's HTTPGraphQLRequest header map
    const headerMap = requestContext.request.http?.headers;
    if (headerMap && typeof headerMap.entries === 'function') {
      const headers: Record<string, unknown> = {};
      for (const [key, value] of headerMap.entries()) {
        headers[key] = value;
      }
      const result = this.maskHeaders(headers);
      return Object.keys(result).length > 0 ? result : undefined;
    }

    return undefined;
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
