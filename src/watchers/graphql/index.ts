/**
 * GraphQL Watcher Module
 *
 * Provides GraphQL monitoring for NestJS applications with:
 * - Apollo Server and Mercurius support
 * - Query/Mutation/Subscription tracking
 * - N+1 query detection
 * - Field-level resolver tracing (opt-in)
 * - WebSocket subscription tracking, instrumented at the schema
 */

// Main watcher
export { GraphQLWatcher, GRAPHQL_WATCHER } from './graphql.watcher';

// Types
export * from './types';

// Adapters
export { BaseGraphQLAdapter, isPackageAvailable } from './adapters/base.adapter';
export { ApolloAdapter, createApolloAdapter } from './adapters/apollo.adapter';
export { MercuriusAdapter, createMercuriusAdapter } from './adapters/mercurius.adapter';

// Subscription support
export { ConnectionStore, createConnectionStore } from './subscription/connection.store';
export {
  SubscriptionTracker,
  createSubscriptionTracker,
} from './subscription/subscription.tracker';
export { instrumentSubscriptions } from './subscription/schema-instrumentation';

// Utils
export {
  hashQuery,
  normalizeQuery,
  truncateQuery,
  extractOperationName,
  extractOperationType,
  formatQuery,
} from './utils/query-parser';

export { sanitizeVariables, sanitizeResponse } from './utils/variable-sanitizer';

export { N1Detector } from './utils/n1-detector';

export { calculateDepth } from './utils/depth-calculator';

export { FieldTracer, createFieldTracer } from './utils/field-tracer';
