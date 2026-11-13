---
sidebar_position: 6
---

# MCP Server (AI agents)

`nestlens-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent — Claude Code, Cursor, VS Code, Claude Desktop, anything that speaks MCP — look at what NestLens has recorded: requests, queries, exceptions, logs, jobs and the rest.

Ask an agent *"why was `/orders` slow in the last ten minutes?"* or *"what exceptions are still unresolved?"* and it reads the answer from NestLens instead of you copying it out of the dashboard.

It is a thin client over the REST API the dashboard already uses. Nothing is added to your application's runtime, and nothing new is exposed: the agent sees what the dashboard shows, through the same guard.

## Quick start

1. Run your application with NestLens mounted (the dashboard opens at `http://localhost:3000/nestlens`).
2. Install the MCP SDK next to `nestlens`. It is an optional peer dependency, so applications that do not use this feature never load it:

   ```bash
   npm install --save-dev @modelcontextprotocol/sdk
   ```

3. Add the server to your agent. For Claude Code:

   ```bash
   claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
   ```

4. Ask it something: *"Use NestLens to show me the slowest requests."*

`--url` is the address of your application **plus the path NestLens is mounted at** (`path` in `NestLensModule.forRoot`, `/nestlens` by default).

:::caution Start it from your project
`npx nestlens-mcp` runs the `nestlens-mcp` binary of the `nestlens` package **installed in the current directory**, so it works when the agent starts it from your project (Claude Code, Cursor and VS Code do). A client that starts it from somewhere else — Claude Desktop does — finds no such binary, and `npx` then looks for a package literally named `nestlens-mcp` on npm, which is not this project. For those, name the real package:

```bash
npx -y -p nestlens -p @modelcontextprotocol/sdk nestlens-mcp --url http://localhost:3000/nestlens
```

`-p` is `--package`; the second one is the SDK, which `nestlens` only lists as an optional peer.
:::

## Two ways to connect

| | Local (stdio) | Remote (a URL) |
| --- | --- | --- |
| The agent runs | `npx nestlens-mcp` itself | nothing — it connects to a URL |
| Use it for | NestLens on your machine, or a server you can reach with an SSH tunnel | NestLens on a development or production server |
| You configure | a command | a URL and a token |

Both give the agent the same tools. The sections below show each.

## Add it to your agent

### Claude Code

**Local** — for you only:

```bash
claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
```

**Shared with the team** — written to `.mcp.json` in the project root, so everyone who clones the repository gets it:

```bash
claude mcp add --scope project nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
```

or write the file yourself:

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

**Remote** — a [server that exposes a URL](#a-nestlens-on-a-server):

```bash
claude mcp add --transport http nestlens https://nestlens-mcp.example.com/mcp \
  --header "Authorization: Bearer <token>"
```

Check that it connected:

```bash
claude mcp list        # nestlens: ✔ Connected
```

or type `/mcp` inside Claude Code. Remove it with `claude mcp remove nestlens`.

### Cursor

Add it to `.cursor/mcp.json` in the project, or to `~/.cursor/mcp.json` for every project:

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

For a remote server, give it the URL and the header instead of a command:

```json
{
  "mcpServers": {
    "nestlens": {
      "url": "https://nestlens-mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:NESTLENS_MCP_TOKEN}" }
    }
  }
}
```

### VS Code

`.vscode/mcp.json`. The top-level key here is `servers`, and `inputs` prompts for the token so it is never written to the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "nestlens-token", "description": "NestLens MCP token", "password": true }
  ],
  "servers": {
    "nestlens-local": {
      "type": "stdio",
      "command": "npx",
      "args": ["nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
    },
    "nestlens-remote": {
      "type": "http",
      "url": "https://nestlens-mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${input:nestlens-token}" }
    }
  }
}
```

### Claude Desktop

Claude Desktop starts the command from its own directory, not your project, so it has to name the package. Add this to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart the app:

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": [
        "-y", "-p", "nestlens", "-p", "@modelcontextprotocol/sdk",
        "nestlens-mcp", "--url", "http://localhost:3000/nestlens"
      ]
    }
  }
}
```

### Any other MCP client

