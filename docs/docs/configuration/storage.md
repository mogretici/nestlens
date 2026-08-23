# Storage Configuration

NestLens supports multiple storage backends to persist monitoring data. Choose the one that best fits your needs.

## Storage Drivers

| Driver | Use Case | Dependencies |
|--------|----------|--------------|
| **Memory** (default) | Development, Docker, Testing | None |
| **SQLite** | Persistent local storage | `better-sqlite3` |
| **Redis** | Production, Distributed | `ioredis` |

## StorageConfig Interface

```typescript
interface StorageConfig {
  driver?: 'memory' | 'sqlite' | 'redis';
  memory?: MemoryStorageConfig;
  sqlite?: SqliteStorageConfig;
  redis?: RedisStorageConfig;
}
```

---

## In-Memory Storage (Default)

Zero configuration, works everywhere including Docker containers. Data is lost when the application restarts.

### Configuration

```typescript
NestLensModule.forRoot({
  // Uses in-memory storage by default - no config needed
})

// Or explicitly:
NestLensModule.forRoot({
  storage: {
    driver: 'memory',
    maxEntries: 10000, // Default: 10000
  },
})
```

### How many entries a store keeps

`storage.maxEntries` applies to every driver, and the oldest go first when it
is reached.

```typescript
NestLensModule.forRoot({
  storage: {
    driver: 'sqlite',
    maxEntries: 50_000, // the ceiling, whichever driver is in use
  },
})
```

:::caution Age alone is not a bound
`pruning.maxAge` deletes what is old; it does not stop a store growing inside
that window. At a thousand requests a second the default twenty-four hours is
eighty-six million entries — enough to fill a disk, or a Redis instance, long
before anything is old enough to be pruned. Leave `maxEntries` set unless
something else bounds the store.

`maxEntries: 0` turns the ceiling off and relies on age alone. It is a
reasonable choice where the volume is known; it is a choice worth making
deliberately.
:::

`storage.memory.maxEntries` still works and still means the same thing. Where
both are given, the driver-specific one wins.

### When to Use

- Local development
- Docker containers without volumes
- Testing environments
- Quick prototyping
- When persistence is not needed

---

## SQLite Storage

Persistent storage using a local SQLite database file. Ideal for development when you need data to survive restarts.

### Installation

```bash
npm install better-sqlite3
```

### Configuration

```typescript
NestLensModule.forRoot({
  storage: {
    driver: 'sqlite',
    sqlite: {
      filename: '.cache/nestlens.db', // Default path
    },
  },
})
```

### SqliteStorageConfig

```typescript
interface SqliteStorageConfig {
  filename?: string;  // Database file path (default: '.cache/nestlens.db')
}
```

### Filename Examples

```typescript
// Default location (recommended)
{ filename: '.cache/nestlens.db' }

// Absolute path
{ filename: '/var/lib/myapp/nestlens.db' }

// Environment-specific
{ filename: `nestlens-${process.env.NODE_ENV}.db` }
```

## Running more than one process

Entries are recorded by the process that handled the request, and read back by
the process that serves the dashboard. When those are not the same process, the
driver decides what you see.

| Topology | `memory` | `sqlite` | `redis` |
| --- | --- | --- | --- |
| One process (`nest start`, a single container) | ✅ | ✅ | ✅ |
| PM2 or Node `cluster`, several workers on one host | ❌ each worker sees only itself | ✅ shared file | ✅ |
| Several replicas of a container | ❌ | ❌ unless the file is on shared storage | ✅ |
| Serverless / short-lived processes | ❌ nothing survives the process | ⚠️ needs a writable, persistent path | ✅ |

With the default in-memory driver in a clustered application, the dashboard
shows whichever worker answered the request: entries appear, a refresh shows a
different set, and live-tail follows one worker only. Nothing is broken — the
entries are real, they are simply spread across processes that cannot see each
other.

NestLens warns at startup when it can tell this is happening:

```
[StorageFactory] In-memory storage in a clustered process: each worker keeps its
own entries, so the dashboard shows only the worker that answered the request.
Use the sqlite or redis driver for one shared view.
```

It can only tell on the same host — several replicas of a container look exactly
like a single process from the inside. If you run more than one, choose `redis`,
or `sqlite` on a volume every replica mounts.

### Upgrading NestLens with an existing database

The database file outlives the version that wrote it, so NestLens migrates it in
place on startup: missing columns are added, missing indexes are created, and
the file is stamped with the schema version it now holds (`PRAGMA user_version`).
Nothing is dropped and nothing is rewritten, so entries recorded by an older
release stay readable.

Going the other way — opening a file with an **older** NestLens than the one
that wrote it — logs a warning:

```
[SqliteStorage] .cache/nestlens.db was written by a newer NestLens
(schema 3, this version reads 2).
```

It still opens and still reads, as far as that version understands the file, but
anything a newer schema added is invisible to it. If you have deliberately
downgraded, point `filename` at a new file instead.

### WAL Mode

SQLite is automatically configured with Write-Ahead Logging (WAL) mode for:

- **Better concurrency** - Readers don't block writers
- **Improved performance** - Faster write operations
- **Crash recovery** - Atomic and durable changes

WAL creates additional files alongside your database:

```
.cache/nestlens.db           # Main database file
.cache/nestlens.db-wal       # Write-ahead log
.cache/nestlens.db-shm       # Shared memory file
```

### When to Use

- Development with persistence needs
- Single-instance deployments
- When you need to inspect data after restart

---

## Redis Storage

Distributed storage using Redis. Ideal for production environments with multiple instances.

### Installation

