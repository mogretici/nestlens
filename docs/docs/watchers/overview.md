---
sidebar_position: 1
---

# Watchers Overview

:::info What each watcher guarantees

Five watchers read from NestJS itself and are covered by the 1.0 guarantee; the
rest attach to a third-party library and can break when that library moves. Which
is which, and what that means when it happens, is in
[versioning and support](../getting-started/versioning-and-support.md#watcher-maturity).

:::

Watchers are the core of NestLens monitoring capabilities. They automatically intercept and track various operations in your NestJS application, collecting detailed telemetry data for analysis in the dashboard.

## What are Watchers?

Watchers are specialized services that hook into different parts of your application to capture telemetry data. Each watcher focuses on a specific aspect of your application (HTTP requests, database queries, exceptions, etc.) and collects relevant information without requiring manual instrumentation.

## Available Watchers

NestLens provides 19 different watchers to cover various aspects of your application:

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
| [GraphQL](./graphql) | `graphql` | Disabled | Tracks GraphQL operations and subscriptions |

## Default Enabled vs Disabled Watchers

### Enabled by Default (4 watchers)

The following watchers are enabled by default because they provide essential monitoring without requiring additional dependencies:

- **Request** - HTTP request/response tracking
- **Query** - Database query monitoring
- **Exception** - Error tracking
- **Log** - Application logging

### Disabled by Default (15 watchers)

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

## Is a Watcher Recording?

A watcher that is switched on records only what it can see. The Redis watcher
needs your Redis client, the log watcher needs to be the application's logger,
the job watcher needs your queues. Without them it records nothing, and its tab
looks exactly like a quiet system — a production application had its Redis,
HTTP client and Logs tabs empty for months for this reason.

So every watcher reports one state:

| State | What it means | What to do |
| --- | --- | --- |
| `off` | Switched off in the configuration. | Nothing, or switch it on. |
| `recording` | Attached: what it watches is recorded. | Nothing. An empty tab now means nothing happened. |
| `waiting` | Switched on, with nothing attached: no client handed over, no setup call made, no logger installed. It records nothing. | Follow the fix link, or switch it off with `watchers.<name>: false`. |
| `manual` | Nothing is attached automatically, and it records what your code hands its manual API (`trackCheck`, `trackBatch`, `trackDump`). It turns `recording` at the first call. | Nothing, if your code calls the manual API. |

A state says what is attached, not whether anything has happened: a `recording`
Redis watcher in an application that has sent no command yet still has an empty
tab. It describes the watcher alone, so entries your code records through
[`CollectorService`](../integrations/custom-integrations.md) are listed whatever
the state.

There are three places to read it:

- **At startup**, one warning lists every `waiting` watcher with its reason and
  the page that shows the fix:

  ```text
  WARN [NestLens] 2 enabled watchers are recording nothing, so their tabs stay empty:
    watchers.log: NestLensLogger is not the application logger and nothing has called it: app.useLogger(app.get(NestLensLogger)) installs it. Fix: https://nestlens-docs.vercel.app/docs/watchers/log#using-nestlens-logger
    watchers.redis: No Redis client is provided under NESTLENS_REDIS_CLIENT. Fix: https://nestlens-docs.vercel.app/docs/watchers/redis#provide-redis-client-to-nestlens
  Switch off one you do not use with `watchers.<name>: false`. GET /nestlens/__nestlens__/api/watchers reports every watcher as it is now.
  ```

  It is printed once, when bootstrap is over: after every `onModuleInit`, and
  after the parts of NestLens that attach during `onApplicationBootstrap` — the
  query, schedule and Mercurius integrations — have. A setup call your code
  makes during `onApplicationBootstrap`, such as a queue registered there, may
  not be in it: Nest does not promise an order between modules' bootstrap
  hooks. A call made later is not. With `enabled: false` nothing is printed.
- **`GET /nestlens/__nestlens__/api/watchers`** answers every watcher as it is
  now, behind the same access control as the rest of the API, and AI agents
  reach it through the [MCP server](../integrations/mcp.md) as
  `get_watcher_status`:

  ```json
  {
    "type": "redis",
    "option": "watchers.redis",
    "state": "waiting",
    "reason": "No Redis client is provided under NESTLENS_REDIS_CLIENT.",
    "docs": "https://nestlens-docs.vercel.app/docs/watchers/redis#provide-redis-client-to-nestlens"
  }
  ```

- **In the dashboard**, the page of a watcher that is `waiting`, `off` or
  `manual` says so, with the reason and the page to read, where its table would
  be empty, and the sidebar marks the ones that are `waiting`.

Reading a state costs a field or two, and only when something asks; nothing is
added to the request path.

### What each watcher checks

| Watcher | `recording` when | Otherwise |
| --- | --- | --- |
| Request | It is switched on: it is a global interceptor. | — |
| Exception | No global filter of the application's that takes every exception is tried before it. | `waiting`: a `@Catch()`, `@Catch(Error)` or `@Catch(Object)` filter registered after it — `app.useGlobalFilters()` before the application starts, or `APP_FILTER` in a module imported after `NestLensModule` — takes them first. |
| Query | A TypeORM `DataSource` or a Prisma client was among the providers at bootstrap: a client of Prisma 6.13 or earlier through its `$use` middleware, with or without logging; from 6.14 on, one built with a query log option. | `waiting`: none was; every Prisma client from 6.14 on was built without query logging; or each is recorded by another application in the same process, until that application closes and this one takes it over. A client made with `$extends` is not found: it has neither `$on` nor `$use`. |
| Log | `NestLensLogger` is the application logger (`app.useLogger(app.get(NestLensLogger))`), or something has called it. | `waiting` |
| Cache | A cache manager under `CACHE_MANAGER` was wrapped. | `waiting` |
| Event | An emitter under `NESTLENS_EVENT_EMITTER` was wrapped. | `waiting` |
| Job | `setupQueue()`, `setupBullMQQueue()` or `setupQueueWithEvents()` has registered a queue. | `waiting`, also while `setupBullMQQueue()` waits for its Redis connection. |
| Schedule | `ScheduleModule.forRoot()` from `@nestjs/schedule` is imported. | `waiting` |
| Mail | A mailer under `NESTLENS_MAILER_SERVICE` was wrapped, or `setupMailer()` was called. | `waiting` |
| HTTP Client | An axios instance or `HttpService` under `NESTLENS_HTTP_CLIENT` was wrapped, or `setupInterceptors()` was called. | `waiting` |
| Redis | A client under `NESTLENS_REDIS_CLIENT` had a command it records. | `waiting` |
| Model | An entity subscriber under `NESTLENS_MODEL_SUBSCRIBER` was wrapped, or `setupPrismaClient()` was called. | `waiting` |
| Notification | A service under `NESTLENS_NOTIFICATION_SERVICE` had a send method. | `waiting` |
| View | An engine under `NESTLENS_VIEW_ENGINE` had `render()`. | `waiting` |
| Command | A `CommandBus` under `NESTLENS_COMMAND_BUS` had `execute()`. | `waiting` |
| Gate | A service under `NESTLENS_GATE_SERVICE` was wrapped, or `trackCheck()` was called. | `manual`; `waiting` if what was handed over has nothing to wrap. |
| Batch | A processor under `NESTLENS_BATCH_PROCESSOR` was wrapped, or `trackBatch()` was called. | `manual`; `waiting` if what was handed over has nothing to wrap. |
| Dump | A service under `NESTLENS_DUMP_SERVICE` was wrapped, or `trackDump()` was called. | `manual`; `waiting` if what was handed over has nothing to wrap. |
| GraphQL | Its plugin is registered: an Apollo server started with it, Mercurius accepted its hooks, or `getPlugin()` handed it out to be [wired by hand](./graphql.md#manual-wiring). | `waiting`: no server package, or a plugin no server has taken. |

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
  maxBodySize?: number;          // Maximum body size to capture; 0 captures none

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

## Handing a Watcher Your Service

Several watchers record a client or service the application owns, handed to
them under a token: `NESTLENS_GATE_SERVICE`, `NESTLENS_REDIS_CLIENT`,
`NESTLENS_EVENT_EMITTER`, `NESTLENS_MAILER_SERVICE` and the rest. Provide the
token in any module — `AppModule`, the feature module the service lives in, or
a global one; the watcher looks it up across the application when it starts,
after every provider has been created, async factories included:

```typescript
import { NESTLENS_GATE_SERVICE } from 'nestlens';

@Module({
  providers: [
    AuthorizationService,
    { provide: NESTLENS_GATE_SERVICE, useExisting: AuthorizationService },
  ],
})
export class AuthModule {}
```

The provider has to be a singleton — the default scope. A request- or
transient-scoped one has no single instance to record; the watcher says so in a
warning and records nothing for it.

- **Several providers of one token** — `CacheModule.register()` in two feature
  modules is two `CACHE_MANAGER`s — are all recorded.
- **When it starts.** The host is wrapped in the watcher's `onModuleInit`. Calls
  made before that — from a constructor, or from an `onModuleInit` Nest runs
  first — are not recorded. Nest orders those hooks by module distance, and the
  order has differed between majors, so do not rely on one running before the
  other; a host that replaces its own methods in its `onModuleInit` can drop the
  wrapping.
- **Lazy-loaded modules** (`LazyModuleLoader`) do not exist yet at that point,
  so a token provided only in one is not found.
- **Two `NestLensModule.forRoot()` imports** record a host once.

## Using a Watcher's Manual API

Watchers with a manual API — `GateWatcher.trackCheck`,
`JobWatcher.setupQueue`, `ModelWatcher.setupPrismaClient` and the others — can
be taken in any service's constructor, in any module, without importing
`NestLensModule` again. The watcher is provided whether it is switched on or not,
so the service boots either way; switched off, or with NestLens off, its methods
do nothing and it installs nothing.

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

Each watcher stores collected data in the configured storage (in-memory by default). Consider:

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
