---
sidebar_position: 3
---

# Bull / BullMQ Integration

NestLens integrates with Bull and BullMQ job queues to track job lifecycle, monitor performance, and debug queue processing issues.

## Overview

The Job Watcher tracks:
- Job additions to queues
- Job state transitions (waiting → active → completed/failed)
- Processing duration
- Retry attempts
- Job failures and errors
- Delayed jobs

## Setup

### 1. Install Bull or BullMQ

```bash
# For Bull
npm install @nestjs/bull bull

# For BullMQ (recommended)
npm install @nestjs/bullmq bullmq
```

### 2. Enable Job Watcher

```typescript
// app.module.ts
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        job: true, // Enable job tracking
      },
    }),
  ],
})
export class AppModule {}
```

### 3. Register Your Queues

#### For Bull (Classic)

```typescript
// app.module.ts or queue.module.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { JobWatcher } from 'nestlens';

@Injectable()
export class QueueRegistration implements OnModuleInit {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('notifications') private notificationQueue: Queue,
    private jobWatcher: JobWatcher,
  ) {}

  async onModuleInit() {
    // Register Bull queues with NestLens
    this.jobWatcher.setupQueue(this.emailQueue, 'email');
    this.jobWatcher.setupQueue(this.notificationQueue, 'notifications');
  }
}
```

#### For BullMQ

```typescript
// app.module.ts or queue.module.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobWatcher } from 'nestlens';

@Injectable()
export class QueueRegistration implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('notifications') private notificationQueue: Queue,
    private jobWatcher: JobWatcher,
  ) {}

  async onModuleInit() {
    // Register BullMQ queues with NestLens (auto-creates QueueEvents)
    await this.jobWatcher.setupBullMQQueue(this.emailQueue, 'email');
    await this.jobWatcher.setupBullMQQueue(this.notificationQueue, 'notifications');
  }

  async onModuleDestroy() {
    // Clean up QueueEvents connections
    await this.jobWatcher.closeQueueEvents();
  }
}
```

:::warning BullMQ `queue.client` version note
`setupBullMQQueue()` derives the Redis connection from `await queue.client` to construct its `QueueEvents`. The `queue.client` accessor's behavior has changed across BullMQ major versions and is deprecated/removed in **BullMQ v5+**. If you are on BullMQ 5, prefer the manual `setupQueueWithEvents()` path below and build `QueueEvents` from your own connection options instead of relying on `queue.client`.
:::

**Advanced: Manual QueueEvents management**

If you need more control over the QueueEvents lifecycle, use `setupQueueWithEvents`:

```typescript
import { Queue, QueueEvents } from 'bullmq';

@Injectable()
export class QueueRegistration implements OnModuleInit, OnModuleDestroy {
  private queueEvents: QueueEvents;

  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    private jobWatcher: JobWatcher,
  ) {}

  async onModuleInit() {
    // Create QueueEvents manually with custom options
    const connection = (await this.emailQueue.client).options;
    this.queueEvents = new QueueEvents('email', { connection });

    // Register with NestLens
    this.jobWatcher.setupQueueWithEvents(this.emailQueue, this.queueEvents, 'email');
  }

  async onModuleDestroy() {
    await this.queueEvents?.close();
  }
}
```

## Registering Queues

