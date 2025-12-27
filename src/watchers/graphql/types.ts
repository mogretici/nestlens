import { GraphQLWatcherConfig, GraphQLSubscriptionConfig } from '../../nestlens.config';
import { GraphQLFieldTrace, GraphQLPayload, PotentialN1Warning } from '../../types';

/**
 * Resolved GraphQL watcher configuration with defaults applied
 */
export interface ResolvedGraphQLConfig {
  enabled: boolean;
  server: 'apollo' | 'mercurius' | 'auto';
  maxQuerySize: number;
  captureVariables: boolean;
  sensitiveVariables: string[];
  ignoreIntrospection: boolean;
  ignoreOperations: string[];
  traceFieldResolvers: boolean;
  traceSlowResolvers?: number;
  resolverTracingSampleRate: number;
  detectN1Queries: boolean;
  n1Threshold: number;
  subscriptions: ResolvedSubscriptionConfig;
  samplingRate: number;
  captureResponse: boolean;
  maxResponseSize: number;
  tags?: GraphQLWatcherConfig['tags'];
}

/**
 * Subscription transport mode
 * - 'gateway': Use NestJS WebSocket gateway hooks (default)
 * - 'adapter': Use adapter-level transport hooks for direct WS server integration
 * - 'auto': Try gateway first, fallback to adapter-level hooks
 */
export type SubscriptionTransportMode = 'gateway' | 'adapter' | 'auto';

/**
 * Resolved subscription configuration
 */
export interface ResolvedSubscriptionConfig {
  enabled: boolean;
  trackMessages: boolean;
  captureMessageData: boolean;
  maxTrackedMessages: number;
  trackConnectionEvents: boolean;
  /** Transport capture mode */
  transportMode: SubscriptionTransportMode;
  /** Enable debug logging for subscription events */
  debug: boolean;
}

/**
 * Default configuration values
 */
export const GRAPHQL_DEFAULTS = {
  server: 'auto' as const,
  maxQuerySize: 8192, // 8KB
  captureVariables: true,
  sensitiveVariables: [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'authorization',
    'apiSecret',
    'api_secret',
    'privateKey',
    'private_key',
    'creditCard',
    'credit_card',
    'ssn',
    'pin',
  ],
  ignoreIntrospection: true,
  ignoreOperations: [] as string[],
  traceFieldResolvers: false,
  resolverTracingSampleRate: 0.1, // 10% when enabled
  detectN1Queries: true,
  n1Threshold: 10,
  samplingRate: 1.0, // Track all by default
  captureResponse: false,
  maxResponseSize: 64 * 1024, // 64KB
  subscriptions: {
    enabled: true,
    trackMessages: false,
    captureMessageData: false,
    maxTrackedMessages: 100,
    trackConnectionEvents: true,
    transportMode: 'auto' as const,
    debug: false,
  },
};

/**
 * Resolve configuration with defaults
 */
