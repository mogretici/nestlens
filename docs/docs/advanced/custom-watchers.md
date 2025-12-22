---
sidebar_position: 1
---

# Custom Watchers

Learn how to create custom watchers and extend existing ones to track application-specific events in NestLens.

## Overview

Custom watchers allow you to:
- Track custom business events
- Extend built-in watchers with additional functionality
- Integrate third-party services
- Monitor application-specific metrics

## Creating a Custom Watcher

### Step 1: Define Your Watcher Service

Create a new injectable service:

```typescript
// custom.watcher.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CollectorService } from 'nestlens';

@Injectable()
export class CustomWatcher implements OnModuleInit {
  private readonly logger = new Logger(CustomWatcher.name);

  constructor(private readonly collector: CollectorService) {}

  async onModuleInit() {
    this.logger.log('Custom watcher initialized');
  }

  async trackCustomEvent(eventName: string, data: any) {
    await this.collector.collect('event', {
      name: eventName,
      payload: data,
      listeners: [],
      duration: 0,
    });
  }
}
```

### Step 2: Register the Watcher

Add it to your module providers:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { NestLensModule } from 'nestlens';
import { CustomWatcher } from './custom.watcher';

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        event: true, // Enable event watcher
      },
    }),
  ],
  providers: [CustomWatcher],
  exports: [CustomWatcher],
})
export class AppModule {}
```

### Step 3: Use the Watcher

Inject and use in your services:

```typescript
// payment.service.ts
import { Injectable } from '@nestjs/common';
import { CustomWatcher } from './custom.watcher';

@Injectable()
export class PaymentService {
  constructor(private customWatcher: CustomWatcher) {}

  async processPayment(amount: number) {
    const startTime = Date.now();

    try {
      // Process payment
      const result = await this.gateway.charge(amount);

      // Track success
      await this.customWatcher.trackCustomEvent('payment_success', {
        amount,
        duration: Date.now() - startTime,
        gateway: 'stripe',
      });

      return result;
    } catch (error) {
      // Track failure
      await this.customWatcher.trackCustomEvent('payment_failed', {
        amount,
        error: error.message,
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }
}
```

## Extending Built-In Watchers

### Extending Request Watcher

Create a decorator for enhanced request tracking:

```typescript
// track-request.decorator.ts
import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { RequestTrackingInterceptor } from './request-tracking.interceptor';

export function TrackRequest(metadata?: any) {
  return applyDecorators(
    UseInterceptors(new RequestTrackingInterceptor(metadata))
  );
}

// request-tracking.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CollectorService } from 'nestlens';

@Injectable()
export class RequestTrackingInterceptor implements NestInterceptor {
  constructor(
    private metadata: any,
    private collector?: CollectorService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        if (this.collector) {
          this.collector.collect('log', {
            level: 'log',
            message: `Request to ${request.path}`,
            metadata: {
              ...this.metadata,
              duration: Date.now() - startTime,
              method: request.method,
            },
          });
        }
      }),
    );
  }
}
```

Usage:

```typescript
@Controller('users')
export class UserController {
  @Get()
  @TrackRequest({ feature: 'user-list' })
  async findAll() {
    return this.userService.findAll();
  }
}
```

### Extending Exception Watcher

Add custom exception context:

```typescript
// enhanced-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { CollectorService } from 'nestlens';

@Catch()
export class EnhancedExceptionFilter implements ExceptionFilter {
  constructor(private collector: CollectorService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : 500;

    // Collect with additional context
    this.collector.collectImmediate('exception', {
      name: exception.constructor.name,
      message: exception.message || 'Unknown error',
      stack: exception.stack,
      context: request.route?.path,
      request: {
        method: request.method,
        url: request.url,
        body: request.body,
      },
      // Add custom context
      customContext: {
        userId: request.user?.id,
        tenant: request.headers['x-tenant-id'],
        version: request.headers['x-api-version'],
      },
    });

    response.status(status).json({
      statusCode: status,
      message: exception.message,
    });
  }
}
```

### Extending Log Watcher

Create a custom logger with automatic tracking:

```typescript
// tracked-logger.service.ts
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { CollectorService } from 'nestlens';

