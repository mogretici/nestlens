---
sidebar_position: 1
title: API Reference
---

# API Reference

Everything NestLens exports, with the examples that show how each piece is
meant to be used.

The exhaustive listing — every interface, every field, every default, straight
from the source — is generated on each build and lives in the pages below this
one. This page does not repeat it.

:::info Where the types are
[**NestLensConfig**](../api-reference/interfaces/NestLensConfig.md) is the whole
configuration surface, and everything it names has a page of its own. Start
there when you want a field list; start here when you want an example.

This page used to carry hand-typed copies of those interfaces. They fell four
config options, sixteen interfaces and the entire GraphQL watcher behind the
code before anyone noticed, which is why they are gone.
:::

## Core Exports

### NestLensModule

The main module to import in your NestJS application.

```typescript
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      enabled: true,
      path: '/nestlens',
    }),
  ],
})
export class AppModule {}
```

Every option: [`NestLensConfig`](../api-reference/interfaces/NestLensConfig.md).

### Configuration at a glance

| Option | What it does | Reference |
| --- | --- | --- |
| `enabled` | Turn NestLens off without removing it | [NestLensConfig](../api-reference/interfaces/NestLensConfig.md) |
| `path` | Where the dashboard is mounted | [Basic configuration](/docs/configuration/basic-config) |
| `trustProxy` | Honour `X-Forwarded-Prefix` behind a rewriting proxy | [NestLensConfig](../api-reference/interfaces/NestLensConfig.md) |
| `sampling` | Record a fraction of traffic instead of all of it | [SamplingConfig](../api-reference/interfaces/SamplingConfig.md) |
| `server` | Serve the dashboard on a listener of its own | [Network isolation](/docs/security/network-isolation) |
| `watchers` | Which watchers run, and how each behaves | [Watchers overview](/docs/watchers/overview) |
| `storage` | Where entries are kept | [Storage](/docs/configuration/storage) |
| `pruning` | How long they are kept | [Pruning](/docs/configuration/pruning) |
| `rateLimit` | Limit requests to the API | [Rate limiting](/docs/configuration/rate-limiting) |
| `authorization` | Who may reach the dashboard | [Access control](/docs/security/access-control) |
| `security` | Data masking and input validation | [Data masking](/docs/security/data-masking) |
| `alerting` | POST entries to a webhook | [Alerting](/docs/configuration/alerting) |
| `filter` / `filterBatch` | Decide what is worth recording | [Filtering entries](/docs/advanced/filtering-entries) |

## Services

### CollectorService

Collect custom entries programmatically:

```typescript
import { CollectorService } from 'nestlens';

@Injectable()
export class MyService {
  constructor(private collector: CollectorService) {}

  async trackCustomEvent() {
    // Buffered collection (batched for performance)
    await this.collector.collect('event', {
      name: 'custom-event',
      payload: { data: 'value' },
      listeners: [],
      duration: 0,
    });
  }

  async trackCriticalEvent() {
    // Immediate collection (bypasses buffer)
    await this.collector.collectImmediate('exception', {
      name: 'CriticalError',
      message: 'Something critical happened',
      context: 'HTTP',
    });
  }

  // Pause/resume collection
  pauseCollection() {
    this.collector.pause('maintenance');
  }

  resumeCollection() {
    this.collector.resume();
  }
}
```

The payload is typed by the entry type you name, so the compiler tells you what
each one needs: [`Entry`](../api-reference/type-aliases/Entry.md) is the union,
and [`EntryType`](../api-reference/type-aliases/EntryType.md) lists the names.

Full signature: [`CollectorService`](../api-reference/classes/CollectorService.md).

### NestLensLogger

Custom logger that integrates with NestLens:

```typescript
import { NestLensLogger } from 'nestlens';

@Injectable()
export class MyService {
  private readonly logger = new NestLensLogger(MyService.name);

  doSomething() {
    this.logger.verbose('Detailed info');
    this.logger.debug('Debug info');
    this.logger.log('General info');
    this.logger.warn('Warning message');
    this.logger.error('Error occurred', error.stack);
  }
}
```

Those five are the whole set — the levels Nest's own logger uses. There is no
`info`; `log` is its equivalent.

### StorageInterface

Implement a storage backend of your own and register it under the `STORAGE`
token:

```typescript
import { StorageInterface, Entry, STORAGE } from 'nestlens';

@Injectable()
export class CustomStorage implements StorageInterface {
  async initialize(): Promise<void> { /* ... */ }
  async save(entry: Entry): Promise<Entry> { /* ... */ }
  async saveBatch(entries: Entry[]): Promise<Entry[]> { /* ... */ }

  // …and the rest of the interface. There are 28 methods in all; the compiler
  // will name every one you have not written yet.
}

@Module({
  providers: [
    {
      provide: STORAGE,
      useClass: CustomStorage,
    },
  ],
})
export class AppModule {}
```

The complete list, with signatures:
[`StorageInterface`](../api-reference/interfaces/StorageInterface.md). For a
worked example, see [Extending storage](/docs/advanced/extending-storage).

## Injection Tokens

Every token a watcher asks you to provide is exported from the package root:

```typescript
import {
  STORAGE,
  NESTLENS_CONFIG,
  NESTLENS_EVENT_EMITTER,
  NESTLENS_REDIS_CLIENT,
  NESTLENS_MODEL_SUBSCRIBER,
  NESTLENS_NOTIFICATION_SERVICE,
  NESTLENS_VIEW_ENGINE,
  NESTLENS_MAILER_SERVICE,
  NESTLENS_HTTP_CLIENT,
  NESTLENS_COMMAND_BUS,
  NESTLENS_GATE_SERVICE,
  NESTLENS_BATCH_PROCESSOR,
  NESTLENS_DUMP_SERVICE,
  REQUEST_ID_HEADER, // 'x-nestlens-request-id'
} from 'nestlens';
```

Each watcher's page explains what to provide under its token. `NESTLENS_CONFIG`
holds the resolved configuration and `NESTLENS_API_PREFIX` is the path segment
the API sits behind; both are exported too. The generated reference lists every
one under [Variables](../api-reference/variables/STORAGE.md).

## Internal Constants

Used internally, not exported:

| Constant | Value | Description |
|----------|-------|-------------|
| `BUFFER_SIZE` | `100` | Entries buffered before automatic flush |
| `FLUSH_INTERVAL` | `1000` | Flush interval in milliseconds |

### Default Sensitive Headers

Masked in captured data without any configuration:

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`
- `x-access-token`
- `x-refresh-token`
- `x-csrf-token`
- `proxy-authorization`

`sensitiveHeaders` adds to this list. To replace it instead, pass
`{ replace: [...] }` — see [Data masking](/docs/security/data-masking).

## Full Documentation

- [Getting Started](/docs/getting-started/installation)
- [Configuration](/docs/configuration/basic-config)
- [Watchers Overview](/docs/watchers/overview)
- [Security](/docs/security/access-control)
