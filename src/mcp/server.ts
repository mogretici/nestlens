import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { NestLensToolDescriptor, ToolParameter } from '../api/tools';
import {
  NestLensApiError,
  NestLensArgumentError,
  NestLensClient,
  NestLensUnreachableError,
} from './client';

export interface NestLensMcpServerOptions {
  client: NestLensClient;
  /**
   * Allow the tools that change something — delete entries, prune, pause
   * recording, resolve an exception, edit tags. Off by default: an agent that
   * was only asked to look should not be able to clear what it is looking at.
   */
  allowWrite?: boolean;
  /** Longest answer returned to the model, in characters. Default 60000. */
  maxResponseChars?: number;
  /** Shown to the client as the server's version. */
  version?: string;
  /** How long a fetched tool list is trusted, in milliseconds. Default 30000. */
  manifestTtlMs?: number;
}

const DEFAULT_MAX_RESPONSE_CHARS = 60_000;
const DEFAULT_MANIFEST_TTL_MS = 30_000;

const INSTRUCTIONS = [
  'NestLens records what a running NestJS application does: HTTP requests, database queries,',
  'exceptions, logs, jobs, cache and Redis calls, outgoing HTTP, mail and more.',
  '',
  'This server is a hub over the NestLens API. It has two tools:',
  '- nestlens_list_tools returns every operation the connected NestLens offers, with a',
  '  description and the arguments each takes. Call it first; the list is read from the',
  '  application each time, so it is always current.',
  '- nestlens_call_tool runs one of them by name.',
  '',
  'Start with get_stats for the shape of what was recorded, then narrow with',
  'get_entries_with_cursor. Answers can be large: pass `limit`, and filter by `type`.',
].join('\n');

const jsonType = (parameter: ToolParameter): Record<string, unknown> => {
  const schema: Record<string, unknown> = { type: parameter.type };
  if (parameter.type === 'array') schema.items = { type: parameter.items ?? 'string' };
  if (parameter.description) schema.description = parameter.description;
  if (parameter.enum) schema.enum = parameter.enum;
  if (parameter.format) schema.format = parameter.format;
  if (parameter.minimum !== undefined) schema.minimum = parameter.minimum;
  if (parameter.maximum !== undefined) schema.maximum = parameter.maximum;
  if (parameter.maxLength !== undefined) schema.maxLength = parameter.maxLength;
  if (parameter.maxItems !== undefined) schema.maxItems = parameter.maxItems;
  return schema;
};

/** A tool as the model should read it: what it does, whether it may run, and its arguments. */
const present = (tool: NestLensToolDescriptor, allowWrite: boolean): Record<string, unknown> => {
  const enabled = !tool.mutates || allowWrite;
  return {
    name: tool.name,
    description: tool.description,
    readOnly: !tool.mutates,
    ...(tool.destructive ? { destructive: true } : {}),
    enabled,
    ...(enabled
      ? {}
      : { disabled: 'This changes data. Start nestlens-mcp with --allow-write to use it.' }),
    arguments: {
      type: 'object',
      properties: Object.fromEntries(tool.parameters.map((p) => [p.name, jsonType(p)])),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      additionalProperties: false,
    },
  };
};

const text = (value: string, isError = false) => ({
  content: [{ type: 'text' as const, text: value }],
  ...(isError ? { isError: true } : {}),
});

