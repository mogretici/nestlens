import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { TagService } from '../../core/tag.service';
import { FamilyHashService } from '../../core/family-hash.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { Entry, RequestEntry } from '../../types';

describe('CollectorService', () => {
  let service: CollectorService;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockTagService: jest.Mocked<TagService>;
  let mockFamilyHashService: jest.Mocked<FamilyHashService>;
  let mockConfig: NestLensConfig;

  const createMockEntry = (overrides: Partial<Entry> = {}): Entry => ({
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
  } as unknown as Entry);

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
      await expect(service.collectImmediate('request', {} as any))
        .rejects.toThrow('Storage error');
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
      expect(mockStorage.saveBatch).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ type: 'request' })
      ]));
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
      const savedEntries = [
        createMockEntry({ id: 1 }),
        createMockEntry({ id: 2 }),
      ];
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
      await expect(service['saveWithRetry'](entries, 3))
        .rejects.toThrow('Persistent failure');
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
      await expect(serviceWithoutOptionals.collectImmediate('request', {} as any))
        .resolves.toBeDefined();
    });

    it('should work without FamilyHashService', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1 });
      mockStorage.save.mockResolvedValue(entry);

      // Act & Assert - should not throw
      await expect(serviceWithoutOptionals.collectImmediate('request', {} as any))
        .resolves.toBeDefined();
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
