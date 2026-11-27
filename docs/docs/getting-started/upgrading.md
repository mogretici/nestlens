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

`1.0` will be the latest `0.x` with a promise attached. Take the sections below
from the version you are on; they are cumulative, and the ones that need an
edit are `0.17.0` (`storage.redis.maxEntries`), `0.8.0` (configuration keys,
entry points) and `0.6.0` (the `path` option). `0.18.0` asks for nothing in the
code, but for Node 22.13 or later.

The quickest way to find out where you stand is to install and compile: every
removed configuration key is a TypeScript error. At runtime a removed key is
ignored, so a configuration written in JavaScript has to be checked against the
sections below.

## 0.18.0 → 0.18.1

Nothing to edit. One failure is reported differently.

### SQLite storage fails at startup when better-sqlite3's addon does not load

With `storage.driver: 'sqlite'`, an installed `better-sqlite3` whose native
addon is missing or will not load used to be read as a problem with the
database file: NestLens logged *Could not open the SQLite database*, advised
moving `storage.sqlite.filename`, and fell back to in-memory storage. The file
had nothing to do with it. It now fails at startup, as a missing
`better-sqlite3` already did, with the reason and the two commands that build
the addon:

```bash
npm install-scripts approve better-sqlite3 --no-allow-scripts-pin
npm rebuild better-sqlite3
```

