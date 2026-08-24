import { BaseEntry, RequestUser } from './entry.types';

/**
 * GraphQL operation types
 */
export type GraphQLOperationType = 'query' | 'mutation' | 'subscription';

/**
 * GraphQL error information
 */
/**
 * How many of an operation's errors are recorded.
 *
 * graphql-js stops validating at a hundred, and each error carries a message,
 * a path and a position. One rejected query recorded all of them:
 *
 * ```text
 * { nope0 … nope499 }  ->  400 Bad Request, a 152,749-byte entry
 * ```
 *
 * repeatable by anyone who can reach the endpoint. The first few are what a
 * reader debugging an operation looks at; `errorCount` keeps the rest from
 * being hidden.
 */
export const MAX_RECORDED_ERRORS = 10;

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
  /**
   * The query, mutation or subscription as text.
   *
   * Empty only when a persisted query's hash could not be resolved to one:
   * the server answered, and what it answered is on the entry, but there is no
   * document to show.
   */
  query: string;
  /**
   * An identity for the query text: the same document produces the same hash
   * whichever operation ran it, so two entries can be told apart from two
   * calls of one thing.
   *
   * Shown on the detail page. Nothing groups by it — the comment here used to
   * say "for deduplication", which was an intention, not a behaviour.
   *
   * For a persisted query whose hash the server could not resolve, this is the
   * client's hash: it is the only identity that operation has.
   */
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
  /** GraphQL errors from the response, at most {@link MAX_RECORDED_ERRORS} of them */
  errors?: GraphQLErrorInfo[];
  /** How many errors the response carried, when more than were recorded */
  errorCount?: number;
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
  /** Request headers (sensitive values masked) */
  headers?: Record<string, string>;
  /** Authenticated user info */
  user?: RequestUser;

  // Tagging
  /** Custom tags for this operation */
  tags?: string[];

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
