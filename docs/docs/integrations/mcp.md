---
sidebar_position: 6
---

# MCP Server (AI agents)

`nestlens-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent — Claude Code, Codex, Cursor, VS Code, Claude Desktop, anything that speaks MCP — look at what NestLens has recorded: requests, queries, exceptions, logs, jobs and the rest.

Ask an agent *"why was `/orders` slow in the last ten minutes?"* or *"what exceptions are still unresolved?"* and it reads the answer from NestLens instead of you copying it out of the dashboard.

It is a thin client over the REST API the dashboard already uses. Nothing is added to your application's runtime, and nothing new is exposed: the agent sees what the dashboard shows, through the same guard.

## Quick start

1. Run your application with NestLens mounted (the dashboard opens at `http://localhost:3000/nestlens`).
2. Add the server to your agent. For Claude Code or Codex:

   ```bash
   # Claude Code
   claude mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens

   # Codex
   codex mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
   ```

   For VS Code, [install it with one click](#vs-code); for the others, see [Add it to your agent](#add-it-to-your-agent).

3. Ask it something: *"Use NestLens to show me the slowest requests."*

`--url` is the address of your application **plus the path NestLens is mounted at** (`path` in `NestLensModule.forRoot`, `/nestlens` by default).

`nestlens-mcp` is its own npm package, released with `nestlens` at the same version. It brings the MCP SDK with it, so nothing is added to your project, and `npx` runs it the same way from your project or from anywhere else. It reads the tool list from your application, so it works against any `nestlens` that serves one (see [troubleshooting](#troubleshooting)); to run the release that matches your application's, name it: `npx -y nestlens-mcp@0.19.0`.

## From the MCP Registry

`nestlens-mcp` is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as **`io.github.mogretici/nestlens`**, so a client that installs servers from the registry can add it without a hand-written config. It asks for three things:

| It asks for | Default | What it is |
| --- | --- | --- |
| `--url` | `http://localhost:3000/nestlens` | Where NestLens is mounted, as in the [quick start](#quick-start). |
| `NESTLENS_HEADERS` | none | Headers as JSON, only if NestLens wants credentials. Kept as a secret. |
| `NESTLENS_MCP_ALLOW_WRITE` | `false` | `true` turns on the [tools that change data](#read-only-by-default). |

and runs the release the registry lists: `npx nestlens-mcp@<version> --url <address>`.

The entry itself is public:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.mogretici/nestlens"
```

## Two ways to connect

| | Local (stdio) | Remote (a URL) |
| --- | --- | --- |
| The agent runs | `npx -y nestlens-mcp` itself | nothing — it connects to a URL |
| Use it for | NestLens on your machine, or a server you can reach with an SSH tunnel | NestLens on a development or production server |
| You configure | a command | a URL and a token |

Both give the agent the same tools. The sections below show each.

## Add it to your agent

### Claude Code

**Local** — for you only:

```bash
claude mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

**Shared with the team** — written to `.mcp.json` in the project root, so everyone who clones the repository gets it:

```bash
claude mcp add --scope project nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

or write the file yourself:

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": ["-y", "nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
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

### Claude Code plugin

The repository is also a Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace). Its `nestlens` plugin adds the same local server, read-only, and a `debug` skill that tells the agent how to work with it: check that the application calls `NestLensModule.forRoot()`, list the tools before calling one, and follow a request through its `requestId`.

Inside Claude Code:

```text
/plugin marketplace add mogretici/nestlens
/plugin install nestlens@nestlens
```

or from your shell:

```bash
claude plugin marketplace add mogretici/nestlens
claude plugin install nestlens@nestlens
```

The plugin has one option, **NestLens URL**, which defaults to `http://localhost:3000/nestlens`. Change it in `/config`, or set it when installing:

```bash
claude plugin install nestlens@nestlens --config url=http://localhost:4000/nestlens
```

The skill runs when you ask about a slow or failing request, an exception or a query, or as `/nestlens:debug`. The plugin's server is named `plugin:nestlens:nestlens` in `/mcp`, so it sits beside one added with `claude mcp add` rather than replacing it. Remove one of the two if you have both. Remove the plugin with `claude plugin uninstall nestlens@nestlens`.

### Codex

**Local** — written to `~/.codex/config.toml`, which the Codex CLI and IDE extension share:

```bash
codex mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

or write the table yourself, in `~/.codex/config.toml` or a project's `.codex/config.toml`:

```toml
[mcp_servers.nestlens]
command = "npx"
args = ["-y", "nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
```

**Remote** — Codex reads the bearer token from an environment variable, so it is never written to the file:

```bash
codex mcp add nestlens --url https://nestlens-mcp.example.com/mcp \
  --bearer-token-env-var NESTLENS_MCP_TOKEN
```

Check it with `codex mcp list`, or type `/mcp` inside Codex. Remove it with `codex mcp remove nestlens`.

### Cursor

Add it to `.cursor/mcp.json` in the project, or to `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": ["-y", "nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
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

[![Install in VS Code](https://img.shields.io/badge/Install_in_VS_Code-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522nestlens%2522%252C%2522type%2522%253A%2522stdio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522nestlens-mcp%2522%252C%2522--url%2522%252C%2522http%253A%252F%252Flocalhost%253A3000%252Fnestlens%2522%255D%257D)

The button opens VS Code with the local server filled in, for you to review before it is added. To share it with the team, write it to `.vscode/mcp.json`. The top-level key here is `servers`, and `inputs` prompts for the token so it is never written to the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "nestlens-token", "description": "NestLens MCP token", "password": true }
  ],
  "servers": {
    "nestlens-local": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
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
      "args": ["-y", "nestlens-mcp", "--url", "http://localhost:3000/nestlens"]
    }
  }
}
```

### Any other MCP client

Every client asks for the same three things. Give it:

- **Command:** `npx`
- **Arguments:** `-y nestlens-mcp --url http://localhost:3000/nestlens` (as separate arguments)
- **Environment** (only if NestLens wants credentials): `NESTLENS_HEADERS={"Authorization":"Bearer ..."}`

or, for a client that takes a URL, the address of a [remote server](#a-nestlens-on-a-server) and its bearer token.

### Docker

The repository's `Dockerfile` builds the server from source, with the versions
`package-lock.json` pins, and runs it on stdio. Inside a container `localhost`
is the container itself, so point it at the application on the host with
`host.docker.internal`:

```bash
docker build -t nestlens-mcp https://github.com/mogretici/nestlens.git
docker run --rm -i -e NESTLENS_URL=http://host.docker.internal:3000/nestlens nestlens-mcp
```

Docker Desktop (macOS, Windows) defines `host.docker.internal`. On Linux, add
`--add-host=host.docker.internal:host-gateway` to `docker run`; the application
then has to listen on an address the container can reach, not only on
`127.0.0.1`. Credentials and write access go in the same variables as above:
`-e NESTLENS_HEADERS='{"Authorization":"Bearer ..."}'`,
`-e NESTLENS_MCP_ALLOW_WRITE=true`.

## What the agent sees

The server exposes two tools, whatever NestLens can do:

| Tool | What it does |
| --- | --- |
| `nestlens_list_tools` | Lists every operation NestLens offers, with a description and the arguments each takes. Takes an optional `names` list to look at a few. |
| `nestlens_call_tool` | Runs one of them by name: `{ "name": "get_stats" }`, or `{ "name": "get_entries_with_cursor", "arguments": { "type": "log", "levels": ["error"], "limit": 20 } }`. |

Arguments are checked against what the list declares before anything is sent: a number for a number, `true` or `false` for a boolean, a member of an enum, no `null`, and no blank value in the query string (leave an argument out instead: the API reads a blank query parameter as not given, and for `clear_entries` a `type` of `null` must not mean every type). A call that does not fit is refused with a sentence saying why.

An agent starts with `nestlens_list_tools`, then calls what it needs. Today the list includes, among others:

| Tool | Use it to |
| --- | --- |
| `get_stats` | See what was recorded: totals per type, slow queries, unresolved exceptions. Usually the first call. |
| `get_entries_with_cursor` | Search and filter anything — every filter the dashboard has, by type. |
| `get_entry` | Open one entry; for a request, with its queries, exceptions and logs. |
| `get_grouped_entries` | Find the noisy ones: the same query on every request, the same exception hundreds of times. |
| `get_exceptions`, `get_logs`, `get_queries`, `get_requests` | Quick lists of one kind. |
| `get_recording_status` | Tell "nothing happened" from "nothing was recorded". |
| `get_watcher_status` | Find out why a type has no entries: which watchers are `recording`, `waiting` with nothing to observe, `manual` or `off`, each with the fix. |
| `get_all_tags`, `get_entries_by_tags` | Work by tag. |

**The list is not written into the MCP server.** It is read from your application — `GET /nestlens/__nestlens__/api/tools` — each time it is asked for, and that endpoint is built from the API controllers themselves. When NestLens gains an endpoint, an agent can use it straight away, and `nestlens-mcp` does not need an update.

### Long answers

A tool with a `limit` returns 10 entries when the agent does not pass one — fewer than the API's own default of 50, because an agent reads every entry it is given. The agent can ask for up to 1000.

An answer is kept under 60,000 characters. A list that is longer keeps as many whole entries as fit — the ones nearest the cursor — and adds a `truncated` object: how many were shown of how many, a note, and a `resume` value (`beforeSequence`, `afterSequence` or `offset`) to pass, with the same arguments, to continue from the last one shown. The list's `meta` is kept, but its paging fields (`oldestSequence`, `newestSequence`, `hasMore`) are rewritten to describe the entries shown rather than the page the API returned, so following them does not skip what was left out. The `truncated` object counts toward the 60,000.

An entry too large for an answer on its own is not shown: the answer has `shown: 0`, the note names its id so the agent can open it with `get_entry`, and `resume` steps past it, so paging still moves on.

Anything else that is too long is cut at 60,000 characters, and a note saying the text is no longer valid JSON is added after them.

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
claude mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens --allow-write
```

## A NestLens on a server

When the application runs on a development or production server, there are two ways to reach it. Either way, the NestLens on that server has to be enabled on purpose: by default it only runs in `development`, `local` and `test` (`authorization.allowedEnvironments`). Read [production usage](../security/production-usage) first.

### Option 1 — an SSH tunnel, no new exposure

Forward the application's port to your machine and use the local setup unchanged. Nothing new listens on the server.

```bash
ssh -N -L 3000:localhost:3000 you@dev.example.com
```

```bash
claude mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

### Option 2 — a URL

Run `nestlens-mcp` in HTTP mode on a machine that can reach NestLens, and give the agent the URL.

```bash
export NESTLENS_MCP_TOKEN="$(openssl rand -hex 32)"
echo "$NESTLENS_MCP_TOKEN"        # keep this: it is what the agent has to send

npx -y nestlens-mcp --http --host 0.0.0.0 --port 8787 --url http://localhost:3000/nestlens
# nestlens-mcp: http://0.0.0.0:8787/mcp serving http://localhost:3000/nestlens (read-only)
```

The endpoint is `http://<host>:8787/mcp`, and every request must carry `Authorization: Bearer <token>`.

- It **will not start on a network address without a token**. On `127.0.0.1` (the default `--host`) the token is optional, and requests addressed to any other name are refused — but without one, **every process on the machine, under any user, can use it**, and with it whatever `--header` gives it. Set `--token` whenever `--header` or `NESTLENS_HEADERS` carries credentials, or whenever the machine is shared.
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

If your `authorization.canAccess` wants a token or a cookie, pass it as a header. Prefer the environment variable: command-line arguments are visible to every user on the machine in the process list. A `--url` (or `NESTLENS_URL`) with credentials in it (`http://user:password@...`) is refused at startup, without repeating them: `fetch` refuses such an address, so it could never work — pass them as a header instead. So is one without `http://` or `https://` (`localhost:3000/nestlens`). A malformed `--header` is reported without its value either.

```bash
NESTLENS_HEADERS='{"Authorization":"Bearer dev-token"}' npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

In an MCP client's JSON config the same goes under `env`:

```json
{
  "mcpServers": {
    "nestlens": {
      "command": "npx",
      "args": ["-y", "nestlens-mcp", "--url", "https://dev.example.com/nestlens"],
      "env": { "NESTLENS_HEADERS": "{\"Authorization\":\"Bearer dev-token\"}" }
    }
  }
}
```

## Using it from code

`nestlens/mcp`, an entry point of the `nestlens` package, is the same server. It needs the MCP SDK, an optional peer of `nestlens`, installed beside it: `npm install --save-dev @modelcontextprotocol/sdk`.

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NestLensClient, createNestLensMcpServer } from 'nestlens/mcp';

const server = createNestLensMcpServer({
  client: new NestLensClient({ baseUrl: 'http://localhost:3000/nestlens' }),
  allowWrite: false,
});

await server.connect(new StdioServerTransport());
```

For HTTP, `startNestLensMcpHttp({ client, port, token })` from the same module returns `{ url, close }`, and `runNestLensMcpCli(argv)` is the whole `nestlens-mcp` command.

## Security

- **It is the dashboard's door.** The server calls the same API, so [`allowedEnvironments`](../configuration/authorization), IP rules, `canAccess` and the [rate limit](../configuration/rate-limiting) all apply to it, from the address it connects from.
- **What is masked stays masked.** [Data masking](../security/data-masking) happens when an entry is recorded, so the agent never sees a value the dashboard would not show.
- **What is not masked reaches the model.** Recorded request bodies, query parameters and log lines can contain customer data, and an agent sends what it reads to its model provider. Use it against development and staging, as NestLens itself is meant to be used.
- **Recorded text is data, not instructions.** An agent reading a log line or a request body that says "ignore your instructions" should not obey it. The server tells the agent so in its instructions, marks `nestlens_call_tool` as reaching the open world, and asks for your explicit request in the description of every destructive tool — but none of that is a guarantee, and read-only mode is what limits the damage when an agent obeys anyway.
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
| The client shows `nestlens` as failed or does not list its tools | Run the same command in a terminal (`npx -y nestlens-mcp --url ...`). It prints why to stderr. A client started before the config was saved is a common cause — restart it. |
| `sh: nestlens-mcp: command not found` | The config uses the `npx -y -p nestlens -p @modelcontextprotocol/sdk nestlens-mcp` form of 0.18 and earlier. Since 0.19.0 the command is the `nestlens-mcp` package: `npx -y nestlens-mcp`, see [upgrading](../getting-started/upgrading.md#018x--0190). |
| `@modelcontextprotocol/sdk is not installed` | A `nestlens` older than 0.19.0 in your project still has its own `nestlens-mcp` command, and `npx nestlens-mcp` runs it. Name the package's release instead — `npx -y nestlens-mcp@latest` — or upgrade `nestlens`. |
| `Could not reach NestLens` | The application is not running, or `--url` is wrong. |
| `answered with something that is not JSON ... dashboard mount` | `--url` points at the application, not at the dashboard mount. Add the path, for example `/nestlens`. |
| `redirected (301 to ...)` | `--url` is not the final address — often `http://` where the application redirects to `https://`, or a missing trailing path. Use the address it redirects to. Redirects are not followed, so the headers you pass are never sent anywhere else. |
| `did not return a tool list` | The application runs a version of `nestlens` older than the one that added this endpoint. |
| `answered 403` | The guard refused the connection: `allowedEnvironments`, `allowedIps` or `canAccess`. Pass credentials with `NESTLENS_HEADERS`. |
| `answered 429` | The rate limit. The default is 100 requests a minute per address. |
| `Refusing to listen on ... without a token` | HTTP mode on a network address needs `--token` or `NESTLENS_MCP_TOKEN`. |
| `401` from the URL | The agent is not sending `Authorization: Bearer <token>`, or the token differs. |
| An empty list straight after a request | Entries are buffered for about a second before they are stored. |
