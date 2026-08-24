import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { NestLensApiController } from '../../api/api.controller';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { PruningService } from '../../core/pruning.service';
import { CollectorService } from '../../core/collector.service';
import { Entry, EntryType } from '../../types';
import { CursorQueryDto } from '../../api/dto';
import { NestLensApiException } from '../../api/exceptions/nestlens-api.exception';
import { ErrorCode } from '../../api/constants/error-codes';

/**
 * Helper to create CursorQueryDto instance with proper transformations
 */
function createQuery(params: Partial<Record<string, string>> = {}): CursorQueryDto {
  return plainToInstance(CursorQueryDto, params);
}

describe('NestLensApiController', () => {
  let controller: NestLensApiController;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockConfig: NestLensConfig;
  let mockPruningService: PruningService;
  let mockCollectorService: jest.Mocked<CollectorService>;

  const createMockEntry = (overrides: Partial<Entry> = {}): Entry =>
    ({
      id: 1,
      type: 'request',
      requestId: 'req-123',
      timestamp: new Date().toISOString(),
      payload: {},
      ...overrides,
    }) as unknown as Entry;

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

    // The real service: the endpoint's window and schedule come from it now,
    // and a stub would let the two drift apart again.
    mockPruningService = new PruningService(mockConfig, mockStorage);

    mockCollectorService = {
      pause: jest.fn(),
      resume: jest.fn(),
      getRecordingStatus: jest.fn(),
      getRecordingCounts: jest.fn().mockReturnValue({
        recorded: 0,
        droppedBySampling: 0,
        droppedByFilter: 0,
        droppedByBuffer: 0,
      }),
      getBufferSize: jest.fn().mockReturnValue({ pending: 0, capacity: 1000, dropped: 0 }),
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
      expect(controller).toBeDefined();
    });

    it('reports no run until pruning has run', async () => {
      mockStorage.getStorageStats.mockResolvedValue({
        total: 0,
        byType: {} as never,
        oldestEntry: null,
        newestEntry: null,
      });

      const status = await controller.getPruningStatus();

      expect(status.data.lastRun).toBeNull();
      expect(status.data.nextRun).toBeNull();
    });
  });

  /**
   * Every list endpoint goes through `findWithCursor` now. They used to be two
   * paths — `find`, which takes no filters, and the cursor one, which does —
   * so `entries`, `requests` and `exceptions` accepted `minDuration` and
   * ignored it while `logs` and `queries` accepted `from` and ignored that.
   * Two ways to answer one question is how the two came to disagree.
   */
  describe('getEntries', () => {
    const emptyPage = {
      data: [],
      meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
    };

    it('asks for a page with the default limit', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      const result = await controller.getEntries({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        filters: expect.any(Object),
      });
      expect(result.meta).toEqual({ total: 0, limit: 50, offset: 0 });
    });

    it('passes the type through', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({ type: 'query' as EntryType });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('query', expect.any(Object));
    });

    it('passes a requestId through as a filter', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({ requestId: 'req-456' });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ filters: expect.objectContaining({ requestId: 'req-456' }) }),
      );
    });

    it('asks for enough matches to reach the offset', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      const result = await controller.getEntries({ limit: 25, offset: 50 });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ limit: 75 }),
      );
      expect(result.meta).toEqual({ total: 0, limit: 25, offset: 50 });
    });

    it('passes the window through as a filter', async () => {
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-31T23:59:59Z');
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({ from, to });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          filters: expect.objectContaining({
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        }),
      );
    });

    it('passes the duration bounds through as filters', async () => {
      // These were accepted and ignored: `find` has no filters to put them in.
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({ minDuration: 500, maxDuration: 5000 });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          filters: expect.objectContaining({ minDuration: 500, maxDuration: 5000 }),
        }),
      );
    });

    it('reports the count of what matched', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        ...emptyPage,
        meta: { ...emptyPage.meta, total: 7 },
      });

      const result = await controller.getEntries({ minDuration: 500 });

      // It used to be `count(type)` — everything of that type, whatever the
      // filters said.
      expect(result.meta.total).toBe(7);
    });
  });

  describe('getEntriesWithCursor', () => {
    it('should return cursor-paginated entries with defaults', async () => {
      const response = {
        data: [createMockEntry()],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 1,
        },
      };
      mockStorage.findWithCursor.mockResolvedValue(response);

      const result = await controller.getEntriesWithCursor(createQuery());

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: undefined,
      });
      expect(result).toEqual(response);
    });

    it('should handle cursor navigation (before)', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ limit: '25', beforeSequence: '100' }));

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 25,
        beforeSequence: 100,
        afterSequence: undefined,
        filters: undefined,
      });
    });

    it('should handle cursor navigation (after)', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ limit: '25', afterSequence: '50' }));

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 25,
        beforeSequence: undefined,
        afterSequence: 50,
        filters: undefined,
      });
    });

    it('should parse levels filter', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(
        createQuery({ type: 'log', levels: 'error,warn,info' }),
      );

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ type: 'query', slow: 'true' }));

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ type: 'exception', resolved: 'false' }));

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(
        createQuery({ type: 'request', statuses: '200,404,ERR' }),
      );

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ type: 'request', methods: 'GET,POST' }));

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ type: 'request', levels: '' }));

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: undefined,
      });
    });

    it('should parse search filter', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ search: 'test search' }));

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
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(createQuery({ tags: 'important,debug' }));

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(undefined, {
        limit: 50,
        beforeSequence: undefined,
        afterSequence: undefined,
        filters: expect.objectContaining({
          tags: ['important', 'debug'],
        }),
      });
    });

    it('should parse all filter types correctly', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: {
          hasMore: false,
          oldestSequence: null,
          newestSequence: null,
          total: 0,
        },
      });

      await controller.getEntriesWithCursor(
        createQuery({
          type: 'request',
          limit: '50',
          levels: 'error,warn',
          contexts: 'UserController',
          queryTypes: 'SELECT,INSERT',
          sources: 'TypeORM',
          slow: 'true',
          names: 'CreateUser',
          methods: 'GET,POST',
          paths: '/api/users',
          resolved: 'false',
          statuses: '200,201',
          hostnames: 'localhost',
          controllers: 'UserController',
          ips: '127.0.0.1',
          eventNames: 'UserCreated',
          scheduleStatuses: 'completed,failed',
          scheduleNames: 'dailyReport',
          jobStatuses: 'active,waiting',
          jobNames: 'emailSender',
          queues: 'default',
          cacheOperations: 'get,set',
          mailStatuses: 'sent,failed',
          redisStatuses: 'success,error',
          redisCommands: 'GET,SET',
          modelActions: 'create,update',
          entities: 'User,Post',
          modelSources: 'TypeORM',
          notificationTypes: 'email,sms',
          notificationStatuses: 'sent',
          viewFormats: 'html,json',
          viewStatuses: 'rendered',
          commandStatuses: 'completed',
          commandNames: 'CreateUser',
          gateNames: 'CanAccess',
          gateResults: 'allowed',
          batchStatuses: 'completed',
          batchOperations: 'import',
          dumpStatuses: 'completed',
          dumpOperations: 'export',
          dumpFormats: 'sql',
          operationTypes: 'query,mutation',
          operationNames: 'GetUsers',
          hasErrors: 'true',
          hasN1: 'false',
          tags: 'important',
          search: 'search term',
        }),
      );

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
          eventNames: ['UserCreated'],
          scheduleStatuses: ['completed', 'failed'],
          scheduleNames: ['dailyReport'],
          jobStatuses: ['active', 'waiting'],
          jobNames: ['emailSender'],
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
          operationTypes: ['query', 'mutation'],
          operationNames: ['GetUsers'],
          hasErrors: true,
          hasN1: false,
          tags: ['important'],
          search: 'search term',
        }),
      });
    });
  });

  describe('getLatestSequence', () => {
    it('should return latest sequence', async () => {
      mockStorage.getLatestSequence.mockResolvedValue(100);

      const result = await controller.getLatestSequence({});

      expect(mockStorage.getLatestSequence).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ data: 100 });
    });

    it('should filter by type', async () => {
      mockStorage.getLatestSequence.mockResolvedValue(50);

      const result = await controller.getLatestSequence({ type: 'query' as EntryType });

      expect(mockStorage.getLatestSequence).toHaveBeenCalledWith('query');
      expect(result).toEqual({ data: 50 });
    });
  });

  describe('checkNewEntries', () => {
    it('should return count and hasNew true when new entries exist', async () => {
      mockStorage.hasEntriesAfter.mockResolvedValue(5);

      const result = await controller.checkNewEntries({ afterSequence: 100 });

      expect(mockStorage.hasEntriesAfter).toHaveBeenCalledWith(100, undefined);
      expect(result).toEqual({ data: { count: 5, hasNew: true } });
    });

    it('should return hasNew false when no new entries', async () => {
      mockStorage.hasEntriesAfter.mockResolvedValue(0);

      const result = await controller.checkNewEntries({ afterSequence: 100 });

      expect(result).toEqual({ data: { count: 0, hasNew: false } });
    });

    it('should filter by type', async () => {
      mockStorage.hasEntriesAfter.mockResolvedValue(3);

      await controller.checkNewEntries({ afterSequence: 50, type: 'exception' as EntryType });

      expect(mockStorage.hasEntriesAfter).toHaveBeenCalledWith(50, 'exception');
    });
  });

  describe('getGroupedEntries', () => {
    it('should return entries grouped by family hash', async () => {
      const groups = [{ familyHash: 'abc', count: 5, latestEntry: createMockEntry() }];
      mockStorage.getGroupedByFamilyHash.mockResolvedValue(groups);

      const result = await controller.getGroupedEntries({});

      expect(mockStorage.getGroupedByFamilyHash).toHaveBeenCalledWith(undefined, 50);
      expect(result).toEqual({ data: groups });
    });

    it('should filter by type and limit', async () => {
      mockStorage.getGroupedByFamilyHash.mockResolvedValue([]);

      await controller.getGroupedEntries({ type: 'exception' as EntryType, limit: 25 });

      expect(mockStorage.getGroupedByFamilyHash).toHaveBeenCalledWith('exception', 25);
    });
  });

  describe('getEntriesByFamilyHash', () => {
    it('should return entries with same family hash', async () => {
      const entries = [createMockEntry(), createMockEntry({ id: 2 })];
      mockStorage.findByFamilyHash.mockResolvedValue(entries);

      const result = await controller.getEntriesByFamilyHash('abc123', {});

      expect(mockStorage.findByFamilyHash).toHaveBeenCalledWith('abc123', 50);
      expect(result).toEqual({ data: entries });
    });

    it('should respect limit parameter', async () => {
      mockStorage.findByFamilyHash.mockResolvedValue([]);

      await controller.getEntriesByFamilyHash('xyz789', { limit: 100 });

      expect(mockStorage.findByFamilyHash).toHaveBeenCalledWith('xyz789', 100);
    });
  });

  describe('getEntry', () => {
    it('should return entry by id', async () => {
      const entry = createMockEntry({ id: 42, type: 'query' as EntryType });
      mockStorage.findById.mockResolvedValue(entry);

      const result = await controller.getEntry(42);

      expect(mockStorage.findById).toHaveBeenCalledWith(42);
      expect(result).toEqual({ data: entry });
    });

    it('should throw NestLensApiException when entry not found', async () => {
      mockStorage.findById.mockResolvedValue(null);

      await expect(controller.getEntry(999)).rejects.toThrow(NestLensApiException);

      try {
        await controller.getEntry(999);
      } catch (error) {
        expect(error).toBeInstanceOf(NestLensApiException);
        expect((error as NestLensApiException).errorCode).toBe(ErrorCode.ENTRY_NOT_FOUND);
        expect((error as NestLensApiException).getStatus()).toBe(404);
      }
    });

    it('should return related entries for request type', async () => {
      const entry = createMockEntry({
        id: 1,
        type: 'request',
        requestId: 'req-123',
      });
      const related = [
        createMockEntry({
          id: 2,
          type: 'query' as EntryType,
          requestId: 'req-123',
        }),
        createMockEntry({
          id: 3,
          type: 'log' as EntryType,
          requestId: 'req-123',
        }),
      ];
      mockStorage.findById.mockResolvedValue(entry);
      mockStorage.find.mockResolvedValue([entry, ...related]);

      const result = await controller.getEntry(1);

      expect(mockStorage.find).toHaveBeenCalledWith({
        requestId: 'req-123',
        limit: 100,
      });
      expect(result).toEqual({
        data: entry,
        related,
      });
    });

    it('should not fetch related for non-request types', async () => {
      const entry = createMockEntry({ id: 1, type: 'query' as EntryType });
      mockStorage.findById.mockResolvedValue(entry);

      const result = await controller.getEntry(1);

      expect(mockStorage.find).not.toHaveBeenCalled();
      expect(result).toEqual({ data: entry });
    });
  });

  describe('getStats', () => {
    it('should return stats from storage', async () => {
      const stats = {
        total: 360,
        byType: { request: 100, query: 50, exception: 10, log: 200 } as any,
      };
      mockStorage.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(mockStorage.getStats).toHaveBeenCalled();
      expect(result).toEqual({ data: stats });
    });
  });

  describe('getRequests', () => {
    it('should call getEntries with request type', async () => {
      const entries = [createMockEntry({ type: 'request' })];
      mockStorage.find.mockResolvedValue(entries);
      mockStorage.count.mockResolvedValue(1);

      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getRequests({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('request', expect.any(Object));
    });
  });

  /**
   * These two used to read a page and filter what came back, so `?level=error`
   * chose the errors out of the newest fifty rather than the newest fifty
   * errors — and reported the count of the whole type above them. The tests
   * that covered it mocked `find` to return two entries and checked that one
   * survived, which is the bug expressed as an expectation.
   *
   * The narrowing belongs to the storage, which applies it before it chooses a
   * page. What is left to check here is that the right question is asked and
   * the storage's answer is passed through unchanged.
   */
  describe('getQueries', () => {
    it('asks for every query when nothing is narrowed', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getQueries({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('query', {
        limit: 50,
        filters: expect.any(Object),
      });
    });

    it('asks the storage to narrow to the slow ones', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getQueries({ slow: 'true' });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ limit: 50, filters: expect.objectContaining({ slow: true }) }),
      );
    });

    it('reports the count of what matched, not of the type', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [createMockEntry({ type: 'query' as EntryType })],
        meta: { hasMore: false, oldestSequence: 1, newestSequence: 1, total: 1 },
      });

      const result = await controller.getQueries({ slow: 'true' });

      // The count used to be `storage.count('query')` — every query there is.
      expect(result.meta.total).toBe(1);
      expect(mockStorage.count).not.toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('asks for every log when nothing is narrowed', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getLogs({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('log', {
        limit: 50,
        filters: expect.any(Object),
      });
    });

    it('asks the storage to narrow by level', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getLogs({ level: 'error' });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ filters: expect.objectContaining({ levels: ['error'] }) }),
      );
    });

    it('asks for enough matches to reach the offset', async () => {
      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getLogs({ level: 'error', limit: 20, offset: 40 });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          limit: 60,
          filters: expect.objectContaining({ levels: ['error'] }),
        }),
      );
    });

    it('returns the page the offset asks for', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => createMockEntry({ id: i + 1 }));
      mockStorage.findWithCursor.mockResolvedValue({
        data: entries,
        meta: { hasMore: false, oldestSequence: 1, newestSequence: 5, total: 5 },
      });

      const result = await controller.getLogs({ limit: 2, offset: 3 });

      expect(result.data.map((e) => e.id)).toEqual([4, 5]);
      expect(result.meta).toEqual({ total: 5, limit: 2, offset: 3 });
    });
  });

  describe('getExceptions', () => {
    it('should call getEntries with exception type', async () => {
      mockStorage.find.mockResolvedValue([]);
      mockStorage.count.mockResolvedValue(0);

      mockStorage.findWithCursor.mockResolvedValue({
        data: [],
        meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
      });

      await controller.getExceptions({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith('exception', expect.any(Object));
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', async () => {
      const stats = {
        total: 1000,
        byType: { request: 500, query: 300, exception: 100, log: 100 } as any,
        databaseSize: 5242880,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-31T23:59:59Z',
      };
      mockStorage.getStorageStats.mockResolvedValue(stats);

      const result = await controller.getStorageStats();

      expect(mockStorage.getStorageStats).toHaveBeenCalled();
      expect(result).toEqual({ data: stats });
    });
  });

  describe('getPruningStatus', () => {
    it('should return pruning status', async () => {
      const storageStats = {
        total: 100,
        byType: {} as any,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-31T23:59:59Z',
        databaseSize: 1024,
      };
      mockStorage.getStorageStats.mockResolvedValue(storageStats);

      const result = await controller.getPruningStatus();

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
      mockConfig.pruning = undefined;
      mockStorage.getStorageStats.mockResolvedValue({
        total: 0,
        byType: {} as any,
        oldestEntry: null,
        newestEntry: null,
        databaseSize: 0,
      });

      const result = await controller.getPruningStatus();

      expect(result.data.enabled).toBe(true);
      expect(result.data.maxAge).toBe(24);
      expect(result.data.interval).toBe(60);
    });
  });

  describe('runPruning', () => {
    it('should run pruning and return result', async () => {
      mockStorage.prune.mockResolvedValue(50);

      const result = await controller.runPruning();

      expect(mockStorage.prune).toHaveBeenCalledWith(expect.any(Date));
      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(50);
      expect(result.data.lastRun).toBeDefined();
      expect(result.data.nextRun).toBeDefined();
    });

    it('should update lastRun and nextRun', async () => {
      mockStorage.prune.mockResolvedValue(10);
      const beforeRun = Date.now();

      const result = await controller.runPruning();

      expect(new Date(result.data.lastRun as string).getTime()).toBeGreaterThanOrEqual(beforeRun);
      expect(new Date(result.data.nextRun as string).getTime()).toBeGreaterThan(
        new Date(result.data.lastRun as string).getTime(),
      );
    });

    it('should calculate prune cutoff based on maxAge config', async () => {
      mockStorage.prune.mockResolvedValue(0);
      const maxAgeHours = 24;
      const expectedBefore = Date.now() - maxAgeHours * 60 * 60 * 1000;

      await controller.runPruning();

      const calledDate = mockStorage.prune.mock.calls[0][0] as Date;
      expect(calledDate.getTime()).toBeCloseTo(expectedBefore, -3);
    });
  });

  describe('clearEntries', () => {
    it('should clear all entries', async () => {
      mockStorage.clear.mockResolvedValue(12);

      const result = await controller.clearEntries({});

      expect(mockStorage.clear).toHaveBeenCalledWith(undefined);
      expect(result).toMatchObject({ success: true, data: { deleted: 12, type: null } });
    });

    it('should clear one type when asked', async () => {
      mockStorage.clear.mockResolvedValue(3);

      const result = await controller.clearEntries({ type: 'query' });

      expect(mockStorage.clear).toHaveBeenCalledWith('query');
      expect(result).toMatchObject({ success: true, data: { deleted: 3, type: 'query' } });
      expect(result.message).toContain('3 query entries');
    });
  });

  describe('resolveEntry', () => {
    it('should resolve entry and return updated entry', async () => {
      const entry = createMockEntry({ id: 1, type: 'exception' as EntryType });
      mockStorage.resolveEntry.mockResolvedValue(undefined);
      mockStorage.findById.mockResolvedValue({
        ...entry,
        resolvedAt: new Date().toISOString(),
      } as any);

      const result = await controller.resolveEntry(1);

      expect(mockStorage.resolveEntry).toHaveBeenCalledWith(1);
      expect(mockStorage.findById).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data!.resolvedAt).toBeDefined();
    });
  });

  describe('unresolveEntry', () => {
    it('should unresolve entry and return updated entry', async () => {
      const entry = createMockEntry({ id: 1, type: 'exception' as EntryType });
      mockStorage.unresolveEntry.mockResolvedValue(undefined);
      mockStorage.findById.mockResolvedValue({
        ...entry,
        resolvedAt: undefined,
      } as any);

      const result = await controller.unresolveEntry(1);

      expect(mockStorage.unresolveEntry).toHaveBeenCalledWith(1);
      expect(mockStorage.findById).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data!.resolvedAt).toBeUndefined();
    });
  });

  describe('pauseRecording', () => {
    it('should pause recording with reason', async () => {
      const status = {
        isPaused: true,
        pausedAt: new Date(),
        pauseReason: 'maintenance',
      };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      const result = await controller.pauseRecording({ reason: 'maintenance' });

      expect(mockCollectorService.pause).toHaveBeenCalledWith('maintenance');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(status);
    });

    it('should pause recording without reason', async () => {
      const status = { isPaused: true, pausedAt: new Date() };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      const result = await controller.pauseRecording({});

      expect(mockCollectorService.pause).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('resumeRecording', () => {
    it('should resume recording', async () => {
      const status = { isPaused: false };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      const result = await controller.resumeRecording();

      expect(mockCollectorService.resume).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(status);
    });
  });

  describe('getRecordingStatus', () => {
    it('should return recording status', async () => {
      const status = { isPaused: false };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      const result = await controller.getRecordingStatus();

      expect(mockCollectorService.getRecordingStatus).toHaveBeenCalled();
      // The counts sit beside the status: "nothing was recorded" and "nothing
      // happened" look identical without them.
      expect(result.data).toMatchObject(status);
      expect(result.data.counts).toMatchObject({ recorded: 0, droppedBySampling: 0 });
    });

    it('should return paused status with details', async () => {
      const status = {
        isPaused: true,
        pausedAt: new Date('2024-01-15T10:00:00Z'),
        pauseReason: 'debugging',
      };
      mockCollectorService.getRecordingStatus.mockReturnValue(status);

      const result = await controller.getRecordingStatus();

      expect(result.data).toMatchObject(status);
    });
  });

  /**
   * Pagination bounds used to be hand-parsed inside the handler, so the only
   * way to check them was to call the handler. They belong to the DTO now, and
   * a DTO only means anything once the validation pipe has run it — which is
   * exactly what these handler-level tests never did, and why `?from=yesterday`
   * reached the storage as an Invalid Date.
   *
   * `entries-query-validation.spec.ts` runs the pipe.
   */
  describe('Edge Cases', () => {
    const emptyPage = {
      data: [],
      meta: { hasMore: false, oldestSequence: null, newestSequence: null, total: 0 },
    };

    it('uses the limit the DTO settled on', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({ limit: 1000 });

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ limit: 1000 }),
      );
    });

    it('falls back to the default when the DTO left it out', async () => {
      mockStorage.findWithCursor.mockResolvedValue(emptyPage);

      await controller.getEntries({});

      expect(mockStorage.findWithCursor).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ limit: 50 }),
      );
    });
  });
});
