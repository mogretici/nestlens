---
sidebar_position: 13
---

# Model Watcher

The Model Watcher tracks ORM model operations (TypeORM and Prisma), monitoring CRUD operations, entity changes, and database interactions at a higher level than raw queries.

## What Gets Captured

- Operation type (find, create, update, delete, save)
- Entity/model name
- ORM source (TypeORM or Prisma)
- Operation duration
- Number of records affected
- Entity data (if enabled, with masking)
- Where conditions
- Error messages

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    model: {
      enabled: true,
      ignoreEntities: ['Migration', 'AuditLog'],
      captureData: false, // Set to true to capture entity data
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable model tracking |
| `ignoreEntities` | string[] | `[]` | Entity names to ignore |
| `captureData` | boolean | `false` | Capture entity data (with masking) |

## Payload Structure

```typescript
interface ModelEntry {
  type: 'model';
  payload: {
    action: 'find' | 'create' | 'update' | 'delete' | 'save';
    entity: string;             // Entity/model name
    source: 'typeorm' | 'prisma';
    duration: number;           // Operation time (ms)
    recordCount?: number;       // Number of records affected
    data?: unknown;             // Entity data (masked, if captureData: true)
    where?: unknown;            // Query conditions
    error?: string;             // Error message
  };
}
```

## Usage Example

### TypeORM Setup

```typescript
import { NESTLENS_MODEL_SUBSCRIBER } from 'nestlens';
import { EntitySubscriberInterface, EventSubscriber } from 'typeorm';

@EventSubscriber()
export class NestLensEntitySubscriber implements EntitySubscriberInterface {
  // Implement TypeORM subscriber methods
}

@Module({
  providers: [
    {
      provide: NESTLENS_MODEL_SUBSCRIBER,
      useClass: NestLensEntitySubscriber,
    },
  ],
})
export class AppModule {}
```

### Prisma Setup

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ModelWatcher } from 'nestlens';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private modelWatcher: ModelWatcher) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    // Setup Prisma tracking
    this.modelWatcher.setupPrismaClient(this);
  }
}
```

### Model Operations

```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll() {
    // Tracked as: action: 'find', entity: 'User'
    return this.userRepository.find();
  }

  async findOne(id: string) {
    // Tracked with where condition
    return this.userRepository.findOne({ where: { id } });
  }

  async create(data: CreateUserDto) {
    // Tracked as: action: 'create', entity: 'User'
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async update(id: string, data: UpdateUserDto) {
    // Tracked as: action: 'update', entity: 'User'
    await this.userRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    // Tracked as: action: 'delete', entity: 'User'
    return this.userRepository.delete(id);
  }
}
```

## Dashboard View

In the NestLens dashboard, model entries show:

- Timeline of model operations
- Most active entities
- CRUD operation distribution
- Slow operations
- Entity access patterns
- Data modification frequency

## Sensitive Data Masking

When `captureData: true`, sensitive fields are automatically masked:

- `password`
- `passwordHash`
- `secret`
- `token`
- `apiKey`
- `accessToken`
- `refreshToken`
- `creditCard`
- `ssn`
- `privateKey`

```typescript
// With captureData: true
const user = await userRepository.save({
  email: 'user@example.com',
  password: 'secret123', // Shown as: '***MASKED***'
  name: 'John Doe',      // Shown normally
});
```

## Prisma Operations

```typescript
// All tracked automatically
await prisma.user.findMany(); // action: 'find'
await prisma.user.findUnique({ where: { id } }); // action: 'find'
await prisma.user.create({ data }); // action: 'create'
await prisma.user.update({ where: { id }, data }); // action: 'update'
await prisma.user.delete({ where: { id } }); // action: 'delete'
```

## Performance Analysis

### Identify N+1 Problems

```typescript
// BAD: N+1 queries (visible in dashboard)
const users = await this.userRepository.find();
for (const user of users) {
  user.posts = await this.postRepository.find({
    where: { userId: user.id }
  });
}
// Dashboard shows: 1 User.find + N Post.find operations

// GOOD: Single query with relations
const users = await this.userRepository.find({
  relations: ['posts'],
});
// Dashboard shows: 1 User.find operation
```

## Filtering Entities

```typescript
NestLensModule.forRoot({
  watchers: {
    model: {
      ignoreEntities: [
        'Migration',      // Ignore migration entities
        'AuditLog',       // Ignore audit logs
        'SessionStore',   // Ignore session storage
      ],
    },
  },
})
```

## Related Watchers

- [Query Watcher](./query) - See raw SQL queries for model operations
- [Request Watcher](./request) - See model operations per request
- [Exception Watcher](./exception) - Track model-related errors
