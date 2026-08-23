/**
 * Mercurius Adapter
 *
 * Implements GraphQL tracking for Mercurius (Fastify GraphQL).
 * Uses Mercurius hooks for request lifecycle tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { MAX_RECORDED_ERRORS, GraphQLPayload } from '../../../types';
import {
  hashQuery,
  truncateQuery,
  extractOperationType,
  extractOperationName,
} from '../utils/query-parser';
import { sanitizeVariables } from '../utils/variable-sanitizer';
import { N1Detector } from '../utils/n1-detector';

/** What Mercurius hands a resolver hook, of which three parts matter here. */
interface ResolverFieldInfo {
  fieldName: string;
  parentType: { name: string };
  returnType: { toString: () => string; ofType?: unknown; getFields?: unknown };
  path: {
    key: string | number;
    prev?: { key: string | number };
  };
}

/**
 * Whether a field could be fetching something.
 *
 * A scalar or an enum is a leaf and cannot be an N+1 however often it is
 * resolved; an object, or a list of them, is the shape one takes. See the same
 * function in the Apollo adapter for what this replaced and why.
 */
const returnsSomethingFetchable = (info: ResolverFieldInfo): boolean => {
  try {
    let type = info.returnType as { ofType?: unknown; getFields?: unknown } | undefined;

    while (type && typeof (type as { ofType?: unknown }).ofType === 'object') {
      type = (type as { ofType?: { ofType?: unknown; getFields?: unknown } }).ofType;
    }

    return typeof type?.getFields === 'function';
  } catch {
    return false;
  }
};
import { calculateDepth } from '../utils/depth-calculator';
import { createFieldTracer, FieldTracer } from '../utils/field-tracer';
import { BaseGraphQLAdapter, isPackageAvailable } from './base.adapter';
import { capturePayload } from '../../capture-payload';
import { recording } from '../never-breaks-the-response';

/**
 * Mercurius context type
 */
