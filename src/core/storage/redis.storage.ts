import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis, ChainableCommander } from 'ioredis';
import {
  Entry,
  EntryFilter,
  EntryStats,
  EntryType,
  CursorPaginationParams,
  CursorPaginatedResponse,
  StorageStats,
  MonitoredTag,
  TagWithCount,
} from '../../types';
import { StorageInterface } from './storage.interface';
import { RedisStorageConfig } from '../../nestlens.config';

/**
 * Redis storage implementation for NestLens.
 * Requires ioredis to be installed.
 * Ideal for production environments with horizontal scaling.
 *
 * Redis Key Structure:
 * - {prefix}entries:{id} - Hash storing entry data
 * - {prefix}entries:all - Sorted set of all entry IDs (score = timestamp)
 * - {prefix}entries:type:{type} - Sorted set of entry IDs by type
 * - {prefix}entries:request:{requestId} - Set of entry IDs for a request
 * - {prefix}entries:sequence - Counter for entry IDs
 * - {prefix}tags:{entryId} - Set of tags for an entry
 * - {prefix}tags:index:{tag} - Set of entry IDs with this tag
 * - {prefix}tags:counts - Hash of tag -> count
 * - {prefix}monitored - Hash of monitored tags
 * - {prefix}monitored:sequence - Counter for monitored tag IDs
 * - {prefix}family:{hash} - Set of entry IDs with this family hash
 */
@Injectable()
export class RedisStorage implements StorageInterface, OnModuleDestroy {
  private readonly logger = new Logger(RedisStorage.name);
  private client: Redis | null = null;
  private readonly keyPrefix: string;
  private readonly config: RedisStorageConfig;

