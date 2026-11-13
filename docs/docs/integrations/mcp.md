---
sidebar_position: 6
---

# MCP Server (AI agents)

`nestlens-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent — Claude Code, Claude Desktop, Cursor, anything that speaks MCP — read what NestLens has recorded: requests, queries, exceptions, logs, jobs and the rest.

It is a thin client over the REST API the dashboard already uses. Nothing is added to your application's runtime, and nothing new is exposed: the agent sees what the dashboard shows, through the same guard.

## Setup

The server talks to a running application, so NestLens has to be mounted and reachable first. Then add it to your MCP client.

**Claude Code**

```bash
claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
```

**Any client that takes a JSON config** (Claude Desktop, Cursor, ...)

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": ["nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
    }
  }
}
```

`npx nestlens-mcp` needs `@modelcontextprotocol/sdk`, an optional peer dependency, next to `nestlens`:

```bash
npm install --save-dev @modelcontextprotocol/sdk
```

`--url` is the address of your application **plus the path NestLens is mounted at** (`path` in `NestLensModule.forRoot`, `/nestlens` by default).

## One hub, not one tool per endpoint

The server exposes two tools:

| Tool | What it does |
| --- | --- |
| `nestlens_list_tools` | Lists every operation NestLens offers, with a description and the arguments each takes. Takes an optional `names` list to look at a few. |
| `nestlens_call_tool` | Runs one of them by name: `{ "name": "get_stats" }`, or `{ "name": "get_entries_with_cursor", "arguments": { "type": "log", "levels": ["error"], "limit": 20 } }`. |

The list is not written into the MCP server. It is read from your application — `GET /nestlens/__nestlens__/api/tools` — each time it is asked for, and that endpoint is built from the API controllers themselves. So when NestLens gains an endpoint, an agent can use it straight away, and `nestlens-mcp` does not need a new release.

An agent starts with `nestlens_list_tools`, then calls what it needs. `get_stats` is the usual first call; `get_entries_with_cursor` takes every filter the dashboard has.

## Read-only by default

Tools that change something — `clear_entries`, `run_pruning`, `pause_recording`, `resolve_entry`, the tag edits — are listed, marked `"enabled": false`, and refused. An agent that was asked to look cannot clear what it is looking at.

Turn them on when you want an agent to act:

```bash
npx nestlens-mcp --url http://localhost:3000/nestlens --allow-write
```

## Options

| Option | Environment | Default |
| --- | --- | --- |
| `--url <address>` | `NESTLENS_URL` | `http://localhost:3000/nestlens` |
| `--header "Name: value"` (repeatable) | `NESTLENS_HEADERS` (JSON object) | none |
| `--allow-write` | `NESTLENS_MCP_ALLOW_WRITE=1` | off |
| `--timeout <ms>` | | `15000` |

If your `authorization.canAccess` wants a token or a cookie, pass it as a header. Prefer the environment variable: command-line arguments are visible to every user on the machine in the process list.

```bash
NESTLENS_HEADERS='{"Authorization":"Bearer dev-token"}' npx nestlens-mcp --url http://localhost:3000/nestlens
```

## Using it from code

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NestLensClient, createNestLensMcpServer } from 'nestlens/mcp';

const server = createNestLensMcpServer({
  client: new NestLensClient({ baseUrl: 'http://localhost:3000/nestlens' }),
  allowWrite: false,
});

await server.connect(new StdioServerTransport());
```

## Security

- **It is the dashboard's door.** The server calls the same API, so [`allowedEnvironments`](../configuration/authorization), IP rules, `canAccess` and the [rate limit](../configuration/rate-limiting) all apply to it, from the address it connects from.
- **What is masked stays masked.** [Data masking](../security/data-masking) happens when an entry is recorded, so the agent never sees a value the dashboard would not show.
- **What is not masked reaches the model.** Recorded request bodies, query parameters and log lines can contain customer data, and an agent sends what it reads to its model provider. Use it against development and staging, as NestLens itself is meant to be used.
- **Recorded text is data, not instructions.** An agent reading a log line or a request body that says "ignore your instructions" should not obey it, and `--allow-write` is what limits the damage when one does.

## Adding a tool

A new endpoint becomes a tool by being decorated, in the same place it is written:

```typescript
@NestLensTool({
  description: 'Entries recorded in the last N minutes, newest first. Use it to see what just happened.',
})
@Get('entries/recent')
async getRecentEntries(@Query() query: RecentQueryDto, @Res() _res?: unknown) {
  // ...
}
```

The tool is named after the method (`get_recent_entries`). Its parameters — their types, enums and bounds — are read from the DTO the handler already validates with, and anything that is not a `GET` is treated as a change and stays behind `--allow-write`. A test fails for an API route that is neither decorated nor excluded on purpose, so one cannot be forgotten.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Could not reach NestLens` | The application is not running, or `--url` is wrong. |
| `answered with something that is not JSON ... dashboard mount` | `--url` points at the application, not at the dashboard mount. Add the path, for example `/nestlens`. |
| `did not return a tool list` | The application runs a version of `nestlens` older than the one that added this endpoint. |
| `answered 403` | The guard refused the connection: `allowedEnvironments`, `allowedIps` or `canAccess`. Pass credentials with `NESTLENS_HEADERS`. |
| `answered 429` | The rate limit. The default is 100 requests a minute per address. |
| An empty list straight after a request | Entries are buffered for about a second before they are stored. |
