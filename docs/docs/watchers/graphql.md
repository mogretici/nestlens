---
sidebar_position: 20
---

# GraphQL Watcher

The GraphQL Watcher tracks all GraphQL operations (queries, mutations, and subscriptions) in your NestJS application, capturing detailed information about performance, errors, and N+1 query detection.

## What Gets Captured

- Operation type (query, mutation, subscription)
- Operation name and query string
- Variables (with sensitive value masking)
- Response data (optional)
- GraphQL errors
- Execution timing (parsing, validation, execution)
- Field-level resolver traces (optional)
- N+1 query detection
- Subscription lifecycle events
- Client IP and user agent
- Authenticated user information
- Batch operation tracking

## Supported GraphQL Servers

NestLens automatically detects and supports:

- **Apollo Server** (`@apollo/server`)
- **Mercurius** (Fastify GraphQL)

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    graphql: {
      enabled: true,
      server: 'auto', // 'apollo' | 'mercurius' | 'auto'
      captureVariables: true,
      captureResponse: false,
      ignoreIntrospection: true,
      ignoreOperations: ['HealthCheck'],
      detectN1Queries: true,
      n1Threshold: 10,
      traceFieldResolvers: false,
      subscriptions: {
        enabled: true,
        trackMessages: false,
        trackConnectionEvents: true,
      },
      tags: async (ctx) => {
        return [ctx.operationType, ctx.operationName ?? 'anonymous'];
      },
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable GraphQL tracking |
| `server` | string | `'auto'` | GraphQL server type: 'apollo', 'mercurius', or 'auto' |
| `maxQuerySize` | number | `8192` | Maximum query size to capture (bytes) |
| `captureVariables` | boolean | `true` | Capture operation variables |
| `sensitiveVariables` | string[] | `['password', 'token', ...]` | Variable names to mask |
| `ignoreIntrospection` | boolean | `true` | Ignore introspection queries |
| `ignoreOperations` | string[] | `[]` | Operation names to ignore |
| `traceFieldResolvers` | boolean | `false` | Enable field-level resolver tracing |
| `traceSlowResolvers` | number | `undefined` | Only trace resolvers slower than this (ms) |
| `resolverTracingSampleRate` | number | `0.1` | Sample rate for resolver tracing (0-1) |
| `detectN1Queries` | boolean | `true` | Enable N+1 query detection |
| `n1Threshold` | number | `10` | Resolver call count to trigger N+1 warning |
| `samplingRate` | number | `1.0` | Overall sampling rate (0-1) |
| `captureResponse` | boolean | `false` | Capture response data |
| `maxResponseSize` | number | `65536` | Maximum response size to capture (bytes) |
| `tags` | function | `undefined` | Function to generate custom tags |

### Subscription Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Track subscriptions |
| `trackMessages` | boolean | `false` | Track individual subscription messages |
| `captureMessageData` | boolean | `false` | Capture message payload data |
| `maxTrackedMessages` | number | `100` | Maximum messages to track per subscription |
| `trackConnectionEvents` | boolean | `true` | Track connection/disconnection events |
| `transportMode` | string | `'auto'` | Transport mode: 'gateway', 'adapter', 'auto' |

## Payload Structure

```typescript
interface GraphQLEntry {
  type: 'graphql';
  payload: {
    operationName?: string;           // Operation name (if named)
    operationType: 'query' | 'mutation' | 'subscription';
    query: string;                    // GraphQL query string
    queryHash: string;                // Hash for grouping similar queries
    variables?: Record<string, unknown>;

    // Timing
    duration: number;                 // Total duration (ms)
    parsingDuration?: number;         // Query parsing time (ms)
    validationDuration?: number;      // Query validation time (ms)
    executionDuration?: number;       // Resolver execution time (ms)

    // Response
    statusCode: number;               // HTTP status (200, 400, 500, etc.)
    hasErrors: boolean;               // Whether response contains errors
    errors?: GraphQLErrorInfo[];      // GraphQL errors
    responseData?: unknown;           // Response data (if captured)

    // Performance
    resolverCount?: number;           // Number of resolver calls
    fieldCount?: number;              // Number of fields in selection
    depthReached?: number;            // Maximum query depth

    // N+1 Detection
    potentialN1?: PotentialN1Warning[];

    // Client context
    ip?: string;
    userAgent?: string;
    user?: RequestUser;

    // Batching
    batchIndex?: number;              // Index in batch (0-based)
    batchSize?: number;               // Total batch size
    batchId?: string;                 // Batch identifier

    // Subscriptions
    subscriptionId?: string;
    subscriptionEvent?: 'start' | 'data' | 'error' | 'complete';
    messageCount?: number;
    subscriptionDuration?: number;

    // Field traces (opt-in)
    fieldTraces?: GraphQLFieldTrace[];
  };
}
```

## Usage Example

### Apollo Server Integration

```typescript
import { GraphQLWatcher } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        graphql: true,
      },
    }),
    GraphQLModule.forRootAsync({
      imports: [NestLensModule],
      inject: [GraphQLWatcher],
      useFactory: (graphqlWatcher: GraphQLWatcher) => ({
        autoSchemaFile: true,
        plugins: [graphqlWatcher.getPlugin()],
      }),
    }),
  ],
})
export class AppModule {}
```

### Mercurius Integration

```typescript
import { GraphQLWatcher } from 'nestlens';

// With Fastify adapter
fastify.register(mercurius, {
  schema,
  hooks: graphqlWatcher.getPlugin(),
});
```

## N+1 Query Detection

The GraphQL Watcher automatically detects potential N+1 query issues by tracking resolver call patterns:

```typescript
// Example: N+1 warning
{
  potentialN1: [{
    field: 'posts',
    parentType: 'User',
    count: 50,
    suggestion: 'Consider using DataLoader for User.posts field'
  }]
}
```

Configure N+1 detection:

```typescript
NestLensModule.forRoot({
  watchers: {
    graphql: {
      detectN1Queries: true,
      n1Threshold: 10, // Warn when a resolver is called 10+ times
    },
  },
})
```

## Field-Level Tracing

Enable detailed resolver timing for performance optimization:

```typescript
NestLensModule.forRoot({
  watchers: {
    graphql: {
      traceFieldResolvers: true,
      resolverTracingSampleRate: 0.1, // 10% sampling
      traceSlowResolvers: 50, // Only trace resolvers > 50ms
    },
  },
})
```

## Subscription Tracking

Track WebSocket subscription lifecycle:

```typescript
NestLensModule.forRoot({
  watchers: {
    graphql: {
      subscriptions: {
        enabled: true,
        trackMessages: true, // Track each message
        captureMessageData: false, // Don't capture message content
        trackConnectionEvents: true,
      },
    },
  },
})
```

## Dashboard View

![GraphQL Detail View](/img/screenshots/graphql_detail.png)

In the NestLens dashboard, GraphQL entries appear in the GraphQL tab showing:

- Timeline view of all operations
- Operation type badges (Query, Mutation, Subscription)
- Error highlighting
- N+1 warnings
- Query hash grouping
- Subscription lifecycle events
- Field-level timing waterfall (when enabled)

### Filters Available

- Filter by operation type
- Filter by operation name
- Filter by error status
- Filter by N+1 warnings
- Filter by query hash
- Search by query content

## Sensitive Data Handling

The GraphQL Watcher automatically masks sensitive variables:

- `password`, `token`, `secret`
- `apiKey`, `api_key`
- `accessToken`, `access_token`
- `refreshToken`, `refresh_token`
- `authorization`
- `creditCard`, `credit_card`
- `ssn`, `pin`

Customize sensitive variable detection:

```typescript
NestLensModule.forRoot({
  watchers: {
    graphql: {
      sensitiveVariables: [
        'password',
        'secret',
        'myCustomSecret',
      ],
    },
  },
})
```

## Performance Considerations

- **Introspection**: Ignored by default to reduce noise
- **Sampling**: Use `samplingRate` for high-traffic APIs
- **Field tracing**: Enable only when debugging performance issues
- **Response capture**: Disabled by default to reduce storage

## Related Watchers

- [Request Watcher](./request) - See HTTP layer for GraphQL requests
- [Exception Watcher](./exception) - See resolver exceptions
- [Log Watcher](./log) - See logs during GraphQL execution
- [Query Watcher](./query) - See database queries during resolvers
