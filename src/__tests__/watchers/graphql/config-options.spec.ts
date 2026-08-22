/**
 * The GraphQL options, each doing what its name says.
 *
 * Nine of them appeared in no test at all: `captureVariables`,
 * `captureResponse`, `maxQuerySize`, `ignoreOperations`,
 * `ignoreIntrospection`, `samplingRate`, `traceFieldResolvers`,
 * `traceSlowResolvers` and `resolverTracingSampleRate`. Every one is read on a
 * reachable path, and several were verified by hand against the example
 * application — but an option with no test is an option that can stop working
 * without anybody hearing about it, which is how `subscriptions` came to be
 * five settings that did nothing.
 */
import { CollectorService } from '../../../core/collector.service';
import { createApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { GraphQLPayload } from '../../../types';
import { GraphQLWatcherConfig } from '../../../nestlens.config';

interface Plugin {
  requestDidStart: (context: unknown) => Promise<{
    executionDidStart?: () => Promise<{ willResolveField: (p: { info: unknown }) => unknown }>;
    willSendResponse?: (context: unknown) => Promise<void>;
  } | void>;
}

const objectType = (name: string) => ({ name, toString: () => name, getFields: () => ({}) });
const scalarType = (name: string) => ({ name, toString: () => name });

/**
 * Runs one operation through the plugin and returns what was recorded.
 */
const record = async (
  options: Partial<GraphQLWatcherConfig>,
  operation: { query: string; operationName?: string; variables?: Record<string, unknown> },
  fields: { parent: string; field: string; returns: unknown }[] = [],
  data: unknown = { ok: true },
): Promise<GraphQLPayload | undefined> => {
  const entries: GraphQLPayload[] = [];

  const collector = {
    collect: async (_type: string, payload: GraphQLPayload) => void entries.push(payload),
    collectImmediate: async (_type: string, payload: GraphQLPayload) => {
      entries.push(payload);
      return null;
    },
  } as unknown as CollectorService;

  const adapter = createApolloAdapter();
  adapter.initialize(resolveGraphQLConfig(options as never), collector);

  const context = {
    request: {
      query: operation.query,
      operationName: operation.operationName,
      variables: operation.variables,
    },
    contextValue: {},
    response: { body: { kind: 'single', singleResult: { data } } },
  };

  const plugin = adapter.getPlugin() as unknown as Plugin;
  const listener = await plugin.requestDidStart(context);

  if (!listener) return undefined;

  const execution = await listener.executionDidStart?.();
  for (const { parent, field, returns } of fields) {
    // `willResolveField` may return the function Apollo calls when the field
    // finishes; a tracer that is never told the field ended records nothing,
    // which is what the first version of this harness measured.
    const finished = execution?.willResolveField({
      info: {
        fieldName: field,
        parentType: { name: parent },
        returnType: returns,
        path: { key: field },
      },
    });

    if (typeof finished === 'function') (finished as () => void)();
  }

  await listener.willSendResponse?.(context);
  await new Promise((resolve) => setTimeout(resolve, 20));

  return entries[0];
};

describe('captureVariables', () => {
  const withVariables = {
    query: 'query Q($id: ID!) { order(id: $id) { id } }',
    variables: { id: '7' },
  };

  it('records them when it is on', async () => {
    const entry = await record({ captureVariables: true }, withVariables);

    expect(entry?.variables).toEqual({ id: '7' });
  });

  it('leaves them out when it is off', async () => {
    const entry = await record({ captureVariables: false }, withVariables);

    expect(entry?.variables).toBeUndefined();
  });

  it('masks a sensitive one even when it is on', async () => {
    const entry = await record(
      { captureVariables: true },
      {
        query: 'mutation M($password: String!) { login(password: $password) { id } }',
        variables: { password: 'hunter2' },
      },
    );

    expect(JSON.stringify(entry?.variables)).not.toContain('hunter2');
  });
});

describe('captureResponse', () => {
  const query = { query: 'query Q { order { id } }' };

  it('records the response when it is on', async () => {
    const entry = await record({ captureResponse: true }, query, [], { order: { id: '7' } });

    expect(JSON.stringify(entry?.responseData)).toContain('7');
  });

  it('leaves it out by default', async () => {
    const entry = await record({}, query, [], { order: { id: '7' } });

    expect(entry?.responseData).toBeUndefined();
  });
});

describe('maxQuerySize', () => {
  it('truncates a query past the limit', async () => {
    const long = `query Q { ${'field '.repeat(200)} }`;
    const entry = await record({ maxQuerySize: 50 }, { query: long });

    expect((entry?.query ?? '').length).toBeLessThanOrEqual(80);
  });

  it('leaves a query inside the limit alone', async () => {
    const entry = await record({ maxQuerySize: 10_000 }, { query: 'query Q { order { id } }' });

    expect(entry?.query).toContain('order');
  });
});

describe('ignoreOperations', () => {
  it('records nothing for an operation it names', async () => {
    const entry = await record(
      { ignoreOperations: ['HealthCheck'] },
      { query: 'query HealthCheck { ok }', operationName: 'HealthCheck' },
    );

    expect(entry).toBeUndefined();
  });

  it('still records the others', async () => {
    const entry = await record(
      { ignoreOperations: ['HealthCheck'] },
      { query: 'query Orders { order { id } }', operationName: 'Orders' },
    );

    expect(entry).toBeDefined();
  });
});

describe('ignoreIntrospection', () => {
  it('records nothing for an introspection query by default', async () => {
    const entry = await record({}, { query: 'query { __schema { types { name } } }' });

    expect(entry).toBeUndefined();
  });

  it('records it when the option is off', async () => {
    const entry = await record(
      { ignoreIntrospection: false },
      { query: 'query { __schema { types { name } } }' },
    );

    expect(entry).toBeDefined();
  });
});

describe('samplingRate', () => {
  it('records nothing at zero', async () => {
    const entry = await record({ samplingRate: 0 }, { query: 'query Q { order { id } }' });

    expect(entry).toBeUndefined();
  });

  it('records everything at one', async () => {
    const entry = await record({ samplingRate: 1 }, { query: 'query Q { order { id } }' });

    expect(entry).toBeDefined();
  });
});

describe('traceFieldResolvers', () => {
  const fields = [{ parent: 'Order', field: 'id', returns: scalarType('ID') }];

  it('records field traces when it is on', async () => {
    const entry = await record(
      { traceFieldResolvers: true, resolverTracingSampleRate: 1 },
      { query: 'query Q { order { id } }' },
      fields,
    );

    expect(entry?.fieldTraces?.length).toBeGreaterThan(0);
  });

  it('records none when it is off', async () => {
    const entry = await record(
      { traceFieldResolvers: false },
      { query: 'query Q { order { id } }' },
      fields,
    );

    expect(entry?.fieldTraces ?? []).toHaveLength(0);
  });

  it('counts the resolvers either way', async () => {
    // A separate question from tracing them, and a cheaper one.
    const entry = await record(
      { traceFieldResolvers: false },
      { query: 'query Q { order { id } }' },
      fields,
    );

    expect(entry?.resolverCount).toBe(1);
  });

  it('records none at a sample rate of zero', async () => {
    const entry = await record(
      { traceFieldResolvers: true, resolverTracingSampleRate: 0 },
      { query: 'query Q { order { id } }' },
      fields,
    );

    expect(entry?.fieldTraces ?? []).toHaveLength(0);
  });
});

describe('detectN1Queries and n1Threshold', () => {
  const many = Array.from({ length: 6 }, () => ({
    parent: 'OrderItem',
    field: 'product',
    returns: objectType('Product'),
  }));

  it('reports past the threshold', async () => {
    const entry = await record(
      { detectN1Queries: true, n1Threshold: 3 },
      { query: 'query Q { orders { items { product { name } } } }' },
      many,
    );

    expect(entry?.potentialN1?.length).toBeGreaterThan(0);
  });

  it('says nothing below it', async () => {
    const entry = await record(
      { detectN1Queries: true, n1Threshold: 100 },
      { query: 'query Q { orders { items { product { name } } } }' },
      many,
    );

    expect(entry?.potentialN1 ?? []).toHaveLength(0);
  });

  it('says nothing when detection is off', async () => {
    const entry = await record(
      { detectN1Queries: false, n1Threshold: 3 },
      { query: 'query Q { orders { items { product { name } } } }' },
      many,
    );

    expect(entry?.potentialN1 ?? []).toHaveLength(0);
  });
});