Every client asks for the same three things. Give it:

- **Command:** `npx`
- **Arguments:** `-y -p nestlens -p @modelcontextprotocol/sdk nestlens-mcp --url http://localhost:3000/nestlens` (as separate arguments — and `nestlens-mcp --url ...` alone if the client starts it from your project)
- **Environment** (only if NestLens wants credentials): `NESTLENS_HEADERS={"Authorization":"Bearer ..."}`

or, for a client that takes a URL, the address of a [remote server](#a-nestlens-on-a-server) and its bearer token.

## What the agent sees

The server exposes two tools, whatever NestLens can do:

| Tool | What it does |
| --- | --- |
| `nestlens_list_tools` | Lists every operation NestLens offers, with a description and the arguments each takes. Takes an optional `names` list to look at a few. |
| `nestlens_call_tool` | Runs one of them by name: `{ "name": "get_stats" }`, or `{ "name": "get_entries_with_cursor", "arguments": { "type": "log", "levels": ["error"], "limit": 20 } }`. |

An agent starts with `nestlens_list_tools`, then calls what it needs. Today the list includes, among others:

| Tool | Use it to |
| --- | --- |
| `get_stats` | See what was recorded: totals per type, slow queries, unresolved exceptions. Usually the first call. |
| `get_entries_with_cursor` | Search and filter anything — every filter the dashboard has, by type. |
| `get_entry` | Open one entry; for a request, with its queries, exceptions and logs. |
| `get_grouped_entries` | Find the noisy ones: the same query on every request, the same exception hundreds of times. |
| `get_exceptions`, `get_logs`, `get_queries`, `get_requests` | Quick lists of one kind. |
| `get_recording_status` | Tell "nothing happened" from "nothing was recorded". |
| `get_all_tags`, `get_entries_by_tags` | Work by tag. |

**The list is not written into the MCP server.** It is read from your application — `GET /nestlens/__nestlens__/api/tools` — each time it is asked for, and that endpoint is built from the API controllers themselves. When NestLens gains an endpoint, an agent can use it straight away, and `nestlens-mcp` does not need an update.

### Things to try

- *"Use NestLens: what is failing right now?"*
- *"Show the slowest requests in the last hour and the queries each one ran."*
- *"Are there N+1 queries? Group the queries and show the repeated ones."*
- *"Find the error logs around `POST /orders` and tell me what the request body was."*
- *"Which exceptions are unresolved? Show me the stack trace of the most frequent."*

## Read-only by default

Tools that change something — `clear_entries`, `run_pruning`, `pause_recording`, `resolve_entry`, the tag edits — are listed, marked `"enabled": false`, and refused. An agent that was asked to look cannot clear what it is looking at.

Turn them on when you want an agent to act:

```bash
claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens --allow-write
```

## A NestLens on a server

When the application runs on a development or production server, there are two ways to reach it. Either way, the NestLens on that server has to be enabled on purpose: by default it only runs in `development`, `local` and `test` (`authorization.allowedEnvironments`). Read [production usage](../security/production-usage) first.

### Option 1 — an SSH tunnel, no new exposure

Forward the application's port to your machine and use the local setup unchanged. Nothing new listens on the server.

```bash
ssh -N -L 3000:localhost:3000 you@dev.example.com
```

```bash
claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
```

### Option 2 — a URL

Run `nestlens-mcp` in HTTP mode from the application's directory (where `nestlens` is installed) on a machine that can reach NestLens, and give the agent the URL.

```bash
export NESTLENS_MCP_TOKEN="$(openssl rand -hex 32)"
echo "$NESTLENS_MCP_TOKEN"        # keep this: it is what the agent has to send

npx nestlens-mcp --http --host 0.0.0.0 --port 8787 --url http://localhost:3000/nestlens
# nestlens-mcp: http://0.0.0.0:8787/mcp serving http://localhost:3000/nestlens (read-only)
```

The endpoint is `http://<host>:8787/mcp`, and every request must carry `Authorization: Bearer <token>`.

- It **will not start on a network address without a token**. On `127.0.0.1` (the default `--host`) the token is optional, and requests addressed to any other name are refused.
- It speaks plain HTTP. Put it behind a reverse proxy or load balancer that terminates TLS (nginx, Caddy, your cloud's) and give the agent the `https://` address.
- It is stateless, so a restart, or several instances behind one address, loses nothing.
- NestLens sees the connection coming from the machine `nestlens-mcp` runs on. When that is the same host, NestLens sees `127.0.0.1`, so `allowedIps` does not tell it apart from the application itself. **The bearer token is the lock** — treat it like a password, and do not share it between people you would want to revoke separately.

Then add the URL to your agent as shown [above](#add-it-to-your-agent).

## Options

| Option | Environment | Default |
| --- | --- | --- |
| `--url <address>` | `NESTLENS_URL` | `http://localhost:3000/nestlens` |
| `--header "Name: value"` (repeatable) | `NESTLENS_HEADERS` (JSON object) | none |
| `--allow-write` | `NESTLENS_MCP_ALLOW_WRITE=1` | off |
| `--timeout <ms>` | | `15000` |
| `--http` | | off (stdio) |
| `--host <address>` | | `127.0.0.1` |
| `--port <number>` | `NESTLENS_MCP_PORT` | `8787` |
| `--token <secret>` | `NESTLENS_MCP_TOKEN` | none |

If your `authorization.canAccess` wants a token or a cookie, pass it as a header. Prefer the environment variable: command-line arguments are visible to every user on the machine in the process list.

```bash
NESTLENS_HEADERS='{"Authorization":"Bearer dev-token"}' npx nestlens-mcp --url http://localhost:3000/nestlens
```

In an MCP client's JSON config the same goes under `env`:

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": ["nestlens-mcp", "--url", "https://dev.example.com/nestlens"],
      "env": { "NESTLENS_HEADERS": "{\"Authorization\":\"Bearer dev-token\"}" }
    }
  }
}
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