export function resolveGraphQLConfig(
  config?: boolean | GraphQLWatcherConfig,
): ResolvedGraphQLConfig {
  if (config === false) {
    return {
      ...GRAPHQL_DEFAULTS,
      enabled: false,
      subscriptions: { ...GRAPHQL_DEFAULTS.subscriptions },
    };
  }

  if (config === true || config === undefined) {
    return {
      ...GRAPHQL_DEFAULTS,
      enabled: true,
      subscriptions: { ...GRAPHQL_DEFAULTS.subscriptions },
    };
  }

  const subscriptions = config.subscriptions ?? {};

  return {
    enabled: config.enabled !== false,
    server: config.server ?? GRAPHQL_DEFAULTS.server,
    maxQuerySize: config.maxQuerySize ?? GRAPHQL_DEFAULTS.maxQuerySize,
    captureVariables: config.captureVariables ?? GRAPHQL_DEFAULTS.captureVariables,
    sensitiveVariables: config.sensitiveVariables ?? GRAPHQL_DEFAULTS.sensitiveVariables,
    ignoreIntrospection: config.ignoreIntrospection ?? GRAPHQL_DEFAULTS.ignoreIntrospection,
    ignoreOperations: config.ignoreOperations ?? GRAPHQL_DEFAULTS.ignoreOperations,
    traceFieldResolvers: config.traceFieldResolvers ?? GRAPHQL_DEFAULTS.traceFieldResolvers,
    traceSlowResolvers: config.traceSlowResolvers,
    resolverTracingSampleRate:
      config.resolverTracingSampleRate ?? GRAPHQL_DEFAULTS.resolverTracingSampleRate,
    detectN1Queries: config.detectN1Queries ?? GRAPHQL_DEFAULTS.detectN1Queries,
    n1Threshold: config.n1Threshold ?? GRAPHQL_DEFAULTS.n1Threshold,
    samplingRate: config.samplingRate ?? GRAPHQL_DEFAULTS.samplingRate,
    captureResponse: config.captureResponse ?? GRAPHQL_DEFAULTS.captureResponse,
    maxResponseSize: config.maxResponseSize ?? GRAPHQL_DEFAULTS.maxResponseSize,
    tags: config.tags,
    subscriptions: {
      enabled: subscriptions.enabled ?? GRAPHQL_DEFAULTS.subscriptions.enabled,
      trackMessages: subscriptions.trackMessages ?? GRAPHQL_DEFAULTS.subscriptions.trackMessages,
      captureMessageData:
        subscriptions.captureMessageData ?? GRAPHQL_DEFAULTS.subscriptions.captureMessageData,
      maxTrackedMessages:
        subscriptions.maxTrackedMessages ?? GRAPHQL_DEFAULTS.subscriptions.maxTrackedMessages,
      trackConnectionEvents:
        subscriptions.trackConnectionEvents ??
        GRAPHQL_DEFAULTS.subscriptions.trackConnectionEvents,
      transportMode:
        (subscriptions as { transportMode?: SubscriptionTransportMode }).transportMode ??
        GRAPHQL_DEFAULTS.subscriptions.transportMode,
      debug: (subscriptions as { debug?: boolean }).debug ?? GRAPHQL_DEFAULTS.subscriptions.debug,
    },
  };
}

/**
 * Operation tracking context during execution
 */
export interface OperationContext {
  requestId: string;
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription';
  query: string;
  queryHash: string;
  variables?: Record<string, unknown>;
  startTime: bigint;
  parsingStartTime?: bigint;
  parsingEndTime?: bigint;
  validationStartTime?: bigint;
  validationEndTime?: bigint;
  executionStartTime?: bigint;
  resolverCalls: Map<string, number>;
  fieldTraces: GraphQLFieldTrace[];
  shouldTraceResolvers: boolean;
  ip?: string;
  userAgent?: string;
  user?: {
    id: string | number;
    name?: string;
    email?: string;
  };
  batchIndex?: number;
  batchSize?: number;
  batchId?: string;
}

/**
 * Collected entry data before storage
 */
export interface CollectedGraphQLEntry {
  payload: GraphQLPayload;
  requestId: string;
}

/**
 * Resolver call tracking for N+1 detection
 */
export interface ResolverCallInfo {
  parentType: string;
  fieldName: string;
  count: number;
}

/**
 * Adapter interface for different GraphQL servers
 */
export interface GraphQLAdapter {
  /**
   * Get the adapter type
   */
  readonly type: 'apollo' | 'mercurius';

  /**
   * Check if this adapter is available (dependencies installed)
   */
  isAvailable(): boolean;

  /**
   * Initialize the adapter with configuration
   */
  initialize(config: ResolvedGraphQLConfig): void;

  /**
   * Get the plugin/hook to be registered with the GraphQL server
   */
  getPlugin(): unknown;

  /**
   * Cleanup resources
   */
  destroy?(): void;
}

/**
 * Subscription message for tracking
 */
export interface SubscriptionMessage {
  timestamp: Date;
  data?: unknown;
}
