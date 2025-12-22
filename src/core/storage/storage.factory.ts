import { Logger } from '@nestjs/common';
import { StorageConfig, StorageDriver } from '../../nestlens.config';
import { StorageInterface } from './storage.interface';

const logger = new Logger('StorageFactory');

/**
 * Resolves the storage driver from configuration.
 * Handles both new and legacy configuration formats.
 */
function resolveDriver(config: StorageConfig): StorageDriver {
  // New config format - driver is explicitly set
  if (config.driver) {
    return config.driver;
  }

  // Legacy config format - check for type: 'sqlite' or filename
  if (config.type === 'sqlite' || config.filename) {
    logger.warn(
      'Using deprecated storage configuration. ' +
        "Please migrate to: { driver: 'sqlite', sqlite: { filename: '...' } }",
    );
    return 'sqlite';
  }

  // Default to memory (zero-config, works everywhere)
  return 'memory';
}

/**
 * Creates an in-memory storage instance.
 * No external dependencies required.
 */
async function createMemoryStorage(config: StorageConfig): Promise<StorageInterface> {
  const { MemoryStorage } = await import('./memory.storage');
  const storage = new MemoryStorage(config.memory);
  await storage.initialize();
  logger.log('Using in-memory storage');
  return storage;
}

/**
 * Creates a SQLite storage instance.
 * Requires better-sqlite3 to be installed.
 */
async function createSqliteStorage(config: StorageConfig): Promise<StorageInterface> {
  try {
    // Lazy load to avoid importing native module until needed
    const { SqliteStorage } = await import('./sqlite.storage');

    // Support both new and legacy config
    const filename = config.sqlite?.filename ?? config.filename ?? '.cache/nestlens.db';

    const storage = new SqliteStorage(filename);
    await storage.initialize();
    logger.log(`Using SQLite storage: ${filename}`);
    return storage;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string };

    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error(
        'SQLite storage requires better-sqlite3 to be installed.\n\n' +
          'Install it with:\n' +
          '  npm install better-sqlite3\n' +
          '  # or\n' +
          '  yarn add better-sqlite3\n\n' +
          'Or use a different storage driver:\n' +
          "  - driver: 'memory' (default, zero dependencies)\n" +
          "  - driver: 'redis' (requires ioredis)\n",
      );
    }

    throw error;
  }
}

/**
 * Creates a Redis storage instance.
 * Requires ioredis to be installed.
 */
async function createRedisStorage(config: StorageConfig): Promise<StorageInterface> {
  try {
    // Lazy load to avoid importing ioredis until needed
    const { RedisStorage } = await import('./redis.storage');
    const storage = new RedisStorage(config.redis);
    await storage.initialize();

    const redisConfig = config.redis ?? {};
    const connectionInfo = redisConfig.url ?? `${redisConfig.host ?? 'localhost'}:${redisConfig.port ?? 6379}`;
    logger.log(`Using Redis storage: ${connectionInfo}`);
    return storage;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string };

    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error(
        'Redis storage requires ioredis to be installed.\n\n' +
          'Install it with:\n' +
          '  npm install ioredis\n' +
          '  # or\n' +
          '  yarn add ioredis\n\n' +
          'Or use a different storage driver:\n' +
          "  - driver: 'memory' (default, zero dependencies)\n" +
          "  - driver: 'sqlite' (requires better-sqlite3)\n",
      );
    }

    throw error;
  }
}

/**
 * Creates the appropriate storage instance based on configuration.
 *
 * Uses lazy loading to avoid importing native modules until they are needed.
 * This prevents Docker build failures when native modules aren't available.
 *
 * @example
 * ```typescript
 * // Memory storage (default, no dependencies)
 * const storage = await createStorage({ driver: 'memory' });
 *
 * // SQLite storage (requires better-sqlite3)
 * const storage = await createStorage({
 *   driver: 'sqlite',
 *   sqlite: { filename: '.cache/nestlens.db' }
 * });
 *
 * // Redis storage (requires ioredis)
 * const storage = await createStorage({
 *   driver: 'redis',
 *   redis: { url: 'redis://localhost:6379' }
 * });
 * ```
 */
export async function createStorage(config: StorageConfig = {}): Promise<StorageInterface> {
  const driver = resolveDriver(config);

  logger.log(`Creating storage with driver: ${driver}`);

  switch (driver) {
    case 'memory':
      return createMemoryStorage(config);

    case 'sqlite':
      return createSqliteStorage(config);

    case 'redis':
      return createRedisStorage(config);

    default: {
      // Exhaustive check - TypeScript will error if a driver is missed
      const _exhaustiveCheck: never = driver;
      throw new Error(`Unknown storage driver: ${_exhaustiveCheck}`);
    }
  }
}
