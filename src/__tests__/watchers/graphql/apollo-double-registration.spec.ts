import { ApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { CollectorService } from '../../../core';

/**
 * One entry per operation, however many plugins Apollo is holding.
 *
 * NestLens registers itself with Apollo automatically. `getPlugin()` still
 * exists for the manual wiring that used to be required, and every installation
 * written before auto-registration still passes it — including this
 * repository's own example application. Apollo then holds two plugins that
 * delegate to the same adapter and calls both, so every operation was recorded
 * twice: storage filling at twice the rate, and each request listed twice on
 * the dashboard.
 *
 * Measured on the example app before this: 10 requests in, 20 entries out.
 */
describe('Apollo plugin registered twice', () => {
  const collected: string[] = [];

  const collector = {
    collect: jest.fn(async (type: string) => {
      collected.push(type);
    }),
    collectImmediate: jest.fn(async (type: string) => {
      collected.push(type);
      return null;
    }),
  } as unknown as CollectorService;

  const makeAdapter = (): ApolloAdapter => {
    const adapter = new ApolloAdapter();
    adapter.initialize(resolveGraphQLConfig(true), collector);
    return adapter;
  };

  /** The shape Apollo hands a plugin, reduced to what the adapter reads. */
  const makeRequestContext = (): Record<string, unknown> => ({
    request: { query: '{ users { id } }', operationName: 'Users' },
    contextValue: {},
  });

  type Plugin = {
    requestDidStart(context: unknown): Promise<unknown>;
  };

  beforeEach(() => {
    collected.length = 0;
    jest.clearAllMocks();
  });

  it('starts the operation once when two plugins receive it', async () => {
    const adapter = makeAdapter();

    // What the application ends up with: the auto-registered plugin and the
    // one it wired by hand. Two objects, one adapter — which is why the guard
    // cannot live on the plugin.
    const auto = adapter.getPlugin() as unknown as Plugin;
    const manual = adapter.getPlugin() as unknown as Plugin;

    const context = makeRequestContext();

    const first = await auto.requestDidStart(context);
    const second = await manual.requestDidStart(context);

    expect(first).toBeDefined();
    // The second plugin is told there is nothing to do for this operation.
    expect(second).toBeUndefined();
  });

  it('still handles the next operation', async () => {
    const adapter = makeAdapter();
    const auto = adapter.getPlugin() as unknown as Plugin;
    const manual = adapter.getPlugin() as unknown as Plugin;

    // Two operations, each seen by both plugins.
    const one = makeRequestContext();
    const two = makeRequestContext();

    const firstListener = await auto.requestDidStart(one);
    await manual.requestDidStart(one);
    const secondListener = await auto.requestDidStart(two);
    await manual.requestDidStart(two);

    // Skipping a duplicate must not skip the operation after it.
    expect(firstListener).toBeDefined();
    expect(secondListener).toBeDefined();
  });

  it('does not hold on to the request contexts it has seen', () => {
    // A `WeakSet`, so a long-running process does not accumulate one entry per
    // request it ever served. Asserted on the field rather than on memory,
    // which is the only part a test can pin.
    const adapter = makeAdapter();
    const seen = (adapter as unknown as { startedRequests: unknown }).startedRequests;

    expect(seen).toBeInstanceOf(WeakSet);
  });
});
