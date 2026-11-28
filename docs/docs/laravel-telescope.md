---
sidebar_position: 2
title: NestLens vs Laravel Telescope
description: Laravel Telescope for NestJS. How NestLens maps to Telescope watcher by watcher, and what is different.
---

# NestLens vs Laravel Telescope

NestLens is a Laravel Telescope for NestJS: the same idea, a dashboard of what
the application just did, built for NestJS's modules, interceptors and the
libraries a NestJS application uses instead of the ones Laravel ships with.

## What Telescope is

[Laravel Telescope](https://laravel.com/docs/13.x/telescope) is Laravel's
debugging assistant for local development. Its watchers record the requests
coming into the application, exceptions, log entries, database queries, queued
jobs, mail, notifications, cache operations, scheduled tasks, variable dumps and
more, and its dashboard at `/telescope` shows them.

## Install in three lines

```bash
npm install nestlens
```

```typescript title="app.module.ts"
imports: [NestLensModule.forRoot({ enabled: process.env.NODE_ENV !== 'production' })],
```

Start the application and open `http://localhost:3000/nestlens`. The
[quick start](./getting-started/quick-start.md) has the whole file.

## Watcher by watcher

Telescope's documentation lists eighteen watchers. NestLens has a watcher of the
same name for each of them, and one more, for GraphQL. A shared name does not
always mean the same thing is recorded: where the two differ, the table says so.

| Telescope watcher | Telescope records | NestLens watcher | NestLens records |
| --- | --- | --- | --- |
| Batch | Queued job batches | [`batch`](./watchers/batch.md) | Batch and bulk operations: imports, exports, bulk updates |
| Cache | Cache hits, misses, updates and removals | [`cache`](./watchers/cache.md) | Cache gets, sets, deletes and clears, with hit or miss |
| Command | Artisan commands: arguments, options, exit code, output | [`command`](./watchers/command.md) | CQRS commands sent through `CommandBus` |
| Dump | Variable dumps | [`dump`](./watchers/dump.md) | Database dumps, exports, imports, backups and migrations |
| Event | Dispatched events, their listeners and broadcast data | [`event`](./watchers/event.md) | EventEmitter2 events, their payloads and listeners |
| Exception | Reportable exceptions and their stack traces | [`exception`](./watchers/exception.md) | Unhandled exceptions and their stack traces |
| Gate | Gate and policy checks and their results | [`gate`](./watchers/gate.md) | Authorization checks made through a gate service you provide |
| HTTP Client | Outgoing HTTP client requests | [`httpClient`](./watchers/http-client.md) | Outgoing HTTP requests |
| Job | Dispatched jobs and their status | [`job`](./watchers/job.md) | Bull and BullMQ jobs and their status |
| Log | Log entries | [`log`](./watchers/log.md) | Logs written through NestJS's logger |
| Mail | Sent mail, with an in-browser preview | [`mail`](./watchers/mail.md) | Sent mail: recipients, subject and content |
| Model | Eloquent model events | [`model`](./watchers/model.md) | TypeORM and Prisma model operations |
| Notification | Sent notifications | [`notification`](./watchers/notification.md) | Notifications on email, SMS, push, socket and webhook channels |
| Query | Raw SQL, bindings and execution time | [`query`](./watchers/query.md) | TypeORM and Prisma queries, their parameters and duration |
| Redis | Redis commands | [`redis`](./watchers/redis.md) | Redis commands, their arguments and duration |
| Request | Requests, headers, session and response | [`request`](./watchers/request.md) | HTTP requests and responses, headers, bodies and timing |
| Schedule | Scheduled tasks and their output | [`schedule`](./watchers/schedule.md) | `@Cron`, `@Interval` and `@Timeout` tasks |
| View | Rendered views, their data and composers | [`view`](./watchers/view.md) | Template rendering |
| — | — | [`graphql`](./watchers/graphql.md) | GraphQL queries, mutations and subscriptions, with N+1 detection |

`request`, `query`, `exception` and `log` are on by default. The other fifteen
are switched on in `watchers`, and most of them also need the library's client
handed to NestLens, because in NestJS the queue, the mailer and the cache are
separate packages rather than part of the framework. Each watcher's page shows
how.

## What is different

| | Telescope | NestLens |
| --- | --- | --- |
| Setup | A service provider, and watchers listed in `config/telescope.php` | `NestLensModule.forRoot()`, once, in the root module. It is global, so feature modules inject a watcher without importing it again |
| Storage | Database tables, created by `php artisan migrate` | In memory by default; [SQLite or Redis](./configuration/storage.md) when entries have to survive a restart. No migration |
| Pruning | Schedule `telescope:prune`; 24 hours by default | Runs on its own: entries older than 24 hours, checked every hour, both [configurable](./configuration/pruning.md) |
| Who can open it | The `local` environment, and a `viewTelescope` gate elsewhere | `development`, `local` and `test` by default, plus [IP rules, roles and a `canAccess` function](./configuration/authorization.md) |
| HTTP | Laravel's own | Express and Fastify |
| GraphQL | No watcher in its list | Registers itself with Apollo or Mercurius when `graphql` is on |
| AI agents | Not part of Telescope; Laravel has separate [MCP](https://laravel.com/docs/13.x/mcp) and [Boost](https://laravel.com/docs/13.x/boost) packages | [`nestlens-mcp`](./integrations/mcp.md) lets an agent read what was recorded, read-only by default |

Both tag entries and can filter what is recorded. In NestLens that is the
`filter` option and the [filtering guide](./advanced/filtering-entries.md).

## Next

- [Installation](./getting-started/installation.md): requirements and the optional peers.
- [Watchers overview](./watchers/overview.md): every watcher and its options.
- [Production usage](./security/production-usage.md): before turning it on anywhere but your machine.