There is only one supported way to register queues with NestLens: call the setup methods on `JobWatcher` from an `OnModuleInit` hook, as shown in the [Setup](#3-register-your-queues) section above.

- **Bull (classic):** `jobWatcher.setupQueue(queue, name)`
- **BullMQ:** `await jobWatcher.setupBullMQQueue(queue, name)` (auto-creates `QueueEvents`), or `jobWatcher.setupQueueWithEvents(queue, queueEvents, name)` for manual control.

:::note No provider-token registration
The package exports a `NESTLENS_BULL_QUEUES` symbol, but `JobWatcher` does **not** inject or consume it. Providing queues via this token has no effect and will not enable tracking. Always register queues by calling `setupQueue()` / `setupBullMQQueue()` explicitly.
:::

## API Reference

### JobWatcher Methods

| Method | Description |
|--------|-------------|
| `setupQueue(queue, queueName?)` | Register a Bull (classic) queue for tracking |
| `setupBullMQQueue(queue, queueName?)` | Register a BullMQ queue (auto-creates QueueEvents) |
| `setupQueueWithEvents(queue, queueEvents, queueName?)` | Register a BullMQ queue with manual QueueEvents |
| `closeQueueEvents()` | Close all QueueEvents created by `setupBullMQQueue` |

### Key Differences

| Feature | Bull Classic | BullMQ |
|---------|-------------|--------|
| Setup method | `setupQueue()` | `setupBullMQQueue()` |
| Event source | Queue instance | QueueEvents (auto-created) |
| Cleanup | None required | Call `closeQueueEvents()` in `onModuleDestroy` |

## Tracked Events

NestLens monitors all Bull/BullMQ queue events:

### 1. Waiting
Job added to queue, waiting for processing

```typescript
{
  type: 'job',
  payload: {
    name: 'send-email',
    queue: 'email',
    data: { to: 'user@example.com', subject: '...' },
    status: 'waiting',
    attempts: 0
  }
}
```

### 2. Active
Job picked up by worker and processing started

```typescript
{
  type: 'job',
  payload: {
    name: 'send-email',
    queue: 'email',
    data: { to: 'user@example.com' },
    status: 'active',
    attempts: 0
  }
}
```

### 3. Completed
Job finished successfully

```typescript
{
  type: 'job',
  payload: {
    name: 'send-email',
    queue: 'email',
    data: { to: 'user@example.com' },
    status: 'completed',
    attempts: 0,
    duration: 1250,  // milliseconds
    result: { messageId: 'abc123' }
  }
}
```

### 4. Failed
Job processing failed

```typescript
{
  type: 'job',
  payload: {
    name: 'send-email',
    queue: 'email',
    data: { to: 'user@example.com' },
    status: 'failed',
    attempts: 1,
    duration: 500,
    error: 'SMTP connection failed'
  }
}
```

### 5. Delayed
Job scheduled for later execution

```typescript
{
  type: 'job',
  payload: {
    name: 'send-reminder',
    queue: 'notifications',
    data: { userId: 123 },
    status: 'delayed',
    attempts: 0
  }
}
```

## Configuration

### Job Watcher Config

```typescript
interface JobWatcherConfig {
  enabled?: boolean;
}

// In your NestLens config
NestLensModule.forRoot({
  watchers: {
    job: {
      enabled: true,
    },
  },
})
```

### Queue-Specific Settings

Bull/BullMQ settings still apply:

```typescript
// Configure Bull queue
BullModule.registerQueue({
  name: 'email',
  redis: {
    host: 'localhost',
    port: 6379,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
})
```

NestLens will track all configured queues.

## Dashboard Features

### Job Filtering

Filter jobs in the dashboard:

1. **Queue Name** - Filter by specific queue
2. **Status** - waiting, active, completed, failed, delayed
3. **Time Range** - View jobs from specific periods
4. **Job Name** - Filter by job type

### Job Metrics

View important metrics:

- **Processing Time** - How long jobs take
- **Failure Rate** - Percentage of failed jobs
- **Retry Count** - Number of retry attempts
- **Queue Length** - Jobs waiting per queue
- **Active Jobs** - Currently processing jobs

### Job Details

Click any job to view:

- Complete job data (payload)
- Result or error details
- Retry history
- Processing duration
- Queue name and configuration

## Use Cases

### 1. Debug Failed Jobs

Identify why jobs are failing:

```typescript
// In dashboard:
// 1. Filter by status: 'failed'
// 2. Filter by queue: 'email'
// 3. View error messages
// 4. Check job data for patterns
```

### 2. Monitor Job Performance

Track slow jobs:

```typescript
// In dashboard:
// 1. Sort jobs by duration
// 2. Identify slow job types
// 3. Optimize processing logic
```

### 3. Track Retry Patterns

Understand retry behavior:

```typescript
// In dashboard:
// 1. Filter by attempts > 1
// 2. Identify jobs that frequently retry
// 3. Adjust retry configuration
```

### 4. Queue Health Monitoring

Monitor queue status:

```typescript
// In dashboard:
// 1. View jobs per queue
// 2. Check for stuck jobs (long active time)
// 3. Identify queue bottlenecks
```

## Example Implementations

### Email Queue

```typescript
// email.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('email')
export class EmailProcessor {
  @Process('send-email')
  async handleSendEmail(job: Job) {
    const { to, subject, body } = job.data;

    // NestLens automatically tracks this
    await this.emailService.send({ to, subject, body });

    return { messageId: 'abc123', sent: true };
  }
}
```

### Notification Queue with Delays

```typescript
// notification.service.ts
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export class NotificationService {
  constructor(
    @InjectQueue('notifications') private queue: Queue
  ) {}

  async scheduleReminder(userId: number, delayMs: number) {
    // NestLens tracks this delayed job
    await this.queue.add(
      'send-reminder',
      { userId },
      { delay: delayMs }
    );
  }
}
```

### Report Generation Queue

```typescript
// report.processor.ts
@Processor('reports')
export class ReportProcessor {
  @Process({ name: 'generate-report', concurrency: 2 })
  async handleGenerateReport(job: Job) {
    // Long-running job tracked by NestLens
    const report = await this.reportService.generate(job.data);

    // Update progress (also tracked)
    job.progress(100);

    return report;
  }
}
```

## Best Practices

### 1. Limit Job Data Size

Keep job payloads small:

```typescript
// Good - minimal data
await queue.add('process-order', { orderId: 123 });

// Bad - large payload
await queue.add('process-order', {
  orderId: 123,
  fullOrderData: { /* huge object */ }
});
```

NestLens truncates data over 64KB, but smaller is better.

### 2. Use Descriptive Job Names

Make debugging easier:

```typescript
// Good
await queue.add('send-welcome-email', data);
await queue.add('generate-monthly-report', data);

// Bad
await queue.add('job1', data);
await queue.add('task', data);
```

### 3. Handle Errors Gracefully

Provide error context:

```typescript
@Process('send-email')
async handleSendEmail(job: Job) {
  try {
    await this.emailService.send(job.data);
  } catch (error) {
    // NestLens captures this error message
    throw new Error(`Failed to send email to ${job.data.to}: ${error.message}`);
  }
}
```

### 4. Monitor Queue Health

Set up alerts based on NestLens data:
- High failure rate → Alert team
- Long active duration → Possible stuck jobs
- Many delayed jobs → Queue backed up

### 5. Use Queue-Specific Prefixes

Organize jobs with naming conventions:

```typescript
// Queue: email
'email:welcome'
'email:reset-password'
'email:notification'

// Queue: reports
'report:daily-sales'
'report:monthly-summary'
```

## Troubleshooting

### Jobs Not Appearing

**Issue**: Jobs not tracked in NestLens

**Solutions**:

1. **Verify Job Watcher Enabled**:
   ```typescript
   watchers: { job: true }
   ```

2. **Check Queue Registration**:
   ```typescript
   // Make sure setupQueue was called
   this.jobWatcher.setupQueue(this.queue, 'queue-name');
   ```

3. **Verify Queue Injection**:
   ```typescript
   // Ensure queue is properly injected
   constructor(
     @InjectQueue('email') private emailQueue: Queue,
     private jobWatcher: JobWatcher,
   ) {}
   ```

4. **For BullMQ - Use setupBullMQQueue**:
   ```typescript
   // Simplest approach - auto-creates QueueEvents
   await this.jobWatcher.setupBullMQQueue(this.emailQueue, 'email');
   ```

### Incomplete Job Data

**Issue**: Missing job data or results

**Solutions**:

1. **Data Size Limit** - NestLens truncates data > 64KB
2. **Serialization Issues** - Ensure job data is JSON-serializable
3. **Check Job Result** - Verify processor returns data

### Performance Impact

**Issue**: Job processing slower with NestLens

**Solutions**:

1. **Minimal Overhead** - NestLens adds ~0.1ms per event
2. **Async Tracking** - All logging is non-blocking
3. **Buffer System** - Entries batched for efficiency

If concerned:
- Disable in production
- Use filtering to exclude specific queues

## Performance Considerations

Job tracking overhead:

- **Per Job Event**: ~0.1-0.2ms
- **Memory**: Minimal (buffered)
- **Redis Impact**: None (no additional Redis calls)

Production recommendations:
- Monitor initial overhead
- Disable for high-volume queues if needed
- Use filtering to exclude verbose jobs

## Next Steps

- Learn about [Redis Integration](./redis.md)
- Explore [Custom Integrations](./custom-integrations.md)
- Configure [Advanced Filtering](/docs/advanced/filtering-entries.md)
