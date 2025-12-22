import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../core/collector.service';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import { TagService } from '../core/tag.service';
import { FamilyHashService } from '../core/family-hash.service';
import { NESTLENS_CONFIG } from '../nestlens.config';
import { Entry, RequestEntry } from '../types';

type RequestPayload = RequestEntry['payload'];

describe('CollectorService', () => {
  let service: CollectorService;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockTagService: jest.Mocked<TagService>;
  let mockFamilyHashService: jest.Mocked<FamilyHashService>;

  const createMockRequestPayload = (overrides: Partial<RequestPayload> = {}): RequestPayload => ({
    method: 'GET',
    url: '/api/test',
    path: '/api/test',
    query: {},
    params: {},
    headers: {},
    statusCode: 200,
    duration: 100,
    memory: 0,
    ...overrides,
  });

  const createMockEntry = (overrides: Partial<RequestEntry> = {}): RequestEntry => ({
    id: 1,
    type: 'request',
    payload: createMockRequestPayload(),
    requestId: 'test-request-id',
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    // Create mock storage with all required methods
    mockStorage = {
      initialize: jest.fn(),
      save: jest.fn(),
      saveBatch: jest.fn(),
      find: jest.fn(),
      findWithCursor: jest.fn(),
      findById: jest.fn(),
      count: jest.fn(),
      getLatestSequence: jest.fn(),
      hasEntriesAfter: jest.fn(),
      getStats: jest.fn(),
      getStorageStats: jest.fn(),
      prune: jest.fn(),
      pruneByType: jest.fn(),
      clear: jest.fn(),
      close: jest.fn(),
      addTags: jest.fn(),
      removeTags: jest.fn(),
      getEntryTags: jest.fn(),
      getAllTags: jest.fn(),
      findByTags: jest.fn(),
      addMonitoredTag: jest.fn(),
      removeMonitoredTag: jest.fn(),
      getMonitoredTags: jest.fn(),
      resolveEntry: jest.fn(),
      unresolveEntry: jest.fn(),
      updateFamilyHash: jest.fn(),
      findByFamilyHash: jest.fn(),
      getGroupedByFamilyHash: jest.fn(),
    } as jest.Mocked<StorageInterface>;

    // Create mock tag service
    mockTagService = {
      autoTag: jest.fn(),
    } as unknown as jest.Mocked<TagService>;

    // Create mock family hash service
    mockFamilyHashService = {
      generateFamilyHash: jest.fn(),
    } as unknown as jest.Mocked<FamilyHashService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorService,
        { provide: STORAGE, useValue: mockStorage },
        { provide: NESTLENS_CONFIG, useValue: {} },
        { provide: TagService, useValue: mockTagService },
        { provide: FamilyHashService, useValue: mockFamilyHashService },
      ],
    }).compile();

    service = module.get<CollectorService>(CollectorService);
  });

  afterEach(async () => {
    // Clean up timer
    await service.shutdown();
  });

  describe('collect', () => {
    it('should add entry to buffer', async () => {
      await service.collect('request', createMockRequestPayload());

      // Buffer should have one entry (access via flush)
      expect(mockStorage.saveBatch).not.toHaveBeenCalled();
    });

    it('should flush when buffer reaches BUFFER_SIZE', async () => {
      mockStorage.saveBatch.mockResolvedValue([]);

      // Add 100 entries to trigger flush
      for (let i = 0; i < 100; i++) {
        await service.collect('request', createMockRequestPayload({
          path: `/api/test/${i}`,
          url: `/api/test/${i}`,
        }));
      }

      expect(mockStorage.saveBatch).toHaveBeenCalled();
    });
  });

  describe('collectImmediate', () => {
    it('should save entry immediately', async () => {
      const savedEntry = createMockEntry();
      mockStorage.save.mockResolvedValue(savedEntry);
      mockFamilyHashService.generateFamilyHash.mockReturnValue('test-hash');

      const result = await service.collectImmediate('request', createMockRequestPayload());

      expect(mockStorage.save).toHaveBeenCalled();
      expect(result).toEqual(savedEntry);
    });

    it('should apply auto-tagging after save', async () => {
      const savedEntry = createMockEntry();
      mockStorage.save.mockResolvedValue(savedEntry);
      mockFamilyHashService.generateFamilyHash.mockReturnValue('test-hash');

      await service.collectImmediate('request', createMockRequestPayload());

      expect(mockFamilyHashService.generateFamilyHash).toHaveBeenCalledWith(savedEntry);
      expect(mockStorage.updateFamilyHash).toHaveBeenCalledWith(savedEntry.id, 'test-hash');
      expect(mockTagService.autoTag).toHaveBeenCalledWith(savedEntry);
    });

    it('should throw error if save fails', async () => {
      mockStorage.save.mockRejectedValue(new Error('Save failed'));

      await expect(
        service.collectImmediate('request', createMockRequestPayload()),
      ).rejects.toThrow('Save failed');
    });
  });

  describe('flush', () => {
    it('should save all buffered entries', async () => {
      const savedEntries = [createMockEntry({ id: 1 }), createMockEntry({ id: 2 })];
      mockStorage.saveBatch.mockResolvedValue(savedEntries);

      await service.collect('request', createMockRequestPayload({ path: '/api/test1', url: '/api/test1' }));
      await service.collect('request', createMockRequestPayload({
        method: 'POST',
        path: '/api/test2',
        url: '/api/test2',
        statusCode: 201,
        duration: 150,
      }));

      await service.flush();

      expect(mockStorage.saveBatch).toHaveBeenCalled();
      const savedBatch = mockStorage.saveBatch.mock.calls[0][0];
      expect(savedBatch).toHaveLength(2);
    });

    it('should not call storage if buffer is empty', async () => {
      await service.flush();

      expect(mockStorage.saveBatch).not.toHaveBeenCalled();
    });

    it('should restore buffer on save failure', async () => {
      mockStorage.saveBatch.mockRejectedValue(new Error('Batch save failed'));

      await service.collect('request', createMockRequestPayload());

      await service.flush();

      // Try flush again - buffer should still have the entry
      mockStorage.saveBatch.mockResolvedValue([createMockEntry()]);
      await service.flush();

      // First flush: 3 attempts (retry logic with maxRetries=3)
      // Second flush: 1 successful attempt
      // Total: 4 calls
      expect(mockStorage.saveBatch).toHaveBeenCalledTimes(4);
    });
  });

  describe('shutdown', () => {
    it('should flush remaining entries on shutdown', async () => {
      mockStorage.saveBatch.mockResolvedValue([createMockEntry()]);

      await service.collect('request', createMockRequestPayload());

      await service.shutdown();

      expect(mockStorage.saveBatch).toHaveBeenCalled();
    });
  });

  describe('entry types', () => {
    it('should handle exception entries', async () => {
      const savedEntry: Entry = {
        id: 1,
        type: 'exception',
        payload: {
          name: 'Error',
          message: 'Test error',
          stack: 'Error: Test error\n    at test.ts:1:1',
        },
        requestId: 'test-request-id',
        createdAt: new Date().toISOString(),
      };
      mockStorage.save.mockResolvedValue(savedEntry);

      const result = await service.collectImmediate('exception', {
        name: 'Error',
        message: 'Test error',
        stack: 'Error: Test error\n    at test.ts:1:1',
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe('exception');
    });

    it('should handle log entries', async () => {
      const savedEntry: Entry = {
        id: 1,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Test log message',
          context: 'TestContext',
        },
        requestId: 'test-request-id',
        createdAt: new Date().toISOString(),
      };
      mockStorage.save.mockResolvedValue(savedEntry);

      const result = await service.collectImmediate('log', {
        level: 'error',
        message: 'Test log message',
        context: 'TestContext',
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe('log');
    });

    it('should handle query entries', async () => {
      const savedEntry: Entry = {
        id: 1,
        type: 'query',
        payload: {
          query: 'SELECT * FROM users',
          duration: 50,
          slow: false,
          source: 'typeorm',
        },
        requestId: 'test-request-id',
        createdAt: new Date().toISOString(),
      };
      mockStorage.save.mockResolvedValue(savedEntry);

      const result = await service.collectImmediate('query', {
        query: 'SELECT * FROM users',
        duration: 50,
        slow: false,
        source: 'typeorm',
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe('query');
    });
  });
});
