/**
 * The Mercurius integration, against Mercurius.
 *
 * It is documented as zero-config and supported, and nothing in this
 * repository had ever run it: the adapter sat at 9% line coverage, the
 * registrar at 7%, the example application uses Apollo, and `mercurius` was
 * not even installed. Reading it against the package's own types found three
 * things wrong with one cause — the hooks' arguments were guessed:
 *
 *     onResolution(execution, context)   execution is the ExecutionResult,
 *                                        `{ data, errors }`, not the request
 *
 * so `execution.variables` was always undefined (captureVariables did
 * nothing), `execution.reply?.statusCode` was always undefined, and the errors
 * were read from a tracking array nothing ever wrote to — every failing
 * operation was recorded as a success.
 *
 * These run a real Fastify server with real Mercurius and read what NestLens
 * recorded.
 */
import Fastify, { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { CollectorService } from '../../../core/collector.service';
import { createMercuriusAdapter } from '../../../watchers/graphql/adapters/mercurius.adapter';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { GraphQLWatcherConfig } from '../../../nestlens.config';
import { GraphQLPayload } from '../../../types';

const SCHEMA = `
  type Order {
    id: ID!
    total: Int!
  }

  type Query {
    hello(name: String): String!
    orders: [Order!]!
    boom: String!
  }
`;

const RESOLVERS = {
  Query: {
    hello: (_root: unknown, args: { name?: string }) => `hello ${args.name ?? 'world'}`,
    orders: () => [
      { id: '1', total: 10 },
      { id: '2', total: 20 },
    ],
    boom: () => {
      throw new Error('resolver said no');
    },
  },
};

interface Recorded {
  payloads: GraphQLPayload[];
}

/** A server with NestLens's hooks registered the way the registrar does. */
const startServer = async (
  options: Partial<GraphQLWatcherConfig> = {},
): Promise<{ app: FastifyInstance; recorded: Recorded }> => {
  const recorded: Recorded = { payloads: [] };

  const collector = {
    collect: async (_type: string, payload: GraphQLPayload) => {
      recorded.payloads.push(payload);
    },
    collectImmediate: async (_type: string, payload: GraphQLPayload) => {
      recorded.payloads.push(payload);
      return null;
    },
  } as unknown as CollectorService;

  const adapter = createMercuriusAdapter();
  adapter.initialize(resolveGraphQLConfig(options as never), collector);

  const app = Fastify();
  // `cache: false` keeps Mercurius from reaching for its LRU through a dynamic
  // import, which Jest's CommonJS VM refuses without a global flag. Nothing
  // under test depends on the query cache.
  await app.register(mercurius, {
    schema: SCHEMA,
    resolvers: RESOLVERS,
    graphiql: false,
    cache: false,
  });

  const hooks = adapter.getPlugin() as Record<string, (...args: unknown[]) => Promise<void>>;
  for (const name of ['preParsing', 'preValidation', 'preExecution', 'onResolution']) {
    const hook = hooks[name];
    if (hook) {
      (app as unknown as { graphql: { addHook: (n: string, h: unknown) => void } }).graphql.addHook(
        name,
        hook,
      );
    }
  }

  await app.ready();
  return { app, recorded };
};

const ask = (
  app: FastifyInstance,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> =>
  app
    .inject({
      method: 'POST',
      url: '/graphql',
      payload: JSON.stringify({ query, variables }),
      headers: { 'content-type': 'application/json', 'user-agent': 'nestlens-test' },
    })
    .then((response) => ({ statusCode: response.statusCode, body: response.body }));

describe('Mercurius, running', () => {
  jest.setTimeout(30_000);

  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const run = async (
    query: string,
    options: Partial<GraphQLWatcherConfig> = {},
    variables?: Record<string, unknown>,
  ): Promise<GraphQLPayload> => {
    const started = await startServer(options);
    app = started.app;

    await ask(app, query, variables);
    // The hook records without awaiting the collector.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(started.recorded.payloads).toHaveLength(1);
    return started.recorded.payloads[0];
  };

  it('records a query', async () => {
    const payload = await run('query Hello { hello }');

    expect(payload.operationType).toBe('query');
    expect(payload.operationName).toBe('Hello');
    expect(payload.query).toContain('hello');
  });

  it('measures how long it took', async () => {
    const payload = await run('{ orders { id total } }');

    expect(payload.duration).toBeGreaterThan(0);
    expect(payload.duration).toBeLessThan(5_000);
  });

  it('records the variables that were sent', async () => {
    const payload = await run(
      'query Hi($name: String) { hello(name: $name) }',
      {},
      {
        name: 'ada',
      },
    );

    expect(payload.variables).toEqual({ name: 'ada' });
  });

  it('masks a sensitive variable rather than dropping the lot', async () => {
    const payload = await run(
      'query Hi($name: String) { hello(name: $name) }',
      { sensitiveVariables: ['name'] },
      { name: 'ada' },
    );

    expect(payload.variables).toEqual({ name: '***' });
  });

  it('leaves the variables out when asked to', async () => {
    const payload = await run(
      'query Hi($name: String) { hello(name: $name) }',
      {
        captureVariables: false,
      },
      { name: 'ada' },
    );

    expect(payload.variables).toBeUndefined();
  });

  it('records that an operation failed', async () => {
    const payload = await run('{ boom }');

    expect(payload.hasErrors).toBe(true);
    expect(payload.errors?.[0].message).toContain('resolver said no');
  });

  it('records where in the query it failed', async () => {
    const payload = await run('{ boom }');

    expect(payload.errors?.[0].path).toEqual(['boom']);
  });

  it('does not call a successful operation a failure', async () => {
    const payload = await run('{ hello }');

    expect(payload.hasErrors).toBe(false);
    expect(payload.errors).toBeUndefined();
  });

  it('records the status the client was given', async () => {
    const payload = await run('{ hello }');

    expect(payload.statusCode).toBe(200);
  });

  it('records who asked', async () => {
    const payload = await run('{ hello }');

    expect(payload.userAgent).toBe('nestlens-test');
  });

  it('records one entry per operation, not one per hook set', async () => {
    const started = await startServer();
    app = started.app;

    // A second hook set, as an application wiring `getPlugin()` by hand on top
    // of the automatic registration would have.
    const adapter = createMercuriusAdapter();
    const collector = {
      collect: async (_t: string, payload: GraphQLPayload) => {
        started.recorded.payloads.push(payload);
      },
    } as unknown as CollectorService;
    adapter.initialize(resolveGraphQLConfig({} as never), collector);
    const second = adapter.getPlugin() as Record<string, (...args: unknown[]) => Promise<void>>;
    for (const name of ['preParsing', 'preValidation', 'preExecution', 'onResolution']) {
      (app as unknown as { graphql: { addHook: (n: string, h: unknown) => void } }).graphql.addHook(
        name,
        second[name],
      );
    }

    await ask(app, '{ hello }');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(started.recorded.payloads).toHaveLength(1);
  });

  it('ignores the operations it was told to', async () => {
    const started = await startServer({ ignoreOperations: ['Hello'] });
    app = started.app;

    await ask(app, 'query Hello { hello }');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(started.recorded.payloads).toHaveLength(0);
  });
});
