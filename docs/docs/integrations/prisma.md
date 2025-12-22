---
sidebar_position: 2
---

# Prisma Integration

NestLens integrates with Prisma through middleware, enabling automatic tracking of all database operations with detailed metrics and performance monitoring.

## Setup

Prisma integration requires manual setup using Prisma's middleware system.

### 1. Enable Query Watcher

First, enable the query watcher in your NestLens configuration:

```typescript
// app.module.ts
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        query: true, // Enable query tracking
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Configure Global Prisma Instance

Set up a global Prisma instance that NestLens can detect:

```typescript
// prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Make Prisma client globally available for NestLens
    (global as any).prisma = this;
  }
}
```

### 3. Alternative: Custom Middleware Setup

For more control, manually attach Prisma middleware:

```typescript
// app.module.ts or main.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Attach NestLens middleware
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  // NestLens will intercept this if global.prisma is set
  console.log(`${params.model}.${params.action} took ${duration}ms`);

  return result;
});

// Make globally available
(global as any).prisma = prisma;
```

## How It Works

NestLens uses Prisma's `$use` middleware to track operations:

1. **Middleware Intercepts** - Catches all Prisma operations
2. **Timing Tracked** - Measures execution duration
3. **Operations Logged** - Records operation details
4. **Auto-Tagged** - Associates with current request

## Query Tracking

### Tracked Operations

NestLens tracks all Prisma operations:

- **Queries**: findUnique, findFirst, findMany
- **Mutations**: create, createMany, update, updateMany, upsert
- **Deletions**: delete, deleteMany
- **Aggregations**: count, aggregate, groupBy
- **Raw Queries**: $queryRaw, $executeRaw

### Query Entry Data

```typescript
{
  type: 'query',
  payload: {
    query: 'User.findMany',          // Prisma operation
    parameters: [{ where: { ... } }], // Operation arguments
    duration: 12,                     // milliseconds
    slow: false,
    source: 'prisma',
    connection: undefined             // Prisma doesn't expose connection name
  }
}
```

### Operation Mapping

Prisma operations are tracked with descriptive names:

```typescript
// Queries
findUnique  → 'User.findUnique'
findMany    → 'User.findMany'
count       → 'User.count'

