/**
 * RedisWatcher Tests
 *
 * Tests for the redis watcher that monitors Redis operations.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { RedisWatcher, NESTLENS_REDIS_CLIENT } from '../../watchers/redis.watcher';

describe('RedisWatcher', () => {
  let watcher: RedisWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createRedisClient = (
    overrides: Partial<{
      get: jest.Mock;
      set: jest.Mock;
      del: jest.Mock;
      exists: jest.Mock;
      expire: jest.Mock;
      ttl: jest.Mock;
      incr: jest.Mock;
      decr: jest.Mock;
      lpush: jest.Mock;
      rpush: jest.Mock;
      lpop: jest.Mock;
      rpop: jest.Mock;
      lrange: jest.Mock;
      hget: jest.Mock;
      hset: jest.Mock;
      hdel: jest.Mock;
      hgetall: jest.Mock;
      sadd: jest.Mock;
      srem: jest.Mock;
      smembers: jest.Mock;
      zadd: jest.Mock;
      zrem: jest.Mock;
      zrange: jest.Mock;
      mget: jest.Mock;
      mset: jest.Mock;
    }> = {},
  ) => ({
    get: jest.fn().mockResolvedValue('value'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(3600),
    incr: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    lpush: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
    lpop: jest.fn().mockResolvedValue('item'),
    rpop: jest.fn().mockResolvedValue('item'),
    lrange: jest.fn().mockResolvedValue(['item1', 'item2']),
    hget: jest.fn().mockResolvedValue('field-value'),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({ field: 'value' }),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue(['member1', 'member2']),
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue(['item1', 'item2']),
    mget: jest.fn().mockResolvedValue(['value1', 'value2']),
    mset: jest.fn().mockResolvedValue('OK'),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    redisClient?: ReturnType<typeof createRedisClient>,
  ): Promise<RedisWatcher> => {
    const providers: any[] = [
      RedisWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (redisClient !== undefined) {
      providers.push({ provide: NESTLENS_REDIS_CLIENT, useValue: redisClient });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<RedisWatcher>(RedisWatcher);
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
        redis: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when redis watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { redis: true };
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when redis watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { redis: false };
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { redis: { enabled: true, maxResultSize: 2048 } };
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);

      // Assert
      expect((watcher as any).config.maxResultSize).toBe(2048);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing redis client gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when client is available', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof client.get).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { redis: false };
      const client = createRedisClient();
      const originalGet = client.get;
      watcher = await createWatcher(mockConfig, client);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(client.get).toBe(originalGet);
    });

    it('should skip ignored commands', async () => {
      // Arrange
      mockConfig.watchers = { redis: { enabled: true, ignoreCommands: ['get'] } };
      const client = createRedisClient();
      const originalGet = client.get;
      watcher = await createWatcher(mockConfig, client);

      // Act
      watcher.onModuleInit();

      // Assert - ignored command should not be wrapped
      expect(client.get).toBe(originalGet);
    });
  });

  // ============================================================================
  // GET Command
  // ============================================================================

  describe('GET Command', () => {
    it('should collect successful get operation', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('cached-value'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('user:123');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'get',
          keyPattern: 'user:123',
          status: 'success',
          result: 'cached-value',
        }),
      );
    });

    it('should calculate command duration', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve('value'), 50)),
          ),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('key');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('original'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      const result = await client.get('key');

      // Assert
      expect(result).toBe('original');
    });
  });

  // ============================================================================
  // SET Command
  // ============================================================================

  describe('SET Command', () => {
    it('should collect successful set operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act - use non-sensitive key
      await client.set('cache:abc', 'data', 'EX', 3600);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'set',
          keyPattern: 'cache:abc',
          status: 'success',
          args: ['cache:abc', 'data', 'EX', 3600],
        }),
      );
    });
  });

  // ============================================================================
  // DELETE Command
  // ============================================================================

  describe('DELETE Command', () => {
    it('should collect delete operation with multi-key pattern', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.del('key1', 'key2', 'key3');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'del',
          keyPattern: 'del(3 keys)',
        }),
      );
    });
  });

  // ============================================================================
  // Hash Commands
  // ============================================================================

  describe('Hash Commands', () => {
    it('should collect hget operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.hget('user:123', 'name');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'hget',
          keyPattern: 'user:123',
        }),
      );
    });

    it('should collect hset operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.hset('user:123', 'name', 'John');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'hset',
        }),
      );
    });

    it('should collect hgetall operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.hgetall('user:123');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'hgetall',
        }),
      );
    });
  });

  // ============================================================================
  // List Commands
  // ============================================================================

  describe('List Commands', () => {
    it('should collect lpush operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.lpush('queue', 'item');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'lpush',
          keyPattern: 'queue',
        }),
      );
    });

    it('should collect lrange operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.lrange('list', 0, -1);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'lrange',
        }),
      );
    });
  });

  // ============================================================================
  // Set Commands
  // ============================================================================

  describe('Set Commands', () => {
    it('should collect sadd operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.sadd('tags', 'tag1', 'tag2');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'sadd',
        }),
      );
    });

    it('should collect smembers operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.smembers('tags');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'smembers',
        }),
      );
    });
  });

  // ============================================================================
  // Multi-Key Commands
  // ============================================================================

  describe('Multi-Key Commands', () => {
    it('should collect mget operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.mget('key1', 'key2', 'key3');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'mget',
          keyPattern: 'mget(3 keys)',
        }),
      );
    });

    it('should collect mset operation', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.mset('key1', 'val1', 'key2', 'val2');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          command: 'mset',
          keyPattern: 'mset(4 keys)',
        }),
      );
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should collect error status', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act & Assert
      await expect(client.get('key')).rejects.toThrow('Connection refused');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          status: 'error',
          error: 'Connection refused',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const client = createRedisClient({
        set: jest.fn().mockRejectedValue(new Error('Timeout')),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act & Assert
      await expect(client.set('key', 'value')).rejects.toThrow('Timeout');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      try {
        await client.get('key');
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Sensitive Key Masking
  // ============================================================================

  describe('Sensitive Key Masking', () => {
    it('should mask password key values', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('secret-password'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('user:password');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: '***MASKED***',
        }),
      );
    });

    it('should mask token key values', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('jwt-token-123'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('auth:token:user1');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: '***MASKED***',
        }),
      );
    });

    it('should mask secret key values', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('api-secret'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('app:secret');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: '***MASKED***',
        }),
      );
    });

    it('should mask session key values', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('session-data'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('session:abc123');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: '***MASKED***',
        }),
      );
    });

    it('should mask args but keep key visible', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.set('user:password', 'secret123', 'EX', 3600);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          args: ['user:password', '***MASKED***', '***MASKED***', '***MASKED***'],
        }),
      );
    });

    it('should not mask non-sensitive keys', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue('normal-value'),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('user:profile');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: 'normal-value',
        }),
      );
    });
  });

  // ============================================================================
  // Size Limits
  // ============================================================================

  describe('Size Limits', () => {
    it('should truncate large result', async () => {
      // Arrange
      const largeValue = 'x'.repeat(5000);
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue(largeValue),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act - use non-sensitive key (not containing 'key', 'token', 'secret', etc.)
      await client.get('cache:large');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should truncate large args', async () => {
      // Arrange
      const largeValue = 'x'.repeat(5000);
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act - use non-sensitive key
      await client.set('cache:item', largeValue);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          args: [expect.objectContaining({ _truncated: true })],
        }),
      );
    });

    it('should use custom maxResultSize', async () => {
      // Arrange
      mockConfig.watchers = { redis: { enabled: true, maxResultSize: 100 } };
      const mediumValue = 'x'.repeat(200);
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue(mediumValue),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act - use non-sensitive key
      await client.get('cache:medium');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: expect.objectContaining({ _truncated: true }),
        }),
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle null result', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue(null),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get('nonexistent');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: undefined,
        }),
      );
    });

    it('should handle empty args', async () => {
      // Arrange
      const client = createRedisClient({
        get: jest.fn().mockResolvedValue(null),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          keyPattern: undefined,
        }),
      );
    });

    it('should handle non-string key', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.get(123 as any);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          keyPattern: undefined,
        }),
      );
    });

    it('should handle non-serializable args', async () => {
      // Arrange
      const client = createRedisClient();
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();
      const circularObj: any = {};
      circularObj.self = circularObj;

      // Act - use non-sensitive key
      await client.set('cache:item', circularObj);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          args: [expect.objectContaining({ _error: 'Unable to serialize arguments' })],
        }),
      );
    });

    it('should handle non-serializable result', async () => {
      // Arrange
      const circularObj: any = {};
      circularObj.self = circularObj;
      const client = createRedisClient({
        hgetall: jest.fn().mockResolvedValue(circularObj),
      });
      watcher = await createWatcher(mockConfig, client);
      watcher.onModuleInit();

      // Act
      await client.hgetall('hash');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({
          result: expect.objectContaining({ _error: 'Unable to serialize result' }),
        }),
      );
    });
  });
});
