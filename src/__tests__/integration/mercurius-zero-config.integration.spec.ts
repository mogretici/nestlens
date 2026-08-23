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
import { GraphQLWatcher } from '../../watchers/graphql/graphql.watcher';
import { Entry } from '../../types';
import { describeMercurius } from '../support/mercurius-pairing';

const SCHEMA = `
  type Product { name: String! }
  type Item { id: ID!, product: Product! }
  type Order { id: ID!, items: [Item!]! }

  type Query {
    hello(name: String): String!
    boom: String!
    orders: [Order!]!
  }
`;

const RESOLVERS = {
  Query: {
    hello: (_root: unknown, args: { name?: string }) => `hello ${args.name ?? 'world'}`,
    boom: () => {
      throw new Error('resolver said no');
    },
    orders: () =>
      Array.from({ length: 5 }, (_unused, index) => ({
        id: String(index),
        items: Array.from({ length: 4 }, (_i, j) => ({
          id: `${index}-${j}`,
          product: { name: `p${j}` },
        })),
      })),
  },
};

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        graphql: {
          traceFieldResolvers: true,
          resolverTracingSampleRate: 1,
          detectN1Queries: true,
          n1Threshold: 2,
        },
        request: false,
        exception: false,
        log: false,
      },
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

describeMercurius('Mercurius with nothing wired by hand', () => {
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

  describe('what it records about resolvers', () => {
    /**
     * Mercurius has no per-field hook — Apollo's `willResolveField` has no
     * counterpart — so the adapter's `trackResolver` was written and then
     * called by nothing. Measured on this same query before the schema was
     * instrumented, with both options on:
     *
     *     resolverCount  0        (seventy-one resolvers ran)
     *     fieldTraces    0
     *     potentialN1    undefined
     */
    const RESOLVING_QUERY = '{ orders { id items { id product { name } } } }';

    it('counts the resolvers that ran', async () => {
      const entries = await ask(RESOLVING_QUERY);
      const payload = entries[0].payload as { resolverCount?: number };

      // Five orders, four items each, a product and a name for every item.
      expect(payload.resolverCount).toBeGreaterThan(40);
    });

    it('traces them', async () => {
      const entries = await ask(RESOLVING_QUERY);
      const payload = entries[0].payload as {
        fieldTraces?: { fieldName: string; duration: number; startOffset: number }[];
      };

      expect(payload.fieldTraces?.length).toBeGreaterThan(10);
      expect(payload.fieldTraces?.map((trace) => trace.fieldName)).toContain('product');
      expect(payload.fieldTraces?.every((trace) => trace.duration >= 0)).toBe(true);
    });

    it('notices the N+1', async () => {
      const entries = await ask(RESOLVING_QUERY);
      const payload = entries[0].payload as {
        potentialN1?: { field: string; count: number }[];
      };

      // `product` resolves once per item; that is the shape of an N+1.
      expect(payload.potentialN1?.map((warning) => warning.field)).toContain('product');
    });

    it('counts a leaf field too, as Apollo does', async () => {
      // Fields with no resolver of their own are served by graphql-js's
      // default. Leaving them out would make the two servers disagree about
      // how many resolvers an operation ran.
      const entries = await ask('{ hello }');
      const payload = entries[0].payload as { resolverCount?: number };

      expect(payload.resolverCount).toBeGreaterThan(0);
    });

    it('gives the schema back when the watcher is destroyed', async () => {
      const watcher = app.get(GraphQLWatcher);
      const before = ((await ask(RESOLVING_QUERY))[0].payload as { resolverCount?: number })
        .resolverCount;

      watcher.destroy();
      const after = ((await ask(RESOLVING_QUERY))[0].payload as { resolverCount?: number })
        .resolverCount;

      expect(before).toBeGreaterThan(0);
      // Nothing is recorded once it has been taken apart, but the query still
      // answers — the resolvers are the application's, not ours.
      expect(after ?? 0).toBe(0);
    });
  });

  it('records one entry per operation', async () => {
    const entries = await ask('{ hello }');

    expect(entries).toHaveLength(1);
  });
});
