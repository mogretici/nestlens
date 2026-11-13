import { NESTLENS_API_PREFIX } from '../../nestlens.config';
import type { NestLensToolDescriptor } from '../../api/tools';
import {
  API_ROOT,
  NestLensApiError,
  NestLensArgumentError,
  NestLensClient,
  NestLensUnreachableError,
} from '../../mcp/client';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const descriptor = (overrides: Partial<NestLensToolDescriptor>): NestLensToolDescriptor => ({
  name: 'tool',
  description: 'A tool for testing the client.',
  method: 'GET',
  path: '/things',
  mutates: false,
  destructive: false,
  parameters: [],
  ...overrides,
});

const setup = (
  respond: (url: string, init: RequestInit) => Response | Promise<Response> = () =>
    json({ data: [] }),
) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFake = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond(String(url), init ?? {});
  });
  const client = new NestLensClient({
    baseUrl: 'http://localhost:3000/nestlens/',
    headers: { Authorization: 'Bearer secret' },
    fetch: fetchFake as unknown as typeof fetch,
  });
  return { client, calls };
};

describe('API_ROOT', () => {
  it('is the prefix the library mounts the API under', () => {
    expect(API_ROOT).toBe(`${NESTLENS_API_PREFIX}/api`);
  });
});

describe('NestLensClient.manifest', () => {
  it('asks the application for its tools, with the headers it was given', async () => {
    const { client, calls } = setup(() => json({ data: { version: 1, tools: [] } }));

    await client.manifest();

    expect(calls[0]?.url).toBe('http://localhost:3000/nestlens/__nestlens__/api/tools');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('says so when the application is too old to have a tool list', async () => {
    const { client } = setup(() => json({ data: [] }));

    await expect(client.manifest()).rejects.toThrow(/older than this MCP server/);
  });

  it('refuses a format it does not read', async () => {
    const { client } = setup(() => json({ data: { version: 2, tools: [] } }));

    await expect(client.manifest()).rejects.toThrow(/format 2/);
  });
});

describe('NestLensClient.invoke', () => {
  it('puts a path parameter in the path, encoded', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      path: '/tags/monitored/:tag',
      method: 'DELETE',
      parameters: [{ name: 'tag', in: 'path', type: 'string', required: true }],
    });

    await client.invoke(tool, { tag: 'a/b c' });

    expect(calls[0]?.url).toBe(
      'http://localhost:3000/nestlens/__nestlens__/api/tags/monitored/a%2Fb%20c',
    );
    expect(calls[0]?.init.method).toBe('DELETE');
  });

  it('sends the rest as a query: lists joined, booleans as words, nothing for an absent value', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      parameters: [
        { name: 'levels', in: 'query', type: 'array', items: 'string', required: false },
        { name: 'slow', in: 'query', type: 'boolean', required: false },
        { name: 'limit', in: 'query', type: 'number', required: false },
        { name: 'search', in: 'query', type: 'string', required: false },
      ],
    });

    await client.invoke(tool, {
      levels: ['error', 'warn'],
      slow: true,
      limit: 5,
      search: undefined,
    });

    expect(calls[0]?.url).toBe(
      'http://localhost:3000/nestlens/__nestlens__/api/things?levels=error%2Cwarn&slow=true&limit=5',
    );
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('sends a body as JSON, and an empty one when every field is optional', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      method: 'POST',
      path: '/recording/pause',
      parameters: [{ name: 'reason', in: 'body', type: 'string', required: false }],
    });

    await client.invoke(tool, { reason: 'load test' });
    await client.invoke(tool, {});

    expect(calls[0]?.init.body).toBe('{"reason":"load test"}');
    expect(calls[0]?.init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(calls[1]?.init.body).toBe('{}');
  });

  it('refuses an argument the tool does not take, and says what it does take', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      parameters: [{ name: 'limit', in: 'query', type: 'number', required: false }],
    });

    await expect(client.invoke(tool, { limt: 5 })).rejects.toThrow(
      new NestLensArgumentError('tool does not take limt. It takes: limit.'),
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses a call that leaves out what is required', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      parameters: [{ name: 'id', in: 'path', type: 'integer', required: true }],
    });

    await expect(client.invoke(tool, {})).rejects.toThrow(/needs id/);
    expect(calls).toHaveLength(0);
  });

  it('returns the body the API sent', async () => {
    const { client } = setup(() => json({ success: true, data: { id: 7 } }));

    await expect(client.invoke(descriptor({}))).resolves.toEqual({
      success: true,
      data: { id: 7 },
    });
  });

  describe('when the API says no', () => {
    it('reports the envelope error, with the reasons a validator gave', async () => {
      const { client } = setup(() =>
        json(
          {
            success: false,
            error: {
              code: 'ERR_VALIDATION',
              message: 'Validation failed',
              details: { errors: ['type must be one of: request, query'] },
            },
          },
          400,
        ),
      );

      const failure = await client.invoke(descriptor({})).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(NestLensApiError);
      expect((failure as NestLensApiError).status).toBe(400);
      expect((failure as Error).message).toBe(
        'Validation failed: type must be one of: request, query',
      );
    });

    it('reports Nest’s own error shape too', async () => {
      const { client } = setup(() => json({ statusCode: 404, message: 'Cannot GET /x' }, 404));

      await expect(client.invoke(descriptor({}))).rejects.toThrow('Cannot GET /x');
    });
  });

  it('says the application could not be reached, and where it looked', async () => {
    const client = new NestLensClient({
      baseUrl: 'http://localhost:3000/nestlens',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });

    const failure = await client.invoke(descriptor({})).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NestLensUnreachableError);
    expect((failure as Error).message).toContain('http://localhost:3000/nestlens/__nestlens__/api');
  });

  it('points at the mount when the answer is not JSON', async () => {
    const { client } = setup(() => new Response('<html>hello</html>', { status: 200 }));

    await expect(client.invoke(descriptor({}))).rejects.toThrow(/dashboard mount/);
  });
});
