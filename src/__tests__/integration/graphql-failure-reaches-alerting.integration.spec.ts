/**
 * The production configuration the documentation recommends, on a GraphQL API.
 *
 * `sampling: { rate: 0 }` keeps only what `always` names, which defaults to
 * `['exception']`, and an alerting webhook's `events` defaults to the same. On
 * a GraphQL API that used to mean: nothing recorded, nothing announced, and
 * `stats.exceptions` structurally zero — measured on a deployment as 2,240
 * entries, every one a health check, while eight broken queries produced
 * nothing at all.
 *
 * This drives the whole chain — resolver, watcher, collector, sampler,
 * alerting — and asks what the reader would ask: did the failure reach the
 * page, and did the pager ring.
 */
import Fastify, { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { Test } from '@nestjs/testing';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { DataMaskerService } from '../../core/data-masker.service';
import { FamilyHashService } from '../../core/family-hash.service';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { STORAGE } from '../../core/storage/storage.interface';
import { TagService } from '../../core/tag.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { createMercuriusAdapter } from '../../watchers/graphql/adapters/mercurius.adapter';
import { instrumentFieldResolvers } from '../../watchers/graphql/field-instrumentation';
import { MercuriusAdapter } from '../../watchers/graphql/adapters/mercurius.adapter';
import { resolveGraphQLConfig } from '../../watchers/graphql/types';
import { describeMercurius } from '../support/mercurius-pairing';

const WEBHOOK = 'http://alerts.test/hook';

describeMercurius('a failing resolver, recorded and announced', () => {
  jest.setTimeout(30_000);

  let app: FastifyInstance;
  let storage: MemoryStorage;
  let collector: CollectorService;
  let alerting: AlertingService;
  let posted: string[];
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    posted = [];
    originalFetch = global.fetch;
    global.fetch = (async (url: string) => {
      posted.push(String(url));
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const config: NestLensConfig = {
      enabled: true,
      // What the performance guide recommends for production.
      sampling: { rate: 0 },
      alerting: { enabled: true, webhooks: [{ url: WEBHOOK }] },
      watchers: { graphql: true },
    };

    storage = new MemoryStorage({ maxEntries: 1000 });
    await storage.initialize();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CollectorService,
        AlertingService,
        TagService,
        FamilyHashService,
        { provide: STORAGE, useValue: storage },
        { provide: NESTLENS_CONFIG, useValue: config },
        { provide: DataMaskerService, useValue: new DataMaskerService() },
      ],
    }).compile();

    collector = moduleRef.get(CollectorService);
    alerting = moduleRef.get(AlertingService);
    alerting.onModuleInit();

    const adapter = createMercuriusAdapter();
    adapter.initialize(resolveGraphQLConfig(true), collector);

    app = Fastify();
    await app.register(mercurius, {
      schema: 'type Query { boom: String!, fine: String! }',
      resolvers: {
        Query: {
          boom: () => {
            throw new Error('the order could not be placed');
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

    instrumentFieldResolvers(
      (app as unknown as { graphql: { schema: unknown } }).graphql.schema,
      (info, context) =>
        (adapter as MercuriusAdapter).trackResolver(
          { info } as Parameters<MercuriusAdapter['trackResolver']>[0],
          context as Parameters<MercuriusAdapter['trackResolver']>[1],
        ),
    );
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    alerting.onModuleDestroy();
    await collector.onModuleDestroy();
    await app?.close();
    await storage.close();
  });

  const ask = async (query: string): Promise<void> => {
    await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: JSON.stringify({ query }),
      headers: { 'content-type': 'application/json' },
    });
    await collector.flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
  };

  it('records the failure although sampling keeps nothing else', async () => {
    await ask('{ boom }');

    const exceptions = await storage.find({ type: 'exception' } as never);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].payload).toMatchObject({ message: 'the order could not be placed' });
  });

  it('counts it, so the dashboard is not structurally empty', async () => {
    await ask('{ boom }');

    const stats = await storage.getStats();
    expect(stats.unresolvedExceptions).toBe(1);
  });

  it('rings the webhook that names exceptions and nothing else', async () => {
    await ask('{ boom }');

    expect(posted).toEqual([WEBHOOK]);
  });

  it('stays quiet for an operation that worked', async () => {
    await ask('{ fine }');

    expect(await storage.find({ type: 'exception' } as never)).toHaveLength(0);
    expect(posted).toEqual([]);
  });

  it('stays quiet for a query the caller got wrong', async () => {
    // A field the schema does not have never reaches a resolver. Recording it
    // would let anyone with curl ring this webhook.
    await ask('{ nope }');

    expect(await storage.find({ type: 'exception' } as never)).toHaveLength(0);
    expect(posted).toEqual([]);
  });
});
