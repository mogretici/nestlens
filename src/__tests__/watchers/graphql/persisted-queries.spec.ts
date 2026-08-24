/**
 * An automatic persisted query is still an operation.
 *
 * With APQ a client sends the full text once and, from then on, only its hash.
 * Apollo resolves the text from its cache *after* `requestDidStart`, and this
 * adapter read `request.query` there and returned when there was none — so
 * every operation was recorded on its first call and never again.
 *
 * Measured against a client using APQ: four requests answered, one entry
 * written. And because the drop happened before the collector, the counters
 * that exist to explain a missing entry — `droppedBySampling`,
 * `droppedByFilter`, `droppedByBuffer` — all stayed at zero, so
 * `recording/status` reported that nothing was wrong.
 *
 * Reported from a production API whose mobile client uses APQ: 44 requests in
 * fifteen minutes, a handful of entries, and months of a dashboard showing a
 * fraction of the traffic.
 */
import { CollectorService } from '../../../core/collector.service';
import { ApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { GraphQLPayload } from '../../../types';
import { GraphQLWatcherConfig } from '../../../nestlens.config';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';

const QUERY = 'query Orders { orders { id } }';
const HASH = 'ec2e01311ab3b02f3d8c8c712f9e579356d332cf4f2a0e2e8b1e9b4b8f2f9a3d';

interface Listener {
  didResolveSource?: (ctx: unknown) => Promise<void>;
  didResolveOperation?: (ctx: unknown) => Promise<void>;
  willSendResponse?: (ctx: unknown) => Promise<void>;
}

const recorder = (options: Partial<GraphQLWatcherConfig> = {}) => {
  const recorded: GraphQLPayload[] = [];

  const collector = {
    collect: async (_type: string, payload: GraphQLPayload) => void recorded.push(payload),
    collectImmediate: async (_type: string, payload: GraphQLPayload) => {
      recorded.push(payload);
      return null;
    },
  } as unknown as CollectorService;

  const adapter = new ApolloAdapter();
  adapter.initialize(resolveGraphQLConfig(options as never), collector);

  return {
    plugin: adapter.getPlugin() as unknown as {
      requestDidStart(ctx: unknown): Promise<Listener | undefined>;
    },
    recorded,
  };
};

/** The first call of a persisted operation: the client sends the text. */
const firstCall = () => ({
  request: {
    query: QUERY,
    operationName: 'Orders',
    extensions: { persistedQuery: { version: 1, sha256Hash: HASH } },
  },
  source: QUERY,
  contextValue: {},
});

/** Every call after it: the hash alone, and Apollo resolves the text. */
const laterCall = () => ({
  request: {
    operationName: 'Orders',
    extensions: { persistedQuery: { version: 1, sha256Hash: HASH } },
  },
  source: QUERY,
  contextValue: {},
});

/** A hash the server's cache does not have: no text, ever. */
const unknownHash = () => ({
  request: { extensions: { persistedQuery: { version: 1, sha256Hash: HASH } } },
  contextValue: {},
});

const answered = async (
  plugin: { requestDidStart(ctx: unknown): Promise<Listener | undefined> },
  context: ReturnType<typeof laterCall> | ReturnType<typeof unknownHash>,
  errors: unknown[] = [],
): Promise<void> => {
  const listener = await plugin.requestDidStart(context);
  // Apollo's order: the source is resolved, then the operation, then the
  // response is sent.
  await listener?.didResolveSource?.(context);
  await listener?.didResolveOperation?.(context);
  await listener?.willSendResponse?.({
    response: { body: { kind: 'single', singleResult: { data: { orders: [] }, errors } } },
  });
};

describe('an operation sent as a persisted query', () => {
  it('is recorded on the calls that send only a hash', async () => {
    const { plugin, recorded } = recorder();

    await answered(plugin, firstCall());
    await answered(plugin, laterCall());
    await answered(plugin, laterCall());
    await answered(plugin, laterCall());

    expect(recorded).toHaveLength(4);
  });

  it('carries the query the hash stood for', async () => {
    const { plugin, recorded } = recorder();

    await answered(plugin, laterCall());

    expect(recorded[0]).toMatchObject({
      query: QUERY,
      operationName: 'Orders',
      operationType: 'query',
    });
  });

  it('reads the depth of the resolved query, not of nothing', async () => {
    const { plugin, recorded } = recorder();

    await answered(plugin, laterCall());

    expect(recorded[0].depthReached).toBeGreaterThan(0);
  });

  it('still honours ignoreOperations, which is decided from the text', async () => {
    const { plugin, recorded } = recorder({ ignoreOperations: ['Orders'] });

    await answered(plugin, laterCall());

    expect(recorded).toHaveLength(0);
  });

  it('records a hash the server could not resolve, which is a real answer', async () => {
    // The APQ handshake: the client sends a hash the cache does not have and
    // Apollo answers `PersistedQueryNotFound`. Recording nothing here is how a
    // cache that keeps missing stays invisible.
    const { plugin, recorded } = recorder();

    await answered(plugin, unknownHash(), [{ message: 'PersistedQueryNotFound' }]);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].queryHash).toBe(HASH);
    expect(recorded[0].hasErrors).toBe(true);
  });

  it('still records an ordinary request that carries its query', async () => {
    const { plugin, recorded } = recorder();

    const plain = { request: { query: QUERY, operationName: 'Orders' }, contextValue: {} };
    const listener = await plugin.requestDidStart(plain);
    await listener?.willSendResponse?.({
      response: { body: { kind: 'single', singleResult: { data: {} } } },
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].query).toBe(QUERY);
  });

  it('still records one entry when two plugins delegate to one adapter', async () => {
    // The double-registration guard has to survive this.
    const { plugin, recorded } = recorder();
    const context = laterCall();

    const first = await plugin.requestDidStart(context);
    const second = await plugin.requestDidStart(context);

    expect(second).toBeUndefined();

    await first?.didResolveSource?.(context);
    await first?.willSendResponse?.({
      response: { body: { kind: 'single', singleResult: { data: {} } } },
    });

    expect(recorded).toHaveLength(1);
  });
});
