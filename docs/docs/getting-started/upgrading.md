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

## Verified NestJS and Node versions

Every release is tested against this matrix in CI:

| | Node 18 | Node 20 | Node 22 |
| --- | --- | --- | --- |
| **NestJS 9** | ✅ | ✅ | ✅ |
| **NestJS 10** | ✅ | ✅ | ✅ |
| **NestJS 11** | — | ✅ | ✅ |

NestJS 11 requires Node 20 or newer, which is why that one cell is empty.

Both the Express and Fastify adapters are covered.
