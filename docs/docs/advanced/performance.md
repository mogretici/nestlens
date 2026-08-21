---
sidebar_position: 4
---

# Performance Optimization

Learn how to optimize NestLens for minimal performance impact on your application.

## Performance Overview

These numbers come from two benchmarks in the repository — run them on your own
hardware rather than trusting the tables. Both were measured on Node 25, Apple
Silicon, with the default configuration and the default in-memory storage.

### One request at a time

`npm run benchmark`:

| | measured |
| --- | --- |
| Added request latency (empty endpoint) | **p50 0.025 ms**, p99 0.18 ms |
| 10,000 entries held in memory | **2.3 MB** |
| Write throughput, memory storage | ~1,500,000 entries/second |
| Write throughput, SQLite storage | ~23,000 entries/second |

The latency figure is the difference between the same application with and
without NestLens, over 2,000 requests after a warm-up.

### Under concurrency

`npm run benchmark:load` runs the application in a process of its own and drives
32 concurrent connections at it, which is the question that matters if you are
leaving NestLens on:

| | GET, no body | POST, 2.5 KB body |
| --- | --- | --- |
| CPU without NestLens | 27 ms / 1,000 requests | 50 ms / 1,000 requests |
| CPU with NestLens, defaults | **55 ms / 1,000 requests** | **87 ms / 1,000 requests** |
| Throughput cost | ~32% | ~18% |
| Idle CPU, dashboard open, nothing arriving | **~0.5%** | |

So roughly **28 microseconds of CPU per request**, plus what the payload costs
to copy. On a service handling 200 requests a second that is about 0.6% of one
core.

Watchers that wrap a library — queries, cache, mail — cost in proportion to how
often that library is called, so an application making twenty queries per
request pays twenty times the per-entry cost rather than the per-request one.