interface MercuriusContext {
  /** Fastify's reply, which is what Mercurius puts on the context. */
  reply?: {
    statusCode?: number;
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
 * What `onResolution` is handed first.
 *
 * A GraphQL `ExecutionResult` — the answer, not the request. This was modelled
 * as the request: `operationName`, `query`, `variables` and `reply` were read
 * off it and every one of them was undefined, so the variables were never
 * captured, the status code always came from a fallback, and the errors were
 * read from a tracking array nothing ever wrote to. Every failing operation
 * was recorded as a success. See `mercurius/index.d.ts`:
 *
 *     onResolutionHookHandler(execution: ExecutionResult<TData>, context)
 */
interface MercuriusExecutionResult {
  data?: Record<string, unknown> | null;
  errors?: {
    message: string;
    path?: (string | number)[];
    locations?: { line: number; column: number }[];
    extensions?: Record<string, unknown>;
  }[];
}

/**
 * Mercurius resolution event
 */
interface MercuriusResolutionEvent {
  info: ResolverFieldInfo;
}

/**
 * Mercurius hooks interface
 */
interface MercuriusHooks {
  preParsing?: (schema: unknown, source: string, context: MercuriusContext) => Promise<void>;
  preValidation?: (schema: unknown, document: unknown, context: MercuriusContext) => Promise<void>;
  preExecution?: (
    schema: unknown,
    document: unknown,
    context: MercuriusContext,
    variables?: Record<string, unknown>,
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
  onResolution?: (execution: MercuriusExecutionResult, context: MercuriusContext) => Promise<void>;
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
    execution: MercuriusExecutionResult,
    context: MercuriusContext,
  ) => Promise<void>;
  onSubscriptionEnd?: (context: MercuriusContext, id: string) => Promise<void>;
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
  /** Handed to `preExecution`, and to no other hook. */
  variables?: Record<string, unknown>;
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
    return contained(this.buildHooks());
  }

  private buildHooks(): MercuriusHooks {
    const adapter = this;

    return {
      async preParsing(_schema: unknown, source: string, context: MercuriusContext) {
        // One entry per operation, however many hook sets are registered.
        //
        // NestLens registers its hooks automatically, and `getPlugin()` still
        // exists for the manual wiring that used to be required. An application
        // carrying both runs this twice for one operation: the second call
        // overwrites the tracking data the first stored on the context, and
        // `onResolution` then fires twice — two entries, two of everything on
        // the dashboard. The Apollo adapter guards the same case on the request
        // context; here the context already carries the mark.
        if ((context as Record<symbol, unknown>)[TRACKING_KEY]) {
          return;
        }

        // Check sampling
        if (!adapter.shouldSample()) {
          return;
        }

        const query = source;
        // What the client named, which is the only answer for a document that
        // declares more than one operation. Mercurius does not pass it to a
        // hook; it is on the request body Fastify parsed.
        const requested = (context.reply?.request as { body?: { operationName?: string } })?.body
          ?.operationName;
        const operationName = extractOperationName(query, requested);
        const operationType = extractOperationType(query, requested);

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

      async preValidation(_schema: unknown, _document: unknown, context: MercuriusContext) {
        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

        if (tracking) {
          tracking.parsingEndTime = process.hrtime.bigint();
          tracking.validationStartTime = process.hrtime.bigint();
        }
      },

      async preExecution(
        _schema: unknown,
        _document: unknown,
        context: MercuriusContext,
        variables?: Record<string, unknown>,
      ) {
        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

        if (tracking) {
          tracking.validationEndTime = process.hrtime.bigint();
          tracking.executionStartTime = process.hrtime.bigint();
          // This is the only hook Mercurius hands the variables to. They were
          // read off the `onResolution` argument instead, which is the result,
          // so `captureVariables` recorded nothing on this server.
          tracking.variables = variables;
        }

        return undefined;
      },

      async onResolution(execution: MercuriusExecutionResult, context: MercuriusContext) {
        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

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
            ? adapter.nsToMs(tracking.validationEndTime - tracking.validationStartTime)
            : undefined;

        const executionDuration = tracking.executionStartTime
          ? adapter.nsToMs(endTime - tracking.executionStartTime)
          : undefined;

        // Extract request info
        const request = context.reply?.request ?? context.request;
        const ip = request?.ip;
        const userAgent = request?.headers?.['user-agent'];
        const user = adapter.extractUser({ user: request?.user });
        const headers = adapter.captureRequestHeaders(request);

        // Calculate depth
        const depthResult = calculateDepth(tracking.query);

        // N+1 detection
        const n1Warnings = tracking.n1Detector ? tracking.n1Detector.detect().warnings : [];

        // Sanitized, then bounded; see the Apollo adapter for why.
        const sanitizedVariables = adapter.config.captureVariables
          ? (capturePayload(
              sanitizeVariables(tracking.variables, adapter.config.sensitiveVariables),
              adapter.config.maxVariablesSize,
            ) as Record<string, unknown> | undefined)
          : undefined;

        // Truncate query
        const truncatedQuery = truncateQuery(tracking.query, adapter.config.maxQuerySize);

        // Get field traces
        const fieldTraces = tracking.fieldTracer?.isActive()
          ? tracking.fieldTracer.getTraces()
          : undefined;

        // The result carries the errors. They used to be read from a tracking
        // array nothing ever pushed to, so every failing operation was recorded
        // as a success and the dashboard's error filter never matched one.
        const errors = execution.errors ?? [];
        const hasErrors = errors.length > 0;
        // What the client was actually given. Mercurius answers a failed
        // operation with 200 and the errors in the body, so the old fallback of
        // 400 was reporting a status nobody received.
        const statusCode = context.reply?.statusCode ?? (hasErrors ? 400 : 200);

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
          errorCount: errors.length > MAX_RECORDED_ERRORS ? errors.length : undefined,
          // The first few, and how many there were; see the Apollo adapter.
          errors: hasErrors
            ? errors.slice(0, MAX_RECORDED_ERRORS).map((e) => ({
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
          headers,
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
              variables: tracking.variables,
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
        await adapter.collectEntry(payload, tracking.requestId);

        // Cleanup
        delete (context as Record<symbol, unknown>)[TRACKING_KEY];
      },

      // Subscription hooks
      async preSubscriptionParsing(_schema: unknown, source: string, context: MercuriusContext) {
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
        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

        if (tracking) {
          tracking.validationEndTime = process.hrtime.bigint();
          tracking.executionStartTime = process.hrtime.bigint();
        }
      },

      async onSubscriptionResolution(
        execution: MercuriusExecutionResult,
        context: MercuriusContext,
      ) {
        // Handle subscription messages if tracking is enabled
        if (!adapter.config.subscriptions.trackMessages) {
          return;
        }

        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

        if (!tracking) {
          return;
        }

        // Increment resolver count for each message
        tracking.resolverCount++;
      },

      async onSubscriptionEnd(context: MercuriusContext, id: string) {
        const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
          RequestTrackingData | undefined;

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
   * Records one field resolution, and returns what to call when it ends.
   *
   * Mercurius has no per-field hook of its own, so this is driven from the
   * schema by `instrumentFieldResolvers`. It used to be driven by nothing at
   * all — the comment below said it "would need to be integrated via custom
   * wrapper" — which left `resolverCount`, `detectN1Queries` and
   * `traceFieldResolvers` recording nothing on this server. The trace's end
   * used to be stored on the context under a key nobody read, so every trace
   * stayed open even if the method had been called.
   */
  trackResolver(
    event: MercuriusResolutionEvent,
    context: MercuriusContext,
  ): (() => void) | undefined {
    const tracking = (context as Record<symbol, unknown>)[TRACKING_KEY] as
      RequestTrackingData | undefined;

    if (!tracking) {
      return undefined;
    }

    tracking.resolverCount++;

    // N+1 tracking, for fields that return something there is more to fetch
    // from. See `N1Detector.recordCall`.
    if (tracking.n1Detector && returnsSomethingFetchable(event.info)) {
      tracking.n1Detector.recordCall({
        parentType: event.info.parentType.name,
        fieldName: event.info.fieldName,
      });
    }

    // Field tracing
    const fieldTracer = tracking.fieldTracer;
    if (!fieldTracer?.isActive()) {
      return undefined;
    }

    const traceId = fieldTracer.startField(
      this.buildFieldPath(event.info.path),
      event.info.parentType.name,
      event.info.fieldName,
      event.info.returnType.toString(),
    );

    return traceId ? () => fieldTracer.endField(traceId) : undefined;
  }

  /**
   * Build field path from path info
   */
  private buildFieldPath(path: { key: string | number; prev?: { key: string | number } }): string {
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
 * The same hooks, with each one unable to reach the response.
 *
 * Measured against Mercurius 16: a hook that throws in `onResolution` empties
 * the result and puts its own message in front of the caller —
 * `{"data":null,"errors":[{"message":"watcher blew up"}]}` — so a failure while
 * recording is an answer the application never gave, and its internals in a
 * client's response.
 *
 * Applied to the object rather than to each hook so a hook added later is
 * covered by having been added.
 */
function contained(hooks: MercuriusHooks): MercuriusHooks {
  const guarded: Record<string, unknown> = {};

  for (const [name, hook] of Object.entries(hooks)) {
    if (typeof hook !== 'function') continue;

    guarded[name] = (...args: unknown[]): Promise<void> =>
      recording(`the ${name} hook`, () =>
        (hook as (...hookArgs: unknown[]) => Promise<void>)(...args),
      );
  }

  return guarded as MercuriusHooks;
}

/**
 * Create a Mercurius adapter instance
 */
export function createMercuriusAdapter(): MercuriusAdapter {
  return new MercuriusAdapter();
}
