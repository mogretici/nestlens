/**
 * CacheWatcher Tests
 *
 * Tests for the cache watcher that monitors cache operations.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { CacheWatcher } from '../../watchers/cache.watcher';

describe('CacheWatcher', () => {
  let watcher: CacheWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const CACHE_MANAGER = 'CACHE_MANAGER';

  const createCacheManager = (
    overrides: Partial<{
      get: jest.Mock;
      set: jest.Mock;
      del: jest.Mock;
      reset: jest.Mock;
    }> = {},
  ) => ({
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    cacheManager?: ReturnType<typeof createCacheManager>,
  ): Promise<CacheWatcher> => {
    const providers: any[] = [
      CacheWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (cacheManager !== undefined) {
      providers.push({ provide: CACHE_MANAGER, useValue: cacheManager });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<CacheWatcher>(CacheWatcher);
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
        cache: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when cache watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { cache: true };
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when cache watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { cache: false };
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);

      // Act
      watcher.onModuleInit();
      await cacheManager.get('test');

      // Assert - should not intercept
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { cache: false };
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);

      // Act
      watcher.onModuleInit();

      // Assert - original methods should not be stored
      expect((watcher as any).originalMethods).toBeUndefined();
    });

    it('should handle missing cache manager gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
      expect((watcher as any).originalMethods).toBeUndefined();
    });

    it('should setup interceptors when cache manager is available', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).originalMethods).toBeDefined();
      expect((watcher as any).originalMethods.get).toBeDefined();
      expect((watcher as any).originalMethods.set).toBeDefined();
    });
  });

  // ============================================================================
  // Get Operation
  // ============================================================================

  describe('Get Operation', () => {
    it('should collect cache hit', async () => {
      // Arrange
      const cachedValue = { id: 1, name: 'Test' };
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(cachedValue),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      const result = await cacheManager.get('user:1');

      // Assert
      expect(result).toEqual(cachedValue);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'get',
          key: 'user:1',
          hit: true,
          value: cachedValue,
        }),
      );
    });

    it('should collect cache miss', async () => {
      // Arrange
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(undefined),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      const result = await cacheManager.get('nonexistent');

      // Assert
      expect(result).toBeUndefined();
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'get',
          key: 'nonexistent',
          hit: false,
        }),
      );
    });

    it('should collect duration for get operation', async () => {
      // Arrange
      const cacheManager = createCacheManager({
        get: jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve('value'), 10)),
          ),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('test-key');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'get',
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(0);
    });

    it('should treat null as cache miss', async () => {
      // Arrange
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(null),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('null-value');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          hit: false,
        }),
      );
    });
  });

  // ============================================================================
  // Set Operation
  // ============================================================================

  describe('Set Operation', () => {
    it('should collect set operation with value', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();
      const value = { data: 'test' };

      // Act
      await cacheManager.set('my-key', value);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'set',
          key: 'my-key',
          value: value,
        }),
      );
    });

    it('should collect set operation with TTL', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();
      const ttl = 3600;

      // Act
      await cacheManager.set('temp-key', 'temp-value', ttl);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'set',
          key: 'temp-key',
          ttl: 3600,
        }),
      );
    });

    it('should collect duration for set operation', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.set('key', 'value');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });
  });

  // ============================================================================
  // Delete Operation
  // ============================================================================

  describe('Delete Operation', () => {
    it('should collect del operation', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.del('key-to-delete');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'del',
          key: 'key-to-delete',
        }),
      );
    });

    it('should collect duration for del operation', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.del('test');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });
  });

  // ============================================================================
  // Reset/Clear Operation
  // ============================================================================

  describe('Reset Operation', () => {
    it('should collect reset operation as clear', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.reset();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'clear',
          key: '*',
        }),
      );
    });

    it('should collect duration for reset operation', async () => {
      // Arrange
      const cacheManager = createCacheManager();
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.reset();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });
  });

  // ============================================================================
  // Value Capture
  // ============================================================================

  describe('Value Capture', () => {
    it('should capture small values as-is', async () => {
      // Arrange
      const smallValue = { id: 1, name: 'Test' };
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(smallValue),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('small');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          value: smallValue,
        }),
      );
    });

    it('should truncate large values', async () => {
      // Arrange
      const largeValue = { data: 'x'.repeat(2000) };
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(largeValue),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('large');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          value: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable values', async () => {
      // Arrange
      const circularValue: any = {};
      circularValue.self = circularValue;
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(circularValue),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('circular');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          value: { _error: 'Unable to serialize value' },
        }),
      );
    });

    it('should return undefined for null values', async () => {
      // Arrange
      const cacheManager = createCacheManager({
        get: jest.fn().mockResolvedValue(null),
      });
      watcher = await createWatcher(mockConfig, cacheManager);
      watcher.onModuleInit();

      // Act
      await cacheManager.get('null');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          value: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Partial Cache Manager
  // ============================================================================

  describe('Partial Cache Manager', () => {
    it('should handle cache manager without get method', async () => {
      // Arrange
      const partialCache = {
        set: jest.fn().mockResolvedValue(undefined),
      };
      watcher = await createWatcher(mockConfig, partialCache as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should handle cache manager without set method', async () => {
      // Arrange
      const partialCache = {
        get: jest.fn().mockResolvedValue('value'),
      };
      watcher = await createWatcher(mockConfig, partialCache as any);

      // Act
      watcher.onModuleInit();
      await partialCache.get('test');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'cache',
        expect.objectContaining({
          operation: 'get',
        }),
      );
    });
  });
});