// Mutations
create      → 'User.create'
update      → 'User.update'
delete      → 'User.delete'
```

## Model Tracking

Track Prisma model operations with the Model Watcher:

### 1. Enable Model Watcher

```typescript
NestLensModule.forRoot({
  watchers: {
    model: true,
  },
})
```

### 2. Setup Prisma Client with Model Tracking

```typescript
// prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ModelWatcher, NESTLENS_MODEL_SUBSCRIBER } from 'nestlens';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private moduleRef: ModuleRef) {
    super();
  }

  async onModuleInit() {
    await this.$connect();

    // Get ModelWatcher from NestLens
    const modelWatcher = this.moduleRef.get(ModelWatcher, { strict: false });
    if (modelWatcher) {
      modelWatcher.setupPrismaClient(this);
    }
  }
}
```

### Model Entry Data

```typescript
{
  type: 'model',
  payload: {
    action: 'create',      // find, create, update, delete, save
    entity: 'User',        // Prisma model name
    source: 'prisma',
    duration: 18,
    recordCount: 1,
    data: { /* captured if captureData: true */ },
    where: { id: 123 }
  }
}
```

## Configuration

### Query Watcher Config

```typescript
NestLensModule.forRoot({
  watchers: {
    query: {
      enabled: true,
      slowThreshold: 100,  // milliseconds
      ignorePatterns: [
        /^_prisma/,        // Ignore internal Prisma tables
      ],
    },
  },
})
```

### Model Watcher Config

```typescript
NestLensModule.forRoot({
  watchers: {
    model: {
      enabled: true,
      ignoreEntities: ['Migration', 'Log'],
      captureData: false, // Don't capture sensitive data
    },
  },
})
```

## Advanced Usage

### Custom Middleware with NestLens

Combine NestLens tracking with custom middleware:

```typescript
// prisma.service.ts
async onModuleInit() {
  await this.$connect();

  // Custom logging
  this.$use(async (params, next) => {
    console.log(`Prisma query: ${params.model}.${params.action}`);
    return next(params);
  });

  // NestLens tracking
  const modelWatcher = this.moduleRef.get(ModelWatcher, { strict: false });
  if (modelWatcher) {
    modelWatcher.setupPrismaClient(this);
  }

  // Make globally available
  (global as any).prisma = this;
}
```

### Selective Tracking

Track only specific models:

```typescript
this.$use(async (params, next) => {
  const trackedModels = ['User', 'Order', 'Payment'];

  if (trackedModels.includes(params.model)) {
    // Only these models are tracked
  }

  return next(params);
});
```

### Custom Slow Query Threshold

Set different thresholds per model:

```typescript
NestLensModule.forRoot({
  watchers: {
    query: {
      slowThreshold: 100, // Default
      // Custom logic can be added via filter function
    },
  },
  filter: (entry) => {
    if (entry.type === 'query' && entry.payload.query.includes('Report')) {
      // Higher threshold for report queries
      return entry.payload.duration < 1000;
    }
    return true;
  },
})
```

## Dashboard Integration

### Filtering Prisma Queries

Use dashboard filters:

1. **Source Filter**: Select "prisma"
2. **Operation Filter**: Filter by operation type
3. **Model Filter**: Filter by model name
4. **Slow Queries**: Toggle slow query filter

### Query Analysis

Analyze Prisma performance:

- **Slowest Operations** - Identify bottlenecks
- **Most Frequent Queries** - Find optimization opportunities
- **N+1 Detection** - Spot repetitive queries
- **Failed Operations** - Track errors

## Best Practices

### 1. Use Global Prisma Instance

Ensure Prisma client is globally accessible:

```typescript
(global as any).prisma = this;
```

This allows NestLens to auto-detect and track operations.

### 2. Exclude Internal Operations

Ignore Prisma's internal queries:

```typescript
ignorePatterns: [
  /^_prisma/,
  /^information_schema/,
]
```

### 3. Limit Data Capture

Avoid capturing large payloads:

```typescript
model: {
  captureData: false, // Recommended
  ignoreEntities: ['AuditLog', 'EventLog'],
}
```

### 4. Monitor Slow Operations

Track operations exceeding threshold:

```typescript
query: {
  slowThreshold: 100, // Adjust based on your needs
}
```

### 5. Correlate with Requests

Link Prisma operations to HTTP requests:
- Each query captures the current request ID
- Filter dashboard by request ID to see all queries
- Identify which endpoint causes most database load

## Troubleshooting

### Queries Not Appearing

**Issue**: Prisma queries not tracked

**Solutions**:

1. **Check Global Instance**:
   ```typescript
   // Verify in console
   console.log('Prisma global:', (global as any).prisma);
   ```

2. **Enable Query Watcher**:
   ```typescript
   watchers: { query: true }
   ```

3. **Verify Middleware Setup**:
   ```typescript
   // In PrismaService
   const modelWatcher = this.moduleRef.get(ModelWatcher);
   if (modelWatcher) {
     modelWatcher.setupPrismaClient(this);
   }
   ```

### Model Operations Not Tracked

**Issue**: Model watcher not working

**Solutions**:

1. **Enable Model Watcher**:
   ```typescript
   watchers: { model: true }
   ```

2. **Call setupPrismaClient**:
   ```typescript
   modelWatcher.setupPrismaClient(this);
   ```

3. **Check ModuleRef Injection**:
   ```typescript
   constructor(private moduleRef: ModuleRef) {}
   ```

### Performance Impact

**Issue**: Middleware slowing down queries

**Solutions**:

1. **Optimize Tracking**:
   - Disable data capture
   - Use ignorePatterns
   - Increase buffer size

2. **Async Processing**:
   - NestLens uses buffered collection
   - Minimal blocking time
   - Background flushing

## Performance Considerations

Prisma integration overhead:

- **Per Query**: ~0.1-0.3ms
- **Memory**: Minimal (buffered entries)
- **Middleware**: Non-blocking async

Production recommendations:
- Set `captureData: false`
- Use selective tracking
- Increase `slowThreshold`
- Consider disabling in high-traffic production

## Next Steps

- Compare with [TypeORM Integration](./typeorm.md)
- Learn about [Custom Integrations](./custom-integrations.md)
- Configure [Advanced Filtering](/docs/advanced/filtering-entries.md)
