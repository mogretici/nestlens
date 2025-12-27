/**
 * GraphQL Watcher Module
 *
 * Provides GraphQL monitoring for NestJS applications with:
 * - Apollo Server and Mercurius support
 * - Query/Mutation/Subscription tracking
 * - N+1 query detection
 * - Field-level resolver tracing (opt-in)
 * - WebSocket subscription tracking
 */

// Main watcher
export { GraphQLWatcher, GRAPHQL_WATCHER, createGraphQLWatcher } from './graphql.watcher';

// Types
export * from './types';

// Adapters
export {
  BaseGraphQLAdapter,
  isPackageAvailable,
} from './adapters/base.adapter';
export { ApolloAdapter, createApolloAdapter } from './adapters/apollo.adapter';
export { MercuriusAdapter, createMercuriusAdapter } from './adapters/mercurius.adapter';

// Subscription support
export {
  ConnectionStore,
  createConnectionStore,
} from './subscription/connection.store';
export {
  SubscriptionTracker,
  createSubscriptionTracker,
} from './subscription/subscription.tracker';
export {
  GraphQLWsMessageType,
  LegacyWsMessageType,
  createGraphQLWsHandlers,
  createWsMessageInterceptor,
  extractConnectionInfo,
} from './subscription/ws-gateway';

// Utils
export {
  hashQuery,
  normalizeQuery,
  truncateQuery,
  extractOperationName,
  extractOperationType,
  isIntrospectionQuery,
  countFields,
  parseQuery,
  formatQuery,
} from './utils/query-parser';

export {
  sanitizeVariables,
  sanitizeResponse,
  createSanitizer,
} from './utils/variable-sanitizer';

export {
  N1Detector,
  createN1Detector,
  detectN1FromMap,
} from './utils/n1-detector';

export {
  calculateDepth,
  calculateDepthFromAST,
  exceedsMaxDepth,
  getDepthDescription,
} from './utils/depth-calculator';

export {
  FieldTracer,
  createFieldTracer,
  noopTracer,
  formatTraceDuration,
  nsToMs,
  buildWaterfall,
} from './utils/field-tracer';
