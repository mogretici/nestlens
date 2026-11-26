import { timingSafeEqual } from 'crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'http';
import type { AddressInfo } from 'net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { NestLensClient } from './client';
import { ToolCatalog, createNestLensMcpServer } from './server';

export interface NestLensMcpHttpOptions {
  client: NestLensClient;
  /** Where to listen. Default 127.0.0.1: reachable from this machine only. */
  host?: string;
  /** Default 8787. `0` picks a free one. */
  port?: number;
  /**
   * The bearer token a caller must present: `Authorization: Bearer <token>`.
   *
   * Required for any address but a loopback one. This server reaches an
   * application's recorded requests, and a listener on a network interface with
   * no check in front of it hands them to whoever can connect.
   */
  token?: string;
  allowWrite?: boolean;
  maxResponseChars?: number;
  version?: string;
  /** Largest request body accepted, in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
}

export interface RunningNestLensMcpHttp {
  /** The address clients connect to, `/mcp` included. */
  url: string;
  close: () => Promise<void>;
}

/** The one path the endpoint answers on. */
export const MCP_PATH = '/mcp';

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export const isLoopback = (host: string): boolean => LOOPBACK_HOSTS.has(host.toLowerCase());

const digest = (value: string): Buffer => Buffer.from(value, 'utf8');

/** Constant-time, and not fooled by a length difference. */
const sameToken = (given: string, expected: string): boolean => {
  const a = digest(given);
  const b = digest(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const isSpace = (code: number): boolean => code === 0x20 || code === 0x09;

/**
 * The token of an `Authorization: Bearer <token>` header, if that is what it is.
 *
 * Parsed by hand: `/^Bearer\s+(.+)$/` backtracks quadratically on a long run
 * of whitespace, and this header is the one thing an unauthenticated caller
 * controls.
 */
export const bearerToken = (header: string | undefined): string | undefined => {
  if (typeof header !== 'string') return undefined;
  const value = header.trim();

  let at = 0;
  while (at < value.length && !isSpace(value.charCodeAt(at))) at += 1;
  if (at === value.length || value.slice(0, at).toLowerCase() !== 'bearer') return undefined;

  const token = value.slice(at).trim();
  return token.length > 0 ? token : undefined;
};

/**
 * Whether the Host header names this machine.
 *
 * Only asked when nothing else guards the listener (loopback, no token). A web
 * page can point a name it controls at 127.0.0.1 and talk to a local server
 * through the browser; refusing any Host that is not a loopback name is what
 * stops that.
 */
const hostIsLoopback = (request: IncomingMessage): boolean => {
  const host = request.headers.host ?? '';
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  return isLoopback(name ?? '');
};

const send = (
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
};

/** A refusal of this server's own, whose message is meant for the caller. */
class HttpRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const INTERNAL_ERROR = 'Internal error. The detail is in the server log.';

/** Anything that is not one of this server's refusals: the caller gets a generic word for it. */
const logFailure = (error: unknown): void => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`nestlens-mcp: ${detail}\n`);
};

const readBody = (request: IncomingMessage, limit: number): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpRefusal(413, 'Request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text.length > 0 ? JSON.parse(text) : undefined);
      } catch {
        reject(new HttpRefusal(400, 'Request body is not valid JSON'));
      }
    });
    request.on('error', reject);
  });

/**
 * Serves the hub over HTTP — MCP's Streamable HTTP transport — so an agent can
 * be given a URL instead of a command.
 *
 * Run it where it can reach NestLens: on the same host as the application, or
 * anywhere that can reach the application's dashboard address. It asks
 * NestLens with the headers the client was given, and asks its own callers for
 * a bearer token.
 *
 * Stateless: a server and transport are made for each request and nothing is
 * remembered between them, which is all a hub of two request/response tools
 * needs, and means a restart or a second instance behind a proxy loses nothing.
 * The tool list is shared, so it is still fetched from the application once and
 * not once per request.
 */
export const startNestLensMcpHttp = async (
  options: NestLensMcpHttpOptions,
): Promise<RunningNestLensMcpHttp> => {
  const host = options.host ?? '127.0.0.1';
  const token = options.token && options.token.length > 0 ? options.token : undefined;

  if (!token && !isLoopback(host)) {
    throw new Error(
      `Refusing to listen on ${host} without a token: anyone who can reach it could read what ` +
        'NestLens recorded. Set --token (or NESTLENS_MCP_TOKEN), or listen on 127.0.0.1.',
    );
  }

  const catalog = new ToolCatalog(options.client);
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== MCP_PATH) {
      send(response, 404, { error: `Not found. The MCP endpoint is ${MCP_PATH}.` });
      return;
    }

    if (token) {
      const given = bearerToken(request.headers.authorization);
      if (!given || !sameToken(given, token)) {
        send(
          response,
          401,
          { error: 'A valid bearer token is required.' },
          { 'WWW-Authenticate': 'Bearer' },
        );
        return;
      }
    } else if (!hostIsLoopback(request)) {
      send(response, 403, { error: 'This listener only answers requests addressed to localhost.' });
      return;
    }

    // Stateless: there is no session to resume and no stream to open.
    if (request.method !== 'POST') {
      send(response, 405, { error: 'Use POST.' }, { Allow: 'POST' });
      return;
    }

    let body: unknown;
    try {
      body = await readBody(request, maxBody);
    } catch (error) {
      if (error instanceof HttpRefusal) {
        send(response, error.status, { error: error.message });
        return;
      }
      logFailure(error);
      send(response, 400, { error: 'The request body could not be read.' });
      return;
    }

    const server = createNestLensMcpServer({
      client: options.client,
      allowWrite: options.allowWrite,
      maxResponseChars: options.maxResponseChars,
      version: options.version,
      catalog,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  };

  const listener: HttpServer = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      logFailure(error);
      if (!response.headersSent) {
        send(response, 500, { error: INTERNAL_ERROR });
      } else {
        response.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(options.port ?? DEFAULT_PORT, host, () => {
      listener.off('error', reject);
      resolve();
    });
  });

  const { port } = listener.address() as AddressInfo;
  const shown = host.includes(':') ? `[${host}]` : host;

  return {
    url: `http://${shown}:${port}${MCP_PATH}`,
    close: () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  };
};
