---
sidebar_position: 1
title: API Reference
---

# API Reference

Complete API documentation for NestLens.

## Core Exports

### NestLensModule

The main module to import in your NestJS application.

```typescript
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      enabled: true,
      path: '/nestlens',
    }),
  ],
})
export class AppModule {}
```

### Configuration Interface

```typescript
interface NestLensConfig {
  /** Enable or disable NestLens (default: true) */
  enabled?: boolean;

  /** Dashboard path (default: '/nestlens') */
  path?: string;

  /** Watcher configurations */
  watchers?: WatchersConfig;

  /** Storage configuration */
  storage?: StorageConfig;

  /** Pruning configuration */
  pruning?: PruningConfig;

  /** Rate limiting configuration (set to false to disable) */
  rateLimit?: RateLimitConfig | false;

  /** Authorization configuration */
  authorization?: AuthorizationConfig;

  /** Single entry filter function */
  filter?: (entry: Entry) => boolean | Promise<boolean>;

  /** Batch entry filter function */
  filterBatch?: (entries: Entry[]) => Entry[] | Promise<Entry[]>;
}
```

## Authorization Configuration

```typescript
interface AuthorizationConfig {
  /** Allowed environments (default: ['development', 'local', 'test'])
   *  Set to null to allow all environments */
  allowedEnvironments?: string[] | null;

  /** Environment variable to check (default: 'NODE_ENV') */
  environmentVariable?: string;

  /** Allowed IP addresses (supports wildcards like '192.168.1.*') */
  allowedIps?: string[];

  /** Custom access control function - can return boolean or AuthUser */
  canAccess?: (req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>;

  /** Required roles for access (user must have ALL specified roles) */
  requiredRoles?: string[];
}

interface AuthUser {
  id: string | number;
  email?: string;
  name?: string;
  roles?: string[];
  [key: string]: unknown;  // Additional custom properties
}
```

## Rate Limit Configuration

```typescript
interface RateLimitConfig {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;

  /** Max requests per window per IP (default: 100) */
  maxRequests?: number;
}
```

## Storage Configuration

```typescript
interface StorageConfig {
  /** Storage driver (default: 'memory') */
  driver?: 'memory' | 'sqlite' | 'redis';

  /** In-memory storage config */
  memory?: {
    maxEntries?: number;  // default: 10000
  };

  /** SQLite storage config (requires better-sqlite3) */
  sqlite?: {
    filename?: string;  // default: '.cache/nestlens.db'
  };

  /** Redis storage config (requires ioredis) */
  redis?: {
    host?: string;      // default: 'localhost'
    port?: number;      // default: 6379
    password?: string;
    db?: number;        // default: 0
    keyPrefix?: string; // default: 'nestlens:'
    url?: string;       // overrides other options
  };
}
```

## Pruning Configuration

```typescript
interface PruningConfig {
  /** Enable automatic pruning (default: true) */
  enabled?: boolean;

  /** Maximum age in hours (default: 24) */
  maxAge?: number;

  /** Pruning interval in minutes (default: 60) */
  interval?: number;
}
```

## Watchers Configuration

```typescript
interface WatchersConfig {
  request?: boolean | RequestWatcherConfig;   // default: true
  query?: boolean | QueryWatcherConfig;       // default: true
  exception?: boolean | ExceptionWatcherConfig; // default: true
  log?: boolean | LogWatcherConfig;           // default: true
  cache?: boolean | CacheWatcherConfig;       // default: false
  event?: boolean | EventWatcherConfig;       // default: false
  job?: boolean | JobWatcherConfig;           // default: false
  schedule?: boolean | ScheduleWatcherConfig; // default: false
  mail?: boolean | MailWatcherConfig;         // default: false
  httpClient?: boolean | HttpClientWatcherConfig; // default: false
  redis?: boolean | RedisWatcherConfig;       // default: false
  model?: boolean | ModelWatcherConfig;       // default: false
  notification?: boolean | NotificationWatcherConfig; // default: false
  view?: boolean | ViewWatcherConfig;         // default: false
  command?: boolean | CommandWatcherConfig;   // default: false
  gate?: boolean | GateWatcherConfig;         // default: false
  batch?: boolean | BatchWatcherConfig;       // default: false
  dump?: boolean | DumpWatcherConfig;         // default: false
}
```

## Entry Types

NestLens uses discriminated union types for entries:

