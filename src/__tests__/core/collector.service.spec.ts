import { Logger } from '@nestjs/common';
import { DataMaskerService } from '../../core/data-masker.service';
import { currentRequestId, runInRequestContext } from '../../core/request-context';
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { TagService } from '../../core/tag.service';
import { FamilyHashService } from '../../core/family-hash.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

describe('CollectorService', () => {
  let service: CollectorService;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockTagService: jest.Mocked<TagService>;
  let mockFamilyHashService: jest.Mocked<FamilyHashService>;
  let mockConfig: NestLensConfig;

  const createMockEntry = (overrides: Partial<Entry> = {}): Entry =>
    ({
      id: 1,
      type: 'request',
      requestId: 'req-123',
      timestamp: new Date().toISOString(),
      payload: {
        method: 'GET',
        url: '/api/test',
        path: '/api/test',
        query: {},
        params: {},
        headers: {},
        statusCode: 200,
        duration: 50,
      },
      ...overrides,
    }) as unknown as Entry;

  beforeEach(async () => {
    // Arrange
    mockStorage = {
      save: jest.fn(),
      saveBatch: jest.fn(),
      updateFamilyHash: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      count: jest.fn(),
      clear: jest.fn(),
      addTags: jest.fn(),
    } as any;

    mockTagService = {
      autoTag: jest.fn(),
    } as any;

    mockFamilyHashService = {
      generateFamilyHash: jest.fn(),
    } as any;

    mockConfig = {
      enabled: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorService,
        { provide: STORAGE, useValue: mockStorage },
        { provide: NESTLENS_CONFIG, useValue: mockConfig },
        { provide: TagService, useValue: mockTagService },
        { provide: FamilyHashService, useValue: mockFamilyHashService },
      ],
    }).compile();

    service = module.get<CollectorService>(CollectorService);
  });

  afterEach(async () => {
    // Clean up timers and flush
    await service.shutdown();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      // Assert
      expect(service).toBeDefined();
    });

    it('should start flush timer on initialization', () => {
      // Assert
      expect(service['flushTimer']).not.toBeNull();
    });
  });

  describe('pause/resume', () => {
    describe('pause', () => {
      it('should pause recording', () => {
        // Act
        service.pause();

        // Assert
        expect(service['isPaused']).toBe(true);
        expect(service['pausedAt']).toBeDefined();
      });

      it('should set pause reason when provided', () => {
        // Arrange
        const reason = 'maintenance';

        // Act
        service.pause(reason);

        // Assert
        expect(service['pauseReason']).toBe(reason);
      });

      it('should not update pausedAt if already paused', () => {
        // Arrange
        service.pause('first');
        const firstPausedAt = service['pausedAt'];

        // Act
        service.pause('second');

        // Assert
        expect(service['pausedAt']).toBe(firstPausedAt);
        expect(service['pauseReason']).toBe('first');
      });
    });

    describe('resume', () => {
      it('should resume recording when paused', () => {
        // Arrange
        service.pause('test');

        // Act
        service.resume();

        // Assert
        expect(service['isPaused']).toBe(false);
        expect(service['pausedAt']).toBeUndefined();
        expect(service['pauseReason']).toBeUndefined();
      });

      it('should do nothing if not paused', () => {
        // Act
        service.resume();

        // Assert
        expect(service['isPaused']).toBe(false);
      });
    });

    describe('getRecordingStatus', () => {
      it('should return not paused by default', () => {
        // Act
        const status = service.getRecordingStatus();

        // Assert
        expect(status.isPaused).toBe(false);
        expect(status.pausedAt).toBeUndefined();
        expect(status.pauseReason).toBeUndefined();
      });

      it('should return paused status with details', () => {
        // Arrange
        service.pause('debugging');

        // Act
        const status = service.getRecordingStatus();

        // Assert
        expect(status.isPaused).toBe(true);
        expect(status.pausedAt).toBeDefined();
        expect(status.pauseReason).toBe('debugging');
      });
    });
  });

  describe('collect', () => {
    it('should add entry to buffer', async () => {
      // Arrange
      const payload = {
        method: 'GET',
        url: '/api/test',
        path: '/api/test',
        query: {},
        params: {},
        headers: {},
        statusCode: 200,
        duration: 50,
      };

      // Act
      await service.collect('request', payload as any, 'req-123');

      // Assert
      expect(service['buffer']).toHaveLength(1);
      expect(service['buffer'][0].type).toBe('request');
      expect(service['buffer'][0].requestId).toBe('req-123');
    });

    it('should skip collection when paused', async () => {
      // Arrange
      service.pause();

      // Act
      await service.collect('request', {} as any);

      // Assert
      expect(service['buffer']).toHaveLength(0);
    });

    it('should flush buffer when full', async () => {
      // Arrange
      mockStorage.saveBatch.mockResolvedValue([]);
      const originalBufferSize = service['BUFFER_SIZE'];

      // Fill buffer to capacity
      for (let i = 0; i < originalBufferSize; i++) {
        await service.collect('log', { level: 'log', message: `Test ${i}` } as any);
      }

      // Assert
      expect(mockStorage.saveBatch).toHaveBeenCalled();
    });

    it('should apply filter and skip entry when filter returns false', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockReturnValue(false);

      // Act
      await service.collect('request', {} as any);

      // Assert
      expect(service['buffer']).toHaveLength(0);
      expect(mockConfig.filter).toHaveBeenCalled();
    });

    it('should apply filter and include entry when filter returns true', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockReturnValue(true);

      // Act
      await service.collect('request', {} as any);

      // Assert
      expect(service['buffer']).toHaveLength(1);
    });

    it('should handle async filter', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockResolvedValue(true);

      // Act
      await service.collect('request', {} as any);

      // Assert
      expect(service['buffer']).toHaveLength(1);
    });

    it('should fail-open when filter throws error', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockImplementation(() => {
        throw new Error('Filter error');
      });

      // Act
      await service.collect('request', {} as any);

      // Assert
      expect(service['buffer']).toHaveLength(1); // Entry should be collected
    });
  });

  describe('collectImmediate', () => {
    it('should save entry immediately', async () => {
      // Arrange
      const savedEntry = createMockEntry({ id: 1 });
      mockStorage.save.mockResolvedValue(savedEntry);
      mockFamilyHashService.generateFamilyHash.mockReturnValue('abc123');

      // Act
      const result = await service.collectImmediate('request', {} as any, 'req-123');

      // Assert
      expect(mockStorage.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });

    it('should return null when paused', async () => {
      // Arrange
      service.pause();

      // Act
      const result = await service.collectImmediate('request', {} as any);

      // Assert
      expect(result).toBeNull();
      expect(mockStorage.save).not.toHaveBeenCalled();
    });

    it('should apply filter and return null when filtered out', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockReturnValue(false);

      // Act
      const result = await service.collectImmediate('request', {} as any);

      // Assert
      expect(result).toBeNull();
      expect(mockStorage.save).not.toHaveBeenCalled();
    });

    it('should apply auto-tagging after save', async () => {
      // Arrange
      const savedEntry = createMockEntry({ id: 1 });
      mockStorage.save.mockResolvedValue(savedEntry);
      mockFamilyHashService.generateFamilyHash.mockReturnValue('abc123');

      // Act
      await service.collectImmediate('request', {} as any);

      // Assert
      expect(mockFamilyHashService.generateFamilyHash).toHaveBeenCalled();
      expect(mockStorage.updateFamilyHash).toHaveBeenCalledWith(1, 'abc123');
      expect(mockTagService.autoTag).toHaveBeenCalledWith(savedEntry);
    });

    it('should throw error on storage failure', async () => {
      // Arrange
      mockStorage.save.mockRejectedValue(new Error('Storage error'));

      // Act & Assert
      await expect(service.collectImmediate('request', {} as any)).rejects.toThrow('Storage error');
    });
  });

  describe('flush', () => {
    it('should do nothing if buffer is empty', async () => {
      // Act
      await service.flush();

      // Assert
      expect(mockStorage.saveBatch).not.toHaveBeenCalled();
    });

    it('should save buffered entries', async () => {
      // Arrange
      service['buffer'] = [createMockEntry(), createMockEntry({ id: 2 })];
      mockStorage.saveBatch.mockResolvedValue([
        createMockEntry({ id: 1 }),
        createMockEntry({ id: 2 }),
      ]);

      // Act
      await service.flush();

      // Assert
      expect(mockStorage.saveBatch).toHaveBeenCalledWith(expect.any(Array));
      expect(service['buffer']).toHaveLength(0);
    });

    it('should apply batch filter when configured', async () => {
      // Arrange
      service['buffer'] = [createMockEntry(), createMockEntry({ id: 2 })];
      mockConfig.filterBatch = jest.fn().mockImplementation((entries) => entries.slice(0, 1));
      mockStorage.saveBatch.mockResolvedValue([createMockEntry({ id: 1 })]);

      // Act
      await service.flush();

      // Assert
      expect(mockConfig.filterBatch).toHaveBeenCalled();
      expect(mockStorage.saveBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ type: 'request' })]),
      );
    });

    it('should handle async batch filter', async () => {
      // Arrange
      service['buffer'] = [createMockEntry()];
      mockConfig.filterBatch = jest.fn().mockResolvedValue([createMockEntry()]);
      mockStorage.saveBatch.mockResolvedValue([createMockEntry({ id: 1 })]);

      // Act
      await service.flush();

      // Assert
      expect(mockStorage.saveBatch).toHaveBeenCalled();
    });

    it('should fail-open when batch filter throws error', async () => {
      // Arrange
      service['buffer'] = [createMockEntry()];
      mockConfig.filterBatch = jest.fn().mockImplementation(() => {
        throw new Error('Batch filter error');
      });
      mockStorage.saveBatch.mockResolvedValue([createMockEntry({ id: 1 })]);

      // Act
      await service.flush();

      // Assert
      expect(mockStorage.saveBatch).toHaveBeenCalled(); // Should still save with original entries
    });

    it('should skip save if all entries are filtered out', async () => {
      // Arrange
      service['buffer'] = [createMockEntry()];
      mockConfig.filterBatch = jest.fn().mockReturnValue([]);

      // Act
      await service.flush();

      // Assert
      expect(mockStorage.saveBatch).not.toHaveBeenCalled();
    });

    it('should restore entries to buffer on save failure', async () => {
      // Arrange
      const entries = [createMockEntry(), createMockEntry({ id: 2 })];
      service['buffer'] = [...entries];
      mockStorage.saveBatch.mockRejectedValue(new Error('Save failed'));

      // Act
      await service.flush();

      // Assert
      expect(service['buffer']).toHaveLength(2);
    });

    it('should apply auto-tagging in parallel for saved entries', async () => {
      // Arrange
      const savedEntries = [createMockEntry({ id: 1 }), createMockEntry({ id: 2 })];
      service['buffer'] = [createMockEntry(), createMockEntry()];
      mockStorage.saveBatch.mockResolvedValue(savedEntries);
      mockFamilyHashService.generateFamilyHash.mockReturnValue('hash123');

      // Act
      await service.flush();

      // Assert
      expect(mockFamilyHashService.generateFamilyHash).toHaveBeenCalledTimes(2);
      expect(mockTagService.autoTag).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveWithRetry', () => {
    it('should succeed on first attempt', async () => {
      // Arrange
      const entries = [createMockEntry()];
      mockStorage.saveBatch.mockResolvedValue(entries);

      // Act
      const result = await service['saveWithRetry'](entries);

      // Assert
      expect(result).toEqual(entries);
      expect(mockStorage.saveBatch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      // Arrange
      const entries = [createMockEntry()];
      mockStorage.saveBatch
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValueOnce(entries);

      // Act
      const result = await service['saveWithRetry'](entries);

      // Assert
      expect(result).toEqual(entries);
      expect(mockStorage.saveBatch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      // Arrange
      const entries = [createMockEntry()];
      mockStorage.saveBatch.mockRejectedValue(new Error('Persistent failure'));

      // Act & Assert
      await expect(service['saveWithRetry'](entries, 3)).rejects.toThrow('Persistent failure');
      expect(mockStorage.saveBatch).toHaveBeenCalledTimes(3);
    });
  });

  describe('applyAutoTagging', () => {
    it('should skip entry without id', async () => {
      // Arrange
      const entry = createMockEntry();
      delete (entry as any).id;

      // Act
      await service['applyAutoTagging'](entry);

      // Assert
      expect(mockFamilyHashService.generateFamilyHash).not.toHaveBeenCalled();
      expect(mockTagService.autoTag).not.toHaveBeenCalled();
    });

    it('should generate and save family hash', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockFamilyHashService.generateFamilyHash.mockReturnValue('familyhash123');

      // Act
      await service['applyAutoTagging'](entry);

      // Assert
      expect(mockFamilyHashService.generateFamilyHash).toHaveBeenCalledWith(entry);
      expect(mockStorage.updateFamilyHash).toHaveBeenCalledWith(1, 'familyhash123');
      expect(entry.familyHash).toBe('familyhash123');
    });

    it('should skip family hash update when hash is undefined', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockFamilyHashService.generateFamilyHash.mockReturnValue(undefined);

      // Act
      await service['applyAutoTagging'](entry);

      // Assert
      expect(mockStorage.updateFamilyHash).not.toHaveBeenCalled();
    });

    it('should call autoTag on TagService', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });

      // Act
      await service['applyAutoTagging'](entry);

      // Assert
      expect(mockTagService.autoTag).toHaveBeenCalledWith(entry);
    });

    it('should not fail if tagging throws error', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockTagService.autoTag.mockRejectedValue(new Error('Tagging error'));

      // Act & Assert - should not throw
      await expect(service['applyAutoTagging'](entry)).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should clear flush timer', async () => {
      // Act
      await service.shutdown();

      // Assert
      expect(service['flushTimer']).toBeNull();
    });

    it('should flush remaining entries', async () => {
      // Arrange
      service['buffer'] = [createMockEntry()];
      mockStorage.saveBatch.mockResolvedValue([createMockEntry({ id: 1 })]);

      // Act
      await service.shutdown();

      // Assert
      expect(mockStorage.saveBatch).toHaveBeenCalled();
      expect(service['buffer']).toHaveLength(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should call shutdown', async () => {
      // Arrange
      const shutdownSpy = jest.spyOn(service, 'shutdown');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe('without optional services', () => {
    let serviceWithoutOptionals: CollectorService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CollectorService,
          { provide: STORAGE, useValue: mockStorage },
          { provide: NESTLENS_CONFIG, useValue: mockConfig },
          // TagService and FamilyHashService are not provided
        ],
      }).compile();

      serviceWithoutOptionals = module.get<CollectorService>(CollectorService);
    });

    afterEach(async () => {
      await serviceWithoutOptionals.shutdown();
    });

    it('should work without TagService', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockStorage.save.mockResolvedValue(entry);

      // Act & Assert - should not throw
      await expect(
        serviceWithoutOptionals.collectImmediate('request', {} as any),
      ).resolves.toBeDefined();
    });

    it('should work without FamilyHashService', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockStorage.save.mockResolvedValue(entry);

      // Act & Assert - should not throw
      await expect(
        serviceWithoutOptionals.collectImmediate('request', {} as any),
      ).resolves.toBeDefined();
      expect(mockStorage.updateFamilyHash).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent collect calls', async () => {
      // Arrange
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.collect('log', { level: 'log', message: `Test ${i}` } as any));
      }

      // Act
      await Promise.all(promises);

      // Assert
      expect(service['buffer'].length).toBeLessThanOrEqual(10);
    });

    it('should handle filter returning promise that rejects', async () => {
      // Arrange
      mockConfig.filter = jest.fn().mockRejectedValue(new Error('Async filter error'));

      // Act
      await service.collect('request', {} as any);

      // Assert - fail-open behavior
      expect(service['buffer']).toHaveLength(1);
    });
  });
});

