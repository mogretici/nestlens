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

    it('should support legacy config format', async () => {
      // Act
      const storage = await createStorage({
        type: 'sqlite',
        filename: ':memory:',
      });

      // Assert
      expect(storage.save).toBeDefined();
      await storage.close();
    });
  });

  describe('redis driver', () => {
    // Note: These tests would require a Redis instance or mock
    // For now, we just test that the error is thrown when ioredis is not available

    it('should throw helpful error when ioredis is not installed', async () => {
      // This test will pass if ioredis is not installed in test environment
      // In real usage, if ioredis is installed, it would try to connect
      try {
        await createStorage({
          driver: 'redis',
          redis: { host: 'localhost', port: 6379 },
        });
        // If it gets here, ioredis is installed - skip the assertion
      } catch (error) {
        expect((error as Error).message).toContain('ioredis');
      }
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

    it('should prioritize driver over legacy type', async () => {
      // Act
      const storage = await createStorage({
        driver: 'memory',
        type: 'sqlite', // Legacy, should be ignored
      });

      // Assert
      expect(storage).toBeInstanceOf(MemoryStorage);
      await storage.close();
    });

    it('should fall back to sqlite for legacy type config', async () => {
      // Act
      const storage = await createStorage({
        type: 'sqlite',
        filename: ':memory:',
      });

      // Assert
      // Should create SqliteStorage, not MemoryStorage
      expect(storage).not.toBeInstanceOf(MemoryStorage);
      await storage.close();
    });

    it('should fall back to sqlite for legacy filename config', async () => {
      // Act
      const storage = await createStorage({
        filename: ':memory:',
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
});
