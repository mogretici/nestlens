// Core storage interface and factory
export * from './storage.interface';
export { createStorage } from './storage.factory';

// In-memory storage (no native dependencies)
export { MemoryStorage } from './memory.storage';

// NOTE: SqliteStorage and RedisStorage are NOT exported from this index
// to avoid loading native modules (better-sqlite3, ioredis) at import time.
//
// Use the createStorage factory instead:
//   import { createStorage } from 'nestlens';
//   const storage = await createStorage({ driver: 'sqlite' });
//
// Or import directly if you need the class:
//   import { SqliteStorage } from 'nestlens/dist/core/storage/sqlite.storage';
//   import { RedisStorage } from 'nestlens/dist/core/storage/redis.storage';
