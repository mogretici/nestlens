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
import { describe, it, expect, vi } from 'vitest';
import { INestApplication, Module, Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestLensModule } from '../../nestlens.module';
import { CollectorService } from '../../core/collector.service';
import { WatcherStatusService } from '../../watchers/watcher-status.service';

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

/** A Prisma client from 6.14 on: queries arrive as `query` events, which cannot be unsubscribed. */
class PrismaClient {
  readonly _engineConfig = { logQueries: true };
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
});
