import { BaseEntry, RequestUser } from './entry.types';

/**
 * GraphQL operation types
 */
export type GraphQLOperationType = 'query' | 'mutation' | 'subscription';

/**
 * GraphQL error information
 */
export interface GraphQLErrorInfo {
  message: string;
  path?: (string | number)[];
  locations?: Array<{
    line: number;
    column: number;
  }>;
  extensions?: Record<string, unknown>;
}

/**
 * Potential N+1 query warning
 */
export interface PotentialN1Warning {
  /** The field that may have N+1 issues */
  field: string;
  /** The parent type of the field */
  parentType: string;
  /** Number of times this resolver was called */
  count: number;
  /** Suggestion for fixing the N+1 issue */
  suggestion: string;
}

/**
 * Field-level trace information (opt-in)
 */
export interface GraphQLFieldTrace {
  /** Full path to the field (e.g., "Query.users.posts") */
  path: string;
  /** Parent type name */
  parentType: string;
  /** Field name */
  fieldName: string;
  /** Return type name */
  returnType: string;
  /** Start offset from request start (nanoseconds) */
  startOffset: number;
  /** Duration in nanoseconds */
  duration: number;
}

/**
 * GraphQL operation context for custom tags
 */
export interface GraphQLOperationContext {
  operationName?: string;
  operationType: GraphQLOperationType;
  query: string;
  variables?: Record<string, unknown>;
  request?: {
    ip?: string;
    userAgent?: string;
    headers?: Record<string, string>;
  };
}

/**
 * GraphQL entry payload
 */
export interface GraphQLPayload {
  // Operation info
  /** Name of the operation (if named) */
  operationName?: string;
  /** Type of operation: query, mutation, or subscription */
  operationType: GraphQLOperationType;
  /** The GraphQL query/mutation/subscription string */
  query: string;
  /** Hash of the query for deduplication and grouping */
  queryHash: string;
  /** Variables passed to the operation (sensitive values masked) */
  variables?: Record<string, unknown>;

  // Timing
  /** Total operation duration in milliseconds */
  duration: number;
  /** Time spent parsing the query (ms) */
  parsingDuration?: number;
  /** Time spent validating the query (ms) */
  validationDuration?: number;
  /** Time spent executing resolvers (ms) */
  executionDuration?: number;

  // Response
  /** HTTP status code (200 for success, 4xx/5xx for errors) */
  statusCode: number;
  /** Whether the response contains any errors */
  hasErrors: boolean;
  /** GraphQL errors from the response */
  errors?: GraphQLErrorInfo[];
  /** Response data (if captured) */
  responseData?: unknown;

  // Performance metrics
  /** Number of resolver calls */
  resolverCount?: number;
  /** Number of fields in the selection set */
  fieldCount?: number;
  /** Maximum depth reached in the query */
  depthReached?: number;

  // N+1 Detection
  /** Potential N+1 query warnings */
  potentialN1?: PotentialN1Warning[];

  // Client context
  /** Client IP address */
  ip?: string;
  /** User agent string */
  userAgent?: string;
  /** Authenticated user info */
  user?: RequestUser;

  // Batching (for batched queries like Apollo batch link)
  /** Index in the batch (0-based) */
  batchIndex?: number;
  /** Total number of operations in the batch */
  batchSize?: number;
  /** Unique ID for the batch */
  batchId?: string;

  // Subscriptions
  /** Unique subscription ID */
  subscriptionId?: string;
  /** Subscription lifecycle event */
  subscriptionEvent?: 'start' | 'data' | 'error' | 'complete';
  /** Number of messages sent (for completed subscriptions) */
  messageCount?: number;
  /** Subscription duration in milliseconds (for completed subscriptions) */
  subscriptionDuration?: number;

  // Field traces (opt-in, disabled by default)
  /** Field-level timing traces */
  fieldTraces?: GraphQLFieldTrace[];
}

/**
 * GraphQL entry type
 */
export interface GraphQLEntry extends BaseEntry {
  type: 'graphql';
  payload: GraphQLPayload;
}

/**
 * Subscription connection state
 */
export interface SubscriptionConnection {
  /** Unique connection ID */
  connectionId: string;
  /** Client IP address */
  ip?: string;
  /** User agent string */
  userAgent?: string;
  /** Connection timestamp */
  connectedAt: Date;
  /** Active subscriptions on this connection */
  activeSubscriptions: Map<string, ActiveSubscription>;
}

/**
 * Active subscription tracking
 */
export interface ActiveSubscription {
  /** Unique subscription ID */
  subscriptionId: string;
  /** GraphQL query/subscription string */
  query: string;
  /** Operation name */
  operationName?: string;
  /** Variables */
  variables?: Record<string, unknown>;
  /** Start timestamp */
  startedAt: Date;
  /** Number of messages sent */
  messageCount: number;
  /** Request ID for correlation */
  requestId?: string;
}
