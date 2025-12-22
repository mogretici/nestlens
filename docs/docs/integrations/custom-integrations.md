---
sidebar_position: 5
---

# Custom Integrations

NestLens provides flexible APIs for creating custom integrations, extending existing watchers, and tracking custom events in your application.

## Manual Tracking API

Track custom events using the CollectorService directly.

### Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { CollectorService } from 'nestlens';

@Injectable()
export class PaymentService {
  constructor(private collector: CollectorService) {}

  async processPayment(orderId: number, amount: number) {
    const startTime = Date.now();

    try {
      const result = await this.paymentGateway.charge(amount);

      // Track successful payment
      await this.collector.collect('http-client', {
        method: 'POST',
        url: 'https://api.payment-gateway.com/charge',
        statusCode: 200,
        duration: Date.now() - startTime,
        requestBody: { amount },
        responseBody: result,
      });

      return result;
    } catch (error) {
      // Track failed payment
      await this.collector.collect('http-client', {
        method: 'POST',
        url: 'https://api.payment-gateway.com/charge',
        duration: Date.now() - startTime,
        error: error.message,
      });

      throw error;
    }
  }
}
```

### Collect Methods

#### collect() - Buffered Collection

For normal tracking with automatic buffering:

```typescript
async collect<T extends EntryType>(
  type: T,
  payload: Extract<Entry, { type: T }>['payload'],
  requestId?: string,
): Promise<void>
```

**Example:**
```typescript
await this.collector.collect('log', {
  level: 'info',
  message: 'User logged in',
  context: 'AuthService',
});
```

#### collectImmediate() - Immediate Save

For critical events that need immediate storage:

```typescript
async collectImmediate<T extends EntryType>(
  type: T,
  payload: Extract<Entry, { type: T }>['payload'],
  requestId?: string,
): Promise<Entry | null>
```

**Example:**
```typescript
const entry = await this.collector.collectImmediate('exception', {
  name: 'PaymentError',
  message: 'Payment gateway timeout',
  stack: error.stack,
});
```

### Request ID Correlation

Associate custom events with HTTP requests using the request ID header:

```typescript
import { REQUEST_ID_HEADER } from 'nestlens';
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class CustomService {
  constructor(
    private collector: CollectorService,
    @Inject(REQUEST) private request: Request,
  ) {}

  async customOperation() {
    // Get the request ID from headers
    const requestId = this.request.headers[REQUEST_ID_HEADER] as string;

    // This will be linked to the current HTTP request
    await this.collector.collect('log', {
      level: 'log',
      message: 'Custom operation',
      context: 'CustomService',
    }, requestId);
  }
}
```

## Custom Watcher Tokens

Create custom watchers using provider tokens.

### NESTLENS_BULL_QUEUES

Register Bull/BullMQ queues for job tracking:

```typescript
import { NESTLENS_BULL_QUEUES } from 'nestlens';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

@Module({
  providers: [
    {
      provide: NESTLENS_BULL_QUEUES,
      useFactory: (
        emailQueue: Queue,
        smsQueue: Queue,
      ) => [
        { queue: emailQueue, name: 'email' },
        { queue: smsQueue, name: 'sms' },
      ],
      inject: [
        getQueueToken('email'),
        getQueueToken('sms'),
      ],
    },
  ],
})
export class QueueModule {}
```

### NESTLENS_REDIS_CLIENT

Register Redis client for command tracking:

```typescript
import { NESTLENS_REDIS_CLIENT } from 'nestlens';
import Redis from 'ioredis';

@Module({
  providers: [
    {
      provide: NESTLENS_REDIS_CLIENT,
      useFactory: () => new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
      }),
    },
  ],
})
export class RedisModule {}
```

### NESTLENS_MODEL_SUBSCRIBER

Register TypeORM entity subscriber for model tracking:

```typescript
import { NESTLENS_MODEL_SUBSCRIBER } from 'nestlens';
import { EntitySubscriberInterface } from 'typeorm';

@Injectable()
@EventSubscriber()
export class CustomEntitySubscriber implements EntitySubscriberInterface {
  // Implement subscriber methods
}

@Module({
  providers: [
    CustomEntitySubscriber,
    {
      provide: NESTLENS_MODEL_SUBSCRIBER,
      useExisting: CustomEntitySubscriber,
    },
  ],
})
export class DatabaseModule {}
```

## Creating Custom Watchers

Build your own watchers for specialized tracking.

### Step 1: Define Entry Type

If using an existing entry type, skip this. Otherwise, consider using a flexible type like `log` or `event`.

### Step 2: Create Watcher Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CollectorService } from 'nestlens';

@Injectable()
export class CustomWatcher {
  private readonly logger = new Logger(CustomWatcher.name);

  constructor(private collector: CollectorService) {}

  async trackCustomEvent(data: any) {
    try {
      await this.collector.collect('event', {
        name: 'custom-event',
        payload: data,
        listeners: [],
        duration: 0,
      });
    } catch (error) {
      this.logger.error(`Failed to track custom event: ${error}`);
    }
  }
}
```