  constructor(config: RedisStorageConfig = {}) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'nestlens:';
  }

  /**
   * Builds a Redis key with the configured prefix
   */
  private key(...parts: string[]): string {
    return this.keyPrefix + parts.join(':');
  }

  /**
   * Lazily loads ioredis and creates a client
   */
  private async loadRedisClient(): Promise<Redis> {
    try {
      // Dynamic import - ioredis is an optional peer dependency
      const { default: RedisClient } = await import('ioredis');

      if (this.config.url) {
        return new RedisClient(this.config.url);
      }

      return new RedisClient({
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 6379,
        password: this.config.password,
        db: this.config.db ?? 0,
      });
    } catch (error) {
      throw new Error(
        'ioredis is required for Redis storage. Install it with: npm install ioredis',
      );
    }
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  async initialize(): Promise<void> {
    this.client = await this.loadRedisClient();
    this.logger.log('Redis storage initialized');
  }

  // ==================== Core CRUD Operations ====================

  async save(entry: Entry): Promise<Entry> {
    const client = this.getClient();

    const id = await client.incr(this.key('entries', 'sequence'));
    const createdAt = new Date().toISOString();
    const timestamp = Date.now();

    const savedEntry: Entry = {
      ...entry,
      id,
      createdAt,
    };

    // Store entry as hash
    await client.hset(
      this.key('entries', String(id)),
      'id', String(id),
      'type', entry.type,
      'requestId', entry.requestId ?? '',
      'payload', JSON.stringify(entry.payload),
      'createdAt', createdAt,
      'familyHash', entry.familyHash ?? '',
      'resolvedAt', entry.resolvedAt ?? '',
    );

    // Add to sorted sets for indexing
    await client.zadd(this.key('entries', 'all'), timestamp, String(id));
    await client.zadd(this.key('entries', 'type', entry.type), timestamp, String(id));

    // Add to request index if applicable
    if (entry.requestId) {
      await client.sadd(this.key('entries', 'request', entry.requestId), String(id));
    }

    return savedEntry;
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    if (entries.length === 0) return [];

    const client = this.getClient();
    const pipeline = client.pipeline();
    const results: Entry[] = [];

    // Pre-fetch IDs
    const startId = await client.incrby(this.key('entries', 'sequence'), entries.length);
    const timestamp = Date.now();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const id = startId - entries.length + 1 + i;
      const createdAt = new Date().toISOString();

      const savedEntry: Entry = { ...entry, id, createdAt };
      results.push(savedEntry);

      pipeline.hset(
        this.key('entries', String(id)),
        'id', String(id),
        'type', entry.type,
        'requestId', entry.requestId ?? '',
        'payload', JSON.stringify(entry.payload),
        'createdAt', createdAt,
        'familyHash', entry.familyHash ?? '',
        'resolvedAt', entry.resolvedAt ?? '',
      );

      pipeline.zadd(this.key('entries', 'all'), timestamp + i, String(id));
      pipeline.zadd(this.key('entries', 'type', entry.type), timestamp + i, String(id));

      if (entry.requestId) {
        pipeline.sadd(this.key('entries', 'request', entry.requestId), String(id));
      }
    }

    await pipeline.exec();
    return results;
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    const client = this.getClient();

    let ids: string[];

    if (filter.requestId) {
      ids = await client.smembers(this.key('entries', 'request', filter.requestId));
    } else if (filter.type) {
      const start = filter.offset ?? 0;
      const end = start + (filter.limit ?? 100) - 1;
      ids = await client.zrevrange(this.key('entries', 'type', filter.type), start, end);
    } else {
      const start = filter.offset ?? 0;
      const end = start + (filter.limit ?? 100) - 1;
      ids = await client.zrevrange(this.key('entries', 'all'), start, end);
    }

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids);

    // Apply date filters
    let filtered = entries;
    if (filter.from) {
      const fromTime = filter.from.getTime();
      filtered = filtered.filter((e) => new Date(e.createdAt!).getTime() >= fromTime);
    }
    if (filter.to) {
      const toTime = filter.to.getTime();
      filtered = filtered.filter((e) => new Date(e.createdAt!).getTime() <= toTime);
    }

    return this.hydrateEntriesWithTags(filtered);
  }

  async findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const client = this.getClient();
    const limit = params.limit ?? 50;

    const indexKey = type ? this.key('entries', 'type', type) : this.key('entries', 'all');

    let ids: string[];

    if (params.beforeSequence !== undefined) {
      ids = await client.zrevrangebyscore(
        indexKey,
        `(${params.beforeSequence}`,
        '-inf',
        'LIMIT', '0', String(limit + 1),
      );
    } else if (params.afterSequence !== undefined) {
      ids = await client.zrangebyscore(
        indexKey,
        `(${params.afterSequence}`,
        '+inf',
        'LIMIT', '0', String(limit + 1),
      );
    } else {
      ids = await client.zrevrange(indexKey, 0, limit);
    }

    const hasMore = ids.length > limit;
    if (hasMore) ids = ids.slice(0, limit);

    if (params.afterSequence !== undefined) {
      ids.reverse();
    }

    let entries = await this.fetchEntriesByIds(ids);

    // Apply advanced filters
    if (params.filters) {
      entries = this.applyAdvancedFilters(entries, params.filters);
    }

    const hydratedEntries = await this.hydrateEntriesWithTags(entries);
    const total = await client.zcard(indexKey);

    return {
      data: hydratedEntries,
      meta: {
        hasMore,
        oldestSequence: hydratedEntries.length > 0 ? hydratedEntries[hydratedEntries.length - 1].id! : null,
        newestSequence: hydratedEntries.length > 0 ? hydratedEntries[0].id! : null,
        total,
      },
    };
  }

  async findById(id: number): Promise<Entry | null> {
    const client = this.getClient();
    const hash = await client.hgetall(this.key('entries', String(id)));

    if (!hash || !hash.id) return null;

    const entry = this.hashToEntry(hash);
    if (!entry) return null;

    const [hydrated] = await this.hydrateEntriesWithTags([entry]);
    return hydrated;
  }

  async count(type?: EntryType): Promise<number> {
    const client = this.getClient();
    const key = type ? this.key('entries', 'type', type) : this.key('entries', 'all');
    return client.zcard(key);
  }

  async clear(): Promise<void> {
    const client = this.getClient();
    const keys = await client.keys(this.keyPrefix + '*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    this.logger.log('Storage cleared');
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.logger.log('Redis storage closed');
  }

  // ==================== Statistics ====================

  async getLatestSequence(type?: EntryType): Promise<number | null> {
    const client = this.getClient();
    const key = type ? this.key('entries', 'type', type) : this.key('entries', 'all');

    const result = await client.zrevrange(key, 0, 0);
    return result.length > 0 ? parseInt(result[0], 10) : null;
  }

  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> {
    const client = this.getClient();
    const key = type ? this.key('entries', 'type', type) : this.key('entries', 'all');
    return client.zcount(key, `(${sequence}`, '+inf');
  }

  async getStats(): Promise<EntryStats> {
    const client = this.getClient();

    // Get counts by type
    const types: EntryType[] = [
      'request', 'query', 'exception', 'log', 'cache', 'event', 'job',
      'schedule', 'mail', 'http-client', 'redis', 'model', 'notification',
      'view', 'command', 'gate', 'batch', 'dump',
    ];

    const byType: Record<EntryType, number> = {} as Record<EntryType, number>;
    let total = 0;

    for (const type of types) {
      const count = await client.zcard(this.key('entries', 'type', type));
      if (count > 0) {
        byType[type] = count;
        total += count;
      }
    }

    // For avgResponseTime and slowQueries, we'd need to iterate over entries
    // which is expensive in Redis. Return undefined for now.

    return {
      total,
      byType,
      avgResponseTime: undefined,
      slowQueries: 0,
      exceptions: byType.exception || 0,
      unresolvedExceptions: 0,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    const client = this.getClient();

    const types: EntryType[] = [
      'request', 'query', 'exception', 'log', 'cache', 'event', 'job',
      'schedule', 'mail', 'http-client', 'redis', 'model', 'notification',
      'view', 'command', 'gate', 'batch', 'dump',
    ];

    const byType: Record<EntryType, number> = {} as Record<EntryType, number>;
    let total = 0;

    for (const type of types) {
      const count = await client.zcard(this.key('entries', 'type', type));
      if (count > 0) {
        byType[type] = count;
        total += count;
      }
    }

    // Get oldest and newest entries
    const oldest = await client.zrange(this.key('entries', 'all'), 0, 0);
    const newest = await client.zrevrange(this.key('entries', 'all'), 0, 0);

    let oldestEntry: string | null = null;
    let newestEntry: string | null = null;

    if (oldest.length > 0) {
      const hash = await client.hget(this.key('entries', oldest[0]), 'createdAt');
      oldestEntry = hash ?? null;
    }
    if (newest.length > 0) {
      const hash = await client.hget(this.key('entries', newest[0]), 'createdAt');
      newestEntry = hash ?? null;
    }

    return {
      total,
      byType,
      oldestEntry,
      newestEntry,
      databaseSize: undefined, // Redis doesn't expose this easily
    };
  }

  // ==================== Pruning ====================

  async prune(before: Date): Promise<number> {
    const client = this.getClient();
    const maxScore = before.getTime();

    const ids = await client.zrangebyscore(this.key('entries', 'all'), '-inf', maxScore);
    if (ids.length === 0) return 0;

    for (const id of ids) {
      await this.deleteEntry(parseInt(id, 10));
    }

    this.logger.log(`Pruned ${ids.length} entries older than ${before.toISOString()}`);
    return ids.length;
  }

  async pruneByType(type: EntryType, before: Date): Promise<number> {
    const client = this.getClient();
    const maxScore = before.getTime();

    const ids = await client.zrangebyscore(
      this.key('entries', 'type', type),
      '-inf',
      maxScore,
    );

    if (ids.length === 0) return 0;

    for (const id of ids) {
      await this.deleteEntry(parseInt(id, 10));
    }

    return ids.length;
  }

  // ==================== Tag Methods ====================

  async addTags(entryId: number, tags: string[]): Promise<void> {
    const client = this.getClient();
    const pipeline = client.pipeline();

    for (const tag of tags) {
      pipeline.sadd(this.key('tags', String(entryId)), tag);
      pipeline.sadd(this.key('tags', 'index', tag), String(entryId));
      pipeline.hincrby(this.key('tags', 'counts'), tag, 1);
    }

    await pipeline.exec();
  }

  async removeTags(entryId: number, tags: string[]): Promise<void> {
    const client = this.getClient();

    for (const tag of tags) {
      await client.srem(this.key('tags', String(entryId)), tag);
      await client.srem(this.key('tags', 'index', tag), String(entryId));
      await client.hincrby(this.key('tags', 'counts'), tag, -1);
    }
  }

  async getEntryTags(entryId: number): Promise<string[]> {
    const client = this.getClient();
    const tags = await client.smembers(this.key('tags', String(entryId)));
    return tags.sort();
  }

  async getAllTags(): Promise<TagWithCount[]> {
    const client = this.getClient();
    const counts = await client.hgetall(this.key('tags', 'counts'));

    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count: parseInt(count, 10) }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async findByTags(tags: string[], logic: 'AND' | 'OR' = 'OR', limit = 50): Promise<Entry[]> {
    if (tags.length === 0) return [];

    const client = this.getClient();
    const tagKeys = tags.map((t) => this.key('tags', 'index', t));

    let ids: string[];
    if (logic === 'AND') {
      ids = await client.sinter(...tagKeys);
    } else {
      ids = await client.sunion(...tagKeys);
    }

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids.slice(0, limit));
    const sorted = entries.sort((a, b) => b.id! - a.id!);
    return this.hydrateEntriesWithTags(sorted);
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(tag: string): Promise<MonitoredTag> {
    const client = this.getClient();
    const existing = await client.hget(this.key('monitored'), tag);

    if (existing) {
      return JSON.parse(existing);
    }

    const id = await client.incr(this.key('monitored', 'sequence'));
    const monitored: MonitoredTag = {
      id,
      tag,
      createdAt: new Date().toISOString(),
    };

    await client.hset(this.key('monitored'), tag, JSON.stringify(monitored));
    return monitored;
  }

  async removeMonitoredTag(tag: string): Promise<void> {
    const client = this.getClient();
    await client.hdel(this.key('monitored'), tag);
  }

  async getMonitoredTags(): Promise<MonitoredTag[]> {
    const client = this.getClient();
    const all = await client.hgetall(this.key('monitored'));

    return Object.values(all)
      .filter((v) => v && v !== '')
      .map((v) => JSON.parse(v) as MonitoredTag)
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // ==================== Resolution ====================

  async resolveEntry(id: number): Promise<void> {
    const client = this.getClient();
    await client.hset(
      this.key('entries', String(id)),
      'resolvedAt',
      new Date().toISOString(),
    );
  }

  async unresolveEntry(id: number): Promise<void> {
    const client = this.getClient();
    await client.hset(this.key('entries', String(id)), 'resolvedAt', '');
  }

  // ==================== Family Hash ====================

  async updateFamilyHash(id: number, familyHash: string): Promise<void> {
    const client = this.getClient();
    await client.hset(this.key('entries', String(id)), 'familyHash', familyHash);
    await client.sadd(this.key('family', familyHash), String(id));
  }

  async findByFamilyHash(familyHash: string, limit = 50): Promise<Entry[]> {
    const client = this.getClient();
    const ids = await client.smembers(this.key('family', familyHash));

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids);
    const sorted = entries.sort((a, b) => b.id! - a.id!).slice(0, limit);
    return this.hydrateEntriesWithTags(sorted);
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit = 50,
  ): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]> {
    const client = this.getClient();

    // Get all family hash keys
    const familyKeys = await client.keys(this.key('family', '*'));
    const groups: { familyHash: string; count: number; latestEntry: Entry }[] = [];

    for (const key of familyKeys) {
      const familyHash = key.replace(this.key('family', ''), '');
      const ids = await client.smembers(key);

      if (ids.length === 0) continue;

      // Get entries for this family
      const entries = await this.fetchEntriesByIds(ids);
      const filtered = type ? entries.filter((e) => e.type === type) : entries;

      if (filtered.length === 0) continue;

      // Sort and get latest
      filtered.sort((a, b) => b.id! - a.id!);
      const [latestEntry] = await this.hydrateEntriesWithTags([filtered[0]]);

      groups.push({
        familyHash,
        count: filtered.length,
        latestEntry,
      });
    }

    return groups
      .sort((a, b) => b.count - a.count || b.latestEntry.id! - a.latestEntry.id!)
      .slice(0, limit);
  }

  // ==================== Lifecycle ====================

  onModuleDestroy(): void {
    this.close().catch((err) => {
      this.logger.error('Error closing Redis connection', err);
    });
  }

  // ==================== Private Helpers ====================

  private async fetchEntriesByIds(ids: string[]): Promise<Entry[]> {
    if (ids.length === 0) return [];

    const client = this.getClient();
    const pipeline = client.pipeline();

    for (const id of ids) {
      pipeline.hgetall(this.key('entries', id));
    }

    const results = await pipeline.exec();
    const entries: Entry[] = [];

    for (const [err, data] of results ?? []) {
      if (err || !data || typeof data !== 'object') continue;
      const hash = data as Record<string, string>;
      if (!hash.id) continue;

      const entry = this.hashToEntry(hash);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private hashToEntry(hash: Record<string, string>): Entry | null {
    try {
      return {
        id: parseInt(hash.id, 10),
        type: hash.type as EntryType,
        requestId: hash.requestId || undefined,
        payload: JSON.parse(hash.payload || '{}'),
        createdAt: hash.createdAt,
        familyHash: hash.familyHash || undefined,
        resolvedAt: hash.resolvedAt || undefined,
      } as Entry;
    } catch {
      return null;
    }
  }

  private async hydrateEntriesWithTags(entries: Entry[]): Promise<Entry[]> {
    const client = this.getClient();
    const result: Entry[] = [];

    for (const entry of entries) {
      const tags = await client.smembers(this.key('tags', String(entry.id)));
      result.push({ ...entry, tags: tags.sort() });
    }

    return result;
  }

  private async deleteEntry(id: number): Promise<void> {
    const client = this.getClient();

    // Get entry to find its type
    const hash = await client.hgetall(this.key('entries', String(id)));
    if (!hash || !hash.type) return;

    // Remove from indexes
    await client.del(this.key('entries', String(id)));
    await client.zrem(this.key('entries', 'all'), String(id));
    await client.zrem(this.key('entries', 'type', hash.type), String(id));

    if (hash.requestId) {
      await client.srem(this.key('entries', 'request', hash.requestId), String(id));
    }

    if (hash.familyHash) {
      await client.srem(this.key('family', hash.familyHash), String(id));
    }

    // Remove tags
    const tags = await client.smembers(this.key('tags', String(id)));
    for (const tag of tags) {
      await client.srem(this.key('tags', 'index', tag), String(id));
      await client.hincrby(this.key('tags', 'counts'), tag, -1);
    }
    await client.del(this.key('tags', String(id)));
  }

  private applyAdvancedFilters(
    entries: Entry[],
    filters: CursorPaginationParams['filters'],
  ): Entry[] {
    if (!filters) return entries;

    return entries.filter((entry) => {
      const payload = entry.payload as Record<string, unknown>;

      // Apply the same filter logic as MemoryStorage
      if (filters.levels?.length && entry.type === 'log') {
        if (!filters.levels.includes(payload.level as string)) return false;
      }
      if (filters.search) {
        const payloadStr = JSON.stringify(payload).toLowerCase();
        if (!payloadStr.includes(filters.search.toLowerCase())) return false;
      }
      if (filters.resolved !== undefined) {
        const isResolved = !!entry.resolvedAt;
        if (isResolved !== filters.resolved) return false;
      }

      // Additional filters can be added as needed
      return true;
    });
  }
}
