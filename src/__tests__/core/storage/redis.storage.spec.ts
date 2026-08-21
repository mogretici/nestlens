/**
 * Redis Storage Tests
 *
 * These tests verify the RedisStorage implementation using mocked Redis operations.
 * Since RedisStorage uses dynamic imports, we test the class by:
 * 1. Creating a testable subclass that allows injecting a mock client
 * 2. Testing all public methods with the mock client
 */

import { Entry, EntryType } from '../../../types';
import { RedisStorageConfig } from '../../../nestlens.config';

// Mock pipeline
const createMockPipeline = () => ({
  hset: jest.fn().mockReturnThis(),
  hget: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  sadd: jest.fn().mockReturnThis(),
  scard: jest.fn().mockReturnThis(),
  hgetall: jest.fn().mockReturnThis(),
  hincrby: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
});

// Mock Redis client factory
const createMockRedisClient = () => {
  const pipeline = createMockPipeline();
  return {
    incr: jest.fn(),
    incrby: jest.fn(),
    exists: jest.fn().mockResolvedValue(1),
    scard: jest.fn(),
    hset: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    hincrby: jest.fn(),
    zadd: jest.fn(),
    zcard: jest.fn(),
    zrange: jest.fn(),
    zrevrange: jest.fn(),
    zrangebyscore: jest.fn(),
    zrevrangebyscore: jest.fn(),
    zrem: jest.fn(),
    zcount: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    sinter: jest.fn(),
    sunion: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    pipeline: jest.fn(() => pipeline),
    _pipeline: pipeline, // expose for test assertions
  };
};

// Import the actual class to access its internals for testing
// We'll use reflection to set the private client
import { RedisStorage } from '../../../core/storage/redis.storage';

/**
 * Helper to create a RedisStorage instance with a mock client
 */
async function createTestStorage(config: RedisStorageConfig = {}) {
  const storage = new RedisStorage({ keyPrefix: 'test:', ...config });
  const mockClient = createMockRedisClient();

  // Use reflection to set the private client
  // This is a test-only pattern to avoid needing ioredis installed
  (storage as unknown as { client: unknown }).client = mockClient;

  return { storage, mockClient, mockPipeline: mockClient._pipeline };
}

