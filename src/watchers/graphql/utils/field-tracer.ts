/**
 * GraphQL Field Resolver Tracer
 *
 * Provides field-level timing traces for resolver execution.
 * This is disabled by default for performance reasons.
 */

import { GraphQLFieldTrace } from '../../../types';

/**
 * Active trace for a field currently being resolved
 */
interface ActiveTrace {
  path: string;
  parentType: string;
  fieldName: string;
  returnType: string;
  startTime: bigint;
  startOffset: number;
}

/**
 * Field Tracer Configuration
 */
export interface FieldTracerConfig {
  /** Enable tracing (should be checked before creating tracer) */
  enabled: boolean;
  /** Only trace resolvers slower than this threshold (ms) */
  slowThreshold?: number;
  /** Sample rate (0-1) for tracing */
  sampleRate: number;
  /** Maximum number of traces to collect */
  maxTraces: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FieldTracerConfig = {
  enabled: false,
  sampleRate: 0.1,
  maxTraces: 100,
};

/**
 * Field Tracer
 *
 * Collects timing information for GraphQL field resolvers.
 * Should be created per-request when tracing is enabled.
 */
export class FieldTracer {
  private config: FieldTracerConfig;
  private requestStartTime: bigint;
  private traces: GraphQLFieldTrace[] = [];
  private activeTraces: Map<string, ActiveTrace> = new Map();
  private shouldTrace: boolean;

  constructor(requestStartTime: bigint, config: Partial<FieldTracerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.requestStartTime = requestStartTime;

    // Determine if we should trace this request based on sample rate
    this.shouldTrace = this.config.enabled && Math.random() < this.config.sampleRate;
  }

  /**
   * Check if tracing is active for this request
   */
  isActive(): boolean {
    return this.shouldTrace;
  }

  /**
   * Start tracing a field resolution
   *
   * @param path - Full path to the field (e.g., "Query.users.0.posts")
   * @param parentType - Parent type name
   * @param fieldName - Field name
   * @param returnType - Return type name
   * @returns A unique trace ID for this field
   */
  startField(
    path: string,
    parentType: string,
    fieldName: string,
    returnType: string,
  ): string | null {
    if (!this.shouldTrace) {
      return null;
    }

    // Don't trace if we've hit the max
    if (this.traces.length >= this.config.maxTraces) {
      return null;
    }

    // The path is graphql-js's instance path — `orders.0.items.1.product` —
    // which is unique within an operation, so it identifies the trace on its
    // own. It used to carry `Date.now()` as well: a clock read per field, for
    // a distinction the path already makes.
    const traceId = path;
    const now = process.hrtime.bigint();

    this.activeTraces.set(traceId, {
      path,
      parentType,
      fieldName,
      returnType,
      startTime: now,
      startOffset: Number(now - this.requestStartTime),
    });

    return traceId;
  }

  /**
   * End tracing a field resolution
   *
   * @param traceId - The trace ID returned from startField
   */
  endField(traceId: string | null): void {
    if (!traceId || !this.shouldTrace) {
      return;
    }

    const activeTrace = this.activeTraces.get(traceId);
    if (!activeTrace) {
      return;
    }

    this.activeTraces.delete(traceId);

    const endTime = process.hrtime.bigint();
    const durationNs = Number(endTime - activeTrace.startTime);

    // Check slow threshold (convert ns to ms)
    const durationMs = durationNs / 1_000_000;
    if (this.config.slowThreshold !== undefined && durationMs < this.config.slowThreshold) {
      return; // Skip fast resolvers
    }

    // Don't add more than max traces
    if (this.traces.length >= this.config.maxTraces) {
      return;
    }

    this.traces.push({
      path: activeTrace.path,
      parentType: activeTrace.parentType,
      fieldName: activeTrace.fieldName,
      returnType: activeTrace.returnType,
      startOffset: activeTrace.startOffset,
      duration: durationNs,
    });
  }

  /**
   * Get all collected traces
   */
  getTraces(): GraphQLFieldTrace[] {
    // Sort by start offset for waterfall display
    return [...this.traces].sort((a, b) => a.startOffset - b.startOffset);
  }
}

/**
 * Create a field tracer for a request
 */
export function createFieldTracer(
  requestStartTime: bigint,
  config: Partial<FieldTracerConfig> = {},
): FieldTracer {
  return new FieldTracer(requestStartTime, config);
}