@Injectable({ scope: Scope.TRANSIENT })
export class TrackedLogger implements LoggerService {
  private context?: string;

  constructor(private collector: CollectorService) {}

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, metadata?: any) {
    console.log(message);
    this.collector.collect('log', {
      level: 'log',
      message,
      context: this.context,
      metadata,
    });
  }

  error(message: string, trace?: string, metadata?: any) {
    console.error(message, trace);
    this.collector.collectImmediate('log', {
      level: 'error',
      message,
      stack: trace,
      context: this.context,
      metadata,
    });
  }

  warn(message: string, metadata?: any) {
    console.warn(message);
    this.collector.collect('log', {
      level: 'warn',
      message,
      context: this.context,
      metadata,
    });
  }

  debug(message: string, metadata?: any) {
    console.debug(message);
    this.collector.collect('log', {
      level: 'debug',
      message,
      context: this.context,
      metadata,
    });
  }

  verbose(message: string, metadata?: any) {
    console.log(message);
    this.collector.collect('log', {
      level: 'verbose',
      message,
      context: this.context,
      metadata,
    });
  }
}
```

## Advanced Patterns

### Watcher with Configuration

Create configurable watchers:

```typescript
// configurable.watcher.ts
export interface CustomWatcherConfig {
  enabled?: boolean;
  trackMetrics?: boolean;
  sampleRate?: number;
}

@Injectable()
export class ConfigurableWatcher implements OnModuleInit {
  private config: CustomWatcherConfig;

  constructor(
    private collector: CollectorService,
    @Inject(NESTLENS_CONFIG) private nestlensConfig: NestLensConfig,
  ) {
    this.config = this.nestlensConfig.watchers?.custom || {
      enabled: true,
      trackMetrics: true,
      sampleRate: 1.0,
    };
  }

  async track(eventName: string, data: any) {
    if (!this.config.enabled) {
      return;
    }

    // Sample rate (0.0 - 1.0)
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    await this.collector.collect('event', {
      name: eventName,
      payload: data,
      listeners: [],
      duration: 0,
    });
  }
}
```

### Watcher with Buffering

Implement custom buffering logic:

```typescript
// buffered.watcher.ts
@Injectable()
export class BufferedWatcher implements OnModuleDestroy {
  private buffer: any[] = [];
  private flushInterval: NodeJS.Timeout;
  private readonly BUFFER_SIZE = 50;