```typescript
type EntryType =
  | 'request'
  | 'query'
  | 'exception'
  | 'log'
  | 'cache'
  | 'event'
  | 'job'
  | 'schedule'
  | 'mail'
  | 'http-client'
  | 'redis'
  | 'model'
  | 'notification'
  | 'view'
  | 'command'
  | 'gate'
  | 'batch'
  | 'dump';

interface Entry {
  id?: number;
  type: EntryType;
  payload: EntryPayload;  // Type-specific payload
  requestId?: string;
  createdAt?: string;
  familyHash?: string;
  tags?: string[];
  resolvedAt?: string;
}
```

## Services

### CollectorService

Collect custom entries programmatically:

```typescript
import { CollectorService } from 'nestlens';

@Injectable()
export class MyService {
  constructor(private collector: CollectorService) {}

  async trackCustomEvent() {
    // Buffered collection (batched for performance)
    await this.collector.collect('event', {
      name: 'custom-event',
      payload: { data: 'value' },
      listeners: [],
      duration: 0,
    });
  }

  async trackCriticalEvent() {
    // Immediate collection (bypasses buffer)
    await this.collector.collectImmediate('exception', {
      name: 'CriticalError',
      message: 'Something critical happened',
      context: 'HTTP',
    });
  }

  // Pause/resume collection
  pauseCollection() {
    this.collector.pause('maintenance');
  }

  resumeCollection() {
    this.collector.resume();
  }
}
```

### NestLensLogger

Custom logger that integrates with NestLens:

```typescript
import { NestLensLogger } from 'nestlens';

@Injectable()
export class MyService {
  private readonly logger = new NestLensLogger(MyService.name);

  doSomething() {
    this.logger.verbose('Detailed info');
    this.logger.debug('Debug info');
    this.logger.log('General info');
    this.logger.warn('Warning message');
    this.logger.error('Error occurred', error.stack);
  }
}
```

### StorageInterface

Implement custom storage backends:

```typescript
import { StorageInterface, Entry, STORAGE } from 'nestlens';

@Injectable()
export class CustomStorage implements StorageInterface {
  // Basic CRUD
  async save(entry: Entry): Promise<Entry> { /* ... */ }
  async saveBatch(entries: Entry[]): Promise<Entry[]> { /* ... */ }
  async find(filter: EntryFilter): Promise<Entry[]> { /* ... */ }
  async findById(id: number): Promise<Entry | null> { /* ... */ }
  async findWithCursor(type: EntryType | undefined, params: CursorPaginationParams): Promise<CursorPaginatedResponse<Entry>> { /* ... */ }

  // Counting & Sequence
  async count(type?: EntryType): Promise<number> { /* ... */ }
  async getLatestSequence(type?: EntryType): Promise<number | null> { /* ... */ }
  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> { /* ... */ }

  // Statistics
  async getStats(): Promise<EntryStats> { /* ... */ }
  async getStorageStats(): Promise<StorageStats> { /* ... */ }

  // Data Management
  async prune(before: Date): Promise<number> { /* ... */ }
  async pruneByType(type: EntryType, before: Date): Promise<number> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
  async close(): Promise<void> { /* ... */ }

  // Tag Operations
  async addTags(entryId: number, tags: string[]): Promise<void> { /* ... */ }
  async removeTags(entryId: number, tags: string[]): Promise<void> { /* ... */ }
  async getEntryTags(entryId: number): Promise<string[]> { /* ... */ }
  async getAllTags(): Promise<TagWithCount[]> { /* ... */ }
  async findByTags(tags: string[], logic?: 'AND' | 'OR', limit?: number): Promise<Entry[]> { /* ... */ }

  // Resolution
  async resolveEntry(id: number): Promise<void> { /* ... */ }
  async unresolveEntry(id: number): Promise<void> { /* ... */ }

  // Family Hash (Grouping)
  async updateFamilyHash(id: number, familyHash: string): Promise<void> { /* ... */ }
  async findByFamilyHash(familyHash: string, limit?: number): Promise<Entry[]> { /* ... */ }
}

// Register custom storage
@Module({
  providers: [
    {
      provide: STORAGE,
      useClass: CustomStorage,
    },
  ],
})
```

## Injection Tokens

### Exported Tokens

These tokens are available for import:

```typescript
import {
  STORAGE,
  NESTLENS_CONFIG,
  NESTLENS_EVENT_EMITTER,
  NESTLENS_REDIS_CLIENT,
  NESTLENS_BULL_QUEUES,
  NESTLENS_MODEL_SUBSCRIBER,
  NESTLENS_NOTIFICATION_SERVICE,
  NESTLENS_VIEW_ENGINE,
  REQUEST_ID_HEADER,  // 'x-nestlens-request-id'
} from 'nestlens';
```

