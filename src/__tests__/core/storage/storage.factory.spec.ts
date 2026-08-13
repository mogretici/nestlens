import { Logger } from '@nestjs/common';
import { createStorage } from '../../../core/storage/storage.factory';
import { MemoryStorage } from '../../../core/storage/memory.storage';

describe('createStorage', () => {
  describe('memory driver', () => {
    it('should create MemoryStorage for driver: memory', async () => {
      // Act
      const storage = await createStorage({ driver: 'memory' });

      // Assert
      expect(storage).toBeInstanceOf(MemoryStorage);
      await storage.close();
    });

    it('should create MemoryStorage with custom maxEntries', async () => {
      // Act
      const storage = await createStorage({
        driver: 'memory',
        memory: { maxEntries: 500 },
      });

      // Assert
      expect(storage).toBeInstanceOf(MemoryStorage);
      await storage.close();
    });

    it('should use memory as default driver', async () => {
      // Act
      const storage = await createStorage({});

      // Assert
      expect(storage).toBeInstanceOf(MemoryStorage);
      await storage.close();
    });
  });

  describe('sqlite driver', () => {
    it('should create SqliteStorage for driver: sqlite', async () => {
      // Act
      const storage = await createStorage({
        driver: 'sqlite',
        sqlite: { filename: ':memory:' },
      });

      // Assert
      // SqliteStorage is lazy-loaded, so we check if it has the expected methods
      expect(storage.save).toBeDefined();
      expect(storage.find).toBeDefined();
      expect(storage.findWithCursor).toBeDefined();
      await storage.close();
    });
  });

  /**
   * This used to build a real client against localhost:6379 inside a
   * `try`/`catch` whose `catch` only ran when ioredis was missing — and ioredis
   * is a devDependency here, so it never was. The test asserted nothing, and it
   * left a client behind reconnecting forever, which is why jest stopped
   * exiting after this file.
   *
   * The behaviour worth testing is the one a consumer hits: they picked the
   * redis driver without installing ioredis, and the message has to tell them
   * what to do. That is reproduced by making the module unresolvable.
   */
  describe('redis driver', () => {
    /**
     * Isolated rather than reset afterwards: a bare `jest.resetModules()` gives
     * the rest of the file a second copy of every module, and `toBeInstanceOf`
     * then fails with "Expected MemoryStorage, received MemoryStorage".
     */
    const withMockedRedisStorage = async (
      factory: () => unknown,
      assert: (attempt: Promise<unknown>) => Promise<void>,
    ): Promise<void> =>
      jest.isolateModulesAsync(async () => {
        jest.doMock('../../../core/storage/redis.storage', factory);
        const { createStorage: isolated } = await import('../../../core/storage/storage.factory');

        await assert(isolated({ driver: 'redis', redis: { host: 'localhost' } }));
      });

    it('explains how to install ioredis when it is missing', async () => {
      await withMockedRedisStorage(
        () => {
          const error = new Error("Cannot find module 'ioredis'") as NodeJS.ErrnoException;
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        },
        (attempt) => expect(attempt).rejects.toThrow(/npm install ioredis/),
      );
    });

    it('passes other failures through rather than blaming the install', async () => {
      await withMockedRedisStorage(
        () => ({
          RedisStorage: class {
            async initialize(): Promise<void> {
              throw new Error('WRONGPASS invalid username-password pair');
            }
          },
        }),
        // A bad password is not a missing package, and saying so would send the
        // reader off installing something they already have.
        (attempt) => expect(attempt).rejects.toThrow(/WRONGPASS/),
      );
    });
  });

  describe('driver resolution', () => {
    it('should default to memory when no config provided', async () => {
      // Act
      const storage = await createStorage();

      // Assert
      expect(storage).toBeInstanceOf(MemoryStorage);
      await storage.close();
    });

    it('should honour an explicit sqlite driver', async () => {
      // Act
      const storage = await createStorage({
        driver: 'sqlite',
        sqlite: { filename: ':memory:' },
      });

      // Assert
      expect(storage).not.toBeInstanceOf(MemoryStorage);
      await storage.close();
    });
  });

  describe('storage interface compliance', () => {
    it('should return storage that implements all required methods', async () => {
      // Act
      const storage = await createStorage({ driver: 'memory' });

      // Assert - check all StorageInterface methods
      expect(typeof storage.initialize).toBe('function');
      expect(typeof storage.save).toBe('function');
      expect(typeof storage.saveBatch).toBe('function');
      expect(typeof storage.find).toBe('function');
      expect(typeof storage.findWithCursor).toBe('function');
      expect(typeof storage.findById).toBe('function');
      expect(typeof storage.count).toBe('function');
      expect(typeof storage.getLatestSequence).toBe('function');
      expect(typeof storage.hasEntriesAfter).toBe('function');
      expect(typeof storage.getStats).toBe('function');
      expect(typeof storage.getStorageStats).toBe('function');
      expect(typeof storage.prune).toBe('function');
      expect(typeof storage.pruneByType).toBe('function');
      expect(typeof storage.clear).toBe('function');
      expect(typeof storage.close).toBe('function');
      expect(typeof storage.addTags).toBe('function');
      expect(typeof storage.removeTags).toBe('function');
      expect(typeof storage.getEntryTags).toBe('function');
      expect(typeof storage.getAllTags).toBe('function');
      expect(typeof storage.findByTags).toBe('function');
      expect(typeof storage.addMonitoredTag).toBe('function');
      expect(typeof storage.removeMonitoredTag).toBe('function');
      expect(typeof storage.getMonitoredTags).toBe('function');
      expect(typeof storage.resolveEntry).toBe('function');
      expect(typeof storage.unresolveEntry).toBe('function');
      expect(typeof storage.updateFamilyHash).toBe('function');
      expect(typeof storage.findByFamilyHash).toBe('function');
      expect(typeof storage.getGroupedByFamilyHash).toBe('function');

      await storage.close();
    });
  });

  /**
   * The default driver keeps entries in the process that recorded them, so in a
   * clustered application the dashboard shows whichever worker answered the
   * request and entries appear to come and go between refreshes. Nothing is
   * broken, which is exactly why it needs saying out loud.
   */
  describe('in a clustered process', () => {
    const originalInstance = process.env.NODE_APP_INSTANCE;

    afterEach(() => {
      if (originalInstance === undefined) delete process.env.NODE_APP_INSTANCE;
      else process.env.NODE_APP_INSTANCE = originalInstance;
    });

    it('warns that memory storage cannot be shared between workers', async () => {
      // Arrange
      process.env.NODE_APP_INSTANCE = '2';
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      // Act
      const storage = await createStorage({ driver: 'memory' });

      // Assert
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('clustered process'));

      warn.mockRestore();
      await storage.close();
    });

    it('stays quiet in a single process', async () => {
      // Arrange
      delete process.env.NODE_APP_INSTANCE;
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      // Act
      const storage = await createStorage({ driver: 'memory' });

      // Assert
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
      await storage.close();
    });
  });
});
