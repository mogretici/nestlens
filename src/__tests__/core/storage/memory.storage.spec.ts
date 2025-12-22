import { MemoryStorage } from '../../../core/storage/memory.storage';
import { Entry, EntryType } from '../../../types';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage({ maxEntries: 100 });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  // ==================== Helper Functions ====================

  function createEntry(type: EntryType, payload: Record<string, unknown> = {}): Entry {
    return {
      type,
      payload,
      requestId: `req-${Date.now()}`,
    } as Entry;
  }

  // ==================== Core CRUD Tests ====================

  describe('save', () => {
    it('should save an entry and return it with id and createdAt', async () => {
      // Arrange
      const entry = createEntry('request', { method: 'GET', path: '/test' });

      // Act
      const saved = await storage.save(entry);

      // Assert
      expect(saved.id).toBeDefined();
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.createdAt).toBeDefined();
      expect(saved.type).toBe('request');
      expect(saved.payload).toEqual({ method: 'GET', path: '/test' });
    });

    it('should assign incrementing IDs', async () => {
      // Arrange & Act
      const saved1 = await storage.save(createEntry('request'));
      const saved2 = await storage.save(createEntry('query'));
      const saved3 = await storage.save(createEntry('log'));

      // Assert
      expect(saved2.id).toBe(saved1.id! + 1);
      expect(saved3.id).toBe(saved2.id! + 1);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple entries at once', async () => {
      // Arrange
      const entries = [
        createEntry('request', { path: '/1' }),
        createEntry('request', { path: '/2' }),
        createEntry('request', { path: '/3' }),
      ];

      // Act
      const saved = await storage.saveBatch(entries);

      // Assert
      expect(saved).toHaveLength(3);
      expect(saved[0].id).toBeDefined();
      expect(saved[1].id).toBe(saved[0].id! + 1);
      expect(saved[2].id).toBe(saved[1].id! + 1);
    });

    it('should return empty array for empty input', async () => {
      // Act
      const saved = await storage.saveBatch([]);

      // Assert
      expect(saved).toEqual([]);
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await storage.saveBatch([
        createEntry('request', { path: '/a' }),
        createEntry('query', { sql: 'SELECT 1' }),
        createEntry('request', { path: '/b' }),
        createEntry('exception', { name: 'Error' }),
      ]);
    });

    it('should find entries by type', async () => {
      // Act
      const requests = await storage.find({ type: 'request' });

      // Assert
      expect(requests).toHaveLength(2);
      expect(requests.every((e) => e.type === 'request')).toBe(true);
    });

    it('should return entries in descending order by createdAt', async () => {
      // Act
      const all = await storage.find({});

      // Assert
      expect(all).toHaveLength(4);
      // Entries should be sorted (newest first based on createdAt, then by ID)
      for (let i = 0; i < all.length - 1; i++) {
        const current = new Date(all[i].createdAt!).getTime();
        const next = new Date(all[i + 1].createdAt!).getTime();
        // Either current is newer, or same time with higher ID
        expect(current >= next).toBe(true);
      }
    });

    it('should apply limit', async () => {
      // Act
      const limited = await storage.find({ limit: 2 });

      // Assert
      expect(limited).toHaveLength(2);
    });

    it('should apply offset', async () => {
      // Act
      const all = await storage.find({});
      const offset = await storage.find({ offset: 2 });

      // Assert
      expect(offset).toHaveLength(2);
      expect(offset[0].id).toBe(all[2].id);
    });
  });

  describe('findById', () => {
    it('should find entry by id', async () => {
      // Arrange
      const saved = await storage.save(createEntry('log', { message: 'test' }));

      // Act
      const found = await storage.findById(saved.id!);

      // Assert
      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.type).toBe('log');
    });

    it('should return null for non-existent id', async () => {
      // Act
      const found = await storage.findById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('count', () => {
    it('should count all entries', async () => {
      // Arrange
      await storage.saveBatch([
        createEntry('request'),
        createEntry('query'),
        createEntry('exception'),
      ]);

      // Act
      const total = await storage.count();

      // Assert
      expect(total).toBe(3);
    });

    it('should count entries by type', async () => {
      // Arrange
      await storage.saveBatch([
        createEntry('request'),
        createEntry('request'),
        createEntry('query'),
      ]);

      // Act
      const requestCount = await storage.count('request');
      const queryCount = await storage.count('query');

      // Assert
      expect(requestCount).toBe(2);
      expect(queryCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      // Arrange
      await storage.saveBatch([createEntry('request'), createEntry('query')]);

      // Act
      await storage.clear();
      const count = await storage.count();

      // Assert
      expect(count).toBe(0);
    });
  });

  // ==================== Tag Tests ====================

  describe('tags', () => {
    let entryId: number;

    beforeEach(async () => {
      const saved = await storage.save(createEntry('exception', { name: 'Error' }));
      entryId = saved.id!;
    });

    it('should add and retrieve tags', async () => {
      // Act
      await storage.addTags(entryId, ['critical', 'production']);
      const tags = await storage.getEntryTags(entryId);

      // Assert
      expect(tags).toContain('critical');
      expect(tags).toContain('production');
    });

    it('should remove tags', async () => {
      // Arrange
      await storage.addTags(entryId, ['tag1', 'tag2', 'tag3']);

      // Act
      await storage.removeTags(entryId, ['tag2']);
      const tags = await storage.getEntryTags(entryId);

      // Assert
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag3');
      expect(tags).not.toContain('tag2');
    });

    it('should get all tags with counts', async () => {
      // Arrange
      const entry2 = await storage.save(createEntry('log'));
      await storage.addTags(entryId, ['shared', 'unique1']);
      await storage.addTags(entry2.id!, ['shared', 'unique2']);

      // Act
      const allTags = await storage.getAllTags();

      // Assert
      const sharedTag = allTags.find((t) => t.tag === 'shared');
      expect(sharedTag?.count).toBe(2);
    });

    it('should find entries by tags with OR logic', async () => {
      // Arrange
      const entry2 = await storage.save(createEntry('log'));
      await storage.addTags(entryId, ['tag1']);
      await storage.addTags(entry2.id!, ['tag2']);

      // Act
      const found = await storage.findByTags(['tag1', 'tag2'], 'OR');

      // Assert
      expect(found).toHaveLength(2);
    });

    it('should find entries by tags with AND logic', async () => {
      // Arrange
      const entry2 = await storage.save(createEntry('log'));
      await storage.addTags(entryId, ['tag1', 'tag2']);
      await storage.addTags(entry2.id!, ['tag1']);

      // Act
      const found = await storage.findByTags(['tag1', 'tag2'], 'AND');

      // Assert
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(entryId);
    });
  });

  // ==================== Monitored Tags Tests ====================

  describe('monitored tags', () => {
    it('should add and retrieve monitored tags', async () => {
      // Act
      const monitored = await storage.addMonitoredTag('important');
      const all = await storage.getMonitoredTags();

      // Assert
      expect(monitored.tag).toBe('important');
      expect(monitored.id).toBeDefined();
      expect(all).toHaveLength(1);
    });

    it('should not duplicate monitored tags', async () => {
      // Act
      await storage.addMonitoredTag('tag');
      await storage.addMonitoredTag('tag');
      const all = await storage.getMonitoredTags();

      // Assert
      expect(all).toHaveLength(1);
    });

    it('should remove monitored tags', async () => {
      // Arrange
      await storage.addMonitoredTag('tag');

      // Act
      await storage.removeMonitoredTag('tag');
      const all = await storage.getMonitoredTags();

      // Assert
      expect(all).toHaveLength(0);
    });
  });

  // ==================== Resolution Tests ====================

  describe('resolution', () => {
    it('should resolve an entry', async () => {
      // Arrange
      const saved = await storage.save(createEntry('exception'));

      // Act
      await storage.resolveEntry(saved.id!);
      const found = await storage.findById(saved.id!);

      // Assert
      expect(found!.resolvedAt).toBeDefined();
    });

    it('should unresolve an entry', async () => {
      // Arrange
      const saved = await storage.save(createEntry('exception'));
      await storage.resolveEntry(saved.id!);

      // Act
      await storage.unresolveEntry(saved.id!);
      const found = await storage.findById(saved.id!);

      // Assert
      expect(found!.resolvedAt).toBeUndefined();
    });
  });

  // ==================== Family Hash Tests ====================

  describe('family hash', () => {
    it('should update family hash', async () => {
      // Arrange
      const saved = await storage.save(createEntry('exception'));

      // Act
      await storage.updateFamilyHash(saved.id!, 'hash123');
      const found = await storage.findById(saved.id!);

      // Assert
      expect(found!.familyHash).toBe('hash123');
    });

    it('should find entries by family hash', async () => {
      // Arrange
      const entry1 = await storage.save(createEntry('exception'));
      const entry2 = await storage.save(createEntry('exception'));
      await storage.updateFamilyHash(entry1.id!, 'same-hash');
      await storage.updateFamilyHash(entry2.id!, 'same-hash');

      // Act
      const found = await storage.findByFamilyHash('same-hash');

      // Assert
      expect(found).toHaveLength(2);
    });

    it('should get grouped by family hash', async () => {
      // Arrange
      const entry1 = await storage.save(createEntry('exception'));
      const entry2 = await storage.save(createEntry('exception'));
      const entry3 = await storage.save(createEntry('exception'));
      await storage.updateFamilyHash(entry1.id!, 'hash-a');
      await storage.updateFamilyHash(entry2.id!, 'hash-a');
      await storage.updateFamilyHash(entry3.id!, 'hash-b');

      // Act
      const grouped = await storage.getGroupedByFamilyHash();

      // Assert
      expect(grouped).toHaveLength(2);
      const hashA = grouped.find((g) => g.familyHash === 'hash-a');
      expect(hashA?.count).toBe(2);
    });
  });

  // ==================== Statistics Tests ====================

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      // Arrange
      await storage.saveBatch([
        createEntry('request', { duration: 100 }),
        createEntry('request', { duration: 200 }),
        createEntry('query', { slow: true }),
        createEntry('exception'),
      ]);

      // Act
      const stats = await storage.getStats();

      // Assert
      expect(stats.total).toBe(4);
      expect(stats.byType.request).toBe(2);
      expect(stats.byType.query).toBe(1);
      expect(stats.byType.exception).toBe(1);
      expect(stats.avgResponseTime).toBe(150);
      expect(stats.slowQueries).toBe(1);
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', async () => {
      // Arrange
      await storage.saveBatch([createEntry('request'), createEntry('query')]);

      // Act
      const stats = await storage.getStorageStats();

      // Assert
      expect(stats.total).toBe(2);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.databaseSize).toBeUndefined(); // Memory storage doesn't have file size
    });
  });

  // ==================== Pruning Tests ====================

  describe('prune', () => {
    it('should delete entries older than given date', async () => {
      // Arrange
      await storage.save(createEntry('request'));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));
      const cutoff = new Date();

      await storage.save(createEntry('request'));

      // Act
      const deleted = await storage.prune(cutoff);
      const remaining = await storage.count();

      // Assert
      expect(deleted).toBe(1);
      expect(remaining).toBe(1);
    });
  });

  describe('pruneByType', () => {
    it('should delete entries of specific type older than given date', async () => {
      // Arrange
      await storage.save(createEntry('request'));
      await storage.save(createEntry('query'));

      await new Promise((resolve) => setTimeout(resolve, 10));
      const cutoff = new Date();

      await storage.save(createEntry('request'));

      // Act
      const deleted = await storage.pruneByType('request', cutoff);
      const requestCount = await storage.count('request');
      const queryCount = await storage.count('query');

      // Assert
      expect(deleted).toBe(1);
      expect(requestCount).toBe(1);
      expect(queryCount).toBe(1); // Query should remain
    });
  });

  // ==================== Max Entries Tests ====================

  describe('maxEntries enforcement', () => {
    it('should remove oldest entries when max is exceeded', async () => {
      // Arrange - create storage with small limit
      const smallStorage = new MemoryStorage({ maxEntries: 5 });
      await smallStorage.initialize();

      // Save 7 entries
      for (let i = 0; i < 7; i++) {
        await smallStorage.save(createEntry('request', { index: i }));
      }

      // Act
      const count = await smallStorage.count();
      const entries = await smallStorage.find({});

      // Assert
      expect(count).toBe(5);
      // Oldest entries (index 0, 1) should be removed
      const indices = entries.map((e) => (e.payload as unknown as { index: number }).index);
      expect(indices).not.toContain(0);
      expect(indices).not.toContain(1);

      await smallStorage.close();
    });
  });

  // ==================== Cursor Pagination Tests ====================

  describe('findWithCursor', () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await storage.save(createEntry('request', { index: i }));
      }
    });

    it('should paginate with beforeSequence', async () => {
      // Arrange
      const all = await storage.find({});
      const middleId = all[4].id!;

      // Act
      const result = await storage.findWithCursor('request', {
        beforeSequence: middleId,
        limit: 3,
      });

      // Assert
      expect(result.data).toHaveLength(3);
      expect(result.data.every((e) => e.id! < middleId)).toBe(true);
      expect(result.meta.hasMore).toBe(true);
    });

    it('should paginate with afterSequence', async () => {
      // Arrange
      const all = await storage.find({});
      const middleId = all[5].id!;

      // Act
      const result = await storage.findWithCursor('request', {
        afterSequence: middleId,
        limit: 3,
      });

      // Assert
      expect(result.data).toHaveLength(3);
      expect(result.data.every((e) => e.id! > middleId)).toBe(true);
    });

    it('should return total count', async () => {
      // Act
      const result = await storage.findWithCursor('request', { limit: 3 });

      // Assert
      expect(result.meta.total).toBe(10);
    });
  });
});
