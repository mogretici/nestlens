import { GraphQLWatcherConfig } from '../../nestlens.config';
import { MaskingTerms, replacesDefaults, resolveMaskingTerms } from '../../core/masking-terms';
import { GraphQLFieldTrace, GraphQLPayload } from '../../types';

/**
 * Resolved GraphQL watcher configuration with defaults applied
 */
export interface ResolvedGraphQLConfig {
  enabled: boolean;
  server: 'apollo' | 'mercurius' | 'auto';
  maxQuerySize: number;
  captureVariables: boolean;
  maxVariablesSize: number;
  sensitiveVariables: string[];
  captureHeaders: boolean;
  sensitiveHeaders: string[];
  ignoreIntrospection: boolean;
  ignoreOperations: string[];
  traceFieldResolvers: boolean;
  traceSlowResolvers?: number;
  resolverTracingSampleRate: number;
  detectN1Queries: boolean;
  recordExceptions: boolean;
  n1Threshold: number;
  subscriptions: ResolvedSubscriptionConfig;
  samplingRate: number;
  captureResponse: boolean;
  maxResponseSize: number;
  tags?: GraphQLWatcherConfig['tags'];
  /**
   * Whether a forwarding header may be believed.
   *
   * Carried here because the adapters record the client's address and have to
   * answer that the same way the guard authorizes with. See `resolveClientIp`.
   */
  trustProxy?: boolean;
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
  maxVariablesSize: 64 * 1024, // 64KB, as for a response
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
  captureHeaders: true,
  sensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token'],
  ignoreIntrospection: true,
  ignoreOperations: [] as string[],
  traceFieldResolvers: false,
  resolverTracingSampleRate: 0.1, // 10% when enabled
  detectN1Queries: true,
  recordExceptions: true,
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
 * Every term the GraphQL sanitiser masks a field for.
 *
 * Three lists in one, because the sanitised payload is marked and the
 * collector's masker skips what is marked — so anything this list misses is
 * missed for good rather than caught on the way to storage:
 *
 * - the GraphQL defaults above,
 * - `security.dataMasking.sensitiveParams` and the collector's own defaults,
 *   passed in as `collectorTerms`, which is what the mark used to be backed by,
 * - whatever the application configured here.
 *
 * The last of those *adds* to the other two rather than substituting for them.
 * The option read as "also mask these" and was implemented as "mask only
 * these", and the difference was invisible: the collector's second pass masked
 * `password` and `token` afterwards whatever this list said, so nobody could
 * tell their own list had replaced the defaults until the second pass went
 * away.
 *
 * `{ replace: [...] }` is how to mean it, and then it means it completely —
 * the collector's terms go too, because this watcher's mark is what stops the
 * collector looking and there is no point dropping a list on one side of that
 * only for the other side to apply it. Masking GraphQL payloads and nothing
 * else is then exactly what is named here.
 *
 * Deduplicated so the compiled matcher is built from each term once, and one
 * array per resolved configuration — the sanitiser caches its compiled matcher
 * on that array's identity.
 */
function mergeSensitiveVariables(collectorTerms: string[], configured?: MaskingTerms): string[] {
  if (replacesDefaults(configured)) {
    return resolveMaskingTerms([], configured);
  }

  return resolveMaskingTerms(
    [...GRAPHQL_DEFAULTS.sensitiveVariables, ...collectorTerms],
    configured,
  );
}

/**
 * Resolve configuration with defaults
 */
export function resolveGraphQLConfig(
  config?: boolean | GraphQLWatcherConfig,
  collectorTerms: string[] = [],
  trustProxy?: boolean,
): ResolvedGraphQLConfig {
  if (config === false) {
    return {
      ...GRAPHQL_DEFAULTS,
      enabled: false,
      trustProxy,
      sensitiveVariables: mergeSensitiveVariables(collectorTerms),
      subscriptions: { ...GRAPHQL_DEFAULTS.subscriptions },
    };
  }

  if (config === true || config === undefined) {
    return {
      ...GRAPHQL_DEFAULTS,
      enabled: true,
      trustProxy,
      sensitiveVariables: mergeSensitiveVariables(collectorTerms),
      subscriptions: { ...GRAPHQL_DEFAULTS.subscriptions },
    };
  }

  const subscriptions = config.subscriptions ?? {};

  return {
    enabled: config.enabled !== false,
    trustProxy,
    server: config.server ?? GRAPHQL_DEFAULTS.server,
    maxQuerySize: config.maxQuerySize ?? GRAPHQL_DEFAULTS.maxQuerySize,
    maxVariablesSize: config.maxVariablesSize ?? GRAPHQL_DEFAULTS.maxVariablesSize,
    captureVariables: config.captureVariables ?? GRAPHQL_DEFAULTS.captureVariables,
    sensitiveVariables: mergeSensitiveVariables(collectorTerms, config.sensitiveVariables),
    captureHeaders: config.captureHeaders ?? GRAPHQL_DEFAULTS.captureHeaders,
    sensitiveHeaders: resolveMaskingTerms(
      GRAPHQL_DEFAULTS.sensitiveHeaders,
      config.sensitiveHeaders,
    ),
    ignoreIntrospection: config.ignoreIntrospection ?? GRAPHQL_DEFAULTS.ignoreIntrospection,
    ignoreOperations: config.ignoreOperations ?? GRAPHQL_DEFAULTS.ignoreOperations,
    traceFieldResolvers: config.traceFieldResolvers ?? GRAPHQL_DEFAULTS.traceFieldResolvers,
    traceSlowResolvers: config.traceSlowResolvers,
    resolverTracingSampleRate:
      config.resolverTracingSampleRate ?? GRAPHQL_DEFAULTS.resolverTracingSampleRate,
    detectN1Queries: config.detectN1Queries ?? GRAPHQL_DEFAULTS.detectN1Queries,
    recordExceptions: config.recordExceptions ?? GRAPHQL_DEFAULTS.recordExceptions,
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
        subscriptions.trackConnectionEvents ?? GRAPHQL_DEFAULTS.subscriptions.trackConnectionEvents,
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
