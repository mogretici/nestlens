---
sidebar_position: 1
---

# TypeORM Integration

NestLens provides seamless integration with TypeORM, automatically tracking database queries and entity operations with zero configuration required.

## Auto-Detection

NestLens automatically detects TypeORM when it's installed in your project:

```bash
npm install typeorm @nestjs/typeorm
```

No additional setup is needed. NestLens will:
- Detect all TypeORM DataSources
- Attach query logging automatically
- Track query execution times
- Monitor slow queries
- Record query parameters

## How It Works

NestLens hooks into TypeORM's driver layer to intercept queries:

```typescript
// In your app.module.ts - Standard TypeORM setup
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'password',
      database: 'mydb',
      entities: [User, Product],
      synchronize: false,
    }),
    NestLensModule.forRoot(), // NestLens auto-detects TypeORM
  ],
})
export class AppModule {}
```

## Query Tracking

Every TypeORM query is automatically tracked:

### Query Entry Data

```typescript
{
  type: 'query',
  payload: {
    query: 'SELECT * FROM users WHERE email = $1',
    parameters: ['user@example.com'],
    duration: 15,        // milliseconds
    slow: false,         // based on slowThreshold
    source: 'typeorm',
    connection: 'default'
  }
}
```

### Tracked Query Types

- SELECT queries
- INSERT operations
- UPDATE statements
- DELETE operations
- Raw queries
- Query builder queries
- Repository operations

## Slow Query Detection

Configure slow query threshold in NestLens config:

```typescript
NestLensModule.forRoot({
  watchers: {
    query: {
      enabled: true,
      slowThreshold: 100, // milliseconds (default: 100ms)
    },
  },
})
```

Queries exceeding the threshold are flagged as slow in the dashboard.

## Multiple Connections

NestLens tracks all TypeORM connections:

```typescript
TypeOrmModule.forRoot({
  name: 'default',
  type: 'postgres',
  // ... config
}),
TypeOrmModule.forRoot({
  name: 'secondary',
  type: 'mysql',
  // ... config
})
```

Each query includes the connection name for easy filtering in the dashboard.

## Model Tracking

Enable entity operation tracking with the Model Watcher:

```typescript
NestLensModule.forRoot({
  watchers: {
    model: true, // Enable model watcher
  },
})
```

### Setting Up Entity Subscriber

To track entity lifecycle events, provide an EntitySubscriber:

```typescript
// nestlens-subscriber.ts
import { EntitySubscriberInterface, EventSubscriber } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
@EventSubscriber()
export class NestLensSubscriber implements EntitySubscriberInterface {
  // TypeORM will call these methods automatically
  afterLoad(entity: any, event?: any) {}
  beforeInsert(event: any) {}
  afterInsert(event: any) {}
  beforeUpdate(event: any) {}
  afterUpdate(event: any) {}
  beforeRemove(event: any) {}
  afterRemove(event: any) {}
}
```

Register the subscriber:

```typescript
import { NESTLENS_MODEL_SUBSCRIBER } from 'nestlens';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      subscribers: [NestLensSubscriber],
    }),
  ],
  providers: [
    NestLensSubscriber,
    {
      provide: NESTLENS_MODEL_SUBSCRIBER,
      useExisting: NestLensSubscriber,
    },
  ],
})
export class AppModule {}
```

### Tracked Model Operations

With the subscriber configured, NestLens tracks:

- **Find** - Entity queries and loading
- **Create** - New entity insertion
- **Update** - Entity modifications
- **Delete** - Entity removal

### Model Entry Data

```typescript
{
  type: 'model',
  payload: {
    action: 'create',
    entity: 'User',
    source: 'typeorm',
    duration: 25,
    recordCount: 1,
    data: { /* entity data if captureData: true */ },
    where: { id: 123 }
  }
}
```

## Configuration Options

### Query Watcher Config

```typescript
interface QueryWatcherConfig {
  enabled?: boolean;
  slowThreshold?: number;        // milliseconds, default: 100
  ignorePatterns?: RegExp[];     // queries to ignore
}
```

### Model Watcher Config

```typescript
interface ModelWatcherConfig {
  enabled?: boolean;
  ignoreEntities?: string[];     // entity names to ignore
  captureData?: boolean;         // default: false - capture entity data
}
```

### Example Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    query: {
      enabled: true,
      slowThreshold: 200,
      ignorePatterns: [
        /SELECT.*FROM.*migrations/,  // Ignore migration queries
        /^SHOW/,                       // Ignore SHOW statements
      ],
    },
    model: {
      enabled: true,
      ignoreEntities: ['Migration', 'Session'],
      captureData: false, // Don't capture sensitive entity data
    },
  },
})
```

## Filtering TypeORM Queries

Use dashboard filters to analyze TypeORM queries:

### By Query Type
- Filter by SELECT, INSERT, UPDATE, DELETE

### By Performance
- Show only slow queries
- Sort by duration

### By Connection
- Filter by connection name
- Useful for multi-database apps

### By Time Range
- View queries from specific time periods
- Compare performance over time

## Best Practices

### 1. Set Appropriate Slow Threshold

Adjust based on your database:
- **Local Development**: 50-100ms
- **Staging**: 100-200ms
- **Production**: Consider disabling or using very high threshold

### 2. Ignore Noisy Queries

Exclude queries that create noise:

```typescript
ignorePatterns: [
  /^SELECT.*FROM information_schema/,
  /^SHOW/,
  /^SET/,
]
```

### 3. Limit Entity Data Capture

Avoid capturing large or sensitive entity data:

```typescript
model: {
  captureData: false, // Recommended for production
  ignoreEntities: ['AuditLog', 'Session'],
}
```

### 4. Monitor Connection Pool

Track queries per connection to identify:
- Connection pool saturation
- Inefficient connection usage
- Load distribution across databases

### 5. Correlate with Requests

Use Request ID to link queries to specific HTTP requests:
1. View a slow request in the dashboard
2. Filter queries by Request ID
3. Identify which queries caused slowness

## Troubleshooting

### Queries Not Appearing

**Issue**: TypeORM queries not tracked

**Solutions**:
1. Ensure TypeORM is installed: `npm list typeorm`
2. Check NestLens is initialized after TypeORM
3. Verify query watcher is enabled:
   ```typescript
   watchers: { query: true }
   ```
4. Check console for TypeORM detection logs

### Slow Queries Not Flagged

**Issue**: Known slow queries not marked as slow

**Solutions**:
1. Lower the slowThreshold value
2. Check query duration in dashboard
3. Verify threshold configuration:
   ```typescript
   query: { slowThreshold: 100 }
   ```

### Model Operations Not Tracked

**Issue**: Entity operations not appearing

**Solutions**:
1. Ensure model watcher is enabled
2. Verify EntitySubscriber is registered
3. Check NESTLENS_MODEL_SUBSCRIBER provider
4. Confirm subscriber is in TypeORM config

## Performance Impact

TypeORM integration has minimal overhead:

- **Query Tracking**: ~0.1-0.5ms per query
- **Memory**: Negligible (queries buffered)
- **Async Processing**: Logging is non-blocking

For production, consider:
- Increasing slowThreshold
- Using ignorePatterns for frequent queries
- Disabling captureData for models

## Next Steps

- Explore [Prisma Integration](./prisma.md)
- Learn about [Custom Integrations](./custom-integrations.md)
- Configure [Query Filtering](/docs/advanced/filtering-entries.md)
