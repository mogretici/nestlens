---
sidebar_position: 4
---

# Upgrading

What changes between releases and what you have to do about it.

NestLens is pre-1.0, so a minor version may carry a breaking change
([SemVer §4](https://semver.org/#spec-item-4)). Every one of them is listed here
with the exact edit it requires.

From `1.0` that stops: breaking changes will arrive only in a major release,
after a deprecation that lasts at least two minors. See
[versioning and support](./versioning-and-support.md) for what is covered and
for how long.

## Coming from any `0.x` to `1.0`

If you are on the latest `0.9.x`, there is nothing to do — `1.0` is the same
code with a promise attached. If you are coming from further back, take the
sections below in order; they are cumulative, and the ones that need an edit are
`0.8.0` (configuration keys, entry points) and `0.6.0` (the `path` option).

The quickest way to find out where you stand is to install and boot: every
removed configuration key fails loudly at startup rather than being ignored.

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

## Two storage fixes worth knowing about

**Pruning on SQLite deleted more than it was asked to.** SQLite writes
`created_at` as `2026-08-12 21:55:45` while a JavaScript `Date` arrives as
`2026-08-12T21:25:45.292Z`, and the two were compared as text: the eleventh
character decides, a space sorts before a `T`, and so every entry recorded on
the cutoff's date or earlier read as older than the cutoff whatever its time.
Automatic pruning therefore emptied the day's entries, and the same comparison
made date-range filtering in the dashboard wrong. Both now compare through
SQLite's `datetime()`. No action needed; entries already deleted are gone.

**Monitored tags are normalised.** Entry tags have always been stored upper-cased
so that `slow` and `SLOW` are one tag; monitored tags were stored exactly as
typed, and the dashboard looks a monitored tag up among the entry tags to count
it. Monitoring `checkout` therefore always showed **0 entries**, on every
backend. Monitored tags now go through the same normalisation, and the count
matches on both sides regardless of what is already stored.

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
'nestlens'` works), and a dual build would add a second copy of the decorators
and their metadata for no gain.

## NestJS 12

NestLens supports NestJS 12 alongside 9, 10 and 11, with
`@nestjs/graphql`, `@nestjs/apollo` and `@nestjs/mercurius` 14 and
`@nestjs/cache-manager` 12. Nothing in your NestLens configuration changes.

The Node.js floor on NestJS 12 is higher than on 9 to 11, and AWS Lambda needs
a flag: see [NestJS 12 and Node.js](./installation.md#nestjs-12-and-nodejs).

NestLens itself stays CommonJS, which is what NestJS's migration guide expects
of a library: the application keeps its module format, and so does everything it
loads.

## Dashboard deep links on NestJS 9 and 10

A fix, independent of NestJS 12, with nothing to change on your side.

On NestJS 9 or 10 with Express 5 somewhere else in the dependency tree —
`@modelcontextprotocol/sdk`, which NestLens's MCP server uses, brings it — npm
hoists Express 5 and nests the adapter's Express 4 under
`@nestjs/platform-express`. NestLens read the hoisted one, mounted the
dashboard's catch-all in Express 5's syntax on an Express 4 router, and every
deep link into the dashboard (`/nestlens/requests/42`) answered 404. It now
reads the Express the adapter actually loads.

## Verified NestJS and Node versions

Every release is tested against this matrix in CI:

| | Node 20 | Node 22 | Node 24 |
| --- | --- | --- | --- |
| **NestJS 9** | ✅ | ✅ | ✅ |
| **NestJS 10** | ✅ | ✅ | ✅ |
| **NestJS 11** | ✅ | ✅ | ✅ |
| **NestJS 12** | ✅ | ✅ | ✅ |

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
