---
sidebar_position: 1
---

# Watchers Overview

Watchers are the core of NestLens monitoring capabilities. They automatically intercept and track various operations in your NestJS application, collecting detailed telemetry data for analysis in the dashboard.

## What are Watchers?

Watchers are specialized services that hook into different parts of your application to capture telemetry data. Each watcher focuses on a specific aspect of your application (HTTP requests, database queries, exceptions, etc.) and collects relevant information without requiring manual instrumentation.

## Available Watchers

NestLens provides 18 different watchers to cover various aspects of your application:

| Watcher | Type | Default | Description |
|---------|------|---------|-------------|
| [Request](./request) | `request` | Enabled | Tracks HTTP requests and responses |
| [Query](./query) | `query` | Enabled | Monitors database queries (TypeORM, Prisma) |
| [Exception](./exception) | `exception` | Enabled | Captures unhandled exceptions and errors |
| [Log](./log) | `log` | Enabled | Collects application logs |
| [Cache](./cache) | `cache` | Disabled | Tracks cache operations (get, set, delete) |
| [Event](./event) | `event` | Disabled | Monitors event emissions and listeners |
| [Job](./job) | `job` | Disabled | Tracks Bull/BullMQ job execution |
| [Schedule](./schedule) | `schedule` | Disabled | Monitors scheduled tasks (cron jobs) |
| [Mail](./mail) | `mail` | Disabled | Tracks email sending operations |
| [HTTP Client](./http-client) | `http-client` | Disabled | Monitors outgoing HTTP requests |
| [Redis](./redis) | `redis` | Disabled | Tracks Redis commands and operations |
| [Model](./model) | `model` | Disabled | Monitors ORM model operations (CRUD) |
| [Notification](./notification) | `notification` | Disabled | Tracks notification delivery |
| [View](./view) | `view` | Disabled | Monitors template rendering |
| [Command](./command) | `command` | Disabled | Tracks CQRS command execution |
| [Gate](./gate) | `gate` | Disabled | Monitors authorization checks |
| [Batch](./batch) | `batch` | Disabled | Tracks batch/bulk operations |
| [Dump](./dump) | `dump` | Disabled | Monitors database dumps and imports |

## Default Enabled vs Disabled Watchers

### Enabled by Default (4 watchers)

The following watchers are enabled by default because they provide essential monitoring without requiring additional dependencies:

- **Request** - HTTP request/response tracking
- **Query** - Database query monitoring
- **Exception** - Error tracking
- **Log** - Application logging

### Disabled by Default (14 watchers)

Most watchers are disabled by default to avoid overhead and because they require specific integrations or services:

- They may depend on optional packages (Bull, Redis, etc.)
- They capture more detailed data that may not be needed
- They track specialized operations not used in all applications

## How to Enable/Disable Watchers

### Enable a Watcher

To enable a disabled watcher, set it to `true` in your configuration:

```typescript
NestLensModule.forRoot({
  watchers: {
    cache: true,
    mail: true,
    job: true,
  },
})
```

### Disable a Watcher

To disable an enabled watcher, set it to `false`:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: false,
    log: false,
  },
})
```

### Configure a Watcher

For advanced configuration, pass a configuration object instead of a boolean:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      captureBody: true,
      captureHeaders: true,
      maxBodySize: 128 * 1024, // 128KB
      ignorePaths: ['/health', '/metrics'],
    },
    query: {
      enabled: true,
      slowThreshold: 100, // ms
      ignorePatterns: [/^SELECT pg_/],
    },
  },
})
```

## Watcher Configuration Patterns

All watchers follow consistent configuration patterns:

### Basic Pattern

```typescript
interface WatcherConfig {
  enabled?: boolean; // Enable/disable the watcher
}
```

### Common Options

Many watchers share these common configuration options:

```typescript
interface CommonWatcherConfig {
  enabled?: boolean;

  // Filtering
  ignorePatterns?: RegExp[];     // Patterns to ignore
  ignorePaths?: string[];        // Paths to ignore
  ignoreEntities?: string[];     // Entities to ignore

  // Data Capture
  captureData?: boolean;         // Capture payload/data
  captureBody?: boolean;         // Capture request/response bodies
  maxBodySize?: number;          // Maximum body size to capture

  // Sensitive Data
  sensitiveHeaders?: string[];   // Headers to mask
  sensitiveParams?: string[];    // Parameters to mask
}
```

### Performance Options

Some watchers include performance-related options:

```typescript
interface PerformanceConfig {
  slowThreshold?: number;        // Threshold for slow operations (ms)
  trackMemory?: boolean;         // Track memory usage
}
```

## Request Correlation

Watchers automatically correlate entries with HTTP requests when possible. Each request is assigned a unique ID that propagates through related operations:

```typescript
// Request generates ID: abc-123
// Query during that request: references abc-123
// Exception during that request: references abc-123
// Log during that request: references abc-123
```

This correlation allows you to see all operations that occurred during a specific request in the dashboard.

## Performance Considerations

### Memory Usage

Each watcher stores collected data in the configured storage (SQLite by default). Consider:

- Enable only watchers you need
- Configure appropriate pruning settings
- Set reasonable size limits for captured data

### CPU Overhead

Watchers add minimal overhead but consider:

- Use ignore patterns to skip noisy operations
- Disable watchers for high-frequency operations if needed
- Configure size limits to avoid serialization overhead

### Best Practices

1. **Start with defaults** - Enable additional watchers as needed
2. **Use filtering** - Configure ignore patterns to reduce noise
3. **Limit data capture** - Set appropriate size limits
4. **Monitor performance** - Watch for impact on response times
5. **Configure pruning** - Keep storage size manageable

## Next Steps

- Explore individual watcher documentation for detailed configuration
- Configure watchers for your specific use case
- Check the [Configuration Guide](../configuration/basic-config) for global settings
- Review [Authorization](../configuration/authorization) to secure your dashboard
