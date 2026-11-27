---
sidebar_position: 2
---

# Prisma Integration

Two watchers record Prisma:

| | Prisma 6.13 and earlier | Prisma 6.14 and later, 7 included |
|---|---|---|
| **Query watcher** — `query` entries | automatic, as `Model.operation` | the SQL, once the client logs queries |
| **Model watcher** — `model` entries | `setupPrismaClient()` | `setupPrismaClient()` |

## Query Watcher

The query watcher is on by default. When the application bootstraps it looks
through every provider in the Nest container and attaches to each one that is a
Prisma client — a `PrismaService` that extends `PrismaClient` included — and to
`globalThis.prisma` if there is one. A client is attached once, however many
providers inject it.

### Prisma 6.14 and later: one constructor option

Prisma 6.14.0 removed `$use`, the middleware API, and a
[client extension](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
does not change the client it extends — it returns a new one. What Prisma 6.14 and
7 offer an existing client is the `query` log event, and a client emits it only
when it was built with query logging:

```typescript
// prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
```

Each query is then recorded with its SQL, its parameters and how long it took.
`log: ['query']` works as well, and also prints every query. A client built
without query logging is still subscribed to, records nothing, and NestLens says
so once at startup, with the line to add:

```text
1 Prisma client(s) were built without query logging, so their queries are not
being recorded. … log: [{ emit: 'event', level: 'query' }] …
```

Prisma emits the event outside the request that ran the query, so on Prisma 6.14
and later a `query` entry is not tied to its request. The model watcher's entries
are.

### Prisma 6.13 and earlier

Nothing to set up: the watcher installs a `$use` middleware and records each
operation by name.

### Query Entry Data

```typescript
// Prisma 6.14 and later
{
  type: 'query',
  payload: {
    query: 'SELECT `main`.`User`.`id` FROM `main`.`User` WHERE `main`.`User`.`name` = ?',
    parameters: ['x'],
    duration: 3,
    slow: false,
    source: 'prisma',
  }
}

// Prisma 6.13 and earlier
{
  type: 'query',
  payload: {
    query: 'User.findMany',          // Prisma operation
    parameters: [{ where: { ... } }], // Operation arguments
    duration: 12,                     // milliseconds
    slow: false,
    source: 'prisma',
  }
}
```

On Prisma 6.13 and earlier, raw queries (`$queryRaw`, `$executeRaw`) have no model and are
recorded as `unknown.<action>`.

## Model Watcher (every Prisma version)

```typescript
NestLensModule.forRoot({
  watchers: {
    model: true,
  },
})
```

`setupPrismaClient()` returns the client to use: on Prisma 6.13 and earlier the
one it was given, with a middleware installed; on 6.14 and later a new, extended
one, and queries through the original are not recorded. With `watchers.model`
off it hands the same client back and installs nothing, so the service boots and
runs either way.

```typescript
// prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ModelWatcher } from 'nestlens';

@Injectable()
export class PrismaService implements OnModuleInit {
  client = new PrismaClient();

  constructor(private readonly modelWatcher: ModelWatcher) {}

  async onModuleInit() {
    await this.client.$connect();
    this.client = this.modelWatcher.setupPrismaClient(this.client);
  }
}
```

The client is held in a field rather than inherited, because `this` cannot be
replaced from inside its own method — see the
[Model watcher](../watchers/model.md#prisma-setup).

:::caution Two entries per operation
A client the query watcher can find — a provider such as a `PrismaService` that
extends `PrismaClient`, or `globalThis.prisma` — is recorded by it as well, so
passing that client to `setupPrismaClient()` gives each operation a `query`
entry and a `model` entry. The field in the example above is not a provider and
is recorded by the model watcher alone. If one entry is enough, set
`watchers.query: false` or leave the model watcher off.
:::

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
        /AuditLog/,        // the SQL on 6.14+, `AuditLog.findMany` on 6.13 and earlier
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

## Troubleshooting

### Queries Not Appearing

1. **Check the startup log.** The query watcher logs
   `Prisma query watcher attached to N client(s)`; no such line means no
   provider in the container was a Prisma client.
2. **On Prisma 6.14 and later, look for the warning** that a client was built without
   query logging, and add `log: [{ emit: 'event', level: 'query' }]` to its
   constructor.
3. **Use the returned client.** With the model watcher on Prisma 6.14 and later, only
   queries through the client `setupPrismaClient()` returned are recorded.

## Next Steps

- Compare with [TypeORM Integration](./typeorm.md)
- Learn about [Custom Integrations](./custom-integrations.md)
- Configure [Advanced Filtering](/docs/advanced/filtering-entries.md)
