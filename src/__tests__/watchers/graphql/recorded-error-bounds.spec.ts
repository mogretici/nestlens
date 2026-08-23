/**
 * How much a rejected operation is allowed to cost.
 *
 * graphql-js stops validating at a hundred errors, and each one carries a
 * message, a path and a position. Every one of them was recorded, measured
 * against the example application:
 *
 * ```text
 * { nope0 … nope499 }  ->  400 Bad Request, a 152,749-byte entry
 * ```
 *
 * from a request anyone who can reach the endpoint may repeat, against a store
 * that keeps ten thousand entries. The variables had the same shape of problem
 * one field over: bounded in depth, unbounded in size, so a 100KB argument was
 * stored whole.
 */
import { CollectorService } from '../../../core/collector.service';
import { createApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { GraphQLPayload, MAX_RECORDED_ERRORS } from '../../../types';
import { GraphQLWatcherConfig } from '../../../nestlens.config';

interface Plugin {
  requestDidStart: (context: unknown) => Promise<{
    willSendResponse?: (context: unknown) => Promise<void>;
  } | void>;
}

const errorsOf = (count: number): { message: string; locations: unknown; path: unknown }[] =>
  Array.from({ length: count }, (_, i) => ({
    message: `Cannot query field "nope${i}" on type "Query". Did you mean something else?`,
    locations: [{ line: 1, column: i * 7 + 3 }],
    path: undefined,
  }));

const record = async (
  options: Partial<GraphQLWatcherConfig>,
  operation: { query: string; variables?: Record<string, unknown> },
  errors?: unknown[],
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
    request: { query: operation.query, variables: operation.variables },
    contextValue: {},
    response: { body: { kind: 'single', singleResult: { data: null, errors } } },
  };

  const plugin = adapter.getPlugin() as unknown as Plugin;
  const listener = await plugin.requestDidStart(context);
  await listener?.willSendResponse?.(context);
  await new Promise((resolve) => setTimeout(resolve, 20));

  return entries[0];
};

const QUERY = 'query Q { nope0 nope1 }';

describe('the errors a rejected operation records', () => {
  it('keeps the first few', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(101));

    expect(entry?.errors).toHaveLength(MAX_RECORDED_ERRORS);
  });

  it('says how many there were', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(101));

    expect(entry?.errorCount).toBe(101);
  });

  it('keeps the entry small', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(101));

    expect(JSON.stringify(entry).length).toBeLessThan(10_000);
  });

  it('records a handful whole, and counts nothing', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(3));

    expect(entry?.errors).toHaveLength(3);
    expect(entry?.errorCount).toBeUndefined();
  });

  it('still says the operation failed', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(101));

    expect(entry?.hasErrors).toBe(true);
  });

  it('records the first message as it was', async () => {
    const entry = await record({}, { query: QUERY }, errorsOf(101));

    expect(entry?.errors?.[0].message).toContain('nope0');
  });
});

describe('the variables an operation records', () => {
  const huge = { name: 'v'.repeat(100_000) };

  it('records the size instead of the value when it is too large', async () => {
    const entry = await record({}, { query: QUERY, variables: huge });

    expect(entry?.variables).toEqual({ _truncated: true, _size: expect.any(Number) });
  });

  it('keeps the entry small', async () => {
    const entry = await record({}, { query: QUERY, variables: huge });

    expect(JSON.stringify(entry).length).toBeLessThan(10_000);
  });

  it('records ordinary variables as they were', async () => {
    const entry = await record({}, { query: QUERY, variables: { name: 'ada' } });

    expect(entry?.variables).toEqual({ name: 'ada' });
  });

  it('takes the limit from the configuration', async () => {
    const entry = await record(
      { maxVariablesSize: 10 },
      { query: QUERY, variables: { name: 'longer-than-ten-bytes' } },
    );

    expect(entry?.variables).toEqual({ _truncated: true, _size: expect.any(Number) });
  });
});