The addon goes missing when npm 12 blocks better-sqlite3's install script — it
runs only when your `package.json` allows it, see
[SQLite storage on npm 12](./installation.md#sqlite-storage-on-npm-12) — and
stops loading after a Node upgrade without a rebuild, where
`npm rebuild better-sqlite3` alone is enough. The in-memory and Redis drivers,
and a database file that cannot be opened, behave as before.

## 0.17.x → 0.18.0

Nothing to edit. Three things change: the Node.js floor, the `better-sqlite3`
NestLens installs, and — already in 0.17.3 — the browsers the dashboard supports.

### Node 20 is no longer supported

`engines` now asks for **Node 22.13 or newer**. Node 20 reached end-of-life on
30 April 2026 and stopped receiving security updates; under
[the policy](./versioning-and-support.md#how-long-a-version-stays-supported) it
should have left with 0.10 and stayed until 0.18. The matrix is now Node 22, 24
and 26 — Node 26 has been LTS since 28 October 2026 and was previously
untested — on every NestJS from 9 to 12.

The floor is 22.13 rather than 22.0 because NestJS 12 and `@nestjs/cache-manager`
12 are ESM only. Node loads an ES module through `require` from 22.12; on 22.11
NestLens fails at its first `require('@nestjs/common')` with `ERR_REQUIRE_ESM`
on NestJS 12, and 22.12 prints an `ExperimentalWarning` about it at every boot,
which 22.13 no longer does — see
[NestJS 12 and Node.js](./installation.md#nestjs-12-and-nodejs). CI runs 22.13.0
itself, not only the newest 22.x.

An application on NestJS 9 to 11 still on Node 20 will most likely keep working
for now, but it is no longer tested, and a future release may use something
Node 20 does not have. If `npm install` now warns about the engine, the fix is
to upgrade Node rather than to pin NestLens.

### `better-sqlite3` 12 is the one installed

NestLens lists `better-sqlite3` as an optional dependency so that the SQLite
driver works without a second install. It asked for the 11 line, while every
test ran on 12. The 11 line has no prebuilt binary for Node 26 and does not
compile there, so npm skipped it without an error and `storage.driver: 'sqlite'`
answered *SQLite storage requires better-sqlite3 to be installed*. It now asks
for `^12.11.1`, which installs prebuilt on Node 22, 24 and 26.

The peer range narrows to match, from `^11.0.0 || ^12.0.0 || ^13.0.0` to
`^12.0.0`. npm installs NestLens's own copy whatever the application has, so 11
and 13 were never what NestLens ran on by default, and nothing tested them. An
application on 11 or 13 keeps its own and gets a second copy nested under
`nestlens`; nothing to change.

### The dashboard needs a current browser

Since 0.17.3 the dashboard's stylesheet is built with Tailwind CSS 4, which
relies on cascade layers, `@property` and `color-mix()`. The dashboard needs
Chrome or Edge 111+, Firefox 128+ or Safari 16.4+; it was previously documented
for Chrome 90, Firefox 88 and Safari 14. An older browser still loads it but
does not style it correctly. Nothing changes in your application or its
configuration, and on a supported browser the dashboard looks as it did. See
[Browser Support](../dashboard/overview.md#browser-support).

## 0.16.x → 0.17.0

One edit, and only if you wrote `storage.redis.maxEntries`; and on NestJS 9, an
upgrade to 9.4.3 if you are below it. The rest is behaviour: several watchers
that recorded nothing in a documented setup start recording.

### NestJS 9 means 9.4.3 or later

The peer range was `^9.0.0`, and nothing tested below 9.4.3 — the release CI
installs for the NestJS 9 row. Measured on 9.0.0, the library does not
type-check (`TS1239` on its own `@Inject` parameters), and with type-checking
off 17 tests still fail. The
range is now `^9.4.3 || ^10.0.0 || ^11.0.0 || ^12.0.0` for `@nestjs/common` and
`@nestjs/core`. An application on `^9.x` gets 9.4.3 from a fresh install; one
whose lockfile holds 9.0 to 9.3 updates with `npm update @nestjs/common
@nestjs/core`.

### `storage.redis.maxEntries` is gone

It compiled and did nothing: the factory wrote `storage.maxEntries` over it.
Now it is a compile error. Move the value to the setting that was in effect all
along:

```typescript
// before — ignored
storage: { driver: 'redis', redis: { url, maxEntries: 50_000 } }
// after
storage: { driver: 'redis', maxEntries: 50_000, redis: { url } }
```

A `RedisStorage` constructed by hand still takes `maxEntries`, through
`RedisStorageOptions`.

### Watchers find their host in any module

A token such as `NESTLENS_GATE_SERVICE` or `NESTLENS_REDIS_CLIENT` — and
`CACHE_MANAGER` — provided in `AppModule` or a feature module never reached its
watcher, which recorded nothing. It is found now, wherever it is provided, and
every provider of it is recorded. If you had such a provider, entries of that
type start appearing. See
[Handing a watcher your service](../watchers/overview.md#handing-a-watcher-your-service).

### `NestLensModule` is global and exports its watchers

Every opt-in watcher and `NestLensLogger` are provided and exported whether or
not they are switched on, so a service can take one in its constructor, and
`app.get(NestLensLogger)` works with `enabled: false` or `watchers.log: false`.
Off, a watcher's manual methods do nothing and it installs nothing.
A key written without a value — `watchers: { gate: undefined }`, or
`path: process.env.NESTLENS_PATH` with the variable unset — now means not
configured, anywhere in the configuration: the default stands, which for an
opt-in watcher is off.

### Entries that read differently

- **Event `duration`** is the time the listeners took — `emit` until its
  synchronous listeners return, `emitAsync` until every listener settles. It
  used to run to the next `setImmediate`, including whatever the emitting code
  did afterwards; expect smaller numbers.
- **Log `metadata`** is recorded: the plain object passed after the message.
  It is masked like every payload; keep secrets out of log calls as before.
- **Gate checks** are read by argument type: a second argument that is not a
  string is the subject, not the action. `allows('update-post', post, user)`
  records action `allows`, subject `Post` and the user's id.
- **Cache `clear()`** is recorded, as `clear` on key `*` — the call that empties
  cache-manager 6 and 7.
- **Prisma 6.14 and 7** are recorded by the query watcher once the client is
  built with query logging; a warning says so when it is not. See
  [Prisma](../integrations/prisma.md).
- **Views** answered through a callback — `render(name, locals, cb)`, Express's
  `app.render` — are timed until they call back and recorded with their output;
  they used to be recorded at once, empty. Locals that point back at themselves
  are recorded instead of `{ _error }`.
- **Counts can drop.** Two `NestLensModule.forRoot()` imports in one application
  record a host once, where each call used to be recorded twice; a warning at
  startup names the duplicate import.

### New warnings at startup

- A host provided under a token with request or transient scope is refused,
  with a warning naming the token: there is no single instance to record.
- A Prisma 6.14 or 7 client built without query logging, as above.

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
made date-range filtering in the dashboard wrong. That release compared both
sides through SQLite's `datetime()`; a later one writes `created_at` in the same
ISO format as the parameter and converts the rows already in the file when the
storage opens, so the comparison is plain text order and the index answers it.
No action needed; entries already deleted are gone.

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

The matrix every release is tested against is on
[versioning and support](./versioning-and-support.md#supported-nestjs-and-node-versions).

### Node 18 is no longer supported

From 0.9.0, `engines` asked for **Node 20 or newer**. Node 18 reached end-of-life in
April 2025 and stopped receiving security updates; the matrix then covered Node
20, 22 and 24, including Node 24, which had been LTS since October 2025 and was
previously untested.

Nothing in NestLens requires a Node 20 feature today, so an application still on
Node 18 will most likely keep working — but it is no longer tested, and a future
release may use something Node 18 does not have. If `npm install` now warns
about the engine, the fix is to upgrade Node rather than to pin NestLens.
