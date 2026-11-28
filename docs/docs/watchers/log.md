---
sidebar_position: 5
---

# Log Watcher

The Log Watcher collects application logs emitted through NestJS's built-in logger, providing a centralized view of all log messages with context and correlation.

## What Gets Captured

- Log level (verbose, debug, log, warn, error)
- Log message
- Context (logger name/category)
- Stack trace (for errors)
- Metadata: the one plain object passed after the message, as in
  `logger.log('Order placed', { orderId: 7 }, 'OrderService')`, up to 64KB
- Request correlation ID

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    log: {
      enabled: true,
      minLevel: 'log', // 'verbose', 'debug', 'log', 'warn', 'error'
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable log tracking |
| `minLevel` | string | `'log'` | Minimum log level to capture |

## Payload Structure

```typescript
interface LogEntry {
  type: 'log';
  payload: {
    level: 'debug' | 'log' | 'warn' | 'error' | 'verbose';
    message: string;            // Log message
    context?: string;           // Logger context/name
    stack?: string;             // Stack trace (for errors)
    metadata?: Record<string, unknown>; // The plain object passed after the message
  };
}
```

## Usage Example

### Using NestLens Logger

Make NestLens logger the application's logger. Nothing else records a log
entry: with the watcher on and this line missing, the Logs tab stays empty and
the log watcher reports itself `waiting`.

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestLensLogger } from 'nestlens';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // held until the logger below is installed, then recorded
  });

  app.useLogger(app.get(NestLensLogger));

  await app.listen(3000);
}
bootstrap();
```

Call `useLogger` before `app.listen()` or `app.init()`: the startup warning reads
which logger is installed when bootstrap ends. It replaces any logger the
application had; see [Integration with External Loggers](#integration-with-external-loggers).

### Logging in Services

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  async create(data: CreateUserDto) {
    this.logger.log('Creating new user');
    this.logger.debug(`User data: ${JSON.stringify(data)}`);

    try {
      const user = await this.userRepository.save(data);
      this.logger.log(`User created with ID: ${user.id}`);
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', error.stack);
      throw error;
    }
  }

  async findOne(id: string) {
    this.logger.verbose(`Finding user ${id}`);
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      this.logger.warn(`User ${id} not found`);
      return null;
    }

    return user;
  }
}
```

### Log Levels

```typescript
// Verbose: Detailed diagnostic information
this.logger.verbose('User query cache hit');

// Debug: Debugging information
this.logger.debug(`Processing ${items.length} items`);

// Log: General informational messages
this.logger.log('Application started successfully');

// Warn: Warning messages
this.logger.warn('Database connection slow (500ms)');

// Error: Error messages with optional stack trace
this.logger.error('Failed to process payment', error.stack);
```

### Setting Minimum Log Level

```typescript
// Development: Capture everything
NestLensModule.forRoot({
  watchers: {
    log: {
      minLevel: 'debug',
    },
  },
})

// Production: Only important logs
NestLensModule.forRoot({
  watchers: {
    log: {
      minLevel: 'warn', // Only warnings and errors
    },
  },
})
```

## Dashboard View

![Log Detail View](/img/screenshots/log_detail.png)

In the NestLens dashboard, log entries appear in the Logs tab showing:

- Timeline of all logs
- Log level badges (colored by severity)
- Context/logger names
- Log message search
- Frequency charts by level
- Logs correlated with requests
- Stack trace viewer (for errors)

### Filters Available

- **Levels** (`levels`) - debug, log, warn, error, verbose
- **Contexts** (`contexts`) - Logger context names
- **Search** (`search`) - The message, context and stack
- **Time window** (`window`) - The last 5 minutes to 24 hours

