# nestlens-mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI agent — Claude Code, Cursor, VS Code, Claude Desktop, anything that speaks MCP — read what [NestLens](https://github.com/mogretici/nestlens) recorded in a running NestJS application: requests, queries, exceptions, logs, jobs and the rest.

```bash
claude mcp add nestlens -- npx -y nestlens-mcp --url http://localhost:3000/nestlens
```

`--url` is your application's address plus the path NestLens is mounted at. The server is read-only unless you pass `--allow-write`, and `--http` serves it at a URL instead of over stdio.

Setup for every client, the options and the security notes are in the [MCP guide](https://nestlens-docs.vercel.app/docs/integrations/mcp).

This package is the command and nothing else: the server is `nestlens/mcp` from the [`nestlens`](https://www.npmjs.com/package/nestlens) package, at the same version, with the MCP SDK installed beside it.