const describeFailure = (error: unknown): string => {
  if (error instanceof NestLensApiError)
    return `NestLens answered ${error.status}: ${error.message}`;
  if (error instanceof NestLensUnreachableError || error instanceof NestLensArgumentError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

const LIST_TOOL = 'nestlens_list_tools';
const CALL_TOOL = 'nestlens_call_tool';

const HUB_TOOLS = [
  {
    name: LIST_TOOL,
    title: 'List NestLens tools',
    description:
      'List every operation the connected NestLens offers, with what each does and the ' +
      'arguments it takes. Read live from the application, so it includes anything added ' +
      'since this server started. Call this before nestlens_call_tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these tools. Omit to list them all.',
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: CALL_TOOL,
    title: 'Call a NestLens tool',
    description:
      'Run one NestLens operation by name, with the arguments nestlens_list_tools says it ' +
      'takes. Returns the API response as JSON.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'A tool name from nestlens_list_tools, such as get_stats.',
        },
        arguments: {
          type: 'object',
          description: "The tool's arguments, as an object. Lists may be given as arrays.",
        },
      },
      required: ['name'],
    },
    annotations: { openWorldHint: false },
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A hub over the NestLens API, as an MCP server.
 *
 * It exposes two tools rather than one per endpoint. The endpoints are read
 * from the application (`GET __nestlens__/api/tools`) every time they are asked
 * for, so a tool added to NestLens is available here at once, with no change to
 * this server and no new release of it.
 */
export const createNestLensMcpServer = (options: NestLensMcpServerOptions): Server => {
  const { client } = options;
  const allowWrite = options.allowWrite === true;
  const maxChars = options.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
  const ttl = options.manifestTtlMs ?? DEFAULT_MANIFEST_TTL_MS;

  const server = new Server(
    { name: 'nestlens', version: options.version ?? '0.0.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  let cached: { at: number; tools: NestLensToolDescriptor[] } | undefined;

  const tools = async (fresh: boolean): Promise<NestLensToolDescriptor[]> => {
    if (!fresh && cached && Date.now() - cached.at < ttl) return cached.tools;
    const manifest = await client.manifest();
    cached = { at: Date.now(), tools: manifest.tools };
    return cached.tools;
  };

  const clip = (value: string): string =>
    value.length <= maxChars
      ? value
      : `${value.slice(0, maxChars)}\n\n[Cut off: ${maxChars} of ${value.length} characters shown. ` +
        'Ask for less with `limit`, or narrow with filters.]';

  const listTools = async (args: Record<string, unknown>) => {
    const names = args.names;
    if (
      names !== undefined &&
      !(Array.isArray(names) && names.every((n) => typeof n === 'string'))
    ) {
      return text('`names` must be an array of tool names.', true);
    }

    const all = await tools(true);
    const wanted = names && names.length > 0 ? new Set(names as string[]) : undefined;
    const chosen = wanted ? all.filter((tool) => wanted.has(tool.name)) : all;
    const missing = wanted ? [...wanted].filter((name) => !all.some((t) => t.name === name)) : [];

    return text(
      clip(
        JSON.stringify(
          {
            tools: chosen.map((tool) => present(tool, allowWrite)),
            ...(missing.length > 0 ? { unknown: missing } : {}),
          },
          null,
          1,
        ),
      ),
    );
  };

  const callTool = async (args: Record<string, unknown>) => {
    const { name } = args;
    if (typeof name !== 'string' || name.length === 0) {
      return text('`name` is required: a tool name from nestlens_list_tools.', true);
    }
    if (args.arguments !== undefined && !isRecord(args.arguments)) {
      return text('`arguments` must be an object.', true);
    }

    let tool = (await tools(false)).find((candidate) => candidate.name === name);
    // A name the cache does not know may be a tool added a moment ago.
    tool ??= (await tools(true)).find((candidate) => candidate.name === name);

    if (!tool) {
      const available = (await tools(false)).map((candidate) => candidate.name).join(', ');
      return text(`There is no tool called "${name}". Available: ${available}.`, true);
    }

    if (tool.mutates && !allowWrite) {
      return text(
        `${tool.name} changes data, and this server is read-only. ` +
          'Start nestlens-mcp with --allow-write to enable it.',
        true,
      );
    }

    const result = await client.invoke(tool, (args.arguments as Record<string, unknown>) ?? {});
    return text(clip(JSON.stringify(result, null, 1)));
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: HUB_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};

    try {
      if (request.params.name === LIST_TOOL) return await listTools(args);
      if (request.params.name === CALL_TOOL) return await callTool(args);
      return text(
        `Unknown tool "${request.params.name}". This server has ${LIST_TOOL} and ${CALL_TOOL}.`,
        true,
      );
    } catch (error) {
      return text(describeFailure(error), true);
    }
  });

  return server;
};
