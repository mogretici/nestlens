/**
 * Mercurius Adapter
 *
 * Implements GraphQL tracking for Mercurius (Fastify GraphQL).
 * Uses Mercurius hooks for request lifecycle tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { GraphQLPayload } from '../../../types';
import { ResolvedGraphQLConfig } from '../types';
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
 * Mercurius context type
 */
interface MercuriusContext {
  reply?: {
    request?: {
      ip?: string;
      headers?: Record<string, string>;
      user?: Record<string, unknown>;
    };
  };
  request?: {
    ip?: string;
    headers?: Record<string, string>;
    user?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Mercurius execution context for hooks
 */
interface MercuriusExecutionContext {
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
  context?: MercuriusContext;
  reply?: {
    statusCode?: number;
    request?: {
      ip?: string;
      headers?: Record<string, string>;
      user?: Record<string, unknown>;
    };
  };
}

/**
 * Mercurius resolution event
 */
interface MercuriusResolutionEvent {
  info: {
    fieldName: string;
    parentType: { name: string };
    returnType: { toString: () => string };
    path: {
      key: string | number;
      prev?: { key: string | number };
    };
  };
}

/**
 * Mercurius hooks interface
 */
interface MercuriusHooks {
  preParsing?: (
    schema: unknown,
    source: string,
    context: MercuriusContext,
  ) => Promise<void>;
  preValidation?: (
    schema: unknown,
    document: unknown,
    context: MercuriusContext,
  ) => Promise<void>;
  preExecution?: (
    schema: unknown,
    document: unknown,
    context: MercuriusContext,
  ) => Promise<{
    document?: unknown;
    errors?: unknown[];
  } | void>;
  preGatewayExecution?: (
    schema: unknown,
    document: unknown,
    context: MercuriusContext,
    service: unknown,
  ) => Promise<void>;
  onResolution?: (
    execution: MercuriusExecutionContext,
    context: MercuriusContext,
  ) => Promise<void>;
  preSubscriptionParsing?: (
    schema: unknown,
    source: string,
    context: MercuriusContext,
  ) => Promise<void>;
  preSubscriptionExecution?: (
    schema: unknown,
    document: unknown,
    context: MercuriusContext,
  ) => Promise<void>;
  onSubscriptionResolution?: (
    execution: MercuriusExecutionContext,
    context: MercuriusContext,
  ) => Promise<void>;
  onSubscriptionEnd?: (
    context: MercuriusContext,
    id: string,
  ) => Promise<void>;
}

/**
 * Request tracking data stored in context
 */
interface RequestTrackingData {
  requestId: string;
  startTime: bigint;
  query: string;
  queryHash: string;
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription';
  parsingStartTime?: bigint;
  parsingEndTime?: bigint;
  validationStartTime?: bigint;
  validationEndTime?: bigint;
  executionStartTime?: bigint;
  n1Detector?: N1Detector;
  fieldTracer?: FieldTracer;
  resolverCount: number;
  errors: unknown[];
}

const TRACKING_KEY = Symbol('nestlens_graphql_tracking');

/**
 * Mercurius Adapter
 */
export class MercuriusAdapter extends BaseGraphQLAdapter {
  readonly type = 'mercurius' as const;

  /**
   * Check if Mercurius is available
   */
  isAvailable(): boolean {
    return isPackageAvailable('mercurius');
  }

  /**
   * Get the Mercurius hooks object
   */
  getPlugin(): MercuriusHooks {
    const adapter = this;

    return {
      async preParsing(
        _schema: unknown,
        source: string,
        context: MercuriusContext,
      ) {
        // Check sampling
        if (!adapter.shouldSample()) {
          return;
        }

        const query = source;
        const operationName = extractOperationName(query);
        const operationType = extractOperationType(query);

        // Check if should ignore
        if (adapter.shouldIgnoreOperation(operationName, query)) {
          return;
        }

        // Initialize tracking data
        const tracking: RequestTrackingData = {
          requestId: uuidv4(),
          startTime: process.hrtime.bigint(),
          query,
          queryHash: hashQuery(query),
          operationName,
          operationType,
          parsingStartTime: process.hrtime.bigint(),
          resolverCount: 0,
          errors: [],
        };

        // Initialize N+1 detector if enabled
        if (adapter.config.detectN1Queries) {
          tracking.n1Detector = new N1Detector(adapter.config.n1Threshold);
        }

        // Initialize field tracer if enabled
        if (adapter.config.traceFieldResolvers) {
          tracking.fieldTracer = createFieldTracer(tracking.startTime, {
            enabled: true,
            slowThreshold: adapter.config.traceSlowResolvers,
            sampleRate: adapter.config.resolverTracingSampleRate,
            maxTraces: 100,
          });
        }

        // Store in context
        (context as Record<symbol, unknown>)[TRACKING_KEY] = tracking;
      },

      async preValidation(
        _schema: unknown,
        _document: unknown,
        context: MercuriusContext,
      ) {
        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (tracking) {
          tracking.parsingEndTime = process.hrtime.bigint();
          tracking.validationStartTime = process.hrtime.bigint();
        }
      },

      async preExecution(
        _schema: unknown,
        _document: unknown,
        context: MercuriusContext,
      ) {
        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (tracking) {
          tracking.validationEndTime = process.hrtime.bigint();
          tracking.executionStartTime = process.hrtime.bigint();
        }

        return undefined;
      },

      async onResolution(
        execution: MercuriusExecutionContext,
        context: MercuriusContext,
      ) {
        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (!tracking) {
          return;
        }

        const endTime = process.hrtime.bigint();
        const duration = adapter.nsToMs(endTime - tracking.startTime);

        // Calculate timing
        const parsingDuration =
          tracking.parsingStartTime && tracking.parsingEndTime
            ? adapter.nsToMs(tracking.parsingEndTime - tracking.parsingStartTime)
            : undefined;

        const validationDuration =
          tracking.validationStartTime && tracking.validationEndTime
            ? adapter.nsToMs(
                tracking.validationEndTime - tracking.validationStartTime,
              )
            : undefined;

        const executionDuration = tracking.executionStartTime
          ? adapter.nsToMs(endTime - tracking.executionStartTime)
          : undefined;

        // Extract request info
        const request = context.reply?.request || context.request;
        const ip = request?.ip;
        const userAgent = request?.headers?.['user-agent'];
        const user = adapter.extractUser({ user: request?.user });

        // Calculate depth
        const depthResult = calculateDepth(tracking.query);

        // N+1 detection
        const n1Warnings = tracking.n1Detector
          ? tracking.n1Detector.detect().warnings
          : [];

        // Sanitize variables
        const sanitizedVariables = adapter.config.captureVariables
          ? sanitizeVariables(
              execution.variables,
              adapter.config.sensitiveVariables,
            )
          : undefined;

        // Truncate query
        const truncatedQuery = truncateQuery(
          tracking.query,
          adapter.config.maxQuerySize,
        );

        // Get field traces
        const fieldTraces =
          tracking.fieldTracer && tracking.fieldTracer.isActive()
            ? tracking.fieldTracer.getTraces()
            : undefined;

        // Determine status code and errors
        const errors = tracking.errors as Array<{
          message: string;
          path?: (string | number)[];
          locations?: { line: number; column: number }[];
          extensions?: Record<string, unknown>;
        }>;
        const hasErrors = errors.length > 0;
        const statusCode = execution.reply?.statusCode || (hasErrors ? 400 : 200);

        // Build payload
        const payload: GraphQLPayload = {
          operationName: tracking.operationName,
          operationType: tracking.operationType,
          query: truncatedQuery,
          queryHash: tracking.queryHash,
          variables: sanitizedVariables,
          duration,
          parsingDuration,
          validationDuration,
          executionDuration,
          statusCode,
          hasErrors,
          errors: hasErrors
            ? errors.map((e) => ({
                message: e.message,
                path: e.path,
                locations: e.locations,
                extensions: e.extensions,
              }))
            : undefined,
          resolverCount: tracking.resolverCount,
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
              operationName: tracking.operationName,
              operationType: tracking.operationType,
              query: tracking.query,
              variables: execution.variables,
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
        await adapter.collectEntry(payload, tracking.requestId);

        // Cleanup
        delete (context as Record<symbol, unknown>)[TRACKING_KEY];
      },

      // Subscription hooks
      async preSubscriptionParsing(
        _schema: unknown,
        source: string,
        context: MercuriusContext,
      ) {
        if (!adapter.config.subscriptions.enabled) {
          return;
        }

        // Similar to preParsing but for subscriptions
        const tracking: RequestTrackingData = {
          requestId: uuidv4(),
          startTime: process.hrtime.bigint(),
          query: source,
          queryHash: hashQuery(source),
          operationName: extractOperationName(source),
          operationType: 'subscription',
          parsingStartTime: process.hrtime.bigint(),
          resolverCount: 0,
          errors: [],
        };

        (context as Record<symbol, unknown>)[TRACKING_KEY] = tracking;
      },

      async preSubscriptionExecution(
        _schema: unknown,
        _document: unknown,
        context: MercuriusContext,
      ) {
        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (tracking) {
          tracking.validationEndTime = process.hrtime.bigint();
          tracking.executionStartTime = process.hrtime.bigint();
        }
      },

      async onSubscriptionResolution(
        execution: MercuriusExecutionContext,
        context: MercuriusContext,
      ) {
        // Handle subscription messages if tracking is enabled
        if (!adapter.config.subscriptions.trackMessages) {
          return;
        }

        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (!tracking) {
          return;
        }

        // Increment resolver count for each message
        tracking.resolverCount++;
      },

      async onSubscriptionEnd(context: MercuriusContext, id: string) {
        const tracking = (context as Record<symbol, unknown>)[
          TRACKING_KEY
        ] as RequestTrackingData | undefined;

        if (!tracking) {
          return;
        }

        const endTime = process.hrtime.bigint();
        const duration = adapter.nsToMs(endTime - tracking.startTime);

        // Build subscription complete payload
        const payload: GraphQLPayload = {
          operationName: tracking.operationName,
          operationType: 'subscription',
          query: truncateQuery(tracking.query, adapter.config.maxQuerySize),
          queryHash: tracking.queryHash,
          duration,
          statusCode: 200,
          hasErrors: false,
          subscriptionId: id,
          subscriptionEvent: 'complete',
          messageCount: tracking.resolverCount,
          subscriptionDuration: duration,
        };

        await adapter.collectEntry(payload, tracking.requestId);

        // Cleanup
        delete (context as Record<symbol, unknown>)[TRACKING_KEY];
      },
    };
  }

  /**
   * Register resolver tracking hook (called externally if needed)
   */
  trackResolver(event: MercuriusResolutionEvent, context: MercuriusContext): void {
    const tracking = (context as Record<symbol, unknown>)[
      TRACKING_KEY
    ] as RequestTrackingData | undefined;

    if (!tracking) {
      return;
    }

    tracking.resolverCount++;

    // N+1 tracking
    if (tracking.n1Detector) {
      tracking.n1Detector.recordCall({
        parentType: event.info.parentType.name,
        fieldName: event.info.fieldName,
      });
    }

    // Field tracing
    if (tracking.fieldTracer && tracking.fieldTracer.isActive()) {
      const path = this.buildFieldPath(event.info.path);
      const traceId = tracking.fieldTracer.startField(
        path,
        event.info.parentType.name,
        event.info.fieldName,
        event.info.returnType.toString(),
      );

      // Return cleanup function (caller should invoke when resolver completes)
      // Note: Mercurius doesn't have built-in resolver tracing hooks,
      // so this would need to be integrated via custom wrapper
      if (traceId) {
        // Store for later cleanup
        (context as Record<string, unknown>)[`_trace_${traceId}`] = () => {
          tracking.fieldTracer!.endField(traceId);
        };
      }
    }
  }

  /**
   * Build field path from path info
   */
  private buildFieldPath(path: {
    key: string | number;
    prev?: { key: string | number };
  }): string {
    const parts: (string | number)[] = [];
    let current: { key: string | number; prev?: unknown } | undefined = path;

    while (current) {
      parts.unshift(current.key);
      current = current.prev as { key: string | number; prev?: unknown } | undefined;
    }

    return parts.join('.');
  }
}

/**
 * Create a Mercurius adapter instance
 */
export function createMercuriusAdapter(): MercuriusAdapter {
  return new MercuriusAdapter();
}
