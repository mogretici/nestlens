---
sidebar_position: 6
---

# Alerting

Send entries to Slack, Discord or your own endpoint as they are collected. By
default only exceptions trigger an alert.

Alerting is off unless you configure it.

```typescript
NestLensModule.forRoot({
  alerting: {
    enabled: true,
    webhooks: [
      {
        url: process.env.SLACK_WEBHOOK_URL,
        type: 'slack',
      },
    ],
  },
});
```

That is enough to get a message in Slack whenever your application throws.

## Options

### `alerting`

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Turns alerting on |
| `webhooks` | `AlertingWebhook[]` | `[]` | One or more destinations |
| `timeoutMs` | `number` | `5000` | Per-delivery timeout |

### `AlertingWebhook`

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | Where to POST |
| `type` | `'slack' \| 'discord' \| 'generic'` | `'generic'` | Payload shape |
| `events` | `EntryType[]` | `['exception']` | Entry types that trigger this webhook |
| `throttleMs` | `number` | `60000` | Minimum gap between alerts sharing a dedup key |

## Payload shapes

**Slack** — an incoming-webhook message:

```json
{ "text": "🔭 *NestLens* — TypeError\nCannot read property 'id' of undefined — GET /orders" }
```

**Discord** — the same text under `content`:

```json
{ "content": "🔭 *NestLens* — TypeError\nCannot read property 'id' of undefined — GET /orders" }
```

**Generic** — structured JSON for your own handler:

```json
{
  "event": "exception",
  "entry": {
    "id": 42,
    "type": "exception",
    "requestId": "b6f1…",
    "title": "TypeError",
    "description": "Cannot read property 'id' of undefined — GET /orders"
  }
}
```

## Throttling

The same failure usually fires many times in a row. Each webhook keeps a dedup
key per entry and refuses to send again until `throttleMs` has passed:

- **Exceptions** are keyed by name and message, so a repeating `TypeError` with
  the same message is sent once a minute rather than once per request
- **Everything else** is keyed by entry id, which means no deduplication in
  practice — use `throttleMs: 0` to disable throttling explicitly

## Multiple destinations

Each webhook has its own event list and its own throttle:

```typescript
NestLensModule.forRoot({
  alerting: {
    enabled: true,
    webhooks: [
      {
        url: process.env.SLACK_WEBHOOK_URL,
        type: 'slack',
        events: ['exception'],
      },
      {
        url: 'https://ops.internal/nestlens',
        type: 'generic',
        events: ['exception', 'job'],
        throttleMs: 0,
      },
    ],
  },
});
```

## Failure handling

Alerting never interferes with your application:

- Deliveries are fire-and-forget — request handling is not blocked
- Each delivery has its own timeout (`timeoutMs`, default 5s)
- A webhook that errors or times out is logged and ignored; the entry is still
  recorded normally

A dead webhook URL will not slow down or break your app.

## Choosing what to alert on

`events` accepts any entry type. Useful combinations:

```typescript
events: ['exception']            // default — failures only
events: ['exception', 'job']     // add failed background jobs
events: ['exception', 'query']   // noisy; pair with a filter
```

For finer control — say, only exceptions from a specific route — use the
[entry filter](/docs/advanced/filtering-entries) to drop entries before they
reach the collector. Anything filtered out never triggers an alert.

:::info On a GraphQL API
`['exception']` covers resolvers too: the [GraphQL watcher](/docs/watchers/graphql)
records what a resolver threw as an `exception` entry beside the operation, so
this webhook fires for it. A malformed query is not among them — nobody threw,
the caller made the mistake, and a webhook anyone with curl can trigger is a
pager anyone with curl can ring.

Adding `'graphql'` alerts on *every* operation rather than the failed ones;
narrow it with a filter if that is what you want:

```typescript
sampling: { rate: 0, always: ['exception', 'graphql'] },
filter: (entry) => entry.type !== 'graphql' || entry.payload.hasErrors === true,
```

`sampling` runs before `filter`, which is why the type has to be named in both.
:::

### Sending somewhere else

`type: 'slack'` posts `{ "text": "..." }`, which is also what Telegram's
`sendMessage` accepts — pointing a Slack-shaped webhook at
`https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>` works with no
adapter in between. Confirmed against a real bot. Anything that accepts a
JSON body with a `text` field works the same way; `type: 'generic'` posts the
whole entry when the receiver wants the detail.
