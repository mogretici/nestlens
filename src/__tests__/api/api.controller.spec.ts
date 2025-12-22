import { Test, TestingModule } from '@nestjs/testing';
import { NestLensApiController } from '../../api/api.controller';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { PruningService } from '../../core/pruning.service';
import { CollectorService } from '../../core/collector.service';
import { Entry, EntryType } from '../../types';

describe('NestLensApiController', () => {
  let controller: NestLensApiController;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockConfig: NestLensConfig;
  let mockPruningService: jest.Mocked<PruningService>;
  let mockCollectorService: jest.Mocked<CollectorService>;

  const createMockEntry = (overrides: Partial<Entry> = {}): Entry => ({
    id: 1,
    type: 'request',
    requestId: 'req-123',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  } as unknown as Entry);

  beforeEach(async () => {
    // Arrange
    mockStorage = {
      find: jest.fn(),
      findById: jest.fn(),
      findWithCursor: jest.fn(),
      findByFamilyHash: jest.fn(),
      count: jest.fn(),
      getStats: jest.fn(),
      getStorageStats: jest.fn(),
      getLatestSequence: jest.fn(),
      hasEntriesAfter: jest.fn(),
      getGroupedByFamilyHash: jest.fn(),
      prune: jest.fn(),
      clear: jest.fn(),
      resolveEntry: jest.fn(),
      unresolveEntry: jest.fn(),
      save: jest.fn(),
    } as any;

    mockConfig = {
      enabled: true,
      pruning: {
        enabled: true,
        maxAge: 24,
        interval: 60,
      },
    };

    mockPruningService = {
      prune: jest.fn(),
    } as any;

    mockCollectorService = {
      pause: jest.fn(),
      resume: jest.fn(),
      getRecordingStatus: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NestLensApiController],
      providers: [
        { provide: STORAGE, useValue: mockStorage },
        { provide: NESTLENS_CONFIG, useValue: mockConfig },
        { provide: PruningService, useValue: mockPruningService },
        { provide: CollectorService, useValue: mockCollectorService },
      ],
    }).compile();

    controller = module.get<NestLensApiController>(NestLensApiController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      // Assert
      expect(controller).toBeDefined();
    });

    it('should calculate next prune run based on interval', () => {
      // Assert
      expect(controller['nextPruneRun']).toBeDefined();
      expect(controller['nextPruneRun']!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getEntries', () => {
    it('should return entries with default pagination', async () => {
      // Arrange
      const entries = [createMockEntry()];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(1);

      // Act
      const result = await controller.getEntries();

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith({
        type: undefined,
        requestId: undefined,
        limit: 50,
        offset: 0,
        from: undefined,
        to: undefined,
      });
      expect(result.data).toEqual(entries);
      expect(result.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    });

    it('should filter by entry type', async () => {
      // Arrange
      const entries = [createMockEntry({ type: 'query' as EntryType })];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(1);

      // Act
      const result = await controller.getEntries('query' as EntryType);

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'query' })
      );
      expect(result.data).toEqual(entries);
    });

    it('should filter by requestId', async () => {
      // Arrange
      const requestId = 'req-456';
      mockStorage.find.mockResolvedValue([]);
      mockStorage.count.mockResolvedValue(0);

      // Act
      await controller.getEntries(undefined, requestId);

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({ requestId })
      );
    });

    it('should handle custom pagination', async () => {
      // Arrange
      mockStorage.find.mockResolvedValue([]);
      mockStorage.count.mockResolvedValue(100);

      // Act
      const result = await controller.getEntries(undefined, undefined, '25', '50');

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 50 })
      );
      expect(result.meta).toEqual({ total: 100, limit: 25, offset: 50 });
    });

    it('should filter by date range', async () => {
      // Arrange
      const from = '2024-01-01T00:00:00Z';
      const to = '2024-01-31T23:59:59Z';
      mockStorage.find.mockResolvedValue([]);
      mockStorage.count.mockResolvedValue(0);

      // Act
      await controller.getEntries(undefined, undefined, undefined, undefined, from, to);

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({
          from: new Date(from),
          to: new Date(to),
        })
      );
    });
  });

  describe('getEntriesWithCursor', () => {
    it('should return cursor-paginated entries', async () => {
      // Arrange
      const response = {
        data: [createMockEntry()],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 1 },
      };
      mockStorage.findWithCursor.mockResolvedValue(response);

      // Act
      const result = await controller.getEntriesWithCursor();

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: undefined,
      });
      expect(result).toEqual(response);
    });

    it('should handle cursor navigation (before)', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(undefined, '25', '100');

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 25,
        beforeSequence: 100,
        afterSequence: undefined,
        filters: undefined,
      });
    });

    it('should handle cursor navigation (after)', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(undefined, '25', undefined, '50');

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 25,
        beforeSequence: undefined,
        afterSequence: 50,
        filters: undefined,
      });
    });

    it('should parse levels filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'log' as EntryType,
        undefined,
        undefined,
        undefined,
        'error,warn,info' // levels
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('log', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          levels: ['error', 'warn', 'info'],
        }),
      });
    });

    it('should parse boolean slow filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'query' as EntryType,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        'true' // slow
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('query', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          slow: true,
        }),
      });
    });

    it('should parse boolean resolved filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'exception' as EntryType,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        'false' // resolved
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('exception', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          resolved: false,
        }),
      });
    });

    it('should parse statuses filter with ERR', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'request' as EntryType,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        '200,404,ERR' // statuses
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          statuses: [200, 404, 'ERR'],
        }),
      });
    });

    it('should parse methods filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'request' as EntryType,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        'GET,POST' // methods
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          methods: ['GET', 'POST'],
        }),
      });
    });

    it('should handle empty filter values', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act
      await controller.getEntriesWithCursor(
        'request' as EntryType,
        undefined, undefined, undefined,
        '' // empty levels
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: undefined,
      });
    });

    it('should parse search filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act - call with all parameters explicitly to reach search at position 41
      await controller.getEntriesWithCursor(
        undefined, // type (0)
        undefined, // limit (1)
        undefined, // beforeSequence (2)
        undefined, // afterSequence (3)
        undefined, // levels (4)
        undefined, // contexts (5)
        undefined, // queryTypes (6)
        undefined, // sources (7)
        undefined, // slow (8)
        undefined, // names (9)
        undefined, // methods (10)
        undefined, // paths (11)
        undefined, // resolved (12)
        undefined, // statuses (13)
        undefined, // hostnames (14)
        undefined, // controllers (15)
        undefined, // ips (16)
        undefined, // scheduleStatuses (17)
        undefined, // jobStatuses (18)
        undefined, // queues (19)
        undefined, // cacheOperations (20)
        undefined, // mailStatuses (21)
        undefined, // redisStatuses (22)
        undefined, // redisCommands (23)
        undefined, // modelActions (24)
        undefined, // entities (25)
        undefined, // modelSources (26)
        undefined, // notificationTypes (27)
        undefined, // notificationStatuses (28)
        undefined, // viewFormats (29)
        undefined, // viewStatuses (30)
        undefined, // commandStatuses (31)
        undefined, // commandNames (32)
        undefined, // gateNames (33)
        undefined, // gateResults (34)
        undefined, // batchStatuses (35)
        undefined, // batchOperations (36)
        undefined, // dumpStatuses (37)
        undefined, // dumpOperations (38)
        undefined, // dumpFormats (39)
        undefined, // tags (40)
        'test search' // search (41)
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          search: 'test search',
        }),
      });
    });

    it('should parse tags filter', async () => {
      // Arrange
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      // Act - call with all parameters explicitly to reach tags at position 40
      await controller.getEntriesWithCursor(
        undefined, // type (0)
        undefined, // limit (1)
        undefined, // beforeSequence (2)
        undefined, // afterSequence (3)
        undefined, // levels (4)
        undefined, // contexts (5)
        undefined, // queryTypes (6)
        undefined, // sources (7)
        undefined, // slow (8)
        undefined, // names (9)
        undefined, // methods (10)
        undefined, // paths (11)
        undefined, // resolved (12)
        undefined, // statuses (13)
        undefined, // hostnames (14)
        undefined, // controllers (15)
        undefined, // ips (16)
        undefined, // scheduleStatuses (17)
        undefined, // jobStatuses (18)
        undefined, // queues (19)
        undefined, // cacheOperations (20)
        undefined, // mailStatuses (21)
        undefined, // redisStatuses (22)
        undefined, // redisCommands (23)
        undefined, // modelActions (24)
        undefined, // entities (25)
        undefined, // modelSources (26)
        undefined, // notificationTypes (27)
        undefined, // notificationStatuses (28)
        undefined, // viewFormats (29)
        undefined, // viewStatuses (30)
        undefined, // commandStatuses (31)
        undefined, // commandNames (32)
        undefined, // gateNames (33)
        undefined, // gateResults (34)
        undefined, // batchStatuses (35)
        undefined, // batchOperations (36)
        undefined, // dumpStatuses (37)
        undefined, // dumpOperations (38)
        undefined, // dumpFormats (39)
        'important,debug' // tags (40)
      );

      // Assert
      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          tags: ['important', 'debug'],
        }),
      });
    });
  });

  describe('getLatestSequence', () => {
    it('should return latest sequence', async () => {
      // Arrange
      mockStorage.getLatestSequence.mockResolvedValue(100);

      // Act
      const result = await controller.getLatestSequence();

      // Assert
      expect(mockStorage.getLatestSequence).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ data: 100 });
    });

    it('should filter by type', async () => {
      // Arrange
      mockStorage.getLatestSequence.mockResolvedValue(50);

      // Act
      const result = await controller.getLatestSequence('query' as EntryType);

      // Assert
      expect(mockStorage.getLatestSequence).toHaveBeenCalledWith('query');
      expect(result).toEqual({ data: 50 });
    });
  });

  describe('checkNewEntries', () => {
    it('should return count and hasNew true when new entries exist', async () => {
      // Arrange
      mockStorage.hasEntriesAfter.mockResolvedValue(5);

      // Act
      const result = await controller.checkNewEntries('100');

      // Assert
      expect(mockStorage.hasEntriesAfter).toHaveBeenCalledWith(100, undefined);
      expect(result).toEqual({ data: { count: 5, hasNew: true } });
    });

    it('should return hasNew false when no new entries', async () => {
      // Arrange
      mockStorage.hasEntriesAfter.mockResolvedValue(0);

      // Act
      const result = await controller.checkNewEntries('100');

      // Assert
      expect(result).toEqual({ data: { count: 0, hasNew: false } });
    });

    it('should filter by type', async () => {
      // Arrange
      mockStorage.hasEntriesAfter.mockResolvedValue(3);

      // Act
      await controller.checkNewEntries('50', 'exception' as EntryType);

      // Assert
      expect(mockStorage.hasEntriesAfter).toHaveBeenCalledWith(50, 'exception');
    });
  });

  describe('getGroupedEntries', () => {
    it('should return entries grouped by family hash', async () => {
      // Arrange
      const groups = [
        { familyHash: 'abc', count: 5, latestEntry: createMockEntry() },
      ];
      mockStorage.getGroupedByFamilyHash.mockResolvedValue(groups);

      // Act
      const result = await controller.getGroupedEntries();

      // Assert
      expect(mockStorage.getGroupedByFamilyHash).toHaveBeenCalledWith(undefined, 50);
      expect(result).toEqual({ data: groups });
    });

    it('should filter by type and limit', async () => {
      // Arrange
      mockStorage.getGroupedByFamilyHash.mockResolvedValue([]);

      // Act
      await controller.getGroupedEntries('exception' as EntryType, '25');

      // Assert
      expect(mockStorage.getGroupedByFamilyHash).toHaveBeenCalledWith('exception', 25);
    });
  });

  describe('getEntriesByFamilyHash', () => {
    it('should return entries with same family hash', async () => {
      // Arrange
      const entries = [createMockEntry(), createMockEntry({ id: 2 })];
      mockStorage.findByFamilyHash.mockResolvedValue(entries);

      // Act
      const result = await controller.getEntriesByFamilyHash('abc123');

      // Assert
      expect(mockStorage.findByFamilyHash).toHaveBeenCalledWith('abc123', 50);
      expect(result).toEqual({ data: entries });
    });

    it('should respect limit parameter', async () => {
      // Arrange
      mockStorage.findByFamilyHash.mockResolvedValue([]);

      // Act
      await controller.getEntriesByFamilyHash('xyz789', '100');

      // Assert
      expect(mockStorage.findByFamilyHash).toHaveBeenCalledWith('xyz789', 100);
    });
  });

  describe('getEntry', () => {
    it('should return entry by id', async () => {
      // Arrange
      const entry = createMockEntry({ id: 42, type: 'query' as EntryType });
      mockStorage.findById.mockResolvedValue(entry);

      // Act
      const result = await controller.getEntry(42);

      // Assert
      expect(mockStorage.findById).toHaveBeenCalledWith(42);
      expect(result).toEqual({ data: entry });
    });

    it('should return null and error when entry not found', async () => {
      // Arrange
      mockStorage.findById.mockResolvedValue(null);

      // Act
      const result = await controller.getEntry(999);

      // Assert
      expect(result).toEqual({ data: null, error: 'Entry not found' });
    });

    it('should return related entries for request type', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1, type: 'request', requestId: 'req-123' });
      const related = [
        createMockEntry({ id: 2, type: 'query' as EntryType, requestId: 'req-123' }),
        createMockEntry({ id: 3, type: 'log' as EntryType, requestId: 'req-123' }),
      ];
      mockStorage.findById.mockResolvedValue(entry);
      mockStorage.find.mockResolvedValue([entry, ...related]);

      // Act
      const result = await controller.getEntry(1);

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith({ requestId: 'req-123', limit: 100 });
      expect(result).toEqual({
        data: entry,
        related,
      });
    });

    it('should not fetch related for non-request types', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1, type: 'query' as EntryType });
      mockStorage.findById.mockResolvedValue(entry);

      // Act
      const result = await controller.getEntry(1);

      // Assert
      expect(mockStorage.find).not.toHaveBeenCalled();
      expect(result).toEqual({ data: entry });
    });
  });

  describe('getStats', () => {
    it('should return stats from storage', async () => {
      // Arrange
      const stats = {
        total: 360,
        byType: { request: 100, query: 50, exception: 10, log: 200 } as any,
      };
      mockStorage.getStats.mockResolvedValue(stats);

      // Act
      const result = await controller.getStats();

      // Assert
      expect(mockStorage.getStats).toHaveBeenCalled();
      expect(result).toEqual({ data: stats });
    });
  });

  describe('getRequests', () => {
    it('should call getEntries with request type', async () => {
      // Arrange
      const entries = [createMockEntry({ type: 'request' })];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(1);

      // Act
      const result = await controller.getRequests();

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'request' })
      );
    });
  });

  describe('getQueries', () => {
    it('should return queries without slow filter', async () => {
      // Arrange
      const entries = [
        createMockEntry({ type: 'query' as EntryType, payload: { query: 'SELECT 1', duration: 10, slow: false } as any }),
        createMockEntry({ type: 'query' as EntryType, payload: { query: 'SELECT 2', duration: 1000, slow: true } as any }),
      ];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(2);

      // Act
      const result = await controller.getQueries();

      // Assert
      expect(result.data).toHaveLength(2);
    });

    it('should filter slow queries when slow=true', async () => {
      // Arrange
      const entries = [
        createMockEntry({ type: 'query' as EntryType, payload: { query: 'SELECT 1', duration: 10, slow: false } as any }),
        createMockEntry({ type: 'query' as EntryType, payload: { query: 'SELECT 2', duration: 1000, slow: true } as any }),
      ];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(2);

      // Act
      const result = await controller.getQueries(undefined, undefined, 'true');

      // Assert
      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).slow).toBe(true);
    });
  });

  describe('getLogs', () => {
    it('should return logs without level filter', async () => {
      // Arrange
      const entries = [
        createMockEntry({ type: 'log' as EntryType, payload: { level: 'log', message: 'Test log' } as any }),
        createMockEntry({ type: 'log' as EntryType, payload: { level: 'error', message: 'Test error' } as any }),
      ];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(2);

      // Act
      const result = await controller.getLogs();

      // Assert
      expect(result.data).toHaveLength(2);
    });

    it('should filter by level', async () => {
      // Arrange
      const entries = [
        createMockEntry({ type: 'log' as EntryType, payload: { level: 'log', message: 'Test log' } as any }),
        createMockEntry({ type: 'log' as EntryType, payload: { level: 'error', message: 'Test error' } as any }),
      ];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(2);

      // Act
      const result = await controller.getLogs(undefined, undefined, 'error');

      // Assert
      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).level).toBe('error');
    });
  });

  describe('getExceptions', () => {
    it('should call getEntries with exception type', async () => {
      // Arrange
      mockStorage.find.mockResolvedValue([]);
      mockStorage.count.mockResolvedValue(0);

      // Act
      await controller.getExceptions();

      // Assert
      expect(mockStorage.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'exception' })
      );
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', async () => {
      // Arrange
      const stats = {
        total: 1000,
        byType: { request: 500, query: 300, exception: 100, log: 100 } as any,
        databaseSize: 5242880,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-31T23:59:59Z',
      };
      mockStorage.getStorageStats.mockResolvedValue(stats);

      // Act
      const result = await controller.getStorageStats();

      // Assert
      expect(mockStorage.getStorageStats).toHaveBeenCalled();
      expect(result).toEqual({ data: stats });
    });
  });

  describe('getPruningStatus', () => {
    it('should return pruning status', async () => {
      // Arrange
      const storageStats = {
        total: 100,
        byType: {} as any,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-31T23:59:59Z',
        databaseSize: 1024,
      };
      mockStorage.getStorageStats.mockResolvedValue(storageStats);

      // Act
      const result = await controller.getPruningStatus();

      // Assert
      expect(result.data).toMatchObject({
        enabled: true,
        maxAge: 24,
        interval: 60,
        totalEntries: 100,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-31T23:59:59Z',
        databaseSize: 1024,
      });
    });

    it('should handle undefined pruning config', async () => {
      // Arrange
      mockConfig.pruning = undefined;
      mockStorage.getStorageStats.mockResolvedValue({
        total: 0,
        byType: {} as any,
        oldestEntry: null,
        newestEntry: null,
        databaseSize: 0,
      });

      // Act
      const result = await controller.getPruningStatus();

      // Assert
      expect(result.data.enabled).toBe(true);
      expect(result.data.maxAge).toBe(24);
      expect(result.data.interval).toBe(60);
    });
  });

  describe('runPruning', () => {
    it('should run pruning and return result', async () => {
      // Arrange
      mockStorage.prune.mockResolvedValue(50);

      // Act
      const result = await controller.runPruning();

      // Assert
      expect(mockStorage.prune).toHaveBeenCalledWith(expect.any(Date));
      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(50);
      expect(result.data.lastRun).toBeDefined();
      expect(result.data.nextRun).toBeDefined();
    });

    it('should update lastPruneRun and nextPruneRun', async () => {
      // Arrange
      mockStorage.prune.mockResolvedValue(10);
      const beforeRun = Date.now();

      // Act
      await controller.runPruning();

      // Assert
      expect(controller['lastPruneRun']!.getTime()).toBeGreaterThanOrEqual(beforeRun);
      expect(controller['nextPruneRun']!.getTime()).toBeGreaterThan(controller['lastPruneRun']!.getTime());
    });

    it('should calculate prune cutoff based on maxAge config', async () => {
      // Arrange
      mockStorage.prune.mockResolvedValue(0);
      const maxAgeHours = 24;
      const expectedBefore = Date.now() - maxAgeHours * 60 * 60 * 1000;

      // Act
      await controller.runPruning();

      // Assert
      const calledDate = mockStorage.prune.mock.calls[0][0] as Date;
      expect(calledDate.getTime()).toBeCloseTo(expectedBefore, -3); // within 1 second
    });
  });

  describe('clearEntries', () => {
    it('should clear all entries', async () => {
      // Arrange
      mockStorage.clear.mockResolvedValue(undefined);

      // Act
      const result = await controller.clearEntries();

      // Assert
      expect(mockStorage.clear).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'All entries cleared' });
    });
  });

  describe('resolveEntry', () => {
    it('should resolve entry and return updated entry', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1, type: 'exception' as EntryType });
      mockStorage.resolveEntry.mockResolvedValue(undefined);
      mockStorage.findById.mockResolvedValue({ ...entry, resolvedAt: new Date().toISOString() } as any);

      // Act
      const result = await controller.resolveEntry(1);

      // Assert
      expect(mockStorage.resolveEntry).toHaveBeenCalledWith(1);
      expect(mockStorage.findById).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data!.resolvedAt).toBeDefined();
    });
  });

  describe('unresolveEntry', () => {
    it('should unresolve entry and return updated entry', async () => {
      // Arrange
      const entry = createMockEntry({ id: 1, type: 'exception' as EntryType });
      mockStorage.unresolveEntry.mockResolvedValue(undefined);
      mockStorage.findById.mockResolvedValue({ ...entry, resolvedAt: undefined } as any);

      // Act
      const result = await controller.unresolveEntry(1);

      // Assert
      expect(mockStorage.unresolveEntry).toHaveBeenCalledWith(1);
      expect(mockStorage.findById).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data!.resolvedAt).toBeUndefined();
    });
  });

  describe('pauseRecording', () => {
    it('should pause recording with reason', async () => {
      // Arrange
      const status = { isPaused: true, pausedAt: new Date(), pauseReason: 'maintenance' };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      // Act
      const result = await controller.pauseRecording({ reason: 'maintenance' });

      // Assert
      expect(mockCollectorService.pause).toHaveBeenCalledWith('maintenance');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(status);
    });

    it('should pause recording without reason', async () => {
      // Arrange
      const status = { isPaused: true, pausedAt: new Date() };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      // Act
      const result = await controller.pauseRecording({});

      // Assert
      expect(mockCollectorService.pause).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('resumeRecording', () => {
    it('should resume recording', async () => {
      // Arrange
      const status = { isPaused: false };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      // Act
      const result = await controller.resumeRecording();

      // Assert
      expect(mockCollectorService.resume).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(status);
    });
  });

  describe('getRecordingStatus', () => {
    it('should return recording status', async () => {
      // Arrange
      const status = { isPaused: false };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      // Act
      const result = await controller.getRecordingStatus();

      // Assert
      expect(mockCollectorService.getRecordingStatus).toHaveBeenCalled();
      expect(result).toEqual({ data: status });
    });

    it('should return paused status with details', async () => {
      // Arrange
      const status = {
        isPaused: true,
        pausedAt: new Date('2024-01-15T10:00:00Z'),
        pauseReason: 'debugging',
      };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      // Act
      const result = await controller.getRecordingStatus();

      // Assert
      expect(result.data).toEqual(status);
    });
  });

  describe('Edge Cases', () => {
    describe('getEntries with invalid pagination', () => {
      it('should handle NaN limit by using default', async () => {
        // Arrange
        mockStorage.find.mockResolvedValue([]);
        mockStorage.count.mockResolvedValue(0);

        // Act
        await controller.getEntries(undefined, undefined, 'invalid', undefined);

        // Assert - invalid limit should fall back to default (50)
        expect(mockStorage.find).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 50 })
        );
      });
    });

    describe('pagination bounds', () => {
      it('should cap limit at MAX_LIMIT (1000)', async () => {
        // Arrange
        mockStorage.find.mockResolvedValue([]);
        mockStorage.count.mockResolvedValue(0);

        // Act
        await controller.getEntries(undefined, undefined, '9999', undefined);

        // Assert - should be capped at 1000
        expect(mockStorage.find).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 1000 })
        );
      });
    });

    describe('getEntriesWithCursor with all filters', () => {
      it('should parse all filter types correctly', async () => {
        // Arrange
        mockStorage.findWithCursor.mockResolvedValue({
          data: [],
          meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
        });

        // Act
        await controller.getEntriesWithCursor(
          'request' as EntryType,
          '50',
          undefined,
          undefined,
          'error,warn', // levels
          'UserController', // contexts
          'SELECT,INSERT', // queryTypes
          'TypeORM', // sources
          'true', // slow
          'CreateUser', // names
          'GET,POST', // methods
          '/api/users', // paths
          'false', // resolved
          '200,201', // statuses
          'localhost', // hostnames
          'UserController', // controllers
          '127.0.0.1', // ips
          'completed,failed', // scheduleStatuses
          'active,waiting', // jobStatuses
          'default', // queues
          'get,set', // cacheOperations
          'sent,failed', // mailStatuses
          'success,error', // redisStatuses
          'GET,SET', // redisCommands
          'create,update', // modelActions
          'User,Post', // entities
          'TypeORM', // modelSources
          'email,sms', // notificationTypes
          'sent', // notificationStatuses
          'html,json', // viewFormats
          'rendered', // viewStatuses
          'completed', // commandStatuses
          'CreateUser', // commandNames
          'CanAccess', // gateNames
          'allowed', // gateResults
          'completed', // batchStatuses
          'import', // batchOperations
          'completed', // dumpStatuses
          'export', // dumpOperations
          'sql', // dumpFormats
          'important', // tags
          'search term' // search
        );

        // Assert
        expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', {
          limit: 50,
          beforeSequence: undefined,
          afterSequence: undefined,
          filters: expect.objectContaining({
            levels: ['error', 'warn'],
            contexts: ['UserController'],
            queryTypes: ['SELECT', 'INSERT'],
            sources: ['TypeORM'],
            slow: true,
            names: ['CreateUser'],
            methods: ['GET', 'POST'],
            paths: ['/api/users'],
            resolved: false,
            statuses: [200, 201],
            hostnames: ['localhost'],
            controllers: ['UserController'],
            ips: ['127.0.0.1'],
            scheduleStatuses: ['completed', 'failed'],
            jobStatuses: ['active', 'waiting'],
            queues: ['default'],
            cacheOperations: ['get', 'set'],
            mailStatuses: ['sent', 'failed'],
            redisStatuses: ['success', 'error'],
            redisCommands: ['GET', 'SET'],
            modelActions: ['create', 'update'],
            entities: ['User', 'Post'],
            modelSources: ['TypeORM'],
            notificationTypes: ['email', 'sms'],
            notificationStatuses: ['sent'],
            viewFormats: ['html', 'json'],
            viewStatuses: ['rendered'],
            commandStatuses: ['completed'],
            commandNames: ['CreateUser'],
            gateNames: ['CanAccess'],
            gateResults: ['allowed'],
            batchStatuses: ['completed'],
            batchOperations: ['import'],
            dumpStatuses: ['completed'],
            dumpOperations: ['export'],
            dumpFormats: ['sql'],
            tags: ['important'],
            search: 'search term',
          }),
        });
      });
    });
  });
});
