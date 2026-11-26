import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { NESTLENS_API_PREFIX } from '../../nestlens.config';
import type { NestLensToolDescriptor } from '../../api/tools';
import {
  API_ROOT,
  NestLensApiError,
  NestLensArgumentError,
  NestLensClient,
  NestLensUnreachableError,
  withoutCredentials,
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

describe('NestLensClient', () => {
  it('drops every trailing slash of the base URL', async () => {
    const urls: string[] = [];
    const client = new NestLensClient({
      baseUrl: 'http://localhost:3000/nestlens///',
      fetch: (async (url: string) => {
        urls.push(url);
        return json({ data: { version: 1, tools: [] } });
      }) as unknown as typeof fetch,
    });

    await client.manifest();

    expect(urls).toEqual(['http://localhost:3000/nestlens/__nestlens__/api/tools']);
  });

  it('reads a base URL in time proportional to its length, not its square', () => {
    const started = Date.now();
    new NestLensClient({ baseUrl: `http://x${'/'.repeat(100_000)}a` });

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('withoutCredentials', () => {
  it.each([
    ['http://user:hunter2@localhost:3000/nestlens', 'http://localhost:3000/nestlens'],
    ['https://token@app.example/nestlens?x=1', 'https://app.example/nestlens?x=1'],
    ['http://a:b@c@host:1', 'http://host:1/'],
    ['http://localhost:3000/nestlens/a@b', 'http://localhost:3000/nestlens/a@b'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['not a url', 'not a url'],
    // The authority ends at the first of / ? # and, for http, a backslash.
    ['https://evil?u=a@b/c', 'https://evil?u=a@b/c'],
    ['https://evil#a@b/c', 'https://evil#a@b/c'],
    ['http:\\\\u:p@h/x', 'http://h/x'],
    // Unparsable: read by position, with the same terminators.
    ['http://u:p@[bad/x', 'http://[bad/x'],
    ['http://[bad?u=a@b', 'http://[bad?u=a@b'],
    ['http://[bad\\u=a@b', 'http://[bad\\u=a@b'],
  ])('shows %j as %j', (url, shown) => {
    expect(withoutCredentials(url)).toBe(shown);
  });

  it('reads a relative address against the one it answered', () => {
    expect(withoutCredentials('//u:p@other.example/x', 'http://localhost:3000/nestlens')).toBe(
      'http://other.example/x',
    );
    expect(withoutCredentials('/login', 'http://localhost:3000/nestlens')).toBe('/login');
  });
});

describe('a base URL with credentials in it', () => {
  it.each(['http://user:hunter2@localhost:3000/nestlens', 'https://hunter2@app.example/nestlens'])(
    'is refused when the client is made, without repeating them: %s',
    (baseUrl) => {
      const make = (): unknown => new NestLensClient({ baseUrl });

      expect(make).toThrow(
        new Error(
          'The NestLens URL contains credentials (user:password@). They cannot work: fetch ' +
            'refuses an address that carries them, so no request could be sent. Pass them as a ' +
            'header instead (--header "Authorization: ..." or NESTLENS_HEADERS).',
        ),
      );
      expect(make).not.toThrow(/hunter2/);
    },
  );

  it.each(['http://localhost:3000/a@b', 'http://localhost:3000?next=a@b', 'http://h#a@b'])(
    'is not confused with an @ after the authority: %s',
    (baseUrl) => {
      expect(() => new NestLensClient({ baseUrl })).not.toThrow();
    },
  );

  it('is found behind a backslash, which fetch reads as a slash', () => {
    expect(() => new NestLensClient({ baseUrl: 'http:\\\\u:hunter2@h/x' })).toThrow(
      /contains credentials/,
    );
  });
});

describe('a base URL fetch could not use', () => {
  it.each(['u:hunter2@localhost:3000', 'localhost:3000/nestlens', 'ftp://h/x', 'not a url'])(
    'is refused when the client is made, without repeating it: %s',
    (baseUrl) => {
      const make = (): unknown => new NestLensClient({ baseUrl });

      expect(make).toThrow(
        new Error(
          'The NestLens URL must be an http:// or https:// address with the dashboard path, ' +
            'such as http://localhost:3000/nestlens.',
        ),
      );
      expect(make).not.toThrow(/hunter2/);
    },
  );
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

  it('sends the rest as a query: a list as one key per element, booleans as words, nothing for an absent value', async () => {
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
      'http://localhost:3000/nestlens/__nestlens__/api/things?levels=error&levels=warn&slow=true&limit=5',
    );
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('keeps a comma inside one list element, which the API would otherwise split', async () => {
    const { client, calls } = setup();
    const tool = descriptor({
      parameters: [{ name: 'tags', in: 'query', type: 'array', items: 'string', required: true }],
    });

    await client.invoke(tool, { tags: ['A,B', 'C'] });
    await client.invoke(tool, { tags: ['A,B'] });
    await client.invoke(tool, { tags: ['A'] });

    expect(calls.map((call) => new URL(call.url).searchParams.getAll('tags'))).toEqual([
      ['A,B', 'C'],
      // One element with a comma needs an empty companion to arrive as a list.
      ['A,B', ''],
      ['A'],
    ]);
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

  it('sends a method in upper case, and refuses one it does not know', async () => {
    const { client, calls } = setup();

    await client.invoke(descriptor({ method: 'delete' as 'DELETE' }));
    await expect(client.invoke(descriptor({ method: 'TRACE' as 'GET' }))).rejects.toThrow(
      new NestLensArgumentError(
        'tool is described with method TRACE, which nestlens-mcp does not send. ' +
          'It sends GET, POST, PUT, PATCH and DELETE.',
      ),
    );

    expect(calls.map((call) => call.init.method)).toEqual(['DELETE']);
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

  describe('refuses an argument whose shape does not fit its parameter, before anything is sent', () => {
    const clearEntries = descriptor({
      method: 'DELETE',
      path: '/entries',
      mutates: true,
      destructive: true,
      parameters: [
        { name: 'type', in: 'query', type: 'string', required: false, enum: ['request', 'log'] },
      ],
    });

    it.each([
      ['an empty list', []],
      ['a list', ['request']],
      ['an object', { value: 'request' }],
    ])('%s for a single value (which would otherwise clear every type)', async (_label, value) => {
      const { client, calls } = setup();

      await expect(client.invoke(clearEntries, { type: value })).rejects.toThrow(
        new NestLensArgumentError('tool takes one value for type, not a list or an object.'),
      );
      expect(calls).toHaveLength(0);
    });

    it('a list for a path or a body parameter', async () => {
      const { client, calls } = setup();
      const tool = descriptor({
        method: 'POST',
        path: '/things/:id',
        parameters: [
          { name: 'id', in: 'path', type: 'integer', required: true },
          { name: 'reason', in: 'body', type: 'string', required: false },
        ],
      });

      await expect(client.invoke(tool, { id: [1, 2] })).rejects.toThrow(/one value for id/);
      await expect(client.invoke(tool, { id: 1, reason: ['a'] })).rejects.toThrow(
        /one value for reason/,
      );
      expect(calls).toHaveLength(0);
    });

    it('an empty list, or a list of objects, for a list', async () => {
      const { client, calls } = setup();
      const tool = descriptor({
        parameters: [
          { name: 'tags', in: 'query', type: 'array', items: 'string', required: false },
        ],
      });

      await expect(client.invoke(tool, { tags: [] })).rejects.toThrow(
        new NestLensArgumentError('tool needs at least one value in tags, or leave tags out.'),
      );
      await expect(client.invoke(tool, { tags: [{ name: 'a' }] })).rejects.toThrow(
        new NestLensArgumentError('tool takes plain values in tags, not lists or objects.'),
      );
      expect(calls).toHaveLength(0);
    });

    it('but still takes a list written as one comma-separated value, as the API reads it', async () => {
      const { client, calls } = setup();
      const tool = descriptor({
        parameters: [
          { name: 'levels', in: 'query', type: 'array', items: 'string', required: false },
        ],
      });

      await client.invoke(tool, { levels: 'error,warn' });

      expect(new URL(calls[0]!.url).searchParams.getAll('levels')).toEqual(['error,warn']);
    });
  });

  describe('refuses a value that is not of its declared type, before anything is sent', () => {
    const tool = descriptor({
      method: 'DELETE',
      path: '/things/:id',
      parameters: [
        { name: 'id', in: 'path', type: 'integer', required: true },
        { name: 'limit', in: 'query', type: 'integer', required: false },
        { name: 'ratio', in: 'query', type: 'number', required: false },
        { name: 'slow', in: 'query', type: 'boolean', required: false },
        { name: 'type', in: 'query', type: 'string', required: false, enum: ['request', 'log'] },
      ],
    });

    it.each([
      [{ id: 1, limit: 'abc' }, 'tool takes a whole number for limit, not "abc".'],
      [{ id: 1, limit: '10' }, 'tool takes a whole number for limit, not "10".'],
      [{ id: 1, limit: 2.5 }, 'tool takes a whole number for limit, not 2.5.'],
      [{ id: 1.5 }, 'tool takes a whole number for id, not 1.5.'],
      [{ id: '7' }, 'tool takes a whole number for id, not "7".'],
      [{ id: 1, ratio: 'half' }, 'tool takes a number for ratio, not "half".'],
      [{ id: 1, slow: 'yes' }, 'tool takes true or false for slow, not "yes".'],
      [{ id: 1, slow: 'true' }, 'tool takes true or false for slow, not "true".'],
      [{ id: 1, type: 'nonsense' }, 'tool takes one of request, log for type, not "nonsense".'],
      [{ id: 1, type: 1 }, 'tool takes one of request, log for type, not 1.'],
    ])('%j', async (args, message) => {
      const { client, calls } = setup();

      await expect(client.invoke(tool, args)).rejects.toThrow(new NestLensArgumentError(message));
      expect(calls).toHaveLength(0);
    });

    it('reads an enum as the query string carries it', async () => {
      const { client, calls } = setup();
      const queries = descriptor({
        parameters: [
          { name: 'slow', in: 'query', type: 'string', required: false, enum: ['true', 'false'] },
        ],
      });

      await client.invoke(queries, { slow: true });

      expect(new URL(calls[0]!.url).searchParams.get('slow')).toBe('true');
    });

    it('and sends what fits', async () => {
      const { client, calls } = setup();

      await client.invoke(tool, { id: 3, limit: 10, ratio: 0.5, slow: false, type: 'log' });

      expect(calls[0]?.url).toBe(
        'http://localhost:3000/nestlens/__nestlens__/api/things/3?limit=10&ratio=0.5&slow=false&type=log',
      );
    });

    describe('a blank, which the API reads as not given', () => {
      const listing = descriptor({
        parameters: [
          { name: 'requestId', in: 'query', type: 'string', required: false },
          { name: 'levels', in: 'query', type: 'array', items: 'string', required: false },
          { name: 'reason', in: 'body', type: 'string', required: false },
        ],
      });

      it.each([
        [{ requestId: '' }, 'requestId'],
        [{ requestId: '   ' }, 'requestId'],
        [{ levels: ' ' }, 'levels'],
        [{ levels: ' , ,' }, 'levels'],
        [{ levels: ['error', ''] }, 'levels'],
        [{ reason: '\t' }, 'reason'],
      ])('%j is refused', async (args, name) => {
        const { client, calls } = setup();

        await expect(client.invoke(listing, args)).rejects.toThrow(
          new NestLensArgumentError(
            `tool was given a blank value for ${name}, which NestLens reads as not given. ` +
              `Leave ${name} out instead.`,
          ),
        );
        expect(calls).toHaveLength(0);
      });

      it('still refuses a limit that is not a number', async () => {
        const { client, calls } = setup();
        const paged = descriptor({
          parameters: [
            { name: 'limit', in: 'query', type: 'integer', required: false, minimum: 1 },
          ],
        });

        await expect(client.invoke(paged, { limit: 'abc' })).rejects.toThrow(/whole number/);
        await expect(client.invoke(paged, { limit: '' })).rejects.toThrow(/whole number/);
        expect(calls).toHaveLength(0);
      });
    });

    it.each(['', '.', '..'])('refuses %j as a path segment', async (value) => {
      const { client, calls } = setup();
      const tagged = descriptor({
        method: 'DELETE',
        path: '/tags/monitored/:tag',
        parameters: [{ name: 'tag', in: 'path', type: 'string', required: true }],
      });

      await expect(client.invoke(tagged, { tag: value })).rejects.toThrow(
        new NestLensArgumentError(
          `tool needs a real value for tag: "", "." and ".." change the path instead of naming one.`,
        ),
      );
      expect(calls).toHaveLength(0);
    });

    it('refuses null rather than reading it as left out, which for a delete means everything', async () => {
      const { client, calls } = setup();
      const clearEntries = descriptor({
        method: 'DELETE',
        path: '/entries',
        parameters: [
          { name: 'type', in: 'query', type: 'string', required: false, enum: ['request'] },
        ],
      });

      await expect(client.invoke(clearEntries, { type: null })).rejects.toThrow(
        new NestLensArgumentError('tool does not take null for type. Leave type out instead.'),
      );
      expect(calls).toHaveLength(0);
    });
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

  describe('a redirect', () => {
    it('is refused, not followed, and named', async () => {
      const { client, calls } = setup(
        () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'https://elsewhere.example/nestlens/__nestlens__/api/things' },
          }),
      );

      const failure = await client.invoke(descriptor({})).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(NestLensApiError);
      expect((failure as NestLensApiError).status).toBe(302);
      expect((failure as Error).message).toContain('redirected');
      expect((failure as Error).message).toContain('https://elsewhere.example/nestlens');
      expect((failure as Error).message).toContain('--url');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.init.redirect).toBe('manual');
    });

    it('releases the body it will not read', async () => {
      const response = new Response('Moved', {
        status: 302,
        headers: { Location: 'https://elsewhere.example/' },
      });
      const cancel = jest.spyOn(response.body!, 'cancel');
      const { client } = setup(() => response);

      await expect(client.invoke(descriptor({}))).rejects.toThrow(/redirected/);

      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('does not carry the headers to where it points, over real HTTP', async () => {
      const seen: Array<string | undefined> = [];
      const target = createServer((request, response) => {
        seen.push(request.headers['x-nestlens-token'] as string | undefined);
        response.end('{}');
      });
      await new Promise<void>((done) => target.listen(0, '127.0.0.1', done));
      const targetPort = (target.address() as AddressInfo).port;
      const origin = createServer((_request, response) => {
        response.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/stolen` });
        response.end();
      });
      await new Promise<void>((done) => origin.listen(0, '127.0.0.1', done));
      const originPort = (origin.address() as AddressInfo).port;

      try {
        const client = new NestLensClient({
          baseUrl: `http://127.0.0.1:${originPort}/nestlens`,
          headers: { 'X-NestLens-Token': 'secret' },
        });

        await expect(client.invoke(descriptor({}))).rejects.toThrow(/redirected/);
        expect(seen).toEqual([]);
      } finally {
        await Promise.all([
          new Promise((done) => target.close(done)),
          new Promise((done) => origin.close(done)),
        ]);
      }
    });
  });

  it('does not repeat the credentials in where a redirect pointed', async () => {
    const { client } = setup(
      () =>
        new Response(null, { status: 301, headers: { Location: 'https://u:pw@other.example/x' } }),
    );

    const failure = await client.invoke(descriptor({})).catch((error: unknown) => error);

    expect((failure as Error).message).toContain('https://other.example/x');
    expect((failure as Error).message).not.toContain('u:pw');
  });

  it('points at the mount when the answer is not JSON', async () => {
    const { client } = setup(() => new Response('<html>hello</html>', { status: 200 }));

    await expect(client.invoke(descriptor({}))).rejects.toThrow(/dashboard mount/);
  });
});
