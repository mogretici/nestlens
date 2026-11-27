---
sidebar_position: 1
---

# Installation

## Requirements

- Node.js >= 20.0.0 — **20.19 or 22.12 and later on NestJS 12**
- NestJS >= 9.0.0 (supports 9, 10, 11, 12)
- TypeScript >= 4.7

Every release is tested against Node 20, 22 and 24 on each of those NestJS
versions, with both the Express and Fastify adapters.

### NestJS 12 and Node.js

NestJS 12 ships as ESM only, and a CommonJS application — NestLens included —
loads it through `require(esm)`. Node enables that from **20.19** and **22.12**
onwards, so those are the real floor on NestJS 12; NestJS 9 to 11 still run on
any Node 20.

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
optional peer dependencies, so npm will not complain if they are missing:

| Package | Needed for |
|---------|-----------|
| `better-sqlite3` ^11.0.0 | SQLite storage driver |
| `ioredis` ^5.0.0 | Redis storage driver and Redis watcher |
| `@nestjs/graphql` + `@nestjs/apollo` + `@apollo/server` | GraphQL watcher (Apollo) |
| `@nestjs/graphql` + `@nestjs/mercurius` + `mercurius` | GraphQL watcher (Mercurius/Fastify) |
| `@nestjs/schedule` | Schedule watcher (cron/interval/timeout tracking) |

> `better-sqlite3` is also listed as an `optionalDependency`, so npm tries to
> install it automatically; if the native build fails, NestLens still works on
> the default in-memory storage.

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
