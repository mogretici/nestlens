/**
 * QueryWatcher unit tests.
 *
 * Covers configuration handling, query payload formatting, slow detection,
 * ignore-pattern filtering, and the auxiliary classes (subscriber + logger)
 * that bridge TypeORM's public API into the watcher.
 *
 * Real TypeORM end-to-end coverage lives in
 * `src/__tests__/watchers/query/typeorm-integration.spec.ts`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { QueryWatcher } from '../../watchers/query/query.watcher';
import { NestLensQuerySubscriber } from '../../watchers/query/typeorm-subscriber';
import { NestLensTypeOrmLogger } from '../../watchers/query/typeorm-logger';

describe('QueryWatcher', () => {
  let collector: jest.Mocked<CollectorService>;

  const buildWatcher = async (config: NestLensConfig): Promise<QueryWatcher> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        QueryWatcher,
        { provide: CollectorService, useValue: collector },
        { provide: NESTLENS_CONFIG, useValue: config },
      ],
    }).compile();

    return moduleRef.get(QueryWatcher);
  };

  beforeEach(() => {
    collector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;
  });

  describe('Config handling', () => {
    it('treats `query: true` as enabled with default slowThreshold', async () => {
      const watcher = await buildWatcher({ watchers: { query: true } });
      expect((watcher as any).config.enabled).toBe(true);
      expect((watcher as any).config.slowThreshold).toBe(100);
    });

    it('treats `query: false` as disabled', async () => {
      const watcher = await buildWatcher({ watchers: { query: false } });
      watcher.onApplicationBootstrap();
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('honours custom slowThreshold from object form', async () => {
      const watcher = await buildWatcher({
        watchers: { query: { enabled: true, slowThreshold: 500 } },
      });
      expect((watcher as any).config.slowThreshold).toBe(500);
    });

    it('defaults to enabled when watchers config is undefined', async () => {
      const watcher = await buildWatcher({});
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  describe('handleQuery', () => {
    let watcher: QueryWatcher;

    beforeEach(async () => {
      watcher = await buildWatcher({
        watchers: { query: { enabled: true, slowThreshold: 100 } },
      });
    });

    it('forwards a fully-populated payload to the collector', () => {
      (watcher as any).handleQuery({
        query: 'SELECT * FROM users WHERE id = ?',
        parameters: [1],
        duration: 50,
        source: 'typeorm',
        connection: 'default',
        requestId: 'req-123',
      });

      expect(collector.collect).toHaveBeenCalledWith(
        'query',
        {
          query: 'SELECT * FROM users WHERE id = ?',
          parameters: [1],
          duration: 50,
          slow: false,
          source: 'typeorm',
          connection: 'default',
        },
        'req-123',
      );
    });

    it('marks queries above slowThreshold as slow', () => {
      (watcher as any).handleQuery({
        query: 'SELECT * FROM big',
        duration: 250,
        source: 'typeorm',
      });
      expect(collector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ slow: true }),
        undefined,
      );
    });

    it('marks queries at or below slowThreshold as not slow', () => {
      (watcher as any).handleQuery({
        query: 'SELECT 1',
        duration: 100,
        source: 'typeorm',
      });
      expect(collector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ slow: false }),
        undefined,
      );
    });

    it('respects custom slowThreshold', async () => {
      const w = await buildWatcher({
        watchers: { query: { enabled: true, slowThreshold: 200 } },
      });
      (w as any).handleQuery({
        query: 'SELECT * FROM x',
        duration: 150,
        source: 'prisma',
      });
      expect(collector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ slow: false }),
        undefined,
      );
    });

    it('skips queries matching any ignore pattern', async () => {
      const w = await buildWatcher({
        watchers: {
          query: { enabled: true, ignorePatterns: [/^PRAGMA/, /information_schema/] },
        },
      });
      (w as any).handleQuery({
        query: 'PRAGMA table_info(users)',
        duration: 1,
        source: 'typeorm',
      });
      (w as any).handleQuery({
        query: 'SELECT * FROM information_schema.tables',
        duration: 5,
        source: 'typeorm',
      });
      expect(collector.collect).not.toHaveBeenCalled();
    });

    it('normalises whitespace and trims the query', () => {
      (watcher as any).handleQuery({
        query: '   SELECT *\n   FROM   users   WHERE id = 1   ',
        duration: 10,
        source: 'typeorm',
      });
      expect(collector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ query: 'SELECT * FROM users WHERE id = 1' }),
        undefined,
      );
    });
  });

  describe('TypeORM DataSource discovery', () => {
    it('discovers DataSource instances exposed via DiscoveryService and dedupes by reference', async () => {
      const fakeDataSource = {
        constructor: { name: 'DataSource' },
        options: { name: 'primary', type: 'better-sqlite3' },
        subscribers: [],
        logger: undefined,
      };
      // Build a wrapper that resembles NestJS's InstanceWrapper minimally.
      const wrappers = [{ instance: fakeDataSource }, { instance: fakeDataSource }];

      const watcher = await buildWatcher({
        watchers: { query: { enabled: true, slowThreshold: 100 } },
      });
      (watcher as any).discoveryService = {
        getProviders: () => wrappers,
      } as unknown as DiscoveryService;

      const found = (watcher as any).discoverTypeORMDataSources();
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(fakeDataSource);
    });

    it('attaches subscriber + wraps logger and refuses to attach twice', async () => {
      const fakeDataSource: Record<string, unknown> = {
        constructor: { name: 'DataSource' },
        options: { name: 'default', type: 'better-sqlite3' },
        subscribers: [],
        logger: undefined,
      };

      const watcher = await buildWatcher({
        watchers: { query: { enabled: true, slowThreshold: 100 } },
      });

      const first = (watcher as any).attachToDataSource(fakeDataSource);
      const second = (watcher as any).attachToDataSource(fakeDataSource);

      expect(first).toBe(true);
      expect(second).toBe(false);
      const subs = fakeDataSource.subscribers as unknown[];
      expect(subs).toHaveLength(1);
      expect(subs[0]).toBeInstanceOf(NestLensQuerySubscriber);
      expect(fakeDataSource.logger).toBeInstanceOf(NestLensTypeOrmLogger);
    });
  });

  describe('NestLensQuerySubscriber', () => {
    it('translates an afterQuery event into a QueryData payload', () => {
      const handler = jest.fn();
      const sub = new NestLensQuerySubscriber(handler, 'main');
      sub.afterQuery({
        query: 'SELECT 1',
        parameters: [],
        executionTime: 12,
        success: true,
      });
      expect(handler).toHaveBeenCalledWith({
        query: 'SELECT 1',
        parameters: [],
        duration: 12,
        source: 'typeorm',
        connection: 'main',
        success: true,
        error: undefined,
      });
    });

    it('ignores events without a query string', () => {
      const handler = jest.fn();
      const sub = new NestLensQuerySubscriber(handler, 'main');
      sub.afterQuery({} as never);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('NestLensTypeOrmLogger', () => {
    it('records logQueryError as a failed query and delegates to the wrapped logger', () => {
      const handler = jest.fn();
      const delegate = { logQueryError: jest.fn() };
      const logger = new NestLensTypeOrmLogger(handler, 'default', delegate);

      const error = new Error('boom');
      logger.logQueryError(error, 'SELECT * FROM missing', [1]);

      expect(handler).toHaveBeenCalledWith({
        query: 'SELECT * FROM missing',
        parameters: [1],
        duration: 0,
        source: 'typeorm',
        connection: 'default',
        success: false,
        error,
      });
      expect(delegate.logQueryError).toHaveBeenCalledWith(
        error,
        'SELECT * FROM missing',
        [1],
        undefined,
      );
    });

    it('records logQuerySlow with the reported execution time', () => {
      const handler = jest.fn();
      const logger = new NestLensTypeOrmLogger(handler, 'default');
      logger.logQuerySlow(450, 'SELECT * FROM big', []);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 450, success: true }),
      );
    });

    it('forwards delegate-only methods without invoking the handler', () => {
      const handler = jest.fn();
      const delegate = {
        logQuery: jest.fn(),
        logSchemaBuild: jest.fn(),
        logMigration: jest.fn(),
        log: jest.fn(),
      };
      const logger = new NestLensTypeOrmLogger(handler, 'default', delegate);

      logger.logQuery('SELECT 1', []);
      logger.logSchemaBuild('build');
      logger.logMigration('migrate');
      logger.log('warn', 'hi');

      expect(handler).not.toHaveBeenCalled();
      expect(delegate.logQuery).toHaveBeenCalled();
      expect(delegate.logSchemaBuild).toHaveBeenCalled();
      expect(delegate.logMigration).toHaveBeenCalled();
      expect(delegate.log).toHaveBeenCalled();
    });
  });
});
