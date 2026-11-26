/**
 * The hub served at a URL.
 *
 * What matters here is who gets in. The endpoint reaches an application's
 * recorded requests, so the tests are mostly about the ways it must say no.
 */
import { request as httpRequest } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { NestLensToolDescriptor, NestLensToolManifest } from '../../api/tools';
import type { NestLensClient } from '../../mcp/client';
import {
  MCP_PATH,
  bearerToken,
  startNestLensMcpHttp,
  type RunningNestLensMcpHttp,
} from '../../mcp/http';
import * as serverModule from '../../mcp/server';

const tool = (
  name: string,
  overrides: Partial<NestLensToolDescriptor> = {},
): NestLensToolDescriptor => ({
  name,
  description: `Reads ${name} for the test.`,
  method: 'GET',
  path: `/${name}`,
  mutates: false,
  destructive: false,
  parameters: [],
  ...overrides,
});

const fakeClient = () => {
  const manifest = jest.fn(async (): Promise<NestLensToolManifest> => ({
    version: 1,
    tools: [tool('get_stats'), tool('clear', { method: 'DELETE', mutates: true })],
  }));
  const invoke = jest.fn(async (t: NestLensToolDescriptor): Promise<unknown> => ({
    data: { ran: t.name },
  }));
  return { client: { manifest, invoke } as unknown as NestLensClient, manifest, invoke };
};

const running: RunningNestLensMcpHttp[] = [];
const start = async (options: Partial<Parameters<typeof startNestLensMcpHttp>[0]> = {}) => {
  const fake = fakeClient();
  const server = await startNestLensMcpHttp({ client: fake.client, port: 0, ...options });
  running.push(server);
  return { ...fake, server };
};

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

const connect = async (url: string, token?: string): Promise<Client> => {
  const agent = new Client({ name: 'http-agent', version: '1.0.0' });
  await agent.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }),
  );
  return agent;
};

const raw = (
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpRequest(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method: options.method ?? 'POST',
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text;

describe('the hub over HTTP', () => {
  it('is reachable at /mcp, and an agent can use it like the stdio one', async () => {
    const { server } = await start();
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const agent = await connect(server.url);

    expect((await agent.listTools()).tools.map((t) => t.name)).toEqual([
      'nestlens_list_tools',
      'nestlens_call_tool',
    ]);
    const stats = await agent.callTool({
      name: 'nestlens_call_tool',
      arguments: { name: 'get_stats' },
    });
    expect(JSON.parse(textOf(stats))).toMatchObject({ data: { ran: 'get_stats' } });
    await agent.close();
  });

  it('stays read-only unless told otherwise', async () => {
    const { server, invoke } = await start();
    const agent = await connect(server.url);

    const result = await agent.callTool({
      name: 'nestlens_call_tool',
      arguments: { name: 'clear' },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    await agent.close();
  });

  it('reads the application’s tool list once for many requests', async () => {
    const { server, manifest } = await start();
    const agent = await connect(server.url);

    await agent.callTool({ name: 'nestlens_call_tool', arguments: { name: 'get_stats' } });
    await agent.callTool({ name: 'nestlens_call_tool', arguments: { name: 'get_stats' } });
    await agent.callTool({ name: 'nestlens_call_tool', arguments: { name: 'get_stats' } });

    expect(manifest).toHaveBeenCalledTimes(1);
    await agent.close();
  });

  describe('who gets in', () => {
    it('refuses to listen on a network address with no token', async () => {
      await expect(
        startNestLensMcpHttp({ client: fakeClient().client, host: '0.0.0.0', port: 0 }),
      ).rejects.toThrow(/without a token/);
    });

    it('listens on a network address once there is a token', async () => {
      const { server } = await start({ host: '0.0.0.0', token: 'secret' });

      expect(server.url).toContain('0.0.0.0');
    });

    it('answers 401 to a caller with no token or the wrong one', async () => {
      const { server } = await start({ token: 'secret' });

      const none = await raw(server.url, { body: '{}' });
      const wrong = await raw(server.url, {
        headers: { Authorization: 'Bearer nope' },
        body: '{}',
      });
      const shorter = await raw(server.url, { headers: { Authorization: 'Bearer s' }, body: '{}' });

      expect([none.status, wrong.status, shorter.status]).toEqual([401, 401, 401]);
    });

    it('lets the right token through', async () => {
      const { server } = await start({ token: 'secret' });

      const agent = await connect(server.url, 'secret');

      expect((await agent.listTools()).tools).toHaveLength(2);
      await agent.close();
    });

    it('does not let an agent with no token connect', async () => {
      const { server } = await start({ token: 'secret' });

      await expect(connect(server.url)).rejects.toThrow();
    });

    it('turns away a request addressed to another name when nothing else guards the listener', async () => {
      const { server } = await start();

      const rebound = await raw(server.url, {
        headers: { Host: 'evil.example:8787', 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(rebound.status).toBe(403);
    });
  });

  describe('what else it refuses', () => {
    it('answers 404 away from /mcp', async () => {
      const { server } = await start();

      const response = await raw(server.url.replace(MCP_PATH, '/elsewhere'), { body: '{}' });

      expect(response.status).toBe(404);
    });

    it('answers 405 to a GET, because there is no stream to open', async () => {
      const { server } = await start();

      expect((await raw(server.url, { method: 'GET' })).status).toBe(405);
    });

    it('answers 400 to a body that is not JSON', async () => {
      const { server } = await start();

      const response = await raw(server.url, { body: '{not json' });

      expect(response.status).toBe(400);
    });

    it('answers 413 to a body over the limit', async () => {
      const { server } = await start({ maxBodyBytes: 64 });

      const response = await raw(server.url, {
        body: JSON.stringify({ pad: 'x'.repeat(500) }),
      }).catch(() => ({ status: 413, body: '' }));

      expect(response.status).toBe(413);
    });
  });
});

describe('bearerToken', () => {
  it.each([
    ['Bearer secret', 'secret'],
    ['bearer secret', 'secret'],
    ['BEARER secret', 'secret'],
    ['Bearer    secret', 'secret'],
    ['Bearer\tsecret', 'secret'],
    ['Bearer \t secret  ', 'secret'],
    ['Bearer a b', 'a b'],
  ])('reads %j as %j', (header, token) => {
    expect(bearerToken(header)).toBe(token);
  });

  it.each([
    [undefined],
    [''],
    ['Bearer'],
    ['Bearer   '],
    ['Bearersecret'],
    ['Basic c2VjcmV0'],
    ['Token secret'],
  ])('finds no token in %j', (header) => {
    expect(bearerToken(header)).toBeUndefined();
  });

  it('takes time in proportion to the header, not its square', () => {
    const started = Date.now();
    bearerToken(`Bearer${' '.repeat(100_000)}x\n`);
    expect(Date.now() - started).toBeLessThan(100);
  });
});

describe('a failure inside the server', () => {
  afterEach(() => jest.restoreAllMocks());

  it('answers 500 with a generic message, and writes the detail to stderr', async () => {
    const { server } = await start();
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(serverModule, 'createNestLensMcpServer').mockImplementation(() => {
      throw new Error('ENOENT /home/app/.secrets/token');
    });

    const response = await raw(server.url, {
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(500);
    expect(response.body).not.toContain('secrets');
    expect(JSON.parse(response.body)).toEqual({
      error: 'Internal error. The detail is in the server log.',
    });
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      'ENOENT /home/app/.secrets/token',
    );
  });
});
