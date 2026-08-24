/**
 * The Apollo integration, against Apollo.
 *
 * Every Apollo test in this repository drove the plugin with hand-written
 * context objects, which encode what the author believed Apollo passes rather
 * than what it passes. That is how a watcher that recorded only the first call
 * of each persisted operation survived a full spec file and reached a
 * production deployment, where it showed a fraction of the traffic for months.
 *
 * These run a real `ApolloServer` with the plugin registered the way an
 * application registers it, and read back what NestLens recorded — including
 * the automatic persisted query handshake, which is the case no fake had.
 */
import { createHash } from 'crypto';
import { ApolloServer } from '@apollo/server';
import { CollectorService } from '../../../core/collector.service';
import { ApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { GraphQLPayload } from '../../../types';
import { GraphQLWatcherConfig } from '../../../nestlens.config';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';

const QUERY = 'query Orders { orders }';
const hashOf = (query: string): string => createHash('sha256').update(query).digest('hex');

interface Running {
  server: ApolloServer;
  recorded: GraphQLPayload[];
}

const start = async (options: Partial<GraphQLWatcherConfig> = {}): Promise<Running> => {
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

  const server = new ApolloServer({
    typeDefs: 'type Query { orders: String!, boom: String! }',
    resolvers: {
      Query: {
        orders: () => 'two',
        boom: () => {
          throw new TypeError('the order could not be placed');
        },
      },
    },
    plugins: [adapter.getPlugin() as never],
    // The APQ cache Apollo keeps by default, made explicit.
    persistedQueries: { ttl: 300 },
  });

  await server.start();

  return { server, recorded };
};

/** One HTTP-less operation, as Apollo's own tests do it. */
const ask = (server: ApolloServer, body: Record<string, unknown>) =>
  server.executeOperation(body as never);

describe('Apollo, running', () => {
  jest.setTimeout(30_000);

  let running: Running;

  afterEach(async () => {
    await running?.server.stop();
  });

  it('records an ordinary operation', async () => {
    running = await start();

    await ask(running.server, { query: QUERY });

    expect(running.recorded).toHaveLength(1);
    expect(running.recorded[0]).toMatchObject({ operationName: 'Orders', operationType: 'query' });
  });

  /**
   * The handshake a client using APQ performs: a hash alone, which the server
   * does not know yet; then the document with its hash, which the server
   * stores; then the hash alone again, which now resolves.
   */
  it('records every call of a persisted query, not just the first', async () => {
    running = await start();
    const sha256Hash = hashOf(QUERY);
    const persisted = { extensions: { persistedQuery: { version: 1, sha256Hash } } };

    // 1. The miss.
    await ask(running.server, persisted);
    // 2. The client retries with the document.
    await ask(running.server, { query: QUERY, ...persisted });
    // 3. And from here on, the hash alone.
    await ask(running.server, persisted);
    await ask(running.server, persisted);
    await ask(running.server, persisted);

    const answered = running.recorded.filter((entry) => entry.query === QUERY);

    // The four that ran the document, whatever the client sent.
    expect(answered).toHaveLength(4);
  });

  it('records the miss under the hash the client sent', async () => {
    running = await start();
    const sha256Hash = hashOf(QUERY);

    await ask(running.server, { extensions: { persistedQuery: { version: 1, sha256Hash } } });

    expect(running.recorded).toHaveLength(1);
    expect(running.recorded[0]).toMatchObject({ queryHash: sha256Hash, hasErrors: true });
  });

  it('records what a resolver threw, as an exception beside the operation', async () => {
    const recorded: { type: string; payload: Record<string, unknown> }[] = [];
    const collector = {
      collect: async (type: string, payload: Record<string, unknown>) =>
        void recorded.push({ type, payload }),
      collectImmediate: async (type: string, payload: Record<string, unknown>) => {
        recorded.push({ type, payload });
        return null;
      },
    } as unknown as CollectorService;

    const adapter = new ApolloAdapter();
    adapter.initialize(resolveGraphQLConfig(true), collector);

    const server = new ApolloServer({
      typeDefs: 'type Query { boom: String! }',
      resolvers: {
        Query: {
          boom: () => {
            throw new TypeError('the order could not be placed');
          },
        },
      },
      plugins: [adapter.getPlugin() as never],
    });
    await server.start();
    running = { server, recorded: [] };

    await server.executeOperation({ query: '{ boom }' } as never);

    expect(recorded.map((entry) => entry.type).sort()).toEqual(['exception', 'graphql']);
    expect(recorded.find((entry) => entry.type === 'exception')?.payload).toMatchObject({
      name: 'TypeError',
      message: 'the order could not be placed',
    });
  });

  it('leaves the client’s answer exactly as it was', async () => {
    running = await start();

    const answer = await ask(running.server, { query: QUERY });

    expect((answer.body as { singleResult: { data?: unknown } }).singleResult.data).toEqual({
      orders: 'two',
    });
  });
});