Two things dominate beyond that: the storage driver you choose (SQLite is
roughly sixty times slower to write than memory, and Redis depends on your
network) and how much payload you record. `maxBodySize`, [`sampling`](#sampling)
and the `filter` hook are the levers.

:::note Improved in 0.10.0
The figure above was 200 ms / 1,000 requests before 0.10.0 — 7× what it is now.
Three things were responsible and none of them were the price of the feature:

- in-memory eviction sorted every key on **every save** once the entry cap was
  reached, which is the steady state of a capped storage — 32% of the whole
  process's CPU,
- the collector's masker re-derived the answer for every field name on every
  entry instead of remembering it,
- every request read `process.memoryUsage()` twice, for a figure that is not
  meaningful under concurrency (see [`captureMemory`](#request-watcher-memory)).

If you measured NestLens before 0.10.0 and put it aside, the numbers you got are
not the numbers now.
:::

### Serving the dashboard

The dashboard is a static bundle served by NestLens itself, so it is worth
knowing what it costs the application hosting it:

- Files are read from disk **once** and kept in memory. Serving them is the only
  work per request; the event loop of your application is not blocked reading
  ~1 MB off disk every time somebody opens the dashboard.
- Fingerprinted assets (`assets/*`) are sent with
  `Cache-Control: public, max-age=31536000, immutable`, so a browser that has
  loaded the dashboard once re-fetches nothing until you upgrade NestLens.
- `index.html` is sent with `Cache-Control: no-cache`. It carries the mount
  point injected per request and points at the current bundle, so it is
  revalidated every time — that is what makes the immutable assets safe.
- Scripts, stylesheets and other text assets are **compressed on the way out**,
  in brotli or gzip depending on what the browser asked for. NestLens writes its
  own responses so that your global interceptors cannot rewrite them, which also
  means nothing else in your pipeline compresses them — this does not depend on
  your application having compression middleware installed.

  Measured on the shipped bundle:

  | | uncompressed | brotli |
  |---|---|---|
  | First load (`index.html` + vendor + app + CSS) | 287 KB | **79 KB** |
  | Opening a log, job, cache or similar entry | 95 KB | **26 KB** |
  | Opening a query entry (includes the SQL formatter) | 344 KB | **90 KB** |

  Each file is compressed once per process and then reused, and the work runs on
  zlib's thread pool rather than the event loop. Already-compressed formats
  (PNG, WOFF2, ICO) and bodies under 1 KB are sent as they are — compressing
  them costs CPU and produces the same size or slightly larger.

  Responses carry `Vary: Accept-Encoding`, so a shared cache in front of your
  application stores one entry per encoding instead of serving a brotli body to
  a client that cannot read it.
- Each page and each entry detail view is a separate chunk, fetched when it is
  first needed. Opening a log entry no longer downloads the views for GraphQL,
  mail, models and the other seventeen types you did not open.

  The SQL formatter is the one large exception: it is 230 KB of the query
  detail view, and it runs on first render because that view opens formatted.
  It is downloaded only when you open a query entry, and then cached like every
  other fingerprinted asset.

None of this applies when the dashboard is disabled: no files are read and
nothing is cached.

## Buffer Configuration

The collector uses buffering to minimize database writes.

### Buffer Settings

```typescript
// In CollectorService (hard-coded constants)
private readonly BUFFER_SIZE = 100;           // Entries before flush
private readonly FLUSH_INTERVAL = 1000;       // 1 second
private readonly MAX_BUFFERED_ENTRIES = 1000; // Ceiling while storage is down
```

### When storage stops answering

Entries that could not be written are kept and retried, but only up to
`MAX_BUFFERED_ENTRIES` — past that the oldest are dropped and counted. NestLens
runs inside your process, and its data is disposable in a way your memory is
not.

While storage is failing, flushing moves entirely to the interval timer: an
entry arriving during an outage is buffered and returns immediately rather than
waiting on a write that is going to fail. One error is logged when the outage
starts, and one line when storage answers again, reporting how many entries
were dropped in between.

:::note Not configurable
`BUFFER_SIZE` and `FLUSH_INTERVAL` are `private readonly` constants on `CollectorService`. They are **not** exposed through `NestLensModule.forRoot(...)` and cannot be set via configuration. There is no config option for them today.
:::

### Changing Buffer Behavior

The only way to change these values is to subclass `CollectorService` and provide your subclass for the collector token. Because the fields are `private readonly`, you must redeclare them in the subclass (and re-implement any flush logic that reads them):

```typescript
// Requires extending CollectorService and overriding the relevant fields/methods.
class OptimizedCollector extends CollectorService {
  protected readonly BUFFER_SIZE = 500;      // Larger buffer
  protected readonly FLUSH_INTERVAL = 5000;  // Flush every 5 seconds
}
```

**Trade-offs**:
- **Larger Buffer**: Less frequent writes, more memory usage
- **Smaller Buffer**: More frequent writes, less memory usage

### Flush Strategy

Configure when buffered entries are written:

```typescript
async collect(type: EntryType, payload: any) {
  this.buffer.push({ type, payload });

  // Immediate flush for critical entries
  if (type === 'exception') {
    await this.flush();
    return;
  }

  // Buffer others until full
  if (this.buffer.length >= this.BUFFER_SIZE) {
    await this.flush();
  }
}
```

## Database Optimization

### Indexing Strategy

Create indexes for common queries:

```sql
-- SQLite (default)
CREATE INDEX idx_type ON entries(type);
CREATE INDEX idx_created_at ON entries(createdAt);
CREATE INDEX idx_request_id ON entries(requestId);
CREATE INDEX idx_type_created ON entries(type, createdAt);

-- Compound index for filtered queries
CREATE INDEX idx_type_status ON entries(type, json_extract(payload, '$.statusCode'));
```

### Connection Pooling

Use connection pooling for better performance:

```typescript
// For custom storage backends
const pool = new Pool({
  max: 20,              // Maximum connections
  min: 5,               // Minimum connections
  idleTimeoutMillis: 30000,
});
```

### Batch Operations

Use batch inserts instead of individual saves:

```typescript
// GOOD - Batch insert
async saveBatch(entries: Entry[]): Promise<Entry[]> {
  const placeholders = entries.map(() => '(?, ?, ?, ?)').join(',');
  const values = entries.flatMap(e => [e.type, JSON.stringify(e.payload), e.requestId, e.createdAt]);

  await this.db.run(
    `INSERT INTO entries (type, payload, requestId, createdAt) VALUES ${placeholders}`,
    values
  );
}

// BAD - Individual inserts
for (const entry of entries) {
  await this.save(entry);
}
```

## Pruning Optimization

Configure aggressive pruning to keep database small.

### Optimized Pruning Config

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 6,          // Keep only 6 hours
    interval: 15,       // Prune every 15 minutes
  },
})
```

### Type-Specific Pruning

Implement custom pruning per entry type:

```typescript
class CustomPruningService extends PruningService {
  async prune(): Promise<void> {
    // Keep exceptions longer (24 hours)
    await this.storage.pruneByType('exception', new Date(Date.now() - 24 * 60 * 60 * 1000));

    // Keep requests shorter (1 hour)
    await this.storage.pruneByType('request', new Date(Date.now() - 1 * 60 * 60 * 1000));

    // Keep logs very short (15 minutes)
    await this.storage.pruneByType('log', new Date(Date.now() - 15 * 60 * 1000));
  }
}
```

### Vacuum Database

Periodically vacuum SQLite database:

```typescript
@Cron('0 2 * * *') // Daily at 2 AM
async vacuumDatabase() {
  if (this.storage instanceof SqliteStorage) {
    await this.storage.run('VACUUM');
    this.logger.log('Database vacuumed');
  }
}
```

## Watcher Optimization

### Disable Unused Watchers

Only enable watchers you need:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: true,      // Essential
    exception: true,    // Essential
    query: true,        // Important

    // Disable everything else
    log: false,
    cache: false,
    event: false,
    job: false,
    schedule: false,
    mail: false,
    httpClient: false,
    redis: false,
    model: false,
    notification: false,
    view: false,
    command: false,
    gate: false,
    batch: false,
    dump: false,
  },
})
```