### Internal Tokens

These tokens exist internally but are not exported. They are used by NestLens watchers:

- `NESTLENS_COMMAND_BUS` - Command watcher
- `NESTLENS_GATE_SERVICE` - Gate watcher
- `NESTLENS_BATCH_PROCESSOR` - Batch watcher
- `NESTLENS_DUMP_SERVICE` - Dump watcher
- `NESTLENS_MAILER_SERVICE` - Mail watcher
- `NESTLENS_HTTP_CLIENT` - HTTP Client watcher
- `NESTLENS_SCHEDULER_REGISTRY` - Schedule watcher

## Watcher-Specific Configurations

### RequestWatcherConfig

```typescript
interface RequestWatcherConfig {
  enabled?: boolean;
  ignorePaths?: string[];
  maxBodySize?: number;           // bytes, default: 64 * 1024 (64KB)
  captureHeaders?: boolean;       // default: true
  captureBody?: boolean;          // default: true
  captureResponse?: boolean;      // default: true
  captureUser?: boolean;          // default: true
  captureSession?: boolean;       // default: true
  captureResponseHeaders?: boolean; // default: true
  captureControllerInfo?: boolean;  // default: true
  tags?: (req: Request) => string[] | Promise<string[]>;
}
```

### QueryWatcherConfig

```typescript
interface QueryWatcherConfig {
  enabled?: boolean;
  slowThreshold?: number;  // milliseconds, default: 100
  ignorePatterns?: RegExp[];
}
```

### ExceptionWatcherConfig

```typescript
interface ExceptionWatcherConfig {
  enabled?: boolean;
  ignoreExceptions?: string[];  // Exception class names to ignore
}
```

### LogWatcherConfig

```typescript
interface LogWatcherConfig {
  enabled?: boolean;
  minLevel?: 'debug' | 'log' | 'warn' | 'error';
}
```

### HttpClientWatcherConfig

```typescript
interface HttpClientWatcherConfig {
  enabled?: boolean;
  maxBodySize?: number;              // bytes, default: 64 * 1024
  captureRequestBody?: boolean;      // default: true
  captureResponseBody?: boolean;     // default: true
  ignoreHosts?: string[];
  sensitiveHeaders?: string[];       // Added to defaults
  sensitiveRequestParams?: string[]; // Fields to mask in request body
  sensitiveResponseParams?: string[]; // Fields to mask in response body
}
```

### RedisWatcherConfig

```typescript
interface RedisWatcherConfig {
  enabled?: boolean;
  ignoreCommands?: string[];
  maxResultSize?: number;  // bytes, default: 1024
}
```

### ModelWatcherConfig

```typescript
interface ModelWatcherConfig {
  enabled?: boolean;
  ignoreEntities?: string[];
  captureData?: boolean;  // default: false
}
```

### JobWatcherConfig

```typescript
interface JobWatcherConfig {
  enabled?: boolean;
}
```

### CommandWatcherConfig

```typescript
interface CommandWatcherConfig {
  enabled?: boolean;
  capturePayload?: boolean;  // default: true
  captureResult?: boolean;   // default: true
  maxPayloadSize?: number;   // bytes, default: 64 * 1024
}
```

### GateWatcherConfig

```typescript
interface GateWatcherConfig {
  enabled?: boolean;
  captureContext?: boolean;  // default: true
  ignoreAbilities?: string[];
}
```

### BatchWatcherConfig

```typescript
interface BatchWatcherConfig {
  enabled?: boolean;
  trackMemory?: boolean;  // default: true
}
```

## Internal Constants

These values are used internally by NestLens and are not exported:

| Constant | Value | Description |
|----------|-------|-------------|
| `BUFFER_SIZE` | `100` | Entries buffered before automatic flush |
| `FLUSH_INTERVAL` | `1000` | Flush interval in milliseconds |

### Default Sensitive Headers

The following headers are automatically masked in captured data:

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`

You can add additional headers via `HttpClientWatcherConfig.sensitiveHeaders`.

## Full Documentation

For detailed documentation on each watcher and feature, see:

- [Getting Started](/docs/getting-started/installation)
- [Configuration](/docs/configuration/basic-config)
- [Watchers Overview](/docs/watchers/overview)
- [Security](/docs/security/access-control)