### Step 3: Use Interceptors or Decorators

Create reusable tracking patterns:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CustomTrackingInterceptor implements NestInterceptor {
  constructor(private collector: CollectorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const handler = context.getHandler().name;

    return next.handle().pipe(
      tap({
        next: (result) => {
          this.collector.collect('log', {
            level: 'log',
            message: `Handler ${handler} executed successfully`,
            metadata: {
              duration: Date.now() - startTime,
              result: typeof result,
            },
          });
        },
        error: (error) => {
          this.collector.collect('exception', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            context: handler,
          });
        },
      }),
    );
  }
}
```

## Extending Existing Watchers

Customize built-in watchers for your needs.

### Extending Request Watcher

Add custom request tagging:

```typescript
import { NestLensModule } from 'nestlens';

NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      tags: async (req) => {
        const tags: string[] = [];

        // Tag by user role
        if (req.user?.role === 'admin') {
          tags.push('admin-request');
        }

        // Tag by endpoint
        if (req.path.startsWith('/api/v2')) {
          tags.push('api-v2');
        }

        // Tag by feature flag
        if (req.headers['x-feature-flag']) {
          tags.push(`feature:${req.headers['x-feature-flag']}`);
        }

        return tags;
      },
    },
  },
})
```

### Extending Exception Watcher

Custom exception handling:

```typescript
import { ExceptionWatcherConfig } from 'nestlens';

const exceptionConfig: ExceptionWatcherConfig = {
  enabled: true,
  ignoreExceptions: [
    'NotFoundException',
    'UnauthorizedException',
  ],
};

NestLensModule.forRoot({
  watchers: {
    exception: exceptionConfig,
  },
})
```

### Extending Log Watcher

Custom log filtering:

```typescript
NestLensModule.forRoot({
  watchers: {
    log: {
      enabled: true,
      minLevel: 'warn', // Only track warnings and errors
    },
  },
})
```

## Advanced Patterns

### Conditional Tracking

Track events only under certain conditions:

```typescript
@Injectable()
export class ConditionalTrackingService {
  constructor(private collector: CollectorService) {}

  async trackIfEnabled(eventName: string, data: any) {
    // Only track in development and staging
    if (['development', 'staging'].includes(process.env.NODE_ENV)) {
      await this.collector.collect('event', {
        name: eventName,
        payload: data,
        listeners: [],
        duration: 0,
      });
    }
  }
}
```

### Custom Entry Filtering

Filter entries before collection:

```typescript
NestLensModule.forRoot({
  filter: async (entry) => {
    // Don't track successful health check requests
    if (entry.type === 'request' &&
        entry.payload.path === '/health' &&
        entry.payload.statusCode === 200) {
      return false;
    }

    // Don't track debug logs in production
    if (entry.type === 'log' &&
        entry.payload.level === 'debug' &&
        process.env.NODE_ENV === 'production') {
      return false;
    }

    return true;
  },
})
```

### Batch Entry Processing

Process multiple entries at once:

```typescript
NestLensModule.forRoot({
  filterBatch: async (entries) => {
    // Remove duplicate queries
    const uniqueQueries = new Map();

    return entries.filter(entry => {
      if (entry.type === 'query') {
        const key = entry.payload.query;
        if (uniqueQueries.has(key)) {
          return false;
        }
        uniqueQueries.set(key, true);
      }
      return true;
    });
  },
})
```

### Custom Tagging

Auto-tag entries based on content:

```typescript
import { TagService } from 'nestlens';

@Injectable()
export class CustomTaggingService {
  constructor(private tagService: TagService) {}

  async tagEntry(entryId: number, entry: Entry) {
    const tags: string[] = [];

    // Tag slow operations
    if (entry.type === 'request' && entry.payload.duration > 1000) {
      tags.push('slow-request');
    }

    // Tag by status code
    if (entry.type === 'request') {
      const status = entry.payload.statusCode;
      if (status >= 400) {
        tags.push(`status-${Math.floor(status / 100)}xx`);
      }
    }

    // Tag database errors
    if (entry.type === 'exception' &&
        entry.payload.message.includes('database')) {
      tags.push('database-error');
    }

    if (tags.length > 0) {
      await this.tagService.addTags(entryId, tags);
    }
  }
}
```

## Real-World Examples

### Third-Party API Tracking

```typescript
@Injectable()
export class ExternalApiService {
  constructor(
    private httpService: HttpService,
    private collector: CollectorService,
  ) {}

