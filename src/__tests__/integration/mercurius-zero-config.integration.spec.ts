/**
 * "Just enable the watcher" — on Mercurius, with nothing wired by hand.
 *
 * The claim is in the README and in CLAUDE.md: enabling `watchers.graphql`
 * registers the hooks during `onApplicationBootstrap`, whichever server is in
 * use. `MercuriusAutoRegistrar` is what does it, and it had 7% line coverage —
 * the example application uses Apollo, so nothing had ever booted this path.
 *
 * This boots a real Nest application on Fastify with real Mercurius and asks
 * it a question.
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { CollectorService } from '../../core/collector.service';
import { NestLensModule } from '../../nestlens.module';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { Entry } from '../../types';

const SCHEMA = `
  type Query {
    hello(name: String): String!
    boom: String!
  }
`;

const RESOLVERS = {
  Query: {
    hello: (_root: unknown, args: { name?: string }) => `hello ${args.name ?? 'world'}`,
    boom: () => {
      throw new Error('resolver said no');
    },
  },
};

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: { graphql: true, request: false, exception: false, log: false },
    }),
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      typeDefs: SCHEMA,
      resolvers: RESOLVERS,
      graphiql: false,
      // Keeps Mercurius from reaching for its LRU through a dynamic import,
      // which Jest's CommonJS VM refuses without a global flag.
      cache: false,
    }),
  ],
})
class MercuriusApp {}

describe('Mercurius with nothing wired by hand', () => {
  jest.setTimeout(60_000);

  let app: NestFastifyApplication;
  let storage: StorageInterface;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(MercuriusApp, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    storage = app.get<StorageInterface>(STORAGE);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Asks, then returns the GraphQL entries recorded for it. */
  const ask = async (query: string, variables?: Record<string, unknown>): Promise<Entry[]> => {
    await storage.clear();

    await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: JSON.stringify({ query, variables }),
      headers: { 'content-type': 'application/json' },
    });

    await app.get(CollectorService).flush();
    return storage.find({ type: 'graphql', limit: 10 });
  };

  it('records an operation without a plugin being registered by hand', async () => {
    const entries = await ask('query Hello { hello }');

    expect(entries).toHaveLength(1);
    expect((entries[0].payload as { operationName?: string }).operationName).toBe('Hello');
  });

  it('records the variables it was sent', async () => {
    const entries = await ask('query Hi($name: String) { hello(name: $name) }', { name: 'ada' });

    expect((entries[0].payload as { variables?: unknown }).variables).toEqual({ name: 'ada' });
  });

  it('records that an operation failed', async () => {
    const entries = await ask('{ boom }');

    const payload = entries[0].payload as { hasErrors?: boolean; errors?: { message: string }[] };
    expect(payload.hasErrors).toBe(true);
    expect(payload.errors?.[0].message).toContain('resolver said no');
  });

  it('records one entry per operation', async () => {
    const entries = await ask('{ hello }');

    expect(entries).toHaveLength(1);
  });
});