### Optimize Query Watcher

```typescript
NestLensModule.forRoot({
  watchers: {
    query: {
      enabled: true,
      slowThreshold: 500,     // Higher threshold = fewer entries
      ignorePatterns: [
        /^SELECT.*FROM sqlite_/,  // Ignore system tables
        /^PRAGMA/,                 // Ignore pragmas
        /^EXPLAIN/,                // Ignore explains
      ],
    },
  },
})
```

### Optimize Request Watcher

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      captureBody: false,         // Disable body capture
      captureResponse: false,      // Disable response capture
      captureSession: false,       // Disable session capture
      maxBodySize: 0,              // No body capture
      ignorePaths: [
        '/health',
        '/metrics',
        '/favicon.ico',
        '/static/*',
      ],
    },
  },
})
```

Passing a settings block never turns a watcher off — only `false` or
`{ enabled: false }` does. (Before 0.10.0 it did, silently: any configured
watcher recorded nothing at all.)

### Request Watcher Memory

`captureMemory` records how much the heap grew across the handler. It is **off
by default** and should usually stay off:

```typescript
watchers: {
  request: { captureMemory: true },   // default: false
}
```

The figure is `process.memoryUsage().heapUsed` read either side of the handler.
Under concurrency the heap is shared with every other request in flight and a
garbage collection may run between the two readings, so the number is mostly
noise: measured on an endpoint returning `{ok: true}`, it ranged from **-570 KB
to +671 KB** and came out negative once in thirty. Reading it twice per request
cost about 2.5% of the process's CPU.

Turn it on where the application handles one thing at a time — a local
reproduction, a worker — and the number means something.

## Shutting Down

The last thing NestLens does on shutdown is flush whatever is still buffered.
That flush has a **three-second deadline**, after which the application finishes
shutting down without it.

The deadline exists because a storage that has stopped answering does not fail
the flush — it never returns. Awaiting it meant `app.close()` never resolved,
SIGTERM did nothing, and the process waited for whatever eventually killed it.
An unreachable Redis was enough to leave a rolling deploy hanging.

Measured against a storage whose `save` never settles:

| storage | `app.close()` |
| --- | --- |
| healthy | 1 ms |
| throwing | 302 ms |
| hanging | never (now: 3 s) |

A normal flush is milliseconds, so the deadline only ever applies when storage
is already failing — and entries it will not accept were not going to be kept
either way.

## Sampling

NestLens records everything by default, which is the point of it. When that is
more than you want to pay for, `sampling` records a fraction of traffic instead:

```typescript
NestLensModule.forRoot({
  sampling: {
    rate: 0.1,              // one request in ten
    always: ['exception'],  // exceptions regardless — this is the default
  },
})
```

The decision is made **per request, from its id**, so a request and everything
recorded under it — its queries, cache reads, logs and outgoing calls — are kept
together or dropped together. A detail page is therefore always complete; you
get fewer requests, not partial ones.

It costs a hash rather than a callback, and it runs before the entry is masked
or buffered, so a dropped entry costs almost nothing. Use `filter` instead when
the rule depends on what is *inside* the entry:

| | use |
| --- | --- |
| "record a tenth of traffic" | `sampling` |
| "record only 4xx and 5xx" | `filter` |
| "record everything for one customer" | `filter`, or a monitored tag |

`rate: 0` records nothing except what `always` names — exceptions only, which is
a reasonable way to run in production if you mostly want the error pages.

## Entry Filtering Performance

### Use Efficient Filters

```typescript
// GOOD - Fast checks
filter: (entry) => {
  if (entry.type === 'request') {
    return entry.payload.statusCode >= 400;
  }
  return true;
}

