---
sidebar_position: 4
---

# Upgrading

What changes between releases and what you have to do about it.

NestLens is pre-1.0, so a minor version may carry a breaking change
([SemVer §4](https://semver.org/#spec-item-4)). Every one of them is listed here
with the exact edit it requires.

## 0.7.x → 0.8.0

Two changes need your attention. Both are quick, and the second one usually
needs nothing at all.

### Removed configuration fields

Fields deprecated since `0.4.0` are gone. If you are still using them, NestJS
will report an unknown property at compile time:

| Removed | Use instead |
| --- | --- |
| `storage.type` | `storage.driver` |
| `storage.filename` | `storage.sqlite.filename` |
| `allowedIps` (top level) | `authorization.allowedIps` |
| `canAccess` (top level) | `authorization.canAccess` |

```typescript
// Before
NestLensModule.forRoot({
  storage: { type: 'sqlite', filename: '.cache/nestlens.db' },
  allowedIps: ['192.168.1.*'],
  canAccess: (req) => Boolean(req.user?.isAdmin),
});

// After
NestLensModule.forRoot({
  storage: { driver: 'sqlite', sqlite: { filename: '.cache/nestlens.db' } },
  authorization: {
    allowedIps: ['192.168.1.*'],
    canAccess: (req) => Boolean(req.user?.isAdmin),
  },
});
```

Nothing else changes — the fields were already forwarded to these locations, so
the behaviour is identical.

### NestLens responses no longer pass through your global interceptors

NestLens now writes its own HTTP responses, which keeps the dashboard and its
API out of your application's response pipeline.

**Most applications need no change.** This is a fix: if you register a global
interceptor that reshapes responses — the common "wrap everything in
`{ success, data }`" pattern — it used to apply to NestLens too, and the result
was a dashboard that would not load:

```
GET /nestlens        → 200 application/json   ← should have been HTML
                       {"success":true,"data":{"options":{"type":"text/html"}}}
GET /nestlens/…/api  → {"success":true,"data":{"success":true,"data":[…]}}
                                               ↑ wrapped twice; the dashboard
                                                 read undefined
```

You only need to act if you were **deliberately** rewriting NestLens responses
from a global interceptor — masking fields in the dashboard's API payloads, for
example. That no longer takes effect; use
[`filter` / `filterBatch`](../advanced/filtering-entries.md) or
[data masking](../security/data-masking.md) instead, which apply to entries as
they are recorded rather than to the HTTP response.

Global **guards** and **exception filters** for your own routes are unaffected.

### New: reverse proxy support

Not breaking — new and off by default. If a proxy serves NestLens under a
stripped path segment, see
[`trustProxy`](../configuration/basic-config.md#trustproxy).

### Also in this release

The dashboard bundle is now read from disk once and kept in memory, and its
fingerprinted assets are served with a long-lived `Cache-Control` while
`index.html` stays `no-cache`. Nothing to configure; the dashboard just costs
your application less per load. See
[performance](../advanced/performance.md#serving-the-dashboard).

## The package now declares what it publishes

NestLens ships an `exports` map. Two entry points are public:

```ts
import { NestLensModule } from 'nestlens';
import { SqliteStorage } from 'nestlens/storage/sqlite';
import { RedisStorage } from 'nestlens/storage/redis';
```

Everything else under `dist/` is internal and no longer importable. If you were
reaching into the build layout — `nestlens/dist/core/storage/sqlite.storage` was
the one this documentation suggested — switch to the entry point above; it is
the same class.

```diff
- import { SqliteStorage } from 'nestlens/dist/core/storage/sqlite.storage';
+ import { SqliteStorage } from 'nestlens/storage/sqlite';
```

This is deliberately a pre-1.0 change. Without a map, every internal file was
importable, and `1.0`'s promise to freeze the API would have frozen the folder
structure with it — moving a service between directories would have become a
breaking change.

NestLens is published as **CommonJS** and stays that way. It loads correctly in
an ESM application through Node's interop (`import { NestLensModule } from
'nestlens'` works), and NestJS itself is CommonJS, so a dual build would add a
second copy of the decorators and their metadata for no gain.

## Verified NestJS and Node versions

Every release is tested against this matrix in CI:

| | Node 20 | Node 22 | Node 24 |
| --- | --- | --- | --- |
| **NestJS 9** | ✅ | ✅ | ✅ |
| **NestJS 10** | ✅ | ✅ | ✅ |
| **NestJS 11** | ✅ | ✅ | ✅ |

Both the Express and Fastify adapters are covered.

### Node 18 is no longer supported

`engines` now asks for **Node 20 or newer**. Node 18 reached end-of-life in
April 2025 and stopped receiving security updates; the matrix above covers the
versions that still do, including Node 24, which has been LTS since October 2025
and was previously untested.

Nothing in NestLens requires a Node 20 feature today, so an application still on
Node 18 will most likely keep working — but it is no longer tested, and a future
release may use something Node 18 does not have. If `npm install` now warns
about the engine, the fix is to upgrade Node rather than to pin NestLens.
