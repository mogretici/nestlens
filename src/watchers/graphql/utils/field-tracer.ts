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

    const traceId = `${path}:${Date.now()}`;
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

  /**
   * Get trace statistics
   */
  getStats(): {
    totalTraces: number;
    totalDuration: number;
    avgDuration: number;
    maxDuration: number;
    slowestField: string | null;
  } {
    if (this.traces.length === 0) {
      return {
        totalTraces: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        slowestField: null,
      };
    }

    const durations = this.traces.map((t) => t.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const maxDuration = Math.max(...durations);
    const slowestTrace = this.traces.find((t) => t.duration === maxDuration);

    return {
      totalTraces: this.traces.length,
      totalDuration,
      avgDuration: totalDuration / this.traces.length,
      maxDuration,
      slowestField: slowestTrace?.path || null,
    };
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces = [];
    this.activeTraces.clear();
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

/**
 * No-op tracer for when tracing is disabled
 */
export const noopTracer = {
  isActive: () => false,
  startField: () => null,
  endField: () => {},
  getTraces: () => [],
  getStats: () => ({
    totalTraces: 0,
    totalDuration: 0,
    avgDuration: 0,
    maxDuration: 0,
    slowestField: null,
  }),
  clear: () => {},
};

/**
 * Format trace duration for display
 */
export function formatTraceDuration(nanoseconds: number): string {
  if (nanoseconds < 1_000) {
    return `${nanoseconds}ns`;
  } else if (nanoseconds < 1_000_000) {
    return `${(nanoseconds / 1_000).toFixed(2)}µs`;
  } else if (nanoseconds < 1_000_000_000) {
    return `${(nanoseconds / 1_000_000).toFixed(2)}ms`;
  } else {
    return `${(nanoseconds / 1_000_000_000).toFixed(2)}s`;
  }
}

/**
 * Convert nanoseconds to milliseconds
 */
export function nsToMs(nanoseconds: number): number {
  return nanoseconds / 1_000_000;
}

/**
 * Build a waterfall timeline from traces
 */
export interface WaterfallItem {
  path: string;
  startMs: number;
  durationMs: number;
  percentOfTotal: number;
  depth: number;
}

export function buildWaterfall(
  traces: GraphQLFieldTrace[],
  totalDurationNs: number,
): WaterfallItem[] {
  const totalDurationMs = nsToMs(totalDurationNs);

  return traces.map((trace) => {
    const depth = (trace.path.match(/\./g) || []).length;

    return {
      path: trace.path,
      startMs: nsToMs(trace.startOffset),
      durationMs: nsToMs(trace.duration),
      percentOfTotal: totalDurationMs > 0 ? (nsToMs(trace.duration) / totalDurationMs) * 100 : 0,
      depth,
    };
  });
}
