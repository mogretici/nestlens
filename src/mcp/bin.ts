#!/usr/bin/env node
import type { main as Main } from './cli';

/**
 * The SDK is an optional peer, so it is looked for before `./cli` is loaded:
 * loading it first answers a missing SDK with a module-resolution stack trace,
 * `--help` included. The module resolved is the first one the CLI imports.
 */
const SDK_ENTRY = '@modelcontextprotocol/sdk/server/stdio.js';

const hasSdk = (): boolean => {
  try {
    require.resolve(SDK_ENTRY);
    return true;
  } catch {
    return false;
  }
};

if (!hasSdk()) {
  process.stderr.write(
    'nestlens-mcp: @modelcontextprotocol/sdk is not installed. Run ' +
      '`npm install --save-dev @modelcontextprotocol/sdk` in the project, or start it with ' +
      '`npx -y -p nestlens -p @modelcontextprotocol/sdk nestlens-mcp`.\n',
  );
  process.exit(1);
}

const { main } = require('./cli') as { main: typeof Main };

main().catch((error: unknown) => {
  process.stderr.write(`nestlens-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