describe('RedisStorage', () => {
  // ==================== Helper Functions ====================

  function createEntry(type: EntryType, payload: Record<string, unknown> = {}): Entry {
    return {
      type,
      payload,
      requestId: `req-${Date.now()}`,
    } as Entry;
  }

  function createMockEntryHash(
    id: number,
    type: EntryType,
    payload: Record<string, unknown> = {},
  ): Record<string, string> {
    return {
      id: String(id),
      type,
      requestId: `req-${id}`,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      familyHash: '',
      resolvedAt: '',
    };
  }

  // ==================== Core CRUD Tests ====================

  describe('save', () => {
    it('should save an entry and return it with id and createdAt', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.incr.mockResolvedValue(1);
      const entry = createEntry('request', { method: 'GET', path: '/test' });

      // Act
      const saved = await storage.save(entry);

      // Assert
      expect(saved.id).toBe(1);
      expect(saved.createdAt).toBeDefined();
      expect(saved.type).toBe('request');
      expect(mockClient.hset).toHaveBeenCalled();
      // Indexed by sequence for ordering and paging, and by time for pruning.
      const indexedKeys = mockClient.zadd.mock.calls.map((call: unknown[]) => String(call[0]));
      expect(indexedKeys).toEqual(
        expect.arrayContaining([
          expect.stringContaining('entries:all'),
          expect.stringContaining('entries:type:request'),
          expect.stringContaining('entries:createdAt'),
        ]),
      );

      await storage.close();
    });

    it('should add entry to request index when requestId is provided', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.incr.mockResolvedValue(1);
      const entry = createEntry('request', { method: 'GET' });
      entry.requestId = 'req-123';

      // Act
      await storage.save(entry);

      // Assert
      expect(mockClient.sadd).toHaveBeenCalledWith(expect.stringContaining('request:req-123'), '1');

      await storage.close();
    });

    it('should assign incrementing IDs', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      // Act
      const saved1 = await storage.save(createEntry('request'));
      const saved2 = await storage.save(createEntry('query'));
      const saved3 = await storage.save(createEntry('log'));

      // Assert
      expect(saved1.id).toBe(1);
      expect(saved2.id).toBe(2);
      expect(saved3.id).toBe(3);

      await storage.close();
    });
  });

  describe('saveBatch', () => {
    it('should save multiple entries at once', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.incrby.mockResolvedValue(3);
      const entries = [
        createEntry('request', { path: '/1' }),
        createEntry('request', { path: '/2' }),
        createEntry('request', { path: '/3' }),
      ];

      // Act
      const saved = await storage.saveBatch(entries);

      // Assert
      expect(saved).toHaveLength(3);
      expect(saved[0].id).toBe(1);
      expect(saved[1].id).toBe(2);
      expect(saved[2].id).toBe(3);
      expect(mockPipeline.exec).toHaveBeenCalled();

      await storage.close();
    });

    it('should return empty array for empty input', async () => {
      // Arrange
      const { storage } = await createTestStorage();

      // Act
      const saved = await storage.saveBatch([]);

      // Assert
      expect(saved).toEqual([]);

      await storage.close();
    });
  });

  describe('find', () => {
    it('should find entries by type', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue(['1', '2']);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'request', { path: '/a' })],
        [null, createMockEntryHash(2, 'request', { path: '/b' })],
      ]);
      mockClient.smembers.mockResolvedValue([]); // for tag hydration

      // Act
      const entries = await storage.find({ type: 'request' });

      // Assert
      expect(entries).toHaveLength(2);
      expect(mockClient.zrevrange).toHaveBeenCalledWith(
        expect.stringContaining('type:request'),
        0,
        99,
      );

      await storage.close();
    });

    it('should find entries by requestId', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.smembers.mockResolvedValueOnce(['1']); // for request lookup
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'request', { path: '/test' })],
      ]);
      mockClient.smembers.mockResolvedValue([]); // for tag hydration

      // Act
      const entries = await storage.find({ requestId: 'req-123' });

      // Assert
      expect(entries).toHaveLength(1);

      await storage.close();
    });

    it('should return empty array when no entries found', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue([]);

      // Act
      const entries = await storage.find({ type: 'exception' });

      // Assert
      expect(entries).toEqual([]);

      await storage.close();
    });
  });

  describe('findById', () => {
    it('should find an entry by ID', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.hgetall.mockResolvedValue(createMockEntryHash(1, 'request', { method: 'GET' }));
      mockClient.smembers.mockResolvedValue([]);

      // Act
      const entry = await storage.findById(1);

      // Assert
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe(1);
      expect(entry!.type).toBe('request');

      await storage.close();
    });

    it('should return null for non-existent entry', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.hgetall.mockResolvedValue({});

      // Act
      const entry = await storage.findById(999);

      // Assert
      expect(entry).toBeNull();

      await storage.close();
    });
  });

  describe('count', () => {
    it('should count all entries', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zcard.mockResolvedValue(10);

      // Act
      const count = await storage.count();

      // Assert
      expect(count).toBe(10);
      expect(mockClient.zcard).toHaveBeenCalledWith(expect.stringContaining('entries:all'));

      await storage.close();
    });

    it('should count entries by type', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zcard.mockResolvedValue(5);

      // Act
      const count = await storage.count('query');

      // Assert
      expect(count).toBe(5);
      expect(mockClient.zcard).toHaveBeenCalledWith(expect.stringContaining('type:query'));

      await storage.close();
    });
  });

  describe("count('request')", () => {
    it('leaves GraphQL operations out', async () => {
      // A GraphQL operation reaches the request watcher too, flagged. It
      // belongs to the GraphQL page, and the other two backends have always
      // excluded it here — this one counted it, so the badge above the request
      // list disagreed with the list itself.
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.zrange.mockResolvedValue(['1', '2', '3']);
      mockPipeline.exec.mockResolvedValue([
        [null, JSON.stringify({ method: 'GET' })],
        [null, JSON.stringify({ isGraphQL: true })],
        [null, JSON.stringify({ method: 'POST' })],
      ]);

      expect(await storage.count('request')).toBe(2);

      await storage.close();
    });

    it('counts nothing when there are no requests', async () => {
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrange.mockResolvedValue([]);

      expect(await storage.count('request')).toBe(0);

      await storage.close();
    });
  });

  // ==================== Tag Tests ====================

  describe('addTags', () => {
    it('should add tags to an entry', async () => {
      // Arrange
      const { storage, mockPipeline } = await createTestStorage();

      // Act
      await storage.addTags(1, ['bug', 'urgent']);

      // Assert: the entry's set, the tag's index, and the register of tag
      // names that `getAllTags` measures.
      expect(mockPipeline.sadd).toHaveBeenCalledTimes(6); // 2 tags x 3 sets each
      expect(mockPipeline.exec).toHaveBeenCalled();

      await storage.close();
    });

    it('does not keep a tag for an entry that is not there', async () => {
      // The collector tags an entry just after saving it, and pruning can
      // remove it in between. Nothing to record, and nothing to throw about.
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.exists.mockResolvedValue(0);

      await storage.addTags(999, ['ghost']);

      expect(mockPipeline.sadd).not.toHaveBeenCalled();

      await storage.close();
    });

    it('does not keep a running count beside the sets', async () => {
      // The count used to be maintained here and drifted from the sets on
      // every path. `getAllTags` measures the sets instead.
      const { storage, mockPipeline } = await createTestStorage();

      await storage.addTags(1, ['bug']);

      expect(mockPipeline.hincrby).not.toHaveBeenCalled();

      await storage.close();
    });
  });

  describe('getEntryTags', () => {
    it('should return tags for an entry', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.smembers.mockResolvedValue(['bug', 'urgent']);

      // Act
      const tags = await storage.getEntryTags(1);

      // Assert
      expect(tags).toEqual(['bug', 'urgent']);

      await storage.close();
    });

    it('should return empty array for entry with no tags', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.smembers.mockResolvedValue([]);

      // Act
      const tags = await storage.getEntryTags(1);

      // Assert
      expect(tags).toEqual([]);

      await storage.close();
    });
  });

  describe('getAllTags', () => {
    it('should return all tags with counts', async () => {
      // Arrange: the names in one read, the sizes of their index sets in one
      // pipeline — measured rather than remembered.
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.smembers.mockResolvedValue(['bug', 'feature', 'urgent']);
      mockPipeline.exec.mockResolvedValue([
        [null, 5],
        [null, 3],
        [null, 2],
      ]);

      // Act
      const tags = await storage.getAllTags();

      // Assert
      expect(tags).toHaveLength(3);
      expect(tags[0]).toEqual({ tag: 'bug', count: 5 });
      expect(tags[1]).toEqual({ tag: 'feature', count: 3 });

      await storage.close();
    });

    it('returns nothing when no tag has ever been used', async () => {
      const { storage, mockClient } = await createTestStorage();
      mockClient.smembers.mockResolvedValue([]);

      expect(await storage.getAllTags()).toEqual([]);

      await storage.close();
    });

    it('leaves out a tag no entry carries any more', async () => {
      // The name stays registered after its last entry is pruned; an empty
      // index set is what says it is no longer in use.
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.smembers.mockResolvedValue(['bug', 'deleted']);
      mockPipeline.exec.mockResolvedValue([
        [null, 5],
        [null, 0],
      ]);

      // Act
      const tags = await storage.getAllTags();

      // Assert
      expect(tags).toHaveLength(1);
      expect(tags[0].tag).toBe('bug');

      await storage.close();
    });
  });

  describe('findByTags', () => {
    it('should find entries with OR logic by default', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.sunion.mockResolvedValue(['1', '2']);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'exception', { name: 'Error' })],
        [null, createMockEntryHash(2, 'exception', { name: 'TypeError' })],
      ]);
      mockClient.smembers.mockResolvedValue([]); // for tag hydration

      // Act
      const entries = await storage.findByTags(['bug', 'urgent']);

      // Assert
      expect(mockClient.sunion).toHaveBeenCalled();
      expect(entries).toHaveLength(2);

      await storage.close();
    });

    it('should find entries with AND logic', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.sinter.mockResolvedValue(['1']);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'exception', { name: 'Error' })],
      ]);
      mockClient.smembers.mockResolvedValue([]); // for tag hydration

      // Act
      const entries = await storage.findByTags(['bug', 'urgent'], 'AND');

      // Assert
      expect(mockClient.sinter).toHaveBeenCalled();
      expect(entries).toHaveLength(1);

      await storage.close();
    });

    it('should return empty array for no matching tags', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.sunion.mockResolvedValue([]);

      // Act
      const entries = await storage.findByTags(['nonexistent']);

      // Assert
      expect(entries).toEqual([]);

      await storage.close();
    });
  });

  // ==================== Monitored Tags Tests ====================

  describe('addMonitoredTag', () => {
    it('should add a monitored tag', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.hget.mockResolvedValue(null);
      mockClient.incr.mockResolvedValue(1);

      // Act
      const monitored = await storage.addMonitoredTag('critical');

      // Assert
      expect(monitored.id).toBe(1);
      // Normalised on the way in, like entry tags.
      expect(monitored.tag).toBe('CRITICAL');
      expect(monitored.createdAt).toBeDefined();

      await storage.close();
    });

    it('should return existing monitored tag if already exists', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      const existing = { id: 1, tag: 'critical', createdAt: '2024-01-01T00:00:00Z' };
      mockClient.hget.mockResolvedValue(JSON.stringify(existing));

      // Act
      const monitored = await storage.addMonitoredTag('critical');

      // Assert
      expect(monitored).toEqual(existing);
      expect(mockClient.incr).not.toHaveBeenCalled();

      await storage.close();
    });
  });

  describe('getMonitoredTags', () => {
    it('should return all monitored tags', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.hgetall.mockResolvedValue({
        critical: JSON.stringify({ id: 1, tag: 'critical', createdAt: '2024-01-01T00:00:00Z' }),
        important: JSON.stringify({ id: 2, tag: 'important', createdAt: '2024-01-02T00:00:00Z' }),
      });

      // Act
      const tags = await storage.getMonitoredTags();

      // Assert
      expect(tags).toHaveLength(2);
      expect(tags[0].tag).toBe('critical');
      expect(tags[1].tag).toBe('important');

      await storage.close();
    });
  });

  // ==================== Resolution Tests ====================

  describe('resolveEntry', () => {
    it('should mark an entry as resolved', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();

      // Act
      await storage.resolveEntry(1);

      // Assert
      expect(mockClient.hset).toHaveBeenCalledWith(
        expect.stringContaining('entries:1'),
        'resolvedAt',
        expect.any(String),
      );

      await storage.close();
    });
  });

  describe('unresolveEntry', () => {
    it('should mark an entry as unresolved', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();

      // Act
      await storage.unresolveEntry(1);

      // Assert
      expect(mockClient.hset).toHaveBeenCalledWith(
        expect.stringContaining('entries:1'),
        'resolvedAt',
        '',
      );

      await storage.close();
    });
  });

  // ==================== Family Hash Tests ====================

  describe('updateFamilyHash', () => {
    it('should update family hash and add to index', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();

      // Act
      await storage.updateFamilyHash(1, 'abc123');

      // Assert
      expect(mockClient.hset).toHaveBeenCalledWith(
        expect.stringContaining('entries:1'),
        'familyHash',
        'abc123',
      );
      expect(mockClient.sadd).toHaveBeenCalledWith(expect.stringContaining('family:abc123'), '1');

      await storage.close();
    });
  });

  describe('findByFamilyHash', () => {
    it('should find entries by family hash', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.smembers.mockResolvedValueOnce(['1', '2']); // family lookup
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'exception', { name: 'Error' })],
        [null, createMockEntryHash(2, 'exception', { name: 'Error' })],
      ]);
      mockClient.smembers.mockResolvedValue([]); // tag hydration

      // Act
      const entries = await storage.findByFamilyHash('abc123');

      // Assert
      expect(entries).toHaveLength(2);

      await storage.close();
    });

    it('should return empty array when no entries found', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.smembers.mockResolvedValue([]);

      // Act
      const entries = await storage.findByFamilyHash('nonexistent');

      // Assert
      expect(entries).toEqual([]);

      await storage.close();
    });
  });

  // ==================== Statistics Tests ====================

  describe('getStats', () => {
    it('should return statistics', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zcard
        .mockResolvedValueOnce(10) // request
        .mockResolvedValueOnce(5) // query
        .mockResolvedValueOnce(2) // exception
        .mockResolvedValue(0); // all others

      // Act
      const stats = await storage.getStats();

      // Assert
      expect(stats.total).toBe(17);
      expect(stats.byType.request).toBe(10);
      expect(stats.byType.query).toBe(5);
      expect(stats.byType.exception).toBe(2);

      await storage.close();
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zcard.mockResolvedValue(10);
      mockClient.zrange.mockResolvedValue(['1']);
      mockClient.zrevrange.mockResolvedValue(['10']);
      mockClient.hget
        .mockResolvedValueOnce('2024-01-01T00:00:00Z')
        .mockResolvedValueOnce('2024-01-10T00:00:00Z');

      // Act
      const stats = await storage.getStorageStats();

      // Assert
      expect(stats.oldestEntry).toBe('2024-01-01T00:00:00Z');
      expect(stats.newestEntry).toBe('2024-01-10T00:00:00Z');

      await storage.close();
    });
  });

  // ==================== Pruning Tests ====================

  describe('prune', () => {
    it('should delete entries older than given date', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrangebyscore.mockResolvedValue(['1', '2']);
      mockClient.hgetall.mockResolvedValue(createMockEntryHash(1, 'request', {}));
      mockClient.smembers.mockResolvedValue([]);

      // Act
      const deleted = await storage.prune(new Date('2024-01-01'));

      // Assert
      expect(deleted).toBe(2);
      expect(mockClient.del).toHaveBeenCalled();

      await storage.close();
    });

    it('should return 0 when no entries to prune', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrangebyscore.mockResolvedValue([]);

      // Act
      const deleted = await storage.prune(new Date('2024-01-01'));

      // Assert
      expect(deleted).toBe(0);

      await storage.close();
    });
  });

  // ==================== Clear & Close Tests ====================

  describe('clear', () => {
    it('should delete all NestLens keys', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.keys.mockResolvedValue(['test:entries:1', 'test:entries:2']);

      // Act
      await storage.clear();

      // Assert
      expect(mockClient.del).toHaveBeenCalledWith('test:entries:1', 'test:entries:2');

      await storage.close();
    });

    it('should handle empty storage', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.keys.mockResolvedValue([]);

      // Act
      await storage.clear();

      // Assert
      expect(mockClient.del).not.toHaveBeenCalled();

      await storage.close();
    });
  });

  describe('close', () => {
    it('should close the Redis connection', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();

      // Act
      await storage.close();

      // Assert
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });

  // ==================== Sequence Tests ====================

  describe('getLatestSequence', () => {
    it('should return the latest sequence number', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue(['10']);

      // Act
      const sequence = await storage.getLatestSequence();

      // Assert
      expect(sequence).toBe(10);

      await storage.close();
    });

    it('should return null for empty storage', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue([]);

      // Act
      const sequence = await storage.getLatestSequence();

      // Assert
      expect(sequence).toBeNull();

      await storage.close();
    });
  });

  describe('hasEntriesAfter', () => {
    it('should return count of entries after sequence', async () => {
      // Arrange
      const { storage, mockClient } = await createTestStorage();
      mockClient.zcount.mockResolvedValue(5);

      // Act
      const count = await storage.hasEntriesAfter(10);

      // Assert
      expect(count).toBe(5);
      expect(mockClient.zcount).toHaveBeenCalledWith(
        expect.stringContaining('entries:all'),
        '(10',
        '+inf',
      );

      await storage.close();
    });
  });

  // ==================== Cursor Pagination Tests ====================

  describe('findWithCursor', () => {
    it('should return entries with cursor metadata', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue(['2', '1']);
      mockClient.zcard.mockResolvedValue(2);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(2, 'request', { path: '/b' })],
        [null, createMockEntryHash(1, 'request', { path: '/a' })],
      ]);
      mockClient.smembers.mockResolvedValue([]);

      // Act
      const result = await storage.findWithCursor(undefined, { limit: 10 });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.newestSequence).toBe(2);
      expect(result.meta.oldestSequence).toBe(1);

      await storage.close();
    });

    it('should support beforeSequence pagination', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.zrevrangebyscore.mockResolvedValue(['1']);
      mockClient.zcard.mockResolvedValue(2);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'request', { path: '/a' })],
      ]);
      mockClient.smembers.mockResolvedValue([]);

      // Act
      await storage.findWithCursor(undefined, {
        limit: 10,
        beforeSequence: 2,
      });

      // Assert
      expect(mockClient.zrevrangebyscore).toHaveBeenCalledWith(
        expect.stringContaining('entries:all'),
        '(2',
        '-inf',
        'LIMIT',
        '0',
        '11',
      );

      await storage.close();
    });

    it('should filter by type', async () => {
      // Arrange
      const { storage, mockClient, mockPipeline } = await createTestStorage();
      mockClient.zrevrange.mockResolvedValue(['1']);
      mockClient.zcard.mockResolvedValue(1);
      mockPipeline.exec.mockResolvedValue([
        [null, createMockEntryHash(1, 'query', { sql: 'SELECT 1' })],
      ]);
      mockClient.smembers.mockResolvedValue([]);

      // Act
      await storage.findWithCursor('query', { limit: 10 });

      // Assert
      expect(mockClient.zrevrange).toHaveBeenCalledWith(
        expect.stringContaining('type:query'),
        0,
        10,
      );

      await storage.close();
    });
  });
});

