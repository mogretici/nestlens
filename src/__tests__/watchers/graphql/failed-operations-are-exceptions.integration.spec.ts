/**
 * A failed operation is an exception the application had.
 *
 * A failed HTTP request produces two entries — the `request` and the
 * `exception` its handler threw — and a failed GraphQL operation produced only
 * the operation. Everything downstream of "an exception happened" was therefore
 * empty on a GraphQL API by construction, whatever the application did: the
 * Exceptions page, `stats.unresolvedExceptions`, the resolve workflow,
 * `sampling.always: ['exception']` and an alerting webhook on
 * `events: ['exception']` — the last two being the defaults, so following the
 * documentation produced silence.
 *
 * Reported from production: 2,240 entries recorded, every one a health check,
 * `exceptions: 0`; eight deliberately broken queries produced four `graphql`
 * entries with `hasErrors: true` while the exception count stayed at zero.
 */
import Fastify, { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { CollectorService } from '../../../core/collector.service';
import { ApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { createMercuriusAdapter } from '../../../watchers/graphql/adapters/mercurius.adapter';
import { describeMercurius } from '../../support/mercurius-pairing';
import { instrumentFieldResolvers } from '../../../watchers/graphql/field-instrumentation';
import { MercuriusAdapter } from '../../../watchers/graphql/adapters/mercurius.adapter';
import { GraphQLWatcherConfig } from '../../../nestlens.config';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { MAX_RECORDED_ERRORS } from '../../../types';

interface Collected {
  type: string;
  payload: Record<string, unknown>;
  requestId?: string;
}

const recorder = (): { collector: CollectorService; collected: Collected[] } => {
  const collected: Collected[] = [];

  const collector = {
    collect: async (type: string, payload: Record<string, unknown>, requestId?: string) => {
      collected.push({ type, payload, requestId });
    },
    collectImmediate: async (
      type: string,
      payload: Record<string, unknown>,
      requestId?: string,
    ) => {
      collected.push({ type, payload, requestId });
      return null;
    },
  } as unknown as CollectorService;

  return { collector, collected };
};

describeMercurius('a resolver that throws, on Mercurius', () => {
  jest.setTimeout(30_000);

  const ask = async (
    query: string,
    options: Partial<GraphQLWatcherConfig> = {},
  ): Promise<{ collected: Collected[]; body: string }> => {
    const { collector, collected } = recorder();
    const adapter = createMercuriusAdapter();
    adapter.initialize(resolveGraphQLConfig(options as never), collector);

    const app: FastifyInstance = Fastify();
    await app.register(mercurius, {
      schema: 'type Query { boom: String!, fine: String! }',
      resolvers: {
        Query: {
          boom: () => {
            throw new TypeError('resolver said no');
          },
          fine: () => 'ok',
        },
      },
      graphiql: false,
      cache: false,
    });

    const hooks = adapter.getPlugin() as Record<string, unknown>;
    const graphql = (app as unknown as { graphql: { addHook: (n: string, h: unknown) => void } })
      .graphql;
    for (const name of ['preParsing', 'preValidation', 'preExecution', 'onResolution']) {
      if (hooks[name]) graphql.addHook(name, hooks[name]);
    }
    await app.ready();

    // What `GraphQLWatcher` installs on this server, and the only place a
    // resolver's own error is visible: Mercurius formats its errors before any
    // hook sees them.
    instrumentFieldResolvers(
      (app as unknown as { graphql: { schema: unknown } }).graphql.schema,
      (info, context) =>
        (adapter as MercuriusAdapter).trackResolver(
          { info } as Parameters<MercuriusAdapter['trackResolver']>[0],
          context as Parameters<MercuriusAdapter['trackResolver']>[1],
        ),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: JSON.stringify({ query }),
      headers: { 'content-type': 'application/json' },
    });

    await app.close();

    return { collected, body: response.body };
  };

  it('is recorded as an exception as well as an operation', async () => {
    const { collected } = await ask('{ boom }');

    expect(collected.map((entry) => entry.type).sort()).toEqual(['exception', 'graphql']);
  });

  it('carries what the resolver threw, not a wrapper', async () => {
    const { collected } = await ask('{ boom }');
    const exception = collected.find((entry) => entry.type === 'exception');

    expect(exception?.payload).toMatchObject({ name: 'TypeError', message: 'resolver said no' });
    expect(String(exception?.payload.stack)).toContain('resolver said no');
  });

  it('says which operation and which field', async () => {
    const { collected } = await ask('query Broken { boom }');
    const exception = collected.find((entry) => entry.type === 'exception');

    expect(String(exception?.payload.context)).toContain('GraphQL');
    expect(String(exception?.payload.context)).toContain('Broken');
    expect(String(exception?.payload.context)).toContain('boom');
  });

  it('shares the operation’s request id, so the two sit together', async () => {
    const { collected } = await ask('{ boom }');
    const ids = new Set(collected.map((entry) => entry.requestId));

    expect(ids.size).toBe(1);
  });

  it('records nothing extra for an operation that worked', async () => {
    const { collected } = await ask('{ fine }');

    expect(collected.map((entry) => entry.type)).toEqual(['graphql']);
  });

  it('leaves the response to the client untouched', async () => {
    const { body } = await ask('{ boom }');

    expect(JSON.parse(body).errors[0].message).toBe('resolver said no');
  });

  it('can be turned off', async () => {
    const { collected } = await ask('{ boom }', { recordExceptions: false });

    expect(collected.map((entry) => entry.type)).toEqual(['graphql']);
  });
});

describe('a failed operation on Apollo', () => {
  type Plugin = {
    requestDidStart(
      context: unknown,
    ): Promise<{ willSendResponse?: (ctx: unknown) => Promise<void> } | undefined>;
  };

  const answer = async (
    errors: unknown[],
    options: Partial<GraphQLWatcherConfig> = {},
  ): Promise<Collected[]> => {
    const { collector, collected } = recorder();
    const adapter = new ApolloAdapter();
    adapter.initialize(resolveGraphQLConfig(options as never), collector);

    const plugin = adapter.getPlugin() as unknown as Plugin;
    const listener = await plugin.requestDidStart({
      request: { query: 'query Broken { boom }', operationName: 'Broken' },
      contextValue: {},
    });

    await listener?.willSendResponse?.({
      response: { body: { kind: 'single', singleResult: { data: null, errors } } },
    });

    return collected;
  };

  it('is recorded as an exception as well as an operation', async () => {
    const collected = await answer([
      {
        message: 'resolver said no',
        path: ['boom'],
        originalError: new TypeError('resolver said no'),
      },
    ]);

    expect(collected.map((entry) => entry.type).sort()).toEqual(['exception', 'graphql']);
  });

  /**
   * A document that does not parse, or names a field the schema does not have,
   * never reaches a resolver: nobody threw and the caller made the mistake. An
   * alerting webhook's default is `events: ['exception']`, so recording those
   * would let anyone with curl page whoever is on call.
   */
  it('leaves an error nothing threw on the operation alone', async () => {
    const collected = await answer([{ message: 'Cannot query field "nope"' }]);

    expect(collected.map((entry) => entry.type)).toEqual(['graphql']);
  });

  it('records one exception per thrown error, bounded like the operation’s list', async () => {
    // A resolver can fail in many fields; the operation entry keeps the first
    // `MAX_RECORDED_ERRORS` of them and so does this.
    const many = Array.from({ length: 40 }, (_, i) => ({
      message: `e${i}`,
      path: [`f${i}`],
      originalError: new Error(`e${i}`),
    }));

    const collected = await answer(many);

    expect(collected.filter((entry) => entry.type === 'exception')).toHaveLength(
      MAX_RECORDED_ERRORS,
    );
  });

  it('records nothing extra for an operation that worked', async () => {
    const collected = await answer([]);

    expect(collected.map((entry) => entry.type)).toEqual(['graphql']);
  });
});