  constructor(private collector: CollectorService) {
    // Flush every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  async track(event: any) {
    this.buffer.push(event);

    if (this.buffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const events = [...this.buffer];
    this.buffer = [];

    for (const event of events) {
      await this.collector.collect('event', {
        name: event.name,
        payload: event.data,
        listeners: [],
        duration: event.duration || 0,
      });
    }
  }

  async onModuleDestroy() {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}
```

### Watcher with Async Hooks

Track async operations:

```typescript
// async-operation.watcher.ts
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class AsyncOperationWatcher {
  private storage = new AsyncLocalStorage<Map<string, any>>();

  constructor(private collector: CollectorService) {}

  async runWithContext<T>(
    operation: string,
    callback: () => Promise<T>
  ): Promise<T> {
    const context = new Map();
    context.set('operation', operation);
    context.set('startTime', Date.now());

    return this.storage.run(context, async () => {
      try {
        const result = await callback();

        const duration = Date.now() - context.get('startTime');
        await this.collector.collect('event', {
          name: 'async_operation_complete',
          payload: {
            operation,
            duration,
            success: true,
          },
          listeners: [],
          duration,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - context.get('startTime');
        await this.collector.collect('event', {
          name: 'async_operation_failed',
          payload: {
            operation,
            duration,
            error: error.message,
          },
          listeners: [],
          duration,
        });

        throw error;
      }
    });
  }

  getContext(): Map<string, any> | undefined {
    return this.storage.getStore();
  }
}
```

## Real-World Examples

### Business Metrics Watcher

```typescript
@Injectable()
export class BusinessMetricsWatcher {
  constructor(private collector: CollectorService) {}

  async trackSale(sale: { amount: number; productId: string }) {
    await this.collector.collect('event', {
      name: 'sale_completed',
      payload: {
        amount: sale.amount,
        productId: sale.productId,
        timestamp: new Date(),
      },
      listeners: [],
      duration: 0,
    });
  }

  async trackUserSignup(userId: string, source: string) {
    await this.collector.collect('event', {
      name: 'user_signup',
      payload: { userId, source },
      listeners: [],
      duration: 0,
    });
  }

  async trackFeatureUsage(feature: string, userId: string) {
    await this.collector.collect('event', {
      name: 'feature_used',
      payload: { feature, userId },
      listeners: [],
      duration: 0,
    });
  }
}
```

### Third-Party Integration Watcher

```typescript
@Injectable()
export class ThirdPartyWatcher {
  constructor(private collector: CollectorService) {}

  async trackApiCall(
    service: string,
    endpoint: string,
    duration: number,
    success: boolean
  ) {
    await this.collector.collect('http-client', {
      method: 'POST',
      url: endpoint,
      duration,
      statusCode: success ? 200 : 500,
      hostname: service,
    });
  }

  async trackWebhook(source: string, event: string, payload: any) {
    await this.collector.collect('event', {
      name: `webhook_${source}_${event}`,
      payload,
      listeners: [],
      duration: 0,
    });
  }
}
```

## Best Practices

### 1. Use Appropriate Entry Types

Choose the right entry type for your data:

```typescript
// For business events
collector.collect('event', ...);

// For external APIs
collector.collect('http-client', ...);

// For custom logs
collector.collect('log', ...);

// For batch operations
collector.collect('batch', ...);
```

### 2. Handle Errors Gracefully

Don't let tracking break your app:

```typescript
async track(data: any) {
  try {
    await this.collector.collect('event', data);
  } catch (error) {
    this.logger.error('Failed to track event:', error);
    // Don't throw - tracking failures shouldn't break functionality
  }
}
```

### 3. Use Request Correlation

Link events to requests:

```typescript
async trackOrder(orderId: string, requestId?: string) {
  await this.collector.collect(
    'event',
    { name: 'order_created', payload: { orderId } },
    requestId  // Link to request
  );
}
```

### 4. Avoid Sensitive Data

Filter sensitive information:

```typescript
async track(user: User) {
  const safeData = {
    id: user.id,
    role: user.role,
    // Don't include: password, email, etc.
  };

  await this.collector.collect('event', {
    name: 'user_action',
    payload: safeData,
    listeners: [],
    duration: 0,
  });
}
```

### 5. Performance Considerations

Use buffering for high-frequency events:

```typescript
// Buffer high-frequency events
private eventBuffer: any[] = [];

async trackFrequent(event: any) {
  this.eventBuffer.push(event);

  if (this.eventBuffer.length >= 100) {
    await this.flushBuffer();
  }
}
```

## Testing Custom Watchers

```typescript
// custom.watcher.spec.ts
describe('CustomWatcher', () => {
  let watcher: CustomWatcher;
  let collector: CollectorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CustomWatcher,
        {
          provide: CollectorService,
          useValue: {
            collect: jest.fn(),
          },
        },
      ],
    }).compile();

    watcher = module.get(CustomWatcher);
    collector = module.get(CollectorService);
  });

  it('should track events', async () => {
    await watcher.trackCustomEvent('test', { foo: 'bar' });

    expect(collector.collect).toHaveBeenCalledWith('event', {
      name: 'test',
      payload: { foo: 'bar' },
      listeners: [],
      duration: 0,
    });
  });
});
```

## Next Steps

- Learn about [Extending Storage](./extending-storage.md)
- Configure [Entry Filtering](./filtering-entries.md)
- Optimize [Performance](./performance.md)