// BAD - Expensive operations
filter: async (entry) => {
  if (entry.type === 'request') {
    // Database lookup on every entry - SLOW!
    const user = await db.findUser(entry.payload.userId);
    return user.trackingEnabled;
  }
  return true;
}
```

### Cache Filter Results

```typescript
const filterCache = new Map<string, boolean>();

filter: (entry) => {
  const key = `${entry.type}:${entry.payload.path}`;

  if (filterCache.has(key)) {
    return filterCache.get(key);
  }

  const shouldCollect = expensiveFilterLogic(entry);
  filterCache.set(key, shouldCollect);

  return shouldCollect;
}
```

### Use Batch Filters

Batch filtering is more efficient than per-entry:

```typescript
// GOOD - Process batch
filterBatch: (entries) => {
  // Process all at once
  return entries.filter(e => e.type !== 'log' || e.payload.level === 'error');
}

// LESS EFFICIENT - Per-entry
filter: (entry) => {
  return entry.type !== 'log' || entry.payload.level === 'error';
}
```

## Memory Management

### Monitor Memory Usage

```typescript
setInterval(() => {
  const usage = process.memoryUsage();

  if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
    logger.warn('High memory usage, flushing buffers');
    collector.flush();
  }
}, 60000);
```

### Limit Payload Size

```typescript
filter: (entry) => {
  // Truncate large payloads
  if (entry.type === 'request' && entry.payload.body) {
    const bodyStr = JSON.stringify(entry.payload.body);

    if (bodyStr.length > 10000) { // 10KB
      entry.payload.body = {
        _truncated: true,
        _size: bodyStr.length,
      };
    }
  }

  return true;
}
```

### Clear Old Data Aggressively

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 1,          // 1 hour only
    interval: 10,       // Prune every 10 minutes
  },
})
```

## CPU Optimization

### Minimize JSON Operations

```typescript
// GOOD - Avoid unnecessary parsing
async save(entry: Entry): Promise<Entry> {
  const payloadStr = JSON.stringify(entry.payload);
  await this.db.run(
    'INSERT INTO entries (type, payload) VALUES (?, ?)',
    [entry.type, payloadStr]
  );
}

// BAD - Multiple JSON operations
async save(entry: Entry): Promise<Entry> {
  const temp = JSON.parse(JSON.stringify(entry)); // Unnecessary
  const payloadStr = JSON.stringify(temp.payload);
  // ...
}
```

### Use Async Operations

Keep operations non-blocking:

```typescript
// GOOD - Async
async collect(type: EntryType, payload: any) {
  this.buffer.push({ type, payload });

  if (this.buffer.length >= this.BUFFER_SIZE) {
    // Non-blocking flush
    this.flush().catch(err => logger.error(err));
  }
}

// BAD - Blocking
collect(type: EntryType, payload: any) {
  this.buffer.push({ type, payload });

  if (this.buffer.length >= this.BUFFER_SIZE) {
    // Blocks until complete
    this.flushSync();
  }
}
```

## Network Optimization

### Compress Large Entries