  async callExternalApi(endpoint: string, data: any) {
    const startTime = Date.now();

    try {
      const response = await this.httpService
        .post(`https://api.example.com${endpoint}`, data)
        .toPromise();

      // Track successful API call
      await this.collector.collect('http-client', {
        method: 'POST',
        url: `https://api.example.com${endpoint}`,
        requestBody: data,
        statusCode: response.status,
        responseBody: response.data,
        duration: Date.now() - startTime,
      });

      return response.data;
    } catch (error) {
      // Track failed API call
      await this.collector.collect('http-client', {
        method: 'POST',
        url: `https://api.example.com${endpoint}`,
        requestBody: data,
        duration: Date.now() - startTime,
        error: error.message,
      });

      throw error;
    }
  }
}
```

### File Upload Tracking

```typescript
@Injectable()
export class FileUploadService {
  constructor(private collector: CollectorService) {}

  async uploadFile(file: Express.Multer.File) {
    const startTime = Date.now();

    try {
      const result = await this.s3.upload(file);

      await this.collector.collect('batch', {
        name: 'file-upload',
        operation: 'upload',
        totalItems: 1,
        processedItems: 1,
        failedItems: 0,
        duration: Date.now() - startTime,
        status: 'completed',
        memory: file.size,
      });

      return result;
    } catch (error) {
      await this.collector.collect('batch', {
        name: 'file-upload',
        operation: 'upload',
        totalItems: 1,
        processedItems: 0,
        failedItems: 1,
        duration: Date.now() - startTime,
        status: 'failed',
        errors: [error.message],
      });

      throw error;
    }
  }
}
```

### Custom Metrics Tracking

```typescript
@Injectable()
export class MetricsService {
  constructor(private collector: CollectorService) {}

  async trackBusinessMetric(name: string, value: number, metadata?: any) {
    await this.collector.collect('log', {
      level: 'log',
      message: `Metric: ${name}`,
      context: 'Metrics',
      metadata: {
        metricName: name,
        metricValue: value,
        timestamp: new Date(),
        ...metadata,
      },
    });
  }

  async trackUserAction(userId: number, action: string) {
    await this.collector.collect('event', {
      name: 'user-action',
      payload: { userId, action },
      listeners: [],
      duration: 0,
    });
  }
}
```

## Best Practices

### 1. Use Type-Safe Entry Payloads

Leverage TypeScript for compile-time safety:

```typescript
import { LogEntry } from 'nestlens';

const logPayload: LogEntry['payload'] = {
  level: 'info',
  message: 'Custom log',
  context: 'MyService',
};

await this.collector.collect('log', logPayload);
```

### 2. Handle Errors Gracefully

Don't let tracking break your app:

```typescript
try {
  await this.collector.collect('log', payload);
} catch (error) {
  // Log but don't throw
  console.error('Failed to track event:', error);
}
```

### 3. Avoid Blocking Operations

Use buffered collection for performance:

```typescript
// Good - buffered, non-blocking
await this.collector.collect('event', payload);

// Use sparingly - immediate, blocking
await this.collector.collectImmediate('exception', payload);
```

### 4. Include Request Context

Link events to requests when possible:

```typescript
await this.collector.collect('log', payload, this.requestId);
```

### 5. Document Custom Integrations

Help your team understand custom tracking:

```typescript
/**
 * Tracks payment processing events
 * @param orderId - Order identifier
 * @param amount - Payment amount in cents
 */
async trackPayment(orderId: number, amount: number) {
  // ...
}
```

## Troubleshooting

### Custom Events Not Appearing

1. **Check Watcher Enabled**: Verify the watcher for your entry type is enabled
2. **Verify Payload**: Ensure payload matches entry type structure
3. **Check Filters**: Make sure filters aren't excluding your entries
4. **Console Logs**: Add logging to confirm `collect()` is called

### Performance Issues

1. **Use Buffered Collection**: Prefer `collect()` over `collectImmediate()`
2. **Limit Payload Size**: Keep payloads small
3. **Async Processing**: Ensure tracking is non-blocking
4. **Batch Operations**: Use `filterBatch()` for bulk processing

## Next Steps

- Learn about [TypeORM Integration](./typeorm.md)
- Explore [Prisma Integration](./prisma.md)
- Configure [Advanced Filtering](/docs/advanced/filtering-entries.md)
- Extend [Storage Backend](/docs/advanced/extending-storage.md)
