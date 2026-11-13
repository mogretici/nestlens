#!/usr/bin/env node
import { main } from './cli';

main().catch((error: unknown) => {
  process.stderr.write(`nestlens-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
