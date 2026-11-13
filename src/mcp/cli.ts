import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NestLensClient } from './client';
import { createNestLensMcpServer } from './server';

export interface CliOptions {
  url: string;
  headers: Record<string, string>;
  allowWrite: boolean;
  timeoutMs?: number;
  help: boolean;
}

export const USAGE = `nestlens-mcp — an MCP server over a running NestLens

Usage:
  nestlens-mcp [--url <address>] [--header "Name: value"]... [--allow-write] [--timeout <ms>]

Options:
  --url <address>      Where NestLens is mounted, with its dashboard path.
                       Default: http://localhost:3000/nestlens  (env: NESTLENS_URL)
  --header "N: v"      Sent with every request; repeat for more. Put secrets in
                       NESTLENS_HEADERS instead, as JSON: '{"Authorization":"Bearer ..."}'
  --allow-write        Enable the tools that change data (clear, prune, pause, resolve,
                       tags). Off by default.  (env: NESTLENS_MCP_ALLOW_WRITE=1)
  --timeout <ms>       Per-request timeout. Default 15000.
  -h, --help           This text.

Add it to an MCP client, for example Claude Code:
  claude mcp add nestlens -- npx nestlens-mcp --url http://localhost:3000/nestlens
`;

const truthy = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes'].includes(value.toLowerCase());

const parseHeader = (raw: string): [string, string] => {
  const at = raw.indexOf(':');
  if (at <= 0) throw new Error(`--header expects "Name: value", got "${raw}"`);
  return [raw.slice(0, at).trim(), raw.slice(at + 1).trim()];
};

const envHeaders = (raw: string | undefined): Record<string, string> => {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'NESTLENS_HEADERS must be a JSON object, such as {"Authorization":"Bearer ..."}',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'NESTLENS_HEADERS must be a JSON object, such as {"Authorization":"Bearer ..."}',
    );
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
};

/** Reads the command line and environment. Throws a one-line message for a mistake. */
export const parseCliOptions = (
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): CliOptions => {
  const options: CliOptions = {
    url: env.NESTLENS_URL ?? 'http://localhost:3000/nestlens',
    headers: envHeaders(env.NESTLENS_HEADERS),
    allowWrite: truthy(env.NESTLENS_MCP_ALLOW_WRITE),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i] as string;
    const value = (): string => {
      const next = argv[(i += 1)];
      if (next === undefined) throw new Error(`${argument} needs a value`);
      return next;
    };

    switch (argument) {
      case '--url':
        options.url = value();
        break;
      case '--header': {
        const [name, headerValue] = parseHeader(value());
        options.headers[name] = headerValue;
        break;
      }
      case '--allow-write':
        options.allowWrite = true;
        break;
      case '--timeout': {
        const timeout = Number(value());
        if (!Number.isInteger(timeout) || timeout <= 0) {
          throw new Error('--timeout must be a whole number of milliseconds');
        }
        options.timeoutMs = timeout;
        break;
      }
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option ${argument}. Try --help.`);
    }
  }

  return options;
};

const packageVersion = (): string => {
  try {
    return (require('../../package.json') as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

/** Runs the server on stdio until the client disconnects. Output goes to stderr only: stdout is the protocol. */
export const main = async (
  argv: readonly string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<void> => {
  let options: CliOptions;
  try {
    options = parseCliOptions(argv, env);
  } catch (error) {
    process.stderr.write(
      `nestlens-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const server = createNestLensMcpServer({
    client: new NestLensClient({
      baseUrl: options.url,
      headers: options.headers,
      timeoutMs: options.timeoutMs,
    }),
    allowWrite: options.allowWrite,
    version: packageVersion(),
  });

  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `nestlens-mcp: serving ${options.url} (${options.allowWrite ? 'read and write' : 'read-only'})\n`,
  );
};