/**
 * What happens to the application when storage stops answering.
 *
 * NestLens runs inside someone else's process. Failed entries used to go back
 * into a buffer with nothing bounding it, and every entry arriving after that
 * started its own flush — three attempts with backoff, awaited on the caller's
 * path. Measured against a storage that always throws: 300 entries took 60
 * seconds and left all 300 in memory, growing. A tool that explains outages was
 * amplifying them.
 */
describe('CollectorService when storage is unavailable', () => {
  const brokenStorage = (): jest.Mocked<StorageInterface> =>
    ({
      save: jest.fn().mockRejectedValue(new Error('storage unavailable')),
      saveBatch: jest.fn().mockRejectedValue(new Error('storage unavailable')),
      updateFamilyHash: jest.fn(),
    }) as unknown as jest.Mocked<StorageInterface>;

  const bufferOf = (collector: CollectorService): Entry[] =>
    (collector as unknown as { buffer: Entry[] }).buffer;

  const collectMany = async (collector: CollectorService, count: number): Promise<void> => {
    for (let index = 0; index < count; index++) {
      await collector.collect('log', {
        message: `entry ${index}`,
        level: 'log',
      } as never);
    }
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the buffer bounded instead of growing with every entry', async () => {
    // Arrange
    const collector = new CollectorService(brokenStorage(), { enabled: true } as NestLensConfig);

    // Act - well past the limit
    await collectMany(collector, 2500);

    // Assert
    expect(bufferOf(collector).length).toBeLessThanOrEqual(1000);

    await collector.onModuleDestroy();
  });

  it('stops retrying on the caller path once storage is failing', async () => {
    // Arrange
    const storage = brokenStorage();
    const collector = new CollectorService(storage, { enabled: true } as NestLensConfig);

    // Act
    await collectMany(collector, 500);

    // Assert - one flush's worth of attempts, not one per entry. Counting the
    // calls rather than timing them: the cost was three awaited attempts with
    // backoff for every entry after the first hundred.
    expect(storage.saveBatch.mock.calls.length).toBeLessThanOrEqual(3);

    await collector.onModuleDestroy();
  });

  it('reports the outage once rather than once per attempt', async () => {
    // Arrange
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const collector = new CollectorService(brokenStorage(), { enabled: true } as NestLensConfig);

    // Act
    await collectMany(collector, 500);
    await collector.flush();

    // Assert
    const outageReports = error.mock.calls.filter((call) =>
      String(call[0]).includes('Failed to flush entries'),
    );
    expect(outageReports).toHaveLength(1);

    await collector.onModuleDestroy();
  });

  it('saves what it kept once storage answers again', async () => {
    // Arrange
    const storage = brokenStorage();
    const collector = new CollectorService(storage, { enabled: true } as NestLensConfig);
    await collectMany(collector, 150);
    expect(bufferOf(collector).length).toBeGreaterThan(0);

    // Act - storage recovers
    storage.saveBatch.mockImplementation(async (entries) => entries as Entry[]);
    await collector.flush();

    // Assert
    expect(bufferOf(collector)).toHaveLength(0);
    expect(storage.saveBatch).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'log' })]),
    );

    await collector.onModuleDestroy();
  });
});

