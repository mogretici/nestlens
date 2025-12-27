/**
 * SqliteStorage Tests
 *
 * Tests for SQLite-based entry storage.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { Entry } from '../../../types';

describe('SqliteStorage', () => {
  let storage: SqliteStorage;

  beforeEach(() => {
    // Create storage with in-memory database for testing
    storage = new SqliteStorage(':memory:');
  });

  afterEach(async () => {
    if (storage) {
      await storage.onModuleDestroy();
    }
  });

  // ============================================================================
  // save
  // ============================================================================

  describe('save', () => {
    it('should save a request entry', async () => {
      // Arrange
      const entry: Entry = {
        type: 'request',
        requestId: 'req-123',
        payload: {
          method: 'GET',
          url: '/api/users',
          path: '/api/users',
          query: {},
          params: {},
          headers: {},
          statusCode: 200,
          duration: 50,
          memory: 1024,
        },
      } as Entry;

      // Act
      const result = await storage.save(entry);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.type).toBe('request');
      expect(result.createdAt).toBeDefined();
    });

    it('should save a query entry', async () => {
      // Arrange
      const entry: Entry = {
        type: 'query',
        requestId: 'req-123',
        payload: {
          query: 'SELECT * FROM users',
          duration: 10,
          slow: false,
        },
      } as Entry;

      // Act
      const result = await storage.save(entry);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.type).toBe('query');
    });

    it('should save an exception entry', async () => {
      // Arrange
      const entry: Entry = {
        type: 'exception',
        requestId: 'req-123',
        payload: {
          name: 'Error',
          message: 'Something went wrong',
          stack: 'Error: Something went wrong\n    at test.ts:10',
        },
      } as Entry;

      // Act
      const result = await storage.save(entry);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.type).toBe('exception');
    });
  });

  // ============================================================================
  // saveBatch
  // ============================================================================

  describe('saveBatch', () => {
    it('should save multiple entries in a batch', async () => {
      // Arrange
      const entries: Entry[] = [
        {
          type: 'request',
          requestId: 'req-1',
          payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
        } as Entry,
        {
          type: 'request',
          requestId: 'req-2',
          payload: { method: 'POST', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 201, duration: 100, memory: 2048 },
        } as Entry,
      ];

      // Act
      const result = await storage.saveBatch(entries);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBeDefined();
      expect(result[1].id).toBeDefined();
      expect(result[0].id).not.toBe(result[1].id);
    });

    it('should handle empty batch', async () => {
      // Arrange
      const entries: Entry[] = [];

      // Act
      const result = await storage.saveBatch(entries);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // find
  // ============================================================================

  describe('find', () => {
    it('should find entries by type', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);

      // Act
      const result = await storage.find({ type: 'request' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('request');
    });

    it('should find entries by requestId', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        requestId: 'req-123',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'request',
        requestId: 'req-456',
        payload: { method: 'POST', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const result = await storage.find({ requestId: 'req-123' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('req-123');
    });

    it('should find entries with limit', async () => {
      // Arrange
      for (let i = 0; i < 5; i++) {
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: `/api/${i}`, path: `/api/${i}`, query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
        } as Entry);
      }

      // Act
      const result = await storage.find({ limit: 3 });

      // Assert
      expect(result).toHaveLength(3);
    });

    it('should find entries with limit and offset', async () => {
      // Arrange
      for (let i = 0; i < 5; i++) {
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: `/api/${i}`, path: `/api/${i}`, query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
        } as Entry);
      }

      // Act - SQLite requires LIMIT when using OFFSET
      const result = await storage.find({ limit: 100, offset: 2 });

      // Assert
      expect(result).toHaveLength(3);
    });

    it('should find entries by date range', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/old', path: '/old', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act - use wide date range to ensure entry is included
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const to = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      const result = await storage.find({ from, to });

      // Assert
      expect(result).toHaveLength(1);
    });
  });

  // ============================================================================
  // findById
  // ============================================================================

  describe('findById', () => {
    it('should find entry by id', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const result = await storage.findById(saved.id!);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe(saved.id);
    });

    it('should return null for non-existent id', async () => {
      // Act
      const result = await storage.findById(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // count
  // ============================================================================

  describe('count', () => {
    it('should count all entries', async () => {
      // Arrange
      await storage.save({ type: 'request', payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 } } as Entry);
      await storage.save({ type: 'query', payload: { query: 'SELECT 1', duration: 5, slow: false } } as Entry);

      // Act
      const result = await storage.count();

      // Assert
      expect(result).toBe(2);
    });

    it('should count entries by type', async () => {
      // Arrange
      await storage.save({ type: 'request', payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 } } as Entry);
      await storage.save({ type: 'request', payload: { method: 'POST', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 201, duration: 100, memory: 2048 } } as Entry);
      await storage.save({ type: 'query', payload: { query: 'SELECT 1', duration: 5, slow: false } } as Entry);

      // Act
      const result = await storage.count('request');

      // Assert
      expect(result).toBe(2);
    });
  });

  // ============================================================================
  // getStats
  // ============================================================================

  describe('getStats', () => {
    it('should return stats for empty database', async () => {
      // Act
      const result = await storage.getStats();

      // Assert
      expect(result.total).toBe(0);
      expect(result.byType).toEqual({});
      expect(result.slowQueries).toBe(0);
      expect(result.exceptions).toBe(0);
    });

    it('should return correct stats', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 100, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'request',
        payload: { method: 'POST', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 200, memory: 2048 },
      } as Entry);
      await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: true },
      } as Entry);
      await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test error', stack: '' },
      } as Entry);

      // Act
      const result = await storage.getStats();

      // Assert
      expect(result.total).toBe(4);
      expect(result.byType.request).toBe(2);
      expect(result.byType.query).toBe(1);
      expect(result.byType.exception).toBe(1);
      expect(result.slowQueries).toBe(1);
      expect(result.exceptions).toBe(1);
      expect(result.avgResponseTime).toBeDefined();
    });
  });

  // ============================================================================
  // prune
  // ============================================================================

  describe('prune', () => {
    it('should prune entries before date', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const before = new Date(Date.now() + 10000); // Future date to delete all
      const deleted = await storage.prune(before);

      // Assert
      expect(deleted).toBe(1);
      const count = await storage.count();
      expect(count).toBe(0);
    });

    it('should not prune entries after date', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act - use a date from yesterday to ensure entry is definitely after it
      const before = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const deleted = await storage.prune(before);

      // Assert
      expect(deleted).toBe(0);
      const count = await storage.count();
      expect(count).toBe(1);
    });
  });

  // ============================================================================
  // pruneByType
  // ============================================================================

  describe('pruneByType', () => {
    it('should prune entries by type', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);

      // Act
      const before = new Date(Date.now() + 10000);
      const deleted = await storage.pruneByType('request', before);

      // Assert
      expect(deleted).toBe(1);
      const requestCount = await storage.count('request');
      const queryCount = await storage.count('query');
      expect(requestCount).toBe(0);
      expect(queryCount).toBe(1);
    });
  });

  // ============================================================================
  // clear
  // ============================================================================

  describe('clear', () => {
    it('should clear all entries', async () => {
      // Arrange
      await storage.save({ type: 'request', payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 } } as Entry);
      await storage.save({ type: 'query', payload: { query: 'SELECT 1', duration: 5, slow: false } } as Entry);

      // Act
      await storage.clear();

      // Assert
      const count = await storage.count();
      expect(count).toBe(0);
    });
  });

  // ============================================================================
  // updateFamilyHash
  // ============================================================================

  describe('updateFamilyHash', () => {
    it('should update family hash', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test', stack: '' },
      } as Entry);

      // Act
      await storage.updateFamilyHash(saved.id!, 'hash-123');
      const result = await storage.findById(saved.id!);

      // Assert
      expect(result?.familyHash).toBe('hash-123');
    });
  });

  // ============================================================================
  // resolveException
  // ============================================================================

  describe('resolveEntry', () => {
    it('should mark entry as resolved', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test', stack: '' },
      } as Entry);

      // Act
      await storage.resolveEntry(saved.id!);
      const result = await storage.findById(saved.id!);

      // Assert
      expect(result?.resolvedAt).toBeDefined();
    });
  });

  // ============================================================================
  // Tags
  // ============================================================================

  describe('tags', () => {
    it('should add tags to entry', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      await storage.addTags(saved.id!, ['tag1', 'tag2']);
      const result = await storage.findById(saved.id!);

      // Assert - tags are normalized to uppercase
      expect(result?.tags).toContain('TAG1');
      expect(result?.tags).toContain('TAG2');
    });

    it('should remove tags from entry', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(saved.id!, ['tag1', 'tag2', 'tag3']);

      // Act - removeTags normalizes input to uppercase
      await storage.removeTags(saved.id!, ['tag2']);
      const result = await storage.findById(saved.id!);

      // Assert - tags are normalized to uppercase
      expect(result?.tags).toContain('TAG1');
      expect(result?.tags).not.toContain('TAG2');
      expect(result?.tags).toContain('TAG3');
    });

    it('should get tags for entry', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(saved.id!, ['alpha', 'beta']);

      // Act
      const tags = await storage.getEntryTags(saved.id!);

      // Assert - tags are normalized to uppercase
      expect(tags).toContain('ALPHA');
      expect(tags).toContain('BETA');
    });

    it('should get all unique tags with counts', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const entry2 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(entry1.id!, ['common', 'unique1']);
      await storage.addTags(entry2.id!, ['common', 'unique2']);

      // Act
      const allTags = await storage.getAllTags();

      // Assert - tags are normalized to uppercase
      const tagNames = allTags.map((t) => t.tag);
      expect(tagNames).toContain('COMMON');
      expect(tagNames).toContain('UNIQUE1');
      expect(tagNames).toContain('UNIQUE2');
      // 'COMMON' should have count of 2
      const commonTag = allTags.find((t) => t.tag === 'COMMON');
      expect(commonTag?.count).toBe(2);
    });

    it('should find entries by tags', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const entry2 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(entry1.id!, ['important']);
      await storage.addTags(entry2.id!, ['normal']);

      // Act
      const results = await storage.findByTags(['important']);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(entry1.id);
    });
  });

  // ============================================================================
  // Pagination
  // ============================================================================

  describe('pagination', () => {
    it('should get entries with cursor pagination', async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: `/api/${i}`, path: `/api/${i}`, query: {}, params: {}, headers: {}, statusCode: 200, duration: 50 + i, memory: 1024 },
        } as Entry);
      }

      // Act
      const result = await storage.findWithCursor('request', { limit: 5 });

      // Assert
      expect(result.data).toHaveLength(5);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.total).toBe(10);
    });

    it('should get next page with cursor', async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: `/api/${i}`, path: `/api/${i}`, query: {}, params: {}, headers: {}, statusCode: 200, duration: 50 + i, memory: 1024 },
        } as Entry);
      }

      // Act
      const firstPage = await storage.findWithCursor('request', { limit: 5 });
      const secondPage = await storage.findWithCursor('request', {
        limit: 5,
        beforeSequence: firstPage.meta.oldestSequence ?? undefined,
      });

      // Assert
      expect(secondPage.data).toHaveLength(5);
      expect(secondPage.meta.hasMore).toBe(false);
    });
  });

  // ============================================================================
  // getLatestSequence
  // ============================================================================

  describe('getLatestSequence', () => {
    it('should return null for empty database', async () => {
      // Act
      const result = await storage.getLatestSequence();

      // Assert
      expect(result).toBeNull();
    });

    it('should return latest sequence id', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const second = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const result = await storage.getLatestSequence();

      // Assert
      expect(result).toBe(second.id);
    });

    it('should return latest sequence by type', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const query = await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);

      // Act
      const result = await storage.getLatestSequence('query');

      // Assert
      expect(result).toBe(query.id);
    });
  });

  // ============================================================================
  // hasEntriesAfter
  // ============================================================================

  describe('hasEntriesAfter', () => {
    it('should return 0 when no entries after sequence', async () => {
      // Arrange
      const entry = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const result = await storage.hasEntriesAfter(entry.id!);

      // Assert
      expect(result).toBe(0);
    });

    it('should return count of entries after sequence', async () => {
      // Arrange
      const first = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/3', path: '/api/3', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);

      // Act
      const result = await storage.hasEntriesAfter(first.id!);

      // Assert
      expect(result).toBe(2);
    });

    it('should filter by type when counting entries after', async () => {
      // Arrange
      const first = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);
      await storage.save({
        type: 'request',
        payload: { method: 'POST', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 201, duration: 100, memory: 2048 },
      } as Entry);

      // Act
      const result = await storage.hasEntriesAfter(first.id!, 'request');

      // Assert
      expect(result).toBe(1);
    });
  });

  // ============================================================================
  // getStorageStats
  // ============================================================================

  describe('getStorageStats', () => {
    it('should return stats for empty database', async () => {
      // Act
      const result = await storage.getStorageStats();

      // Assert
      expect(result.total).toBe(0);
      expect(result.byType).toEqual({});
      expect(result.oldestEntry).toBeNull();
      expect(result.newestEntry).toBeNull();
    });

    it('should return correct storage stats', async () => {
      // Arrange
      await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);

      // Act
      const result = await storage.getStorageStats();

      // Assert
      expect(result.total).toBe(2);
      expect(result.byType.request).toBe(1);
      expect(result.byType.query).toBe(1);
      expect(result.oldestEntry).toBeDefined();
      expect(result.newestEntry).toBeDefined();
    });
  });

  // ============================================================================
  // Monitored Tags
  // ============================================================================

  describe('monitored tags', () => {
    it('should add monitored tag', async () => {
      // Act
      const result = await storage.addMonitoredTag('important');

      // Assert
      expect(result.id).toBeDefined();
      expect(result.tag).toBe('important');
      expect(result.createdAt).toBeDefined();
    });

    it('should get all monitored tags', async () => {
      // Arrange
      await storage.addMonitoredTag('alpha');
      await storage.addMonitoredTag('beta');

      // Act
      const result = await storage.getMonitoredTags();

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map(t => t.tag)).toContain('alpha');
      expect(result.map(t => t.tag)).toContain('beta');
    });

    it('should remove monitored tag', async () => {
      // Arrange
      await storage.addMonitoredTag('temp');
      await storage.addMonitoredTag('keep');

      // Act
      await storage.removeMonitoredTag('temp');
      const result = await storage.getMonitoredTags();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('keep');
    });

    it('should handle duplicate monitored tags', async () => {
      // Arrange & Act
      await storage.addMonitoredTag('duplicate');
      await storage.addMonitoredTag('duplicate');
      const result = await storage.getMonitoredTags();

      // Assert - should only have one
      expect(result).toHaveLength(1);
    });
  });

  // ============================================================================
  // unresolveEntry
  // ============================================================================

  describe('unresolveEntry', () => {
    it('should unresolve a resolved entry', async () => {
      // Arrange
      const saved = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test', stack: '' },
      } as Entry);
      await storage.resolveEntry(saved.id!);

      // Act
      await storage.unresolveEntry(saved.id!);
      const result = await storage.findById(saved.id!);

      // Assert
      expect(result?.resolvedAt).toBeUndefined();
    });
  });

  // ============================================================================
  // findByFamilyHash
  // ============================================================================

  describe('findByFamilyHash', () => {
    it('should find entries by family hash', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test 1', stack: '' },
      } as Entry);
      const entry2 = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test 2', stack: '' },
      } as Entry);
      await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Different', stack: '' },
      } as Entry);
      await storage.updateFamilyHash(entry1.id!, 'hash-abc');
      await storage.updateFamilyHash(entry2.id!, 'hash-abc');

      // Act
      const result = await storage.findByFamilyHash('hash-abc');

      // Assert
      expect(result).toHaveLength(2);
    });

    it('should return empty array for non-existent hash', async () => {
      // Act
      const result = await storage.findByFamilyHash('non-existent');

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // getGroupedByFamilyHash
  // ============================================================================

  describe('getGroupedByFamilyHash', () => {
    it('should return empty array when no family hashes', async () => {
      // Arrange
      await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test', stack: '' },
      } as Entry);

      // Act
      const result = await storage.getGroupedByFamilyHash();

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should group entries by family hash', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test 1', stack: '' },
      } as Entry);
      const entry2 = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test 2', stack: '' },
      } as Entry);
      const entry3 = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test 3', stack: '' },
      } as Entry);
      await storage.updateFamilyHash(entry1.id!, 'hash-a');
      await storage.updateFamilyHash(entry2.id!, 'hash-a');
      await storage.updateFamilyHash(entry3.id!, 'hash-b');

      // Act
      const result = await storage.getGroupedByFamilyHash();

      // Assert
      expect(result).toHaveLength(2);
      const hashA = result.find(r => r.familyHash === 'hash-a');
      expect(hashA?.count).toBe(2);
      const hashB = result.find(r => r.familyHash === 'hash-b');
      expect(hashB?.count).toBe(1);
    });

    it('should filter by type when grouping', async () => {
      // Arrange
      const exc = await storage.save({
        type: 'exception',
        payload: { name: 'Error', message: 'Test', stack: '' },
      } as Entry);
      const query = await storage.save({
        type: 'query',
        payload: { query: 'SELECT 1', duration: 5, slow: false },
      } as Entry);
      await storage.updateFamilyHash(exc.id!, 'hash-exc');
      await storage.updateFamilyHash(query.id!, 'hash-query');

      // Act
      const result = await storage.getGroupedByFamilyHash('exception');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].familyHash).toBe('hash-exc');
    });
  });

  // ============================================================================
  // findByTags with AND logic
  // ============================================================================

  describe('findByTags advanced', () => {
    it('should return empty array when tags array is empty', async () => {
      // Arrange
      const entry = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api', path: '/api', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(entry.id!, ['tag1']);

      // Act
      const result = await storage.findByTags([]);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should find entries with AND logic (all tags required)', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const entry2 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(entry1.id!, ['red', 'blue', 'green']);
      await storage.addTags(entry2.id!, ['red', 'blue']);

      // Act - find entries with BOTH red and green
      const result = await storage.findByTags(['red', 'green'], 'AND');

      // Assert - only entry1 has both
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(entry1.id);
    });

    it('should find entries with OR logic (any tag)', async () => {
      // Arrange
      const entry1 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/1', path: '/api/1', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      const entry2 = await storage.save({
        type: 'request',
        payload: { method: 'GET', url: '/api/2', path: '/api/2', query: {}, params: {}, headers: {}, statusCode: 200, duration: 50, memory: 1024 },
      } as Entry);
      await storage.addTags(entry1.id!, ['alpha']);
      await storage.addTags(entry2.id!, ['beta']);

      // Act - find entries with alpha OR beta
      const result = await storage.findByTags(['alpha', 'beta'], 'OR');

      // Assert
      expect(result).toHaveLength(2);
    });
  });
});
