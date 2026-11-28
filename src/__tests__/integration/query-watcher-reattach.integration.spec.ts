/**
 * A second application on the same DataSource or Prisma client records its queries.
 *
 * The query watcher marked what it attached to and never took the mark off, so
 * once one application had closed — `nest start --hmr`, a test suite, two
 * applications in one process — the next found the mark and attached to
 * nothing. Its Queries tab stayed empty, and the first application's closed
 * collector went on being called.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { INestApplication, Logger, Module, Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestLensModule } from '../../nestlens.module';
import { CollectorService } from '../../core/collector.service';
import { WatcherStatusService } from '../../watchers/watcher-status.service';
import { QueryWatcher } from '../../watchers/query';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

class DataSource {
  subscribers: { afterQuery?: (event: unknown) => void }[] = [];
  options = { type: 'postgres', name: 'default' };
  logger: unknown = { logQuery: (): void => undefined };

  run(query: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.afterQuery?.({ query, parameters: [], executionTime: 2 });
    }
  }
}

const TYPEORM_MARK = Symbol.for('nestlens:typeorm-query-watcher-attached');
const PRISMA_MARK = Symbol.for('nestlens:prisma-query-watcher-attached');

interface HoldingLike {
  owner?: unknown;
  waiting: { watcher: unknown; takeOver: () => void }[];
}

const holdingOf = (target: object, mark: symbol): HoldingLike | undefined =>
  (target as Record<symbol, HoldingLike | undefined>)[mark];

/** A Prisma client from 6.14 on: queries arrive as `query` events, which cannot be unsubscribed. */
class PrismaClient {
  constructor(readonly _engineConfig = { logQueries: true }) {}

  private readonly listeners: ((event: unknown) => void)[] = [];

  $on(event: string, listener: (event: unknown) => void): void {
    if (event === 'query') this.listeners.push(listener);
  }

  run(query: string): void {
    for (const listener of this.listeners) listener({ query, params: '[]', duration: 2 });
  }

  get listenerCount(): number {
    return this.listeners.length;
  }
}

const boot = async (...provided: Provider[]): Promise<INestApplication> => {
  @Module({ imports: [NestLensModule.forRoot({})], providers: provided })
  class AppModule {}

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger: false,
    abortOnError: false,
  });
  await app.init();
  return app;
};

const queryStatus = (app: INestApplication): { state?: string; reason?: string } =>
  app
    .get(WatcherStatusService)
    .statuses()
    .find((report) => report.type === 'query') ?? {};

afterEach(() => {
  delete (global as Record<string, unknown>)['prisma'];
  vi.restoreAllMocks();
});

const queriesCollectedBy = (app: INestApplication): (() => string[]) => {
  const collect = vi.spyOn(app.get(CollectorService), 'collect');
  return () =>
    collect.mock.calls
      .filter(([type]) => type === 'query')
      .map(([, payload]) => (payload as { query: string }).query);
};

