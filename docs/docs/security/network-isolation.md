---
sidebar_position: 3
---

# Network Isolation

Serve the dashboard on a listener of its own, bound to an address you choose,
instead of mounting it on your application's server.

## Why

Everything under [Access Control](./access-control.md) decides who is allowed
through. This decides who can reach the door.

By default NestLens mounts on your application's HTTP server. Whatever reaches
that server reaches `/nestlens` too, and the only thing standing in the way is
the guard in front of it. If the application is behind a reverse proxy that is
supposed to exclude the path, one mistake in that proxy — a `location` block
that never matches, an ordering change, a config reload that failed quietly —
publishes every recorded Authorization header, cookie and request body to the
internet. Nothing inside the application can tell that it happened.

A control that depends on another component staying correct is weaker than one
that does not.

Given a `server`, NestLens binds its own socket to the address you name and
registers **no** dashboard route on your application at all. Point it at a
private interface — a VPN or tailnet address, a container network, `127.0.0.1`
behind an SSH tunnel — and the dashboard is not merely protected from the public
interface; it is absent from it.

This is the shape Grafana, Prometheus and the Kubernetes API server all use, and
for the same reason.

## Usage

```typescript
NestLensModule.forRoot({
  server: {
    host: '100.64.0.5', // a tailnet address
    port: 3001,
  },
});
```

The dashboard is then at `http://100.64.0.5:3001/nestlens`, and
`http://your-app:3000/nestlens` is a 404 — not a 403, a 404, because the route
does not exist there.

`path` still applies, so `path: '/admin/monitoring'` puts the dashboard at
`http://100.64.0.5:3001/admin/monitoring`. A global prefix set with
`app.setGlobalPrefix()` does not: it belongs to your application's routes, and
this listener has none of them.

| Option | Type | Description |
|--------|------|-------------|
| `host` | `string` | Address to bind. No default — see below. |
| `port` | `number` | Port to bind. `0` asks the OS for a free one. |

Omit `server` entirely and nothing changes: the dashboard mounts on your
application exactly as it always has.

### There is no default address

`host` is required. `0.0.0.0` is a perfectly good answer where the network is
the boundary — a container on an internal network, a host behind a firewall you
control — it just has to be an answer somebody wrote down rather than one that
arrived by omission.

The socket is bound to that address alone. This is not a filter applied after
listening on everything: an address the host does not hold fails at startup.

## It fails loudly

If the address cannot be bound, the dashboard does not start and says so:

```
[NestLens] Could not bind the dashboard listener to 100.64.0.5:3001 — listen
EADDRNOTAVAIL: address not available 100.64.0.5:3001. The dashboard is not
mounted on the application either, so it is not reachable at all; fix the
address or remove `server` from the NestLens configuration. The application is
starting without it.
```

Your application starts either way. A port already taken or an address the host
does not hold is a deployment's condition rather than a mistake in its code,
and a debugging tool is never a reason for a deployment not to boot.

There is deliberately no fallback to mounting on the application. A silent
fallback is precisely how a private dashboard becomes a public one — so the
cost of a bad address is the dashboard, and only the dashboard.

On a successful start NestLens logs where it went, so the mode in force is
visible without reading code:

```
[NestLens] Dashboard on its own listener: http://100.64.0.5:3001/nestlens — not mounted on the application
```

The listener is closed when the module is destroyed, along with the application.

## Authorization still applies

Address isolation is the first layer, not a replacement for the second.
`allowedEnvironments`, `allowedIps`, `canAccess`, `requiredRoles` and rate
limiting are enforced on this listener exactly as they are on the mounted one.

```typescript
NestLensModule.forRoot({
  // Layer 1: not on the public interface at all
  server: { host: '100.64.0.5', port: 3001 },

  // Layer 2: and still, only these people
  authorization: {
    allowedEnvironments: ['production'],
    canAccess: (req) => verifySession(req),
    requiredRoles: ['admin'],
  },
});
```

## What it shares with your application

One process, one set of entries. The listener serves the same storage,
collector and pruning service your watchers are writing to — it is a second
door onto the same room, not a second room. Live tail, tags and pruning all
behave as they do on the mounted dashboard.

It uses the same HTTP platform your application does (Express or Fastify),
whichever `@nestjs/platform-*` package is installed.

## Note for reverse-proxy deployments

`trustProxy` and `X-Forwarded-Prefix` exist for a dashboard being proxied. If
you have moved the dashboard off the application's server precisely so that no
proxy is in front of it, you do not need them — and leaving `trustProxy: true`
on means `X-Forwarded-For` is still honoured for IP whitelisting, which is only
correct if something you control really is setting it.

## Related

- [Access Control](./access-control.md) — who is allowed through
- [IP Whitelisting](./ip-whitelisting.md) — restricting by client address
- [Production Usage](./production-usage.md) — running NestLens in production
