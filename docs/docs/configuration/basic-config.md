# Basic Configuration

NestLens provides a flexible configuration system that allows you to customize its behavior to suit your application's needs. This guide covers the basic configuration options available.

## NestLensConfig Interface

The main configuration interface for NestLens is `NestLensConfig`, which provides options for controlling the overall behavior of the monitoring system.

```typescript
interface NestLensConfig {
  enabled?: boolean;
  path?: string;
  authorization?: AuthorizationConfig;
  storage?: StorageConfig;
  pruning?: PruningConfig;
  rateLimit?: RateLimitConfig | false;
  watchers?: WatchersConfig;
  filter?: (entry: Entry) => boolean | Promise<boolean>;
  filterBatch?: (entries: Entry[]) => Entry[] | Promise<Entry[]>;
}
```

## Core Options

### enabled

Controls whether NestLens is active in your application.

- **Type**: `boolean`
- **Default**: `true`

```typescript
NestLensModule.forRoot({
  enabled: true, // NestLens is active
});
```

You can conditionally enable NestLens based on your environment:

```typescript
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV === 'development',
});
```

### path

Defines the base URL path where the NestLens dashboard and API will be accessible.

- **Type**: `string`
- **Default**: `'/nestlens'`

```typescript
NestLensModule.forRoot({
  path: '/nestlens', // Dashboard at http://localhost:3000/nestlens
});
```

Custom path example:

```typescript
NestLensModule.forRoot({
  path: '/admin/monitoring', // Dashboard at http://localhost:3000/admin/monitoring
});
```

## Watchers Configuration

Watchers are the core monitoring components that collect data about different aspects of your application. Each watcher can be enabled/disabled individually and configured with specific options.

### Basic Watcher Control

You can enable or disable watchers using boolean values:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: true,      // Monitor HTTP requests (enabled by default)
    query: true,        // Monitor database queries (enabled by default)
    exception: true,    // Monitor exceptions (enabled by default)
    log: true,          // Monitor logs (enabled by default)
    cache: false,       // Monitor cache operations (disabled by default)
    event: false,       // Monitor events (disabled by default)
    job: false,         // Monitor queue jobs (disabled by default)
    schedule: false,    // Monitor scheduled tasks (disabled by default)
    mail: false,        // Monitor emails (disabled by default)
    httpClient: false,  // Monitor outgoing HTTP requests (disabled by default)
    redis: false,       // Monitor Redis operations (disabled by default)
    model: false,       // Monitor model operations (disabled by default)
    notification: false, // Monitor notifications (disabled by default)
    view: false,        // Monitor view rendering (disabled by default)
    command: false,     // Monitor CQRS commands (disabled by default)
    gate: false,        // Monitor authorization gates (disabled by default)
    batch: false,       // Monitor batch operations (disabled by default)
    dump: false,        // Monitor dump/debug operations (disabled by default)
  },
});
```

### Advanced Watcher Configuration

For more control, you can pass configuration objects to individual watchers:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      ignorePaths: ['/health', '/metrics'],
      captureHeaders: true,
      captureBody: true,
      captureResponse: true,
      maxBodySize: 65536, // 64KB
    },
    query: {
      enabled: true,
      slowThreshold: 100, // Log queries slower than 100ms
      ignorePatterns: [/^SELECT 1$/],
    },
    exception: {
      enabled: true,
      ignoreExceptions: ['NotFoundException'],
    },
    log: {
      enabled: true,
      minLevel: 'warn', // Only capture warnings and errors
    },
  },
});
```

## Entry Filtering

NestLens provides two filtering mechanisms to control which entries are collected:

### Single Entry Filter

Process entries one at a time:

```typescript
NestLensModule.forRoot({
  filter: (entry: Entry) => {
    // Skip health check requests
    if (entry.type === 'request' && entry.payload.path === '/health') {
      return false;
    }
    return true;
  },
});
```

### Batch Filter

Process multiple entries at once for better performance:

```typescript
NestLensModule.forRoot({
  filterBatch: (entries: Entry[]) => {
    // Keep only errors and slow queries
    return entries.filter(entry => {
      if (entry.type === 'exception') return true;
      if (entry.type === 'query' && entry.payload.duration > 1000) return true;
      return false;
    });
  },
});
```

## Complete Configuration Example

Here's a comprehensive configuration example combining all basic options:

```typescript
import { Module } from '@nestjs/common';
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      // General settings
      enabled: process.env.NODE_ENV !== 'production',
      path: '/nestlens',

      // Authorization
      authorization: {
        allowedEnvironments: ['development', 'local', 'test'],
        environmentVariable: 'NODE_ENV',
        allowedIps: ['127.0.0.1', '192.168.1.*'],
      },

      // Storage (memory is default, no config needed)
      storage: {
        driver: 'sqlite',
        sqlite: { filename: '.cache/nestlens.db' },
      },

      // Pruning
      pruning: {
        enabled: true,
        maxAge: 24, // Keep data for 24 hours
        interval: 60, // Run pruning every 60 minutes
      },

      // Rate limiting
      rateLimit: {
        windowMs: 60000, // 1 minute window
        maxRequests: 100, // 100 requests per minute
      },

      // Watchers
      watchers: {
        request: {
          enabled: true,
          ignorePaths: ['/health', '/metrics'],
          captureHeaders: true,
          captureBody: true,
          captureResponse: true,
          captureUser: true,
          captureSession: true,
        },
        query: {
          enabled: true,
          slowThreshold: 100,
        },
        exception: true,
        log: {
          enabled: true,
          minLevel: 'warn',
        },
        cache: true,
        event: true,
        httpClient: {
          enabled: true,
          ignoreHosts: ['localhost'],
          sensitiveHeaders: ['authorization', 'x-api-key'],
          sensitiveRequestParams: ['password', 'creditCard'],
          sensitiveResponseParams: ['accessToken', 'apiKey'],
        },
      },

      // Entry filtering
      filter: (entry) => {
        // Skip internal health checks
        if (entry.type === 'request' && entry.payload.path?.startsWith('/internal')) {
          return false;
        }
        return true;
      },
    }),
  ],
})
export class AppModule {}
```

## Next Steps

For detailed information about specific configuration areas:

- [Authorization Configuration](./authorization.md) - Secure dashboard access
- [Storage Configuration](./storage.md) - Data persistence options
- [Pruning Configuration](./pruning.md) - Automatic data cleanup
- [Rate Limiting Configuration](./rate-limiting.md) - API protection
