import { SetMetadata } from '@nestjs/common';

/** Where {@link NestLensTool} writes its options. */
export const NESTLENS_TOOL_METADATA = 'nestlens:tool';

export interface NestLensToolOptions {
  /**
   * What the endpoint does, written for a reader that has never seen the
   * dashboard — an AI agent choosing between tools by this sentence alone.
   *
   * Say what it returns or changes and when to reach for it. Parameter names,
   * types, enums and bounds are read from the DTOs the handler already
   * validates with, so do not repeat them here.
   */
  description: string;

  /**
   * The call cannot be undone — it deletes recorded entries or turns recording
   * off. Every non-GET endpoint already counts as a change and stays behind the
   * MCP server's `--allow-write`; this is the extra word that tells the reader
   * it is not the reversible kind.
   */
  destructive?: boolean;
}

/**
 * Publishes an API endpoint as a tool.
 *
 * `GET __nestlens__/api/tools` lists every handler that carries this decorator,
 * with its route, its parameters and its description, and the `nestlens-mcp`
 * server offers whatever that list holds. A new endpoint becomes a tool by being
 * decorated — nothing in the MCP server changes — and
 * `tools/tool-coverage.spec.ts` fails for a route that is neither decorated nor
 * excluded on purpose, so it cannot be forgotten.
 *
 * The tool's name is the handler's method name in snake_case (`getEntries` →
 * `get_entries`), which keeps one name for one handler.
 */
export const NestLensTool = (options: NestLensToolOptions): MethodDecorator =>
  SetMetadata(NESTLENS_TOOL_METADATA, options);
