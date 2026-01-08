/**
 * QueryWatcher Tests
 *
 * Tests for the query watcher that monitors TypeORM and Prisma queries.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { QueryWatcher } from '../../watchers/query/query.watcher';

// Mock the types module
jest.mock('../../watchers/query/types', () => ({
  isModuleAvailable: jest.fn(),
  tryRequire: jest.fn(),
  isTypeORMDataSource: jest.fn(),
  isPrismaClient: jest.fn(),
}));

import * as queryTypes from '../../watchers/query/types';

describe('QueryWatcher', () => {
  let watcher: QueryWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;
  const mockedTypes = queryTypes as jest.Mocked<typeof queryTypes>;

  const createWatcher = async (config: NestLensConfig): Promise<QueryWatcher> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryWatcher,
        { provide: CollectorService, useValue: mockCollector },
        { provide: NESTLENS_CONFIG, useValue: config },
      ],
    }).compile();

    return module.get<QueryWatcher>(QueryWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        query: { enabled: true, slowThreshold: 100 },
      },
    };

    // Default mock implementations
    mockedTypes.isModuleAvailable.mockReturnValue(false);
    mockedTypes.tryRequire.mockReturnValue(null);
    mockedTypes.isTypeORMDataSource.mockReturnValue(false);
    mockedTypes.isPrismaClient.mockReturnValue(false);
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when query watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { query: true };
      watcher = await createWatcher(mockConfig);

      // Act & Assert
      // Access private config through prototype for testing
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when query watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { query: false };
      watcher = await createWatcher(mockConfig);

      // Act
      await watcher.onModuleInit();

      // Assert - should not try to initialize adapters
      expect(mockedTypes.isModuleAvailable).not.toHaveBeenCalled();
    });

    it('should use default slowThreshold of 100 when not specified', async () => {
      // Arrange
      mockConfig.watchers = { query: true };
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.slowThreshold).toBe(100);
    });

    it('should use custom slowThreshold from config', async () => {
      // Arrange
      mockConfig.watchers = { query: { enabled: true, slowThreshold: 500 } };
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.slowThreshold).toBe(500);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should check for TypeORM module availability', async () => {
      // Arrange
      mockedTypes.isModuleAvailable.mockReturnValue(false);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockedTypes.isModuleAvailable).toHaveBeenCalledWith('typeorm');
    });

    it('should check for Prisma module availability', async () => {
      // Arrange
      mockedTypes.isModuleAvailable.mockReturnValue(false);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockedTypes.isModuleAvailable).toHaveBeenCalledWith('@prisma/client');
    });

    it('should not initialize when disabled', async () => {
      // Arrange
      mockConfig.watchers = { query: false };
      watcher = await createWatcher(mockConfig);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockedTypes.isModuleAvailable).not.toHaveBeenCalled();
    });

    it('should try to require TypeORM when available', async () => {
      // Arrange
      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === 'typeorm');
      mockedTypes.tryRequire.mockReturnValue(null);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockedTypes.tryRequire).toHaveBeenCalledWith('typeorm');
    });
  });

  // ============================================================================
  // Query Handling (via handleQuery)
  // ============================================================================

  describe('Query Handling', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should collect query with all fields', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT * FROM users WHERE id = ?',
        parameters: [1],
        duration: 50,
        source: 'typeorm',
        connection: 'default',
        requestId: 'req-123',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
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

    it('should mark queries as slow when exceeding threshold', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT * FROM large_table',
        duration: 150, // Above 100ms threshold
        source: 'typeorm',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          slow: true,
        }),
        undefined,
      );
    });

    it('should not mark queries as slow when below threshold', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT * FROM users',
        duration: 50, // Below 100ms threshold
        source: 'typeorm',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          slow: false,
        }),
        undefined,
      );
    });

    it('should use custom slowThreshold', async () => {
      // Arrange
      mockConfig.watchers = { query: { enabled: true, slowThreshold: 200 } };
      watcher = await createWatcher(mockConfig);

      const queryData = {
        query: 'SELECT * FROM users',
        duration: 150, // Below 200ms custom threshold
        source: 'prisma',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          slow: false,
        }),
        undefined,
      );
    });

    it('should handle queries without parameters', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT COUNT(*) FROM users',
        duration: 10,
        source: 'typeorm',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          parameters: undefined,
        }),
        undefined,
      );
    });

    it('should handle queries without connection name', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT * FROM posts',
        duration: 20,
        source: 'prisma',
      };

      // Act
      (watcher as any).handleQuery(queryData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          connection: undefined,
        }),
        undefined,
      );
    });
  });

  // ============================================================================
  // Ignore Patterns
  // ============================================================================

  describe('Ignore Patterns', () => {
    it('should skip queries matching ignore patterns', async () => {
      // Arrange
      mockConfig.watchers = {
        query: {
          enabled: true,
          ignorePatterns: [/^PRAGMA/, /^SELECT 1/],
        },
      };
      watcher = await createWatcher(mockConfig);

      // Act
      (watcher as any).handleQuery({
        query: 'PRAGMA table_info(users)',
        duration: 5,
        source: 'typeorm',
      });

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip queries matching any ignore pattern', async () => {
      // Arrange
      mockConfig.watchers = {
        query: {
          enabled: true,
          ignorePatterns: [/^PRAGMA/, /^SELECT 1/, /health_check/],
        },
      };
      watcher = await createWatcher(mockConfig);

      // Act
      (watcher as any).handleQuery({
        query: 'SELECT 1 AS result',
        duration: 1,
        source: 'typeorm',
      });

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect queries not matching ignore patterns', async () => {
      // Arrange
      mockConfig.watchers = {
        query: {
          enabled: true,
          ignorePatterns: [/^PRAGMA/],
        },
      };
      watcher = await createWatcher(mockConfig);

      // Act
      (watcher as any).handleQuery({
        query: 'SELECT * FROM users',
        duration: 10,
        source: 'typeorm',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Query Formatting
  // ============================================================================

  describe('Query Formatting', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should normalize whitespace in queries', async () => {
      // Arrange
      const queryData = {
        query: 'SELECT   *   FROM    users   WHERE   id = 1',
        duration: 10,
        source: 'typeorm',
      };

      // Act
      const formatted = (watcher as any).formatQuery(queryData.query);

      // Assert
      expect(formatted).toBe('SELECT * FROM users WHERE id = 1');
    });

    it('should trim leading and trailing whitespace', async () => {
      // Arrange
      const query = '   SELECT * FROM users   ';

      // Act
      const formatted = (watcher as any).formatQuery(query);

      // Assert
      expect(formatted).toBe('SELECT * FROM users');
    });

    it('should handle newlines in queries', async () => {
      // Arrange
      const query = `SELECT *
        FROM users
        WHERE id = 1`;

      // Act
      const formatted = (watcher as any).formatQuery(query);

      // Assert
      expect(formatted).toBe('SELECT * FROM users WHERE id = 1');
    });
  });

  // ============================================================================
  // TypeORM Integration
  // ============================================================================

  describe('TypeORM Integration', () => {
    it('should attach logger to initialized DataSource', async () => {
      // Arrange
      const mockDataSource = {
        isInitialized: true,
        options: { name: 'test-connection' },
        driver: {
          afterQuery: jest.fn(),
        },
      };

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === 'typeorm');
      mockedTypes.tryRequire.mockReturnValue({
        getDataSources: () => [mockDataSource],
      });
      mockedTypes.isTypeORMDataSource.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockDataSource.driver.afterQuery).not.toBe(undefined);
    });

    it('should intercept afterQuery and collect queries', async () => {
      // Arrange
      let capturedAfterQuery: Function | undefined;
      const originalAfterQuery = jest.fn();

      const mockDataSource = {
        isInitialized: true,
        options: { name: 'default' },
        driver: {
          get afterQuery() {
            return originalAfterQuery;
          },
          set afterQuery(fn: Function) {
            capturedAfterQuery = fn;
          },
        },
      };

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === 'typeorm');
      mockedTypes.tryRequire.mockReturnValue({
        getDataSources: () => [mockDataSource],
      });
      mockedTypes.isTypeORMDataSource.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);
      await watcher.onModuleInit();

      // Act - simulate TypeORM calling afterQuery
      capturedAfterQuery?.call(
        mockDataSource.driver,
        'SELECT * FROM users',
        [1, 2],
        { rows: [] },
        25,
      );

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          query: 'SELECT * FROM users',
          parameters: [1, 2],
          duration: 25,
          source: 'typeorm',
          connection: 'default',
        }),
        undefined,
      );
    });

    it('should handle uninitialized DataSource', async () => {
      // Arrange
      let initializeHook: (() => Promise<any>) | undefined;
      const mockDataSource = {
        isInitialized: false,
        options: { name: 'default' },
        driver: { afterQuery: null },
        initialize: jest.fn().mockImplementation(async () => {
          mockDataSource.isInitialized = true;
          return mockDataSource;
        }),
      };

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === 'typeorm');
      mockedTypes.tryRequire.mockReturnValue({
        getDataSources: () => [mockDataSource],
      });
      mockedTypes.isTypeORMDataSource.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);
      await watcher.onModuleInit();

      // Capture the wrapped initialize function
      initializeHook = mockDataSource.initialize;

      // Act - call the wrapped initialize
      await initializeHook?.();

      // Assert - original initialize was called
      expect(mockDataSource.isInitialized).toBe(true);
    });
  });

  // ============================================================================
  // Prisma Integration
  // ============================================================================

  describe('Prisma Integration', () => {
    it('should attach middleware to global Prisma client', async () => {
      // Arrange
      const mockPrismaClient = {
        $use: jest.fn(),
      };

      (global as any).prisma = mockPrismaClient;

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === '@prisma/client');
      mockedTypes.isPrismaClient.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);

      // Act
      await watcher.onModuleInit();

      // Assert
      expect(mockPrismaClient.$use).toHaveBeenCalled();

      // Cleanup
      delete (global as any).prisma;
    });

    it('should collect Prisma queries through middleware', async () => {
      // Arrange
      let capturedMiddleware: Function | undefined;
      const mockPrismaClient = {
        $use: jest.fn((middleware) => {
          capturedMiddleware = middleware;
        }),
      };

      (global as any).prisma = mockPrismaClient;

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === '@prisma/client');
      mockedTypes.isPrismaClient.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);
      await watcher.onModuleInit();

      const mockNext = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      // Act - simulate Prisma middleware call
      const startTime = Date.now();
      await capturedMiddleware?.(
        { model: 'User', action: 'findMany', args: { where: { active: true } } },
        mockNext,
      );

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          query: 'User.findMany',
          parameters: [{ where: { active: true } }],
          source: 'prisma',
        }),
        undefined,
      );

      // Cleanup
      delete (global as any).prisma;
    });

    it('should skip Prisma if client has no $use method', async () => {
      // Arrange
      const mockPrismaClient = {};
      (global as any).prisma = mockPrismaClient;

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === '@prisma/client');
      mockedTypes.isPrismaClient.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);

      // Act
      await watcher.onModuleInit();

      // Assert - should not throw
      expect(mockCollector.collect).not.toHaveBeenCalled();

      // Cleanup
      delete (global as any).prisma;
    });

    it('should handle missing model in Prisma params', async () => {
      // Arrange
      let capturedMiddleware: Function | undefined;
      const mockPrismaClient = {
        $use: jest.fn((middleware) => {
          capturedMiddleware = middleware;
        }),
      };

      (global as any).prisma = mockPrismaClient;

      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === '@prisma/client');
      mockedTypes.isPrismaClient.mockReturnValue(true);

      watcher = await createWatcher(mockConfig);
      await watcher.onModuleInit();

      const mockNext = jest.fn().mockResolvedValue([]);

      // Act
      await capturedMiddleware?.(
        { model: undefined, action: '$queryRaw', args: undefined },
        mockNext,
      );

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          query: 'unknown.$queryRaw',
          parameters: undefined,
        }),
        undefined,
      );

      // Cleanup
      delete (global as any).prisma;
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should gracefully handle TypeORM initialization errors', async () => {
      // Arrange
      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === 'typeorm');
      mockedTypes.tryRequire.mockImplementation(() => {
        throw new Error('TypeORM not found');
      });

      watcher = await createWatcher(mockConfig);

      // Act & Assert - should not throw
      await expect(watcher.onModuleInit()).resolves.not.toThrow();
    });

    it('should gracefully handle Prisma initialization errors', async () => {
      // Arrange
      mockedTypes.isModuleAvailable.mockImplementation((mod) => mod === '@prisma/client');
      mockedTypes.isPrismaClient.mockImplementation(() => {
        throw new Error('Prisma error');
      });

      watcher = await createWatcher(mockConfig);

      // Act & Assert - should not throw
      await expect(watcher.onModuleInit()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Source Types
  // ============================================================================

  describe('Source Types', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should identify TypeORM queries', async () => {
      // Arrange & Act
      (watcher as any).handleQuery({
        query: 'SELECT * FROM users',
        duration: 10,
        source: 'typeorm',
        connection: 'default',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          source: 'typeorm',
        }),
        undefined,
      );
    });

    it('should identify Prisma queries', async () => {
      // Arrange & Act
      (watcher as any).handleQuery({
        query: 'User.findMany',
        duration: 15,
        source: 'prisma',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          source: 'prisma',
        }),
        undefined,
      );
    });
  });
});
