---
sidebar_position: 5
---

# Live Tail

The dashboard streams new entries as they happen. Trigger a request in your
application and it appears in the list immediately — no refresh, no polling
delay.

This is on by default. There is nothing to configure.

## How it works

NestLens exposes a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
endpoint that the dashboard subscribes to:

```
GET /nestlens/__nestlens__/stream
```

Whenever the collector records an entry, it is pushed to every connected
dashboard. SSE was chosen over WebSockets deliberately: it is plain HTTP, works
through proxies without extra configuration, and the browser reconnects on its
own if the connection drops.

The stream follows your configured `path` and any global prefix, exactly like
the rest of NestLens:

| Setup | Stream endpoint |
|---|---|
| default | `/nestlens/__nestlens__/stream` |
| `path: '/admin/monitoring'` | `/admin/monitoring/__nestlens__/stream` |
| `app.setGlobalPrefix('api')` | `/api/nestlens/__nestlens__/stream` |

## Connection status

List pages show a **Live** indicator. When it is lit, the stream is connected
and entries arrive as they are collected. If the connection drops — a server
restart, a proxy timeout — the browser reconnects automatically and the
indicator returns.

Entries that arrived while you were disconnected are not lost: they were still
recorded, and a refresh brings them in.

## Pausing

Recording can be paused from the dashboard toolbar. While paused, no new entries
are collected, so nothing is streamed. Resume to start receiving again.

This is useful when you want to reproduce a specific flow without the list
moving under you.

## Notes for reverse proxies

SSE needs the connection to stay open and unbuffered. Most setups work out of
the box, but nginx buffers proxied responses by default:

```nginx
location /nestlens/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
}
```

Without `proxy_buffering off`, entries arrive in bursts rather than in real
time. NestLens already sends `X-Accel-Buffering: no`, which nginx honours in
most configurations — the directive above is the explicit fallback.
