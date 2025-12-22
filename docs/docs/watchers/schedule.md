---
sidebar_position: 9
---

# Schedule Watcher

The Schedule Watcher monitors scheduled tasks (cron jobs) in your NestJS application, tracking execution, failures, and timing information.

## What Gets Captured

- Scheduled task name
- Cron pattern (if applicable)
- Execution status (started, completed, failed)
- Processing duration
- Error messages
- Next run time

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    schedule: {
      enabled: true,
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable schedule tracking |

## Payload Structure

```typescript
interface ScheduleEntry {
  type: 'schedule';
  payload: {
    name: string;               // Task name
    cron?: string;              // Cron pattern (for cron jobs)
    interval?: number;          // Interval in ms (reserved, not currently populated)
    timeout?: number;           // Timeout in ms (reserved, not currently populated)
    status: 'started' | 'completed' | 'failed';
    duration?: number;          // Execution time (ms)
    error?: string;             // Error message if failed
    nextRun?: string;           // Next scheduled run (ISO string)
  };
}
```

## Usage Example

### Setup Schedule Module

```typescript
// Install: npm install @nestjs/schedule
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
})
export class AppModule {}
```

### Cron Jobs

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  // Run every day at midnight
  @Cron('0 0 * * *', { name: 'daily-cleanup' })
  async handleDailyCleanup() {
    // Automatically tracked
    console.log('Running daily cleanup');
    await this.cleanupOldRecords();
  }

  // Run every 5 minutes
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sync-data' })
  async handleDataSync() {
    console.log('Syncing data');
    await this.syncExternalData();
  }

  // Run every hour
  @Cron(CronExpression.EVERY_HOUR, { name: 'send-reports' })
  async sendHourlyReports() {
    console.log('Sending reports');
    await this.reportService.sendReports();
  }
}
```

### Intervals

```typescript
import { Interval } from '@nestjs/schedule';

@Injectable()
export class MonitoringService {
  @Interval('health-check', 10000) // Every 10 seconds
  handleHealthCheck() {
    console.log('Performing health check');
    this.checkSystemHealth();
  }
}
```

### Timeouts

```typescript
import { Timeout } from '@nestjs/schedule';

@Injectable()
export class StartupService {
  @Timeout('warmup-cache', 5000) // Run once after 5 seconds
  handleCacheWarmup() {
    console.log('Warming up cache');
    this.warmupCache();
  }
}
```

## Dashboard View

In the NestLens dashboard, schedule entries show:

- Timeline of scheduled task executions
- Task execution frequency
- Failed tasks with error messages
- Average execution duration per task
- Next scheduled runs
- Cron pattern visualization

## Cron Patterns

Common cron patterns tracked by the watcher:

```typescript
// Every minute
@Cron('* * * * *')

// Every hour at minute 0
@Cron('0 * * * *')

// Every day at 2:30 AM
@Cron('30 2 * * *')

// Every Monday at 9 AM
@Cron('0 9 * * 1')

// First day of every month at midnight
@Cron('0 0 1 * *')
```

## Error Handling

```typescript
@Cron('0 * * * *', { name: 'data-import' })
async handleDataImport() {
  try {
    await this.importData();
  } catch (error) {
    // Error is tracked automatically
    console.error('Data import failed:', error);
    // Send alert
    await this.alertService.notify('Data import failed');
  }
}
```

## Limitations

Currently, the Schedule Watcher has the following limitations:

- **Cron jobs**: Fully tracked with execution times and status
- **Intervals**: Registered but individual executions are not tracked
- **Timeouts**: Registered but execution is not tracked

For full tracking of interval and timeout-based tasks, consider using the [Job Watcher](./job) with a queue-based approach instead.

## Related Watchers

- [Job Watcher](./job) - Track queue-based background jobs
- [Log Watcher](./log) - See logs from scheduled tasks
- [Exception Watcher](./exception) - Track errors in cron jobs
