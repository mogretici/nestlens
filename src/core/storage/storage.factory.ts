import { Logger } from '@nestjs/common';
import { StorageConfig, StorageDriver } from '../../nestlens.config';
import { StorageInterface } from './storage.interface';

const logger = new Logger('StorageFactory');

/**
 * Resolves the storage driver from configuration.
 * Handles both new and legacy configuration formats.
 */
function resolveDriver(config: StorageConfig): StorageDriver {
  if (config.driver) {
    return config.driver;
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
  warnIfClustered();
  return storage;
}

/**
 * Says so when in-memory storage is running in one of several processes.
 *
 * The default storage lives in the process that recorded the entry, and a
 * clustered application answers each request from whichever worker was free.
 * The dashboard then shows one worker's entries, a refresh shows another's, and
 * entries appear to come and go at random — a confusing thing to debug with a
 * debugging tool. Nothing is broken; the driver simply cannot see across
 * processes.
 *
 * Only same-host clustering is detectable from inside the process. Several
 * replicas of a container have exactly the same problem and no way to know it,
 * which is why the documentation covers the topology rather than this warning.
 *
 * Read from the environment rather than from `node:cluster`: `isWorker` is
 * defined as `NODE_UNIQUE_ID !== undefined`, and loading the cluster module to
 * ask leaves a handle open that outlives the process's work. `NODE_APP_INSTANCE`
 * covers PM2, which sets it in fork mode as well as in cluster mode.
 */
function warnIfClustered(): void {
  if (!process.env.NODE_UNIQUE_ID && !process.env.NODE_APP_INSTANCE) return;

  logger.warn(
    'In-memory storage in a clustered process: each worker keeps its own entries, so the dashboard ' +
      'shows only the worker that answered the request. Use the sqlite or redis driver for one shared view.',
  );
}

/**
 * Creates a SQLite storage instance.
 * Requires better-sqlite3 to be installed.
 */
async function createSqliteStorage(config: StorageConfig): Promise<StorageInterface> {
  try {
    // Lazy load to avoid importing native module until needed
    const { SqliteStorage } = await import('./sqlite.storage');

    const filename = config.sqlite?.filename ?? '.cache/nestlens.db';

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

    // Anything else is the file itself: a directory that cannot be written, a
    // path that is not a database, a disk with nothing left on it.
    //
    // Not fatal. A debugging tool must not be the reason a deployment fails to
    // start, and the application has nothing to do with why the file would not
    // open — a read-only container filesystem is the common case, and the
    // default path (`.cache/nestlens.db`) sits inside the project directory.
    // Redis already behaves this way: an unreachable server does not stop the
    // application, so SQLite doing the opposite was the odd one out.
    //
    // Loud, though. Falling back silently would leave a reader wondering why
    // nothing survives a restart.
    logger.error(
      `Could not open the SQLite database at ${config.sqlite?.filename ?? '.cache/nestlens.db'}: ` +
        `${err.message}. Falling back to in-memory storage — entries will be kept for this ` +
        'process only and lost on restart. Point `storage.sqlite.filename` somewhere writable, ' +
        "or set `storage.driver: 'memory'` to make that the intent.",
    );

    return createMemoryStorage(config);
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
    const connectionInfo =
      redisConfig.url ?? `${redisConfig.host ?? 'localhost'}:${redisConfig.port ?? 6379}`;
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
