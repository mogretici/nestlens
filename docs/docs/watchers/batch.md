---
sidebar_position: 18
---

# Batch Watcher

The Batch Watcher tracks batch and bulk operations in your NestJS application, monitoring data processing jobs, import/export operations, and bulk updates.

## What Gets Captured

- Batch operation name
- Operation type (process, import, export, etc.)
- Total items to process
- Successfully processed items
- Failed items
- Processing duration
- Batch size (chunk size)
- Operation status (completed, partial, failed)
- Error messages
- Memory usage

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    batch: {
      enabled: true,
      trackMemory: true,
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable batch tracking |
| `trackMemory` | boolean | `true` | Track memory usage during batch operations |

## Payload Structure

```typescript
interface BatchEntry {
  type: 'batch';
  payload: {
    name: string;               // Batch operation name
    operation: string;          // Operation type
    totalItems: number;         // Total items
    processedItems: number;     // Successfully processed
    failedItems: number;        // Failed items
    duration: number;           // Processing time (ms)
    batchSize?: number;         // Chunk/batch size
    status: 'completed' | 'partial' | 'failed';
    errors?: string[];          // Error messages
    memory?: number;            // Memory delta (bytes)
  };
}
```

## Usage Example

### Provide Batch Processor

```typescript
import { NESTLENS_BATCH_PROCESSOR } from 'nestlens';

@Module({
  providers: [
    BatchService,
    {
      provide: NESTLENS_BATCH_PROCESSOR,
      useExisting: BatchService,
    },
  ],
})
export class AppModule {}
```

### Batch Processing Service

```typescript
@Injectable()
export class BatchService {
  async process(name: string, items: any[], options?: any): Promise<any> {
    // Automatically tracked
    const results = {
      processed: 0,
      failed: 0,
      errors: [],
    };

    for (const item of items) {
      try {
        await this.processItem(item);
        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push(error.message);
      }
    }

    return results;
  }
}
```

### Manual Tracking

Use the `trackBatch` method for custom implementations:

```typescript
import { BatchWatcher } from 'nestlens';

@Injectable()
export class DataImportService {
  constructor(private batchWatcher: BatchWatcher) {}

  async importUsers(file: Express.Multer.File) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const users = await this.parseFile(file);
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        await this.userRepository.create(user);
        processed++;
      } catch (error) {
        failed++;
        errors.push(`User ${user.email}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    const memory = process.memoryUsage().heapUsed - startMemory;

    // Track batch operation
    this.batchWatcher.trackBatch(
      'user-import',
      'import',
      users.length,
      processed,
      failed,
      duration,
      {
        batchSize: 100,
        errors,
        memory,
      },
    );

    return { processed, failed, errors };
  }
}
```

### Chunked Processing

```typescript
@Injectable()
export class BulkEmailService {
  async sendBulkEmails(recipients: string[], template: string) {
    const BATCH_SIZE = 50;
    const chunks = this.chunk(recipients, BATCH_SIZE);

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const chunk of chunks) {
      const { processed, failed } = await this.processBatch(
        'bulk-email',
        chunk,
        { batchSize: BATCH_SIZE },
      );

      totalProcessed += processed;
      totalFailed += failed;
    }

    return { totalProcessed, totalFailed };
  }

  private chunk<T>(array: T[], size: number): T[][] {
    return Array.from(
      { length: Math.ceil(array.length / size) },
      (_, i) => array.slice(i * size, i * size + size),
    );
  }
}
```

### Data Export

```typescript
@Injectable()
export class ReportService {
  async exportUserReport(): Promise<Buffer> {
    const startTime = Date.now();
    const users = await this.userRepository.find();

    const csvData = await this.convertToCSV(users);
    const duration = Date.now() - startTime;

    // Track export operation
    this.batchWatcher.trackBatch(
      'user-report',
      'export',
      users.length,
      users.length,
      0,
      duration,
    );

    return Buffer.from(csvData);
  }
}
```

## Dashboard View

In the NestLens dashboard, batch entries show:

- Batch operation timeline
- Success/failure rates
- Most resource-intensive batches
- Processing time trends
- Memory usage per operation
- Error analysis
- Throughput metrics

## Batch Status

The watcher automatically determines status:

- **completed**: All items processed successfully (failedItems = 0)
- **partial**: Some items failed (processed > 0 && failed > 0)
- **failed**: All items failed (processedItems = 0)

```typescript
// Example statuses
{ totalItems: 100, processed: 100, failed: 0 }  // status: 'completed'
{ totalItems: 100, processed: 80, failed: 20 }  // status: 'partial'
{ totalItems: 100, processed: 0, failed: 100 }  // status: 'failed'
```

## Error Tracking

```typescript
async processBatch(items: any[]) {
  const errors: string[] = [];

  for (const item of items) {
    try {
      await this.processItem(item);
    } catch (error) {
      // Collect errors for dashboard
      errors.push(`Item ${item.id}: ${error.message}`);
    }
  }

  // Errors shown in dashboard
  return { errors };
}
```

## Memory Tracking

Monitor memory usage during batch operations:

```typescript
NestLensModule.forRoot({
  watchers: {
    batch: {
      trackMemory: true, // Track heap memory delta
    },
  },
})

// Dashboard shows memory usage per batch
// Helps identify memory-intensive operations
```

## Performance Optimization

Use batch tracking to optimize processing:

```typescript
// Test different batch sizes
async testBatchSizes() {
  const sizes = [10, 50, 100, 500];
  const items = await this.loadItems();

  for (const size of sizes) {
    await this.processBatch(`test-batch-${size}`, items, { batchSize: size });
  }

  // Check dashboard to find optimal batch size
  // Look at: duration, memory, throughput
}
```

## Related Watchers

- [Job Watcher](./job) - Track queued batch jobs
- [Model Watcher](./model) - See database operations in batches
- [Query Watcher](./query) - Monitor database performance