describe('the query watcher across applications', () => {
  it('attaches to a DataSource another application has closed on', async () => {
    // Arrange
    const dataSource = new DataSource();
    const first = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    await first.close();

    // Act
    const second = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    const collected = queriesCollectedBy(second);
    dataSource.run('SELECT 1');

    // Assert
    expect(collected()).toEqual(['SELECT 1']);
    await second.close();
  });

  it('leaves alone a logger someone else put on the DataSource after it', async () => {
    const dataSource = new DataSource();
    const app = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    const theirs = { logQuery: (): void => undefined };
    dataSource.logger = theirs;

    await app.close();

    expect(dataSource.logger).toBe(theirs);
  });

  it('gives a DataSource back as it found it', async () => {
    const dataSource = new DataSource();
    const logger = dataSource.logger;

    const app = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    await app.close();

    expect(dataSource.subscribers).toEqual([]);
    expect(dataSource.logger).toBe(logger);
  });

  it('records a Prisma client in the second application, and not in the first', async () => {
    // Arrange
    const prisma = new PrismaClient();
    const first = await boot({ provide: 'PRISMA', useValue: prisma });
    const collectedByFirst = queriesCollectedBy(first);
    await first.close();

    // Act
    const second = await boot({ provide: 'PRISMA', useValue: prisma });
    const collectedBySecond = queriesCollectedBy(second);
    prisma.run('SELECT 2');

    // Assert
    expect(collectedBySecond()).toEqual(['SELECT 2']);
    expect(collectedByFirst()).toEqual([]);
    // Prisma has no way to remove a listener, so the one installed is reused.
    expect(prisma.listenerCount).toBe(1);
    await second.close();
  });

  it('attaches to a client an older NestLens copy marked, and to every client after it', async () => {
    // The mark is a registry symbol, shared by every copy of the library; an
    // older copy left `true` there, and assigning to it threw in strict mode,
    // which skipped the rest of the clients without a word.
    const marked = new PrismaClient();
    (marked as unknown as Record<symbol, unknown>)[
      Symbol.for('nestlens:prisma-query-watcher-attached')
    ] = true;
    const unmarked = new PrismaClient();

    const app = await boot(
      { provide: 'MARKED', useValue: marked },
      { provide: 'UNMARKED', useValue: unmarked },
    );
    const collected = queriesCollectedBy(app);
    marked.run('SELECT marked');
    unmarked.run('SELECT unmarked');

    expect(collected()).toEqual(['SELECT marked', 'SELECT unmarked']);
    await app.close();
  });

  it('says a client is recorded by another live application, not that none was found', async () => {
    const prisma = new PrismaClient();
    const first = await boot({ provide: 'PRISMA', useValue: prisma });
    const second = await boot({ provide: 'PRISMA', useValue: prisma });

    const status = second
      .get(WatcherStatusService)
      .statuses()
      .find((report) => report.type === 'query');

    expect(status).toMatchObject({
      state: 'waiting',
      reason: expect.stringContaining('another application'),
    });
    await second.close();
    await first.close();
  });

  it.each([
    ['DataSource', () => new DataSource()],
    ['Prisma client', () => new PrismaClient()],
  ] as const)(
    'hands a %s to the application waiting for it when the one holding it closes',
    async (_kind, create) => {
      // Arrange: A holds it, B waits for it.
      const shared = create();
      const first = await boot({ provide: 'SHARED', useValue: shared });
      const second = await boot({ provide: 'SHARED', useValue: shared });
      const query = (): string | undefined =>
        second
          .get(WatcherStatusService)
          .statuses()
          .find((report) => report.type === 'query')?.state;
      expect(query()).toBe('waiting');

      // Act
      await first.close();
      const collected = queriesCollectedBy(second);
      shared.run('SELECT handed over');

      // Assert: what it says and what it does agree.
      expect(query()).toBe('recording');
      expect(collected()).toEqual(['SELECT handed over']);
      await second.close();
    },
  );

  it('does not hand a DataSource to a waiting application that has closed', async () => {
    const dataSource = new DataSource();
    const first = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    const second = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });

    await second.close();
    await first.close();

    expect(dataSource.subscribers).toEqual([]);
  });

  it('waits once for a client that is both a provider and global.prisma, and says what it took over', async () => {
    // Arrange: an unlogged client, reachable twice from the second application.
    const prisma = new PrismaClient({ logQueries: false });
    (global as Record<string, unknown>)['prisma'] = prisma;
    const first = await boot({ provide: 'PRISMA', useValue: prisma });
    const second = await boot({ provide: 'PRISMA', useValue: prisma });
    expect(holdingOf(prisma, PRISMA_MARK)?.waiting).toHaveLength(1);

    // Act
    await first.close();

    // Assert: it holds the client now, and says what is true of it.
    expect(queryStatus(second)).toMatchObject({
      state: 'waiting',
      reason: expect.stringContaining('without query logging'),
    });
    expect(prisma.listenerCount).toBe(1);
    await second.close();
  });

  it.each([
    ['DataSource', () => new DataSource(), TYPEORM_MARK],
    ['Prisma client', () => new PrismaClient(), PRISMA_MARK],
  ] as const)(
    'hands a %s on past a waiter that fails to take it, and still closes',
    async (_kind, create, mark) => {
      // Arrange: A holds it, a waiter that throws is first in line, B second.
      const shared = create();
      const first = await boot({ provide: 'SHARED', useValue: shared });
      const second = await boot({ provide: 'SHARED', useValue: shared });
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      holdingOf(shared, mark)?.waiting.unshift({
        watcher: {},
        takeOver: () => {
          throw new Error('cannot take it');
        },
      });

      // Act
      await expect(first.close()).resolves.toBeUndefined();
      const collected = queriesCollectedBy(second);
      shared.run('SELECT after a failed hand-over');

      // Assert
      expect(collected()).toEqual(['SELECT after a failed hand-over']);
      expect(queryStatus(second).state).toBe('recording');
      expect(warn.mock.calls.map(([message]) => String(message)).join('\n')).toContain(
        'cannot take it',
      );
      await second.close();
    },
  );

  it('does not mark a DataSource it failed to attach to as its own', async () => {
    const dataSource = new DataSource();
    Object.freeze(dataSource.subscribers);

    const app = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });

    expect(holdingOf(dataSource, TYPEORM_MARK)?.owner).toBeUndefined();
    await app.close();
  });

  it('does not hand a Prisma client to a waiting application that has closed', async () => {
    const prisma = new PrismaClient();
    const first = await boot({ provide: 'PRISMA', useValue: prisma });
    const second = await boot({ provide: 'PRISMA', useValue: prisma });
    const collectedBySecond = queriesCollectedBy(second);

    await second.close();
    await first.close();
    prisma.run('SELECT nobody');

    expect(collectedBySecond()).toEqual([]);
    expect(holdingOf(prisma, PRISMA_MARK)?.owner).toBeUndefined();
  });

  it.each([
    ['DataSource', () => new DataSource()],
    ['Prisma client', () => new PrismaClient()],
  ] as const)('hands a %s along a chain of three applications', async (_kind, create) => {
    const shared = create();
    const a = await boot({ provide: 'SHARED', useValue: shared });
    const b = await boot({ provide: 'SHARED', useValue: shared });
    const c = await boot({ provide: 'SHARED', useValue: shared });
    expect([queryStatus(a).state, queryStatus(b).state, queryStatus(c).state]).toEqual([
      'recording',
      'waiting',
      'waiting',
    ]);

    await a.close();
    const byB = queriesCollectedBy(b);
    const byC = queriesCollectedBy(c);
    shared.run('SELECT 1');
    expect([queryStatus(b).state, queryStatus(c).state]).toEqual(['recording', 'waiting']);
    expect([byB(), byC()]).toEqual([['SELECT 1'], []]);

    await b.close();
    shared.run('SELECT 2');
    expect(queryStatus(c).state).toBe('recording');
    expect(byC()).toEqual(['SELECT 2']);
    await c.close();
  });

  it('queues once on a holding however often it finds the client held', async () => {
    const prisma = new PrismaClient();
    const first = await boot({ provide: 'PRISMA', useValue: prisma });
    const second = await boot({ provide: 'PRISMA', useValue: prisma });

    // The same client found again: a second provider, the global, a second pass.
    const watcher = second.get(QueryWatcher) as unknown as {
      attachPrismaClient: (client: unknown) => string;
    };
    expect(watcher.attachPrismaClient(prisma)).toBe('held-elsewhere');

    expect(holdingOf(prisma, PRISMA_MARK)?.waiting).toHaveLength(1);
    await second.close();
    await first.close();
  });

  it('hands a DataSource on past a waiter that returns without taking it', async () => {
    const dataSource = new DataSource();
    const first = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    const second = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    holdingOf(dataSource, TYPEORM_MARK)?.waiting.unshift({
      watcher: {},
      takeOver: () => undefined,
    });

    await first.close();

    expect(queryStatus(second).state).toBe('recording');
    await second.close();
  });

  it.each([
    ['DataSource', () => new DataSource(), 'TypeORM query watcher attached to 1 DataSource(s)', ''],
    [
      'unlogged Prisma client',
      () => new PrismaClient({ logQueries: false }),
      'Prisma query watcher attached to 1 client(s)',
      'built without query logging',
    ],
  ] as const)(
    'says so when it takes a %s over, as it does at bootstrap',
    async (_kind, create, logged, warned) => {
      const shared = create();
      const first = await boot({ provide: 'SHARED', useValue: shared });
      const second = await boot({ provide: 'SHARED', useValue: shared });
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await first.close();

      expect(log.mock.calls.map(([message]) => String(message)).join('\n')).toContain(logged);
      expect(warn.mock.calls.map(([message]) => String(message)).join('\n')).toContain(warned);
      await second.close();
    },
  );

  it('says it could not attach when its own take-over fails, not that nothing was found', async () => {
    // Arrange: B waits; then the DataSource stops accepting subscribers.
    const dataSource = new DataSource();
    const first = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    const second = await boot({ provide: 'DATA_SOURCE', useValue: dataSource });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    dataSource.subscribers = Object.freeze([]) as unknown as typeof dataSource.subscribers;

    // Act
    await first.close();

    // Assert
    expect(queryStatus(second)).toMatchObject({
      state: 'waiting',
      reason: expect.stringMatching(
        /found 1 DataSource\(s\) or Prisma client\(s\) and could not attach.*not extensible/,
      ),
    });
    await second.close();
  });

  it.each([
    [
      'a DataSource that refuses subscribers',
      (): Provider => {
        const dataSource = new DataSource();
        Object.freeze(dataSource.subscribers);
        return { provide: 'DATA_SOURCE', useValue: dataSource };
      },
      /not extensible/,
    ],
    [
      'a Prisma client whose $on throws',
      (): Provider => {
        const prisma = new PrismaClient();
        prisma.$on = () => {
          throw new Error('no listeners here');
        };
        return { provide: 'PRISMA', useValue: prisma };
      },
      /no listeners here/,
    ],
  ] as const)('says it could not attach at bootstrap to %s', async (_kind, provide, message) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const app = await boot(provide());

    const status = queryStatus(app);
    expect(status.state).toBe('waiting');
    expect(status.reason).toContain('could not attach');
    expect(status.reason).toMatch(message);
    await app.close();
  });
});
