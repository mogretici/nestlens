---
sidebar_position: 1
---

# Installation

## Requirements

- Node.js >= 18.0.0
- NestJS >= 9.0.0 (supports 9, 10, 11)
- TypeScript >= 4.7

## Install via npm

```bash npm2yarn
npm install nestlens
```

## Peer Dependencies

NestLens requires these peer dependencies (likely already in your NestJS project):

- `@nestjs/common` ^9.0.0 || ^10.0.0 || ^11.0.0
- `@nestjs/core` ^9.0.0 || ^10.0.0 || ^11.0.0
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