/**
 * Cursor pagination, against sorted sets that behave like Redis.
 *
 * The tests above hand the storage a client made of `jest.fn()`s, which answers
 * whatever the test told it to and records the calls. That is enough to check
 * that a command was issued, and blind to what the command means: for a long
 * time the code asked `zrevrangebyscore` for members scored below an entry's
 * *id* while every member was scored by its *save time*. The call looked right,
 * the assertion passed, and on Redis the dashboard's second page came back
 * empty — every time, for everyone.
 *
 * `ioredis-mock` implements the sorted sets, so these ask for pages and read
 * what comes back.
 */
describe('RedisStorage cursor pagination', () => {
  const seedCount = 5;

  async function createStorageWithRealSortedSets(): Promise<RedisStorage> {
    const RedisMock = (await import('ioredis-mock')).default;
    const storage = new RedisStorage({ keyPrefix: 'pagination-test:' });

    // Instances of the mock share their data, so each test starts by clearing
    // it — otherwise the sequence counter carries over and the ids under test
    // are whatever the previous test left behind.
    const client = new RedisMock();
    await client.flushall();
    (storage as unknown as { client: unknown }).client = client;
    await (storage as unknown as { migrateIndexScores: () => Promise<void> }).migrateIndexScores();

    for (let index = 0; index < seedCount; index++) {
      await storage.save({
        type: 'request',
        payload: {
          method: 'GET',
          url: `/page-${index}`,
          path: `/page-${index}`,
          statusCode: 200,
          duration: 1,
          memory: 1,
        },
      } as Entry);
    }

    return storage;
  }

  /**
   * ioredis connects in the background, so the rescore is the first command
   * anything sends — and the first chance an unreachable Redis has to throw.
   * A monitoring tool does not get to stop the application it is watching from
   * starting, which is what CI caught when this went out without a guard.
   */
  it('starts even when Redis cannot answer', async () => {
    // Arrange
    const storage = new RedisStorage({ keyPrefix: 'unreachable:' });
    const unreachable = {
      get: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    };
    (storage as unknown as { client: unknown }).client = unreachable;
    (storage as unknown as { loadRedisClient: () => Promise<unknown> }).loadRedisClient =
      async () => unreachable;

    // Act & Assert
    await expect(storage.initialize()).resolves.toBeUndefined();
    expect(unreachable.get).toHaveBeenCalled();
  });

  it('walks back through the list one page at a time', async () => {
    // Arrange
    const storage = await createStorageWithRealSortedSets();

    // Act
    const firstPage = await storage.findWithCursor('request', { limit: 2 });
    const secondPage = await storage.findWithCursor('request', {
      limit: 2,
      beforeSequence: firstPage.meta.oldestSequence ?? undefined,
    });

    // Assert - the regression: the second page used to come back empty
    expect(firstPage.data.map((entry) => entry.id)).toEqual([5, 4]);
    expect(secondPage.data.map((entry) => entry.id)).toEqual([3, 2]);
  });

  it('answers "anything newer than this" with only what is newer', async () => {
    // Arrange
    const storage = await createStorageWithRealSortedSets();

    // Act
    const newer = await storage.findWithCursor('request', { limit: 10, afterSequence: 3 });

    // Assert - this used to return the entire set, oldest first
    expect(newer.data.map((entry) => entry.id)).toEqual([5, 4]);
  });

  /**
   * Entries saved inside the same millisecond used to share a score, so an
   * exclusive range around the cursor dropped whichever ones sat on the
   * boundary. Ids are unique, so a page cannot swallow its neighbours.
   */
  it('loses nothing when entries share a timestamp', async () => {
    // Arrange
    const storage = await createStorageWithRealSortedSets();

    // Act - page through the whole list in twos
    const collected: number[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < seedCount; page++) {
      const result = await storage.findWithCursor('request', { limit: 2, beforeSequence: cursor });
      collected.push(...result.data.map((entry) => entry.id as number));
      if (!result.meta.hasMore) break;
      cursor = result.meta.oldestSequence ?? undefined;
    }

    // Assert
    expect(collected).toEqual([5, 4, 3, 2, 1]);
  });

  it('still prunes by age once the index is scored by sequence', async () => {
    // Arrange
    const storage = await createStorageWithRealSortedSets();

    // Act - everything recorded so far is older than a moment from now
    const pruned = await storage.prune(new Date(Date.now() + 1000));

    // Assert
    expect(pruned).toBe(seedCount);
    const remaining = await storage.findWithCursor('request', { limit: 10 });
    expect(remaining.data).toEqual([]);
  });
});