```typescript
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

async save(entry: Entry): Promise<Entry> {
  let payload = JSON.stringify(entry.payload);

  // Compress if large
  if (payload.length > 50000) {
    const compressed = await gzipAsync(payload);
    payload = compressed.toString('base64');
    entry.compressed = true;
  }

  // Save compressed payload
  await this.db.save({ ...entry, payload });
}
```

### Batch API Requests

If using external storage:

```typescript
// GOOD - Batch requests
async saveBatch(entries: Entry[]): Promise<Entry[]> {
  return this.api.post('/entries/batch', { entries });
}

// BAD - Individual requests
for (const entry of entries) {
  await this.api.post('/entries', entry);
}
```

## Production Optimizations

### Complete Production Config

```typescript
NestLensModule.forRoot({
  // Minimal watchers
  watchers: {
    request: {
      enabled: true,
      captureBody: false,
      captureResponse: false,
      ignorePaths: ['/health', '/metrics'],
    },
    exception: true,
    // All others disabled
  },

  // Aggressive pruning
  pruning: {
    enabled: true,
    maxAge: 1,       // 1 hour
    interval: 15,    // Every 15 minutes
  },

  // Efficient filtering
  filter: (entry) => {
    // Only errors in production
    if (entry.type === 'request') {
      return entry.payload.statusCode >= 500;
    }
    return entry.type === 'exception';
  },
})
```

### Disable in Production

The safest optimization:

```typescript
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV !== 'production',
})
```

## Benchmarking

### Measure NestLens Impact

```typescript
// Without NestLens
const start = Date.now();
for (let i = 0; i < 1000; i++) {
  await makeRequest();
}
const baseline = Date.now() - start;

// With NestLens
const startWithNestLens = Date.now();
for (let i = 0; i < 1000; i++) {
  await makeRequest();
}
const withNestLens = Date.now() - startWithNestLens;

const overhead = ((withNestLens - baseline) / baseline) * 100;
console.log(`NestLens overhead: ${overhead.toFixed(2)}%`);
```

### Load Testing

```bash
# Use artillery or ab for load testing
artillery quick --count 10 -n 100 http://localhost:3000/api/users

# Monitor performance
node --inspect index.js
```

## Performance Monitoring

### Add Metrics

```typescript
@Injectable()
export class PerformanceMonitor {
  private metrics = {
    entriesCollected: 0,
    entriesFlushed: 0,
    flushDuration: [],
    bufferSize: 0,
  };

  trackCollection() {
    this.metrics.entriesCollected++;
  }

  trackFlush(duration: number, count: number) {
    this.metrics.entriesFlushed += count;
    this.metrics.flushDuration.push(duration);
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgFlushDuration: avg(this.metrics.flushDuration),
      entriesPerSecond: this.metrics.entriesCollected / uptime(),
    };
  }
}
```

### Dashboard Integration

Create a metrics endpoint:

```typescript
@Controller('admin')
export class MetricsController {
  @Get('nestlens/metrics')
  async getMetrics() {
    return {
      bufferSize: collector.getBufferSize(),
      storageSize: await storage.getStorageStats(),
      performance: performanceMonitor.getMetrics(),
    };
  }
}
```

## Best Practices

### 1. Start with Defaults

Begin with default settings, then optimize if needed.

### 2. Measure Before Optimizing

Profile your application to identify actual bottlenecks.

### 3. Test Changes

Benchmark before and after optimization changes.

### 4. Monitor Production

Track NestLens impact in production metrics.

### 5. Disable if Needed

Don't hesitate to disable NestLens in production if performance is critical.

## Troubleshooting

### High Memory Usage

1. Reduce buffer size
2. Enable aggressive pruning
3. Disable body/response capture
4. Add entry filtering

### Slow Response Times

1. Disable unused watchers
2. Use async collection only
3. Optimize filter functions
4. Reduce payload capture

### Database Growth

1. Enable pruning
2. Reduce maxAge
3. Filter more aggressively
4. Implement type-specific retention

## Next Steps

- Create [Custom Watchers](./custom-watchers.md)
- Implement [Custom Storage](./extending-storage.md)
- Configure [Entry Filtering](./filtering-entries.md)