```bash
npm install ioredis
```

### Configuration

```typescript
// Using URL (recommended for production)
NestLensModule.forRoot({
  storage: {
    driver: 'redis',
    redis: {
      url: process.env.REDIS_URL,
    },
  },
})

// Using individual options
NestLensModule.forRoot({
  storage: {
    driver: 'redis',
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'secret',
      db: 0,
      keyPrefix: 'nestlens:',
    },
  },
})
```

### RedisStorageConfig

```typescript
interface RedisStorageConfig {
  host?: string;          // Redis host (default: 'localhost')
  port?: number;          // Redis port (default: 6379)
  password?: string;      // Redis password
  db?: number;            // Redis database number (default: 0)
  keyPrefix?: string;     // Key prefix (default: 'nestlens:')
  url?: string;           // Connection URL (overrides host/port/password/db)
  commandTimeout?: number; // Command timeout in ms (default: 5000)
}
```

### Redis Key Structure

NestLens uses the following Redis key patterns:

```
{prefix}entries:{id}           # Entry data (Hash)
{prefix}entries:all            # All entry IDs (Sorted Set, score = id)
{prefix}entries:type:{type}    # Entry IDs by type (Sorted Set, score = id)
{prefix}entries:createdAt      # Entry IDs by save time (Sorted Set), used for pruning
{prefix}entries:request:{id}   # Entry IDs by request (Set)
{prefix}entries:sequence       # Counter for entry IDs
{prefix}schema                 # Index layout version; an upgrade rescores once
{prefix}tags:{entryId}         # Tags for entry (Set)
{prefix}tags:index:{tag}       # Entry IDs by tag (Set)
{prefix}tags:counts            # Hash of tag -> count
{prefix}family:{hash}          # Entry IDs by family hash (Set)
{prefix}monitored              # Hash of monitored tags
{prefix}monitored:sequence     # Counter for monitored tag IDs
```

### When to Use

- Production environments
- Multiple application instances
- Horizontal scaling
- When you need shared storage across instances

---

## Database Schema (SQLite)

### nestlens_entries Table

```sql
CREATE TABLE nestlens_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  request_id TEXT,
  payload TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  family_hash TEXT,
  resolved_at TEXT
);

-- Indexes
CREATE INDEX idx_nestlens_type ON nestlens_entries(type);
CREATE INDEX idx_nestlens_request_id ON nestlens_entries(request_id);
CREATE INDEX idx_nestlens_created_at ON nestlens_entries(created_at);
CREATE INDEX idx_nestlens_family_hash ON nestlens_entries(family_hash);
```

### nestlens_tags Table

```sql
CREATE TABLE nestlens_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES nestlens_entries(id) ON DELETE CASCADE
);
```

### nestlens_monitored_tags Table

```sql
CREATE TABLE nestlens_monitored_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Payload Examples

Different entry types store different payload structures:

### Request Entry

```json
{
  "method": "GET",
  "url": "http://localhost:3000/api/users",
  "path": "/api/users",
  "statusCode": 200,
  "duration": 45,
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "controllerAction": "UserController.findAll"
}
```

### Query Entry

```json
{
  "query": "SELECT * FROM users WHERE id = $1",
  "parameters": [123],
  "duration": 12,
  "slow": false,
  "source": "typeorm"
}
```

### Exception Entry

```json
{
  "name": "BadRequestException",
  "message": "Invalid input",
  "stack": "Error: Invalid input\n    at UserController.create...",
  "code": 400
}
```

---

## Best Practices

### Development

```typescript
// Simple in-memory for quick development
NestLensModule.forRoot({})

// SQLite for persistent debugging
NestLensModule.forRoot({
  storage: {
    driver: 'sqlite',
    sqlite: { filename: '.cache/nestlens.db' },
  },
})
```

### Docker

```typescript
// In-memory works without volumes
NestLensModule.forRoot({
  storage: { driver: 'memory' },
})

// Or SQLite with volume mount
NestLensModule.forRoot({
  storage: {
    driver: 'sqlite',
    sqlite: { filename: '/app/data/nestlens.db' },
  },
})
```

### Production

```typescript
NestLensModule.forRoot({
  enabled: process.env.NESTLENS_ENABLED === 'true',
  storage: {
    driver: 'redis',
    redis: { url: process.env.REDIS_URL },
  },
  pruning: {
    enabled: true,
    maxAge: 24,
  },
})
```

### Version Control

Add to `.gitignore`:

```gitignore
# NestLens database files
.cache/
nestlens.db
nestlens.db-wal
nestlens.db-shm
```

---

## Troubleshooting

### SQLite: "Database is locked"

1. WAL mode should handle this automatically
2. Check file permissions
3. Ensure no other processes hold locks

### SQLite: File Permission Issues

```bash
chmod 664 .cache/nestlens.db
chown myapp:myapp .cache/nestlens.db
```

### Redis: Connection Issues

```typescript
// Test connection
import Redis from 'ioredis';
const client = new Redis(process.env.REDIS_URL);
client.ping().then(console.log); // Should print "PONG"
```

### Memory: Data Loss

This is expected behavior. Use SQLite or Redis if you need persistence.

---

## Migration Between Drivers

NestLens doesn't provide automatic migration between storage drivers. When switching:

1. Export important data via the API if needed
2. Change the storage configuration
3. Restart the application
4. Old data will not be available in the new storage

---

## Next Steps

- [Pruning Configuration](./pruning.md) - Automatic data cleanup
- [Basic Configuration](./basic-config.md) - General NestLens settings
- [Rate Limiting Configuration](./rate-limiting.md) - API protection