Every filter and what it matches: [Filtering](../dashboard/filtering.md#log-filters).

## Log Contexts

Organize logs by context:

```typescript
@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  // All logs will have context: 'AuthService'

  async login(credentials: LoginDto) {
    this.logger.log('User login attempt');
    // Shows: [AuthService] User login attempt
  }
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('PaymentService');
  // All logs will have context: 'PaymentService'

  async processPayment(amount: number) {
    this.logger.log(`Processing payment: $${amount}`);
    // Shows: [PaymentService] Processing payment: $100
  }
}
```

## Request Correlation

Logs automatically correlate with the current HTTP request:

```typescript
@Get(':id')
async findOne(@Param('id') id: string) {
  this.logger.log(`Fetching user ${id}`);
  // This log is linked to the current request

  const user = await this.userService.findOne(id);
  // Logs in findOne() are also linked to this request

  return user;
}
```

In the dashboard, click on a request to see all related logs.

## Structured Logging

Use structured log messages for better searchability:

```typescript
// GOOD: Structured
this.logger.log(`User ${userId} updated profile field: ${field}`);

// BETTER: Include identifiers
this.logger.log(
  `User ${userId} updated profile`,
  JSON.stringify({ field, oldValue, newValue })
);

// BAD: Vague
this.logger.log('Profile updated');
```

## Performance Considerations

### 1. Avoid Excessive Debug Logs

```typescript
// BAD: Logging in tight loops
for (const item of items) {
  this.logger.debug(`Processing item ${item.id}`); // Too many logs!
}

// GOOD: Aggregate logging
this.logger.debug(`Processing ${items.length} items`);
items.forEach(item => this.process(item));
this.logger.debug('Processing complete');
```

### 2. Use Appropriate Log Levels

```typescript
// Development
this.logger.debug(`Cache key: ${key}`);

// Production (won't be captured if minLevel is 'log')
NestLensModule.forRoot({
  watchers: {
    log: {
      minLevel: 'log', // debug logs are ignored
    },
  },
})
```

### 3. Conditional Logging

```typescript
if (process.env.NODE_ENV === 'development') {
  this.logger.debug(`Detailed debug info: ${JSON.stringify(data)}`);
}
```

## Log Filtering

NestLens automatically filters out its own internal logs to avoid recursion:

```typescript
// These won't be captured to avoid infinite loops
this.logger.log('NestLens started'); // Context includes 'NestLens'
this.logger.log('Collector processed entries'); // Context is 'Collector'
```

## Error Logging Best Practices

```typescript
try {
  await this.riskyOperation();
} catch (error) {
  // GOOD: Include stack trace
  this.logger.error(
    `Operation failed: ${error.message}`,
    error.stack,
    'OperationContext'
  );

  // BAD: No stack trace
  this.logger.error(`Operation failed: ${error.message}`);
}
```

## Integration with External Loggers

`NestLensLogger` records what reaches it, and what reaches it is decided by
`app.useLogger()`. Nest keeps one application logger: `useLogger()` hands its
argument to `Logger.overrideLogger`, which replaces the logger before it. Nest's
own logs and every `new Logger(context)` in the application go to that one, and
to nothing else.

So a second logger is not added — it replaces the first:

```typescript
import { WinstonModule } from 'nest-winston';

const app = await NestFactory.create(AppModule, {
  logger: WinstonModule.createLogger(winstonConfig),
});

// winston receives nothing from here on: NestLensLogger is now the
// application logger, and it prints to the console as ConsoleLogger does.
app.useLogger(app.get(NestLensLogger));
```

An application on pino, winston or any other logger therefore has to choose
today:

- **Install `NestLensLogger`**, and the Logs tab records every line — printed by
  the console logger it extends, not by yours.
- **Keep your logger**, and the Logs tab stays empty. The log watcher then
  reports itself `waiting`, and the [startup warning](./overview.md#is-a-watcher-recording)
  names it; switch it off with `watchers: { log: false }` to say that is
  intended.

`app.useLogger(['log', 'warn', 'error'])` — an array — sets the log levels and
installs nothing, so it is the second case.

A bridge that keeps your logger and records into NestLens as well is planned.

## Related Watchers

- [Request Watcher](./request) - See logs related to specific requests
- [Exception Watcher](./exception) - See error logs with stack traces
- [Query Watcher](./query) - Cross-reference logs with database queries