/**
 * Which request an entry belongs to.
 *
 * Watchers outside the HTTP layer are never handed a request: the query watcher
 * is given a statement by TypeORM's logger, the cache watcher by a wrapped
 * method. Of the twenty-one places that record an entry, two passed a request
 * id — so a request's detail page could show the exceptions it raised and never
 * the queries it ran, while the documentation offered "request correlation ID"
 * and "group related entries by request".
 *
 * The id now travels in the ambient async context, which is why this is a
 * property of the collector rather than of each watcher.
 */
describe('CollectorService request correlation', () => {
  const workingStorage = (): jest.Mocked<StorageInterface> =>
    ({
      save: jest.fn().mockImplementation(async (e) => e),
      saveBatch: jest.fn().mockImplementation(async (entries) => entries),
      updateFamilyHash: jest.fn(),
    }) as unknown as jest.Mocked<StorageInterface>;

  const collectAndFlush = async (
    collector: CollectorService,
    explicitId?: string,
  ): Promise<Entry> => {
    await collector.collect('log', { message: 'x', level: 'log' } as never, explicitId);
    await collector.flush();
    return (collector as unknown as { storage: jest.Mocked<StorageInterface> }).storage.saveBatch
      .mock.calls[0][0][0] as Entry;
  };

  it('attributes an entry to the request it was recorded inside', async () => {
    // Arrange
    const collector = new CollectorService(workingStorage(), { enabled: true } as NestLensConfig);

    // Act - what a query watcher does, deep inside a request
    const entry = await runInRequestContext('req-42', () => collectAndFlush(collector));

    // Assert
    expect(entry.requestId).toBe('req-42');

    await collector.onModuleDestroy();
  });

  it('leaves an entry recorded outside a request unattributed', async () => {
    // Arrange - a startup log, a scheduled task
    const collector = new CollectorService(workingStorage(), { enabled: true } as NestLensConfig);

    // Act
    const entry = await collectAndFlush(collector);

    // Assert
    expect(entry.requestId).toBeUndefined();

    await collector.onModuleDestroy();
  });

  it('lets a watcher that knows the request say so', async () => {
    // Arrange
    const collector = new CollectorService(workingStorage(), { enabled: true } as NestLensConfig);

    // Act - an explicit id is not overridden by the surrounding context
    const entry = await runInRequestContext('ambient', () =>
      collectAndFlush(collector, 'explicit'),
    );

    // Assert
    expect(entry.requestId).toBe('explicit');

    await collector.onModuleDestroy();
  });

  /**
   * The point of using the async context rather than a field: two requests in
   * flight at once must not borrow each other's id.
   */
  it('keeps concurrent requests apart', async () => {
    // Arrange
    const collector = new CollectorService(workingStorage(), { enabled: true } as NestLensConfig);
    const recorded: Array<string | undefined> = [];

    const handle = (id: string, delayMs: number): Promise<void> =>
      runInRequestContext(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await collector.collect('log', { message: id, level: 'log' } as never);
        recorded.push(currentRequestId());
      });

    // Act - the slower request records last
    await Promise.all([handle('slow', 20), handle('fast', 1)]);

    // Assert
    expect(recorded).toEqual(['fast', 'slow']);

    await collector.onModuleDestroy();
  });
});

