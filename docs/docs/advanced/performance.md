---
sidebar_position: 4
---

# Performance Optimization

Learn how to optimize NestLens for minimal performance impact on your application.

## Performance Overview

NestLens is designed for minimal overhead:

- **Request Tracking**: ~0.5-1ms per request
- **Query Tracking**: ~0.1-0.5ms per query
- **Memory Usage**: Less than 50MB typical (with buffering)
- **CPU Impact**: Less than 2% in most applications

## Buffer Configuration

The collector uses buffering to minimize database writes.

### Default Buffer Settings

```typescript
// In CollectorService
private readonly BUFFER_SIZE = 100;      // Entries before flush
private readonly FLUSH_INTERVAL = 1000;  // 1 second
```

### Optimize Buffer Size

Increase buffer size for higher throughput:

```typescript
// In your fork/extension
class OptimizedCollector extends CollectorService {
  private readonly BUFFER_SIZE = 500;      // Larger buffer
  private readonly FLUSH_INTERVAL = 5000;  // Flush every 5 seconds
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
