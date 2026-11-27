---
sidebar_position: 1
---

# Installation

## Requirements

- Node.js >= 22.13.0
- NestJS >= 9.0.0 (supports 9, 10, 11, 12)
- TypeScript >= 4.7

Every release is tested against Node 22, 24 and 26 on each of those NestJS
versions, with both the Express and Fastify adapters.

### NestJS 12 and Node.js

NestJS 12 ships as ESM only, and a CommonJS application — NestLens included —
loads it through `require(esm)`, which Node enables from **22.12** onwards. So
does `@nestjs/cache-manager` 12, which an application on NestJS 9 to 11 installs
too. On an older Node 22 the first `require` of either fails with
`ERR_REQUIRE_ESM`. 22.12 itself prints an `ExperimentalWarning` at every boot —
*CommonJS module … is loading ES Module …/@nestjs/common/index.js using
require()* — which 22.13 only prints under `--trace-require-module`. That is
why the floor is 22.13.

On AWS Lambda's Node.js runtimes `require(esm)` is disabled by default. NestJS's
[migration guide](https://docs.nestjs.com/migration-guide) has the function set
`NODE_OPTIONS=--experimental-require-module`.

## Entry points

The package publishes three:

```ts
import { NestLensModule } from 'nestlens';
import { SqliteStorage } from 'nestlens/storage/sqlite';
import { RedisStorage } from 'nestlens/storage/redis';
```

The two storage classes have their own entry points so that importing NestLens
never loads `better-sqlite3` or `ioredis` — you only pay for the driver you use.
Most applications never need them directly; `storage.driver` in the
configuration is enough.

NestLens is published as CommonJS. An ESM application can import it normally;
Node's interop handles it.

## Install via npm

```bash npm2yarn
npm install nestlens
```

## Peer Dependencies

NestLens requires these peer dependencies (likely already in your NestJS project):

- `@nestjs/common` ^9.4.3 || ^10.0.0 || ^11.0.0 || ^12.0.0
- `@nestjs/core` ^9.4.3 || ^10.0.0 || ^11.0.0 || ^12.0.0
- `reflect-metadata` ^0.1.13 || ^0.2.0
- `rxjs` ^7.0.0

## Bundled Dependencies

These ship with NestLens — you don't need to install them:

- `class-transformer` - DTO transformation
- `class-validator` - Input validation
- `uuid` - Request ID generation

## Optional Dependencies

Install these only when you use the matching feature. They are declared as
optional peer dependencies, so npm will not complain if they are missing, and
the ranges are the ones npm checks when they are present — except
`better-sqlite3`, which NestLens installs itself (see below):

- `better-sqlite3` ^12.0.0 — SQLite storage driver
- `ioredis` ^5.0.0 — Redis storage driver
- `bullmq` ^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 — Job watcher on BullMQ queues
- `@nestjs/cache-manager` ^1.0.0 || ^2.0.0 || ^3.0.0 || ^12.0.0 — Cache watcher
- `graphql` ^15.0.0 || ^16.0.0 || ^17.0.0 — GraphQL watcher, with one of the two
  servers below
- `@nestjs/graphql` ^9.0.0 || ^10.0.0 || ^11.0.0 || ^12.0.0 || ^13.0.0 || ^14.0.0
- `@nestjs/apollo` ^9.0.0 || ^10.0.0 || ^11.0.0 || ^12.0.0 || ^13.0.0 || ^14.0.0 —
  with `@apollo/server`, for Apollo
- `@apollo/server` ^4.0.0 || ^5.0.0
- `@nestjs/mercurius` ^9.0.0 || ^10.0.0 || ^11.0.0 || ^12.0.0 || ^13.0.0 || ^14.0.0 —
  with `mercurius`, for Mercurius on Fastify
- `mercurius` ^12.0.0 || ^13.0.0 || ^14.0.0 || ^15.0.0 || ^16.0.0
- `@modelcontextprotocol/sdk` ^1.32.0 — the `nestlens-mcp` server for AI agents

`@nestjs/schedule` is not a peer: the Schedule watcher finds its
`SchedulerRegistry` when the application has imported `ScheduleModule.forRoot()`,
and records nothing otherwise. The other watchers that need a library — mail,
notifications, views, commands, events, gates, Redis, HTTP clients and models —
are handed the application's own client or service through a token
(`NESTLENS_REDIS_CLIENT`, `NESTLENS_EVENT_EMITTER`, …), so the version is
whichever the application uses.

> `better-sqlite3` is also an `optionalDependency` (`^12.11.1`), so npm
> installs it with NestLens and there is nothing to add to your dependencies
> (on npm 12, allow its install script: see
> [below](#sqlite-storage-on-npm-12)). npm installs that copy whatever the
> application has: an application on another major — 11 or 13 —
> keeps its own and gets a second one nested under `nestlens` (measured with
> npm 11.21.3). If the native install fails, npm skips the package without an
> error; NestLens still runs on the default in-memory storage, and
> `storage.driver: 'sqlite'` fails at startup asking for `better-sqlite3`.
>
> pnpm and Yarn do not document what they do with a package that is both an
> optional dependency and a peer, and NestLens is not tested with them.

### SQLite storage on npm 12

npm 12 runs a dependency's install script only when the application's own
`package.json` allows it in `allowScripts`
([npm install-scripts](https://docs.npmjs.com/cli/v12/commands/npm-install-scripts)),
and better-sqlite3's install script is what downloads its native addon.
Without that entry `npm install` still succeeds and ends with a warning that
better-sqlite3's install script was blocked; the package is there, its addon
is not, and with `storage.driver: 'sqlite'` NestLens logs an error saying so
and keeps entries in memory instead. Allow it, then build the copy that is
already installed:

```bash
npm install-scripts approve better-sqlite3 --no-allow-scripts-pin
npm rebuild better-sqlite3
```

`--no-allow-scripts-pin` writes `"better-sqlite3": true`. Without it npm
writes `"better-sqlite3@12.11.1": true`, which covers that version only, so the
next upgrade is blocked again. An `npm install` after approving does not go
back for the script it skipped; `npm rebuild` does, and so does an `npm ci`
from scratch.

NestLens cannot allow it for you: npm reads `allowScripts` from the
application's `package.json` alone, never from a dependency's. With the default
in-memory storage, or Redis, there is nothing to do. npm 11 still runs the
script and only warns that it is not covered.

## HTTP Adapter Compatibility

NestLens works with **both** NestJS HTTP adapters out of the box — no extra
configuration is required:

- `@nestjs/platform-express` (default)
- `@nestjs/platform-fastify`

The dashboard lives at `/nestlens` on both adapters.

> **Fastify note:** Fastify does not treat trailing slashes as equivalent by
> default. The dashboard is served at `/nestlens` (no trailing slash). If you
> want `/nestlens/` to resolve as well, enable `ignoreTrailingSlash: true` in
> your `FastifyAdapter` options.

## Verify Installation

After installation, verify it's working:

```bash
npm ls nestlens
```