For HTTP, `startNestLensMcpHttp({ client, port, token })` from the same module returns `{ url, close }`.

## Security

- **It is the dashboard's door.** The server calls the same API, so [`allowedEnvironments`](../configuration/authorization), IP rules, `canAccess` and the [rate limit](../configuration/rate-limiting) all apply to it, from the address it connects from.
- **What is masked stays masked.** [Data masking](../security/data-masking) happens when an entry is recorded, so the agent never sees a value the dashboard would not show.
- **What is not masked reaches the model.** Recorded request bodies, query parameters and log lines can contain customer data, and an agent sends what it reads to its model provider. Use it against development and staging, as NestLens itself is meant to be used.
- **Recorded text is data, not instructions.** An agent reading a log line or a request body that says "ignore your instructions" should not obey it, and read-only mode is what limits the damage when one does.
- **A URL is a door.** In HTTP mode keep the token secret, serve it over TLS, and prefer the SSH tunnel when one person needs it.

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
| The client shows `nestlens` as failed or does not list its tools | Run the same command in a terminal (`npx nestlens-mcp --url ...`). It prints why to stderr. A missing `@modelcontextprotocol/sdk` is the usual cause; so is a client started before the config was saved — restart it. |
| `404` / `Not Found` for the package `nestlens-mcp` from `npx` | The client started it outside your project, so `npx` looked on npm for a package with that name. Use the `-p nestlens -p @modelcontextprotocol/sdk` form [above](#quick-start). |
| `Could not reach NestLens` | The application is not running, or `--url` is wrong. |
| `answered with something that is not JSON ... dashboard mount` | `--url` points at the application, not at the dashboard mount. Add the path, for example `/nestlens`. |
| `did not return a tool list` | The application runs a version of `nestlens` older than the one that added this endpoint. |
| `answered 403` | The guard refused the connection: `allowedEnvironments`, `allowedIps` or `canAccess`. Pass credentials with `NESTLENS_HEADERS`. |
| `answered 429` | The rate limit. The default is 100 requests a minute per address. |
| `Refusing to listen on ... without a token` | HTTP mode on a network address needs `--token` or `NESTLENS_MCP_TOKEN`. |
| `401` from the URL | The agent is not sending `Authorization: Bearer <token>`, or the token differs. |
| An empty list straight after a request | Entries are buffered for about a second before they are stored. |