/**
 * Masking on the way in.
 *
 * The architecture note describes the flow as watcher → collect() → DataMasker
 * → storage, and the documentation says `security.dataMasking` configures "the
 * global DataMaskerService … across watchers". Neither was true: the service was
 * never provided to anything, no watcher called it, and a request body went to
 * storage exactly as it arrived. Measured against the example application, a
 * POST carrying `{"password":"hunter2"}` was stored with the password readable.
 *
 * Doing it here rather than in each watcher is the point: an entry cannot reach
 * storage, the live tail or a webhook unmasked because a watcher forgot.
 */
describe('CollectorService masking', () => {
  const savingStorage = (): jest.Mocked<StorageInterface> =>
    ({
      save: jest.fn().mockImplementation(async (e) => e),
      saveBatch: jest.fn().mockImplementation(async (entries) => entries),
      updateFamilyHash: jest.fn(),
    }) as unknown as jest.Mocked<StorageInterface>;

  const collectorWithMasker = (storage: jest.Mocked<StorageInterface>): CollectorService =>
    new CollectorService(storage, { enabled: true } as NestLensConfig, new DataMaskerService());

  it('masks a payload before it reaches storage', async () => {
    // Arrange
    const storage = savingStorage();
    const collector = collectorWithMasker(storage);

    // Act
    await collector.collect('request', {
      method: 'POST',
      url: '/users',
      path: '/users',
      statusCode: 201,
      duration: 5,
      memory: 1,
      body: { email: 'a@b.com', password: 'hunter2', accessToken: 'tok_live_1' },
    } as never);
    await collector.flush();

    // Assert
    const [saved] = storage.saveBatch.mock.calls[0][0] as unknown as [
      { payload: { body: unknown } },
    ];
    expect(saved.payload.body).toEqual({
      email: 'a@b.com',
      password: '***REDACTED***',
      accessToken: '***REDACTED***',
    });

    await collector.onModuleDestroy();
  });

  it('masks the immediate path too, which is where exceptions go', async () => {
    // Arrange
    const storage = savingStorage();
    const collector = collectorWithMasker(storage);

    // Act
    await collector.collectImmediate('exception', {
      name: 'Error',
      message: 'boom',
      context: { password: 'hunter2' },
    } as never);

    // Assert
    expect(JSON.stringify(storage.save.mock.calls[0][0])).not.toContain('hunter2');

    await collector.onModuleDestroy();
  });

  it('leaves the payload alone when no masker is configured', async () => {
    // Arrange - the service is optional; without it nothing should throw
    const storage = savingStorage();
    const collector = new CollectorService(storage, { enabled: true } as NestLensConfig);

    // Act
    await collector.collect('log', { message: 'plain', level: 'log' } as never);
    await collector.flush();

    // Assert
    const [saved] = storage.saveBatch.mock.calls[0][0] as unknown as [
      { payload: { message: string } },
    ];
    expect(saved.payload.message).toBe('plain');

    await collector.onModuleDestroy();
  });
});
