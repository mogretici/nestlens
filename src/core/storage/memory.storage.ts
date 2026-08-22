import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  Entry,
  StoredEntry,
  EntryFilter,
  EntryStats,
  EntryType,
  CursorPaginationParams,
  CursorPaginatedResponse,
  StorageStats,
  MonitoredTag,
  TagWithCount,
} from '../../types';
import { matchesEntryFilters } from './entry-filter';
import { StorageInterface } from './storage.interface';
import { normalizeTag } from './tag-normalization';
import { MemoryStorageConfig } from '../../nestlens.config';

/**
 * In-memory storage implementation for NestLens.
 * Zero dependencies, works everywhere including Docker.
 * Ideal for testing, development, and containerized environments.
 */
@Injectable()
export class MemoryStorage implements StorageInterface, OnModuleDestroy {
  private readonly logger = new Logger(MemoryStorage.name);

  // Main storage
  private entries: Map<number, StoredEntry> = new Map();
  private nextId = 1;
  /** Lowest id that might still be present; see `enforceMaxEntries`. */
  private oldestId = 1;

  // Tag storage
  private entryTags: Map<number, Set<string>> = new Map(); // entryId -> tags
  private tagIndex: Map<string, Set<number>> = new Map(); // tag -> entryIds

  // Monitored tags
  private monitoredTags: Map<string, MonitoredTag> = new Map();
  private nextMonitoredTagId = 1;

  // Configuration
  private readonly maxEntries: number;

  constructor(config: MemoryStorageConfig = {}) {
    this.maxEntries = config.maxEntries ?? 10000;
  }

  async initialize(): Promise<void> {
    this.logger.log(`In-memory storage initialized (maxEntries: ${this.maxEntries})`);
  }

  // ==================== Core CRUD Operations ====================

  async save(entry: Entry): Promise<StoredEntry> {
    const id = this.nextId++;
    const savedEntry: StoredEntry = {
      ...entry,
      id,
      // What the collector stamped when the thing happened, or now for a
      // caller that supplied nothing. The buffer holds entries for up to a
      // second, so stamping them here recorded the flush rather than the
      // event.
      createdAt: entry.createdAt ?? new Date().toISOString(),
    };

    this.entries.set(id, savedEntry);
    this.enforceMaxEntries();

    return savedEntry;
  }

  async saveBatch(entries: Entry[]): Promise<StoredEntry[]> {
    const savedEntries: StoredEntry[] = [];

    for (const entry of entries) {
      const saved = await this.save(entry);
      savedEntries.push(saved);
    }

    return savedEntries;
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    let results = Array.from(this.entries.values());

    // Apply filters
    if (filter.type) {
      results = results.filter((e) => e.type === filter.type);

      // Exclude GraphQL requests from regular requests list
      // GraphQL requests should only appear in the GraphQL watcher
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (filter.type === 'request') {
        results = results.filter((e) => {
          const isGraphQL = (e.payload as { isGraphQL?: boolean }).isGraphQL;
          return !isGraphQL;
        });
      }
    }
    if (filter.requestId) {
      results = results.filter((e) => e.requestId === filter.requestId);
    }
    if (filter.from) {
      const fromTime = filter.from.getTime();
      results = results.filter((e) => new Date(e.createdAt).getTime() >= fromTime);
    }
    if (filter.to) {
      const toTime = filter.to.getTime();
      results = results.filter((e) => new Date(e.createdAt).getTime() <= toTime);
    }

    // Sort by createdAt DESC (newest first), falling back to id so entries
    // recorded within the same millisecond keep a stable, meaningful order.
    // Without the tie-break, ordering depends on how insertions happen to land
    // across the millisecond boundary, which makes paging skip or repeat rows.
    results.sort((a, b) => {
      const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return byTime !== 0 ? byTime : b.id - a.id;
    });

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    // Hydrate with tags
    return this.hydrateEntriesWithTags(results);
  }

  async findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const limit = params.limit ?? 50;
    let results = Array.from(this.entries.values());

    // Filter by type
    if (type) {
      results = results.filter((e) => e.type === type);

      // Exclude GraphQL requests from regular requests list
      // GraphQL requests should only appear in the GraphQL watcher
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (type === 'request') {
        results = results.filter((e) => {
          const isGraphQL = (e.payload as { isGraphQL?: boolean }).isGraphQL;
          return !isGraphQL;
        });
      }
    }

    // Apply cursor pagination
    if (params.beforeSequence !== undefined) {
      const beforeSequence = params.beforeSequence;
      results = results.filter((e) => e.id < beforeSequence);
    }
    if (params.afterSequence !== undefined) {
      const afterSequence = params.afterSequence;
      results = results.filter((e) => e.id > afterSequence);
    }

    // Hydrate tags before filtering: the tag and search rules read them off the
    // entry, which is also how RedisStorage orders these two steps.
    if (params.filters) {
      results = this.applyAdvancedFilters(this.hydrateEntriesWithTags(results), params.filters);
    }

    // Sort
    if (params.afterSequence !== undefined) {
      results.sort((a, b) => a.id - b.id);
    } else {
      results.sort((a, b) => b.id - a.id);
    }

    // Check for more entries
    const hasMore = results.length > limit;
    results = results.slice(0, limit);

    // Reverse if using afterSequence
    if (params.afterSequence !== undefined) {
      results.reverse();
    }

    // Get total count with filters
    const total = await this.countWithFilters(type, params.filters);

    const hydratedResults = this.hydrateEntriesWithTags(results);

    return {
      data: hydratedResults,
      meta: {
        hasMore,
        oldestSequence:
          hydratedResults.length > 0 ? hydratedResults[hydratedResults.length - 1].id : null,
        newestSequence: hydratedResults.length > 0 ? hydratedResults[0].id : null,
        total,
      },
    };
  }

  async findById(id: number): Promise<Entry | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const [hydrated] = this.hydrateEntriesWithTags([entry]);
    return hydrated;
  }

  async count(type?: EntryType): Promise<number> {
    if (!type) return this.entries.size;

    let results = Array.from(this.entries.values()).filter((e) => e.type === type);

    // Exclude GraphQL requests from regular requests count
    // Uses isGraphQL flag set by request.watcher.ts based on robust detection
    if (type === 'request') {
      results = results.filter((e) => {
        const isGraphQL = (e.payload as { isGraphQL?: boolean }).isGraphQL;
        return !isGraphQL;
      });
    }

    return results.length;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.entryTags.clear();
    this.tagIndex.clear();
    this.nextId = 1;
    this.oldestId = 1;
    this.logger.log('Storage cleared');
  }

  async close(): Promise<void> {
    this.logger.log('In-memory storage closed');
  }

  // ==================== Statistics ====================

  async getLatestSequence(type?: EntryType): Promise<number | null> {
    const entries = Array.from(this.entries.values()).filter((e) => !type || e.type === type);
    if (entries.length === 0) return null;
    return Math.max(...entries.map((e) => e.id));
  }

  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> {
    return Array.from(this.entries.values()).filter(
      (e) => e.id > sequence && (!type || e.type === type),
    ).length;
  }

  async getStats(): Promise<EntryStats> {
    const entries = Array.from(this.entries.values());
    const byType: Record<EntryType, number> = {} as Record<EntryType, number>;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    // Calculate average response time from request entries
    const requests = entries.filter((e) => e.type === 'request');
    const durations = requests
      .map((e) => (e.payload as { duration?: number }).duration)
      .filter((d): d is number => d !== undefined);

    const avgResponseTime =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined;

    // Count slow queries
    const slowQueries = entries.filter(
      (e) => e.type === 'query' && (e.payload as { slow?: boolean }).slow === true,
    ).length;

    // Count unresolved exceptions
    const unresolvedExceptions = entries.filter(
      (e) => e.type === 'exception' && !e.resolvedAt,
    ).length;

    return {
      total: entries.length,
      byType,
      avgResponseTime,
      slowQueries,
      exceptions: byType.exception || 0,
      unresolvedExceptions,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    const entries = Array.from(this.entries.values());
    const byType: Record<EntryType, number> = {} as Record<EntryType, number>;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    const sorted = [...entries].sort((a, b) => a.id - b.id);

    return {
      total: entries.length,
      byType,
      oldestEntry: sorted[0]?.createdAt || null,
      newestEntry: sorted[sorted.length - 1]?.createdAt || null,
      databaseSize: undefined, // Memory storage doesn't have file size
    };
  }

  // ==================== Pruning ====================

  async prune(before: Date): Promise<number> {
    const beforeTime = before.getTime();
    let deleted = 0;

    for (const [id, entry] of this.entries) {
      if (new Date(entry.createdAt).getTime() < beforeTime) {
        this.entries.delete(id);
        this.removeEntryTagsInternal(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      this.logger.log(`Pruned ${deleted} entries older than ${before.toISOString()}`);
    }

    return deleted;
  }

  async pruneByType(type: EntryType, before: Date): Promise<number> {
    const beforeTime = before.getTime();
    let deleted = 0;

    for (const [id, entry] of this.entries) {
      if (entry.type === type && new Date(entry.createdAt).getTime() < beforeTime) {
        this.entries.delete(id);
        this.removeEntryTagsInternal(id);
        deleted++;
      }
    }

    return deleted;
  }

  // ==================== Tag Methods ====================

  async addTags(entryId: number, tags: string[]): Promise<void> {
    // Same rule as the SQLite backend: an entry that is not here cannot be
    // tagged. Storing the tag anyway left it counted by `getAllTags` and
    // returned by `getEntryTags` for an id nothing else knows about, and it
    // would never be cleaned up — `removeEntryTagsInternal` only runs for
    // entries that were evicted, and this one was never there.
    if (!this.entries.has(entryId)) {
      return;
    }

    const entryTagSet = this.entryTags.get(entryId) ?? new Set<string>();
    this.entryTags.set(entryId, entryTagSet);

    for (const rawTag of tags) {
      // Normalize tags to uppercase for consistent storage
      const tag = rawTag.toUpperCase();
      entryTagSet.add(tag);

      const taggedEntries = this.tagIndex.get(tag) ?? new Set<number>();
      taggedEntries.add(entryId);
      this.tagIndex.set(tag, taggedEntries);
    }
  }

  async removeTags(entryId: number, tags: string[]): Promise<void> {
    const entryTagSet = this.entryTags.get(entryId);
    if (!entryTagSet) return;

    for (const rawTag of tags) {
      // Normalize to uppercase for consistent lookup
      const tag = rawTag.toUpperCase();
      entryTagSet.delete(tag);
      this.tagIndex.get(tag)?.delete(entryId);

      // Clean up empty tag index entries
      if (this.tagIndex.get(tag)?.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
  }

  async getEntryTags(entryId: number): Promise<string[]> {
    const tags = this.entryTags.get(entryId);
    return tags ? Array.from(tags).sort() : [];
  }

  async getAllTags(): Promise<TagWithCount[]> {
    const result: TagWithCount[] = [];

    for (const [tag, entryIds] of this.tagIndex) {
      if (entryIds.size > 0) {
        result.push({ tag, count: entryIds.size });
      }
    }

    return result.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async findByTags(tags: string[], logic: 'AND' | 'OR' = 'OR', limit = 50): Promise<Entry[]> {
    if (tags.length === 0) return [];

    // Normalize input tags to uppercase for case-insensitive matching
    const normalizedTags = tags.map((t) => t.toUpperCase());

    let matchingIds: Set<number>;

    if (logic === 'OR') {
      matchingIds = new Set();
      for (const tag of normalizedTags) {
        const ids = this.tagIndex.get(tag);
        if (ids) {
          for (const id of ids) matchingIds.add(id);
        }
      }
    } else {
      // AND logic - entries must have ALL specified tags
      const tagSets = normalizedTags.map((tag) => this.tagIndex.get(tag) ?? new Set<number>());

      if (tagSets.length === 0 || tagSets.some((set) => set.size === 0)) {
        return [];
      }

      matchingIds = new Set(tagSets[0]);
      for (let i = 1; i < tagSets.length; i++) {
        matchingIds = new Set([...matchingIds].filter((id) => tagSets[i].has(id)));
      }
    }

    const entries = Array.from(matchingIds)
      .map((id) => this.entries.get(id))
      .filter((e): e is StoredEntry => e !== undefined)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);

    return this.hydrateEntriesWithTags(entries);
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(rawTag: string): Promise<MonitoredTag> {
    const tag = normalizeTag(rawTag);
    const existing = this.monitoredTags.get(tag);
    if (existing) {
      return existing;
    }

    const monitored: MonitoredTag = {
      id: this.nextMonitoredTagId++,
      tag,
      createdAt: new Date().toISOString(),
    };

    this.monitoredTags.set(tag, monitored);
    return monitored;
  }

  async removeMonitoredTag(rawTag: string): Promise<void> {
    this.monitoredTags.delete(normalizeTag(rawTag));
  }

  async getMonitoredTags(): Promise<MonitoredTag[]> {
    return Array.from(this.monitoredTags.values()).sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // ==================== Resolution ====================

  async resolveEntry(id: number): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.resolvedAt = new Date().toISOString();
    }
  }

  async unresolveEntry(id: number): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.resolvedAt = undefined;
    }
  }

  // ==================== Family Hash ====================

  async updateFamilyHash(id: number, familyHash: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.familyHash = familyHash;
    }
  }

  async findByFamilyHash(familyHash: string, limit = 50): Promise<Entry[]> {
    const entries = Array.from(this.entries.values())
      .filter((e) => e.familyHash === familyHash)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);

    return this.hydrateEntriesWithTags(entries);
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit = 50,
  ): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]> {
    const groups = new Map<string, StoredEntry[]>();

    for (const entry of this.entries.values()) {
      if (!entry.familyHash) continue;
      if (type && entry.type !== type) continue;

      const group = groups.get(entry.familyHash) ?? [];
      group.push(entry);
      groups.set(entry.familyHash, group);
    }

    const result: { familyHash: string; count: number; latestEntry: StoredEntry }[] = [];

    for (const [familyHash, entries] of groups) {
      entries.sort((a, b) => b.id - a.id);
      const [latestEntry] = this.hydrateEntriesWithTags([entries[0]]);
      result.push({
        familyHash,
        count: entries.length,
        latestEntry,
      });
    }

    return result
      .sort((a, b) => b.count - a.count || b.latestEntry.id - a.latestEntry.id)
      .slice(0, limit);
  }

  // ==================== Lifecycle ====================

  onModuleDestroy(): void {
    // Nothing to clean up for memory storage
  }

  // ==================== Private Helpers ====================

  private hydrateEntriesWithTags(entries: StoredEntry[]): StoredEntry[] {
    return entries.map((entry) => ({
      ...entry,
      tags: Array.from(this.entryTags.get(entry.id) ?? []),
    }));
  }

  private removeEntryTagsInternal(entryId: number): void {
    const tags = this.entryTags.get(entryId);
    if (tags) {
      for (const tag of tags) {
        this.tagIndex.get(tag)?.delete(entryId);
        if (this.tagIndex.get(tag)?.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
      this.entryTags.delete(entryId);
    }
  }

  /**
   * Drops the oldest entries once the cap is passed.
   *
   * Ids are allocated in order by `save()`, the only thing that inserts, so the
   * lowest surviving id is the oldest entry. `oldestId` walks forward over the
   * ones already gone and never goes back, which makes eviction amortised O(1)
   * and — measured — free: a capped map costs the same to fill as an uncapped
   * one.
   *
   * Two versions of this were wrong before, both of them quietly:
   *
   * - it copied every key into an array and sorted it, on every save once the
   *   cap was reached, which is the steady state of a capped storage. 32% of
   *   the whole process's CPU under load, more than the request handling it
   *   was recording.
   * - then it took the front of the map with `keys().next()`, which reads
   *   correct and is not. V8 leaves a tombstone behind a deleted entry and a
   *   fresh iterator walks them all before reaching a live one, so the cost
   *   grew with everything ever evicted: 1,566ms against 16ms for the same
   *   200,000 inserts, and the profile still put it at the top.
   *
   * `entryTags` is keyed by the same ids and is cleaned alongside, so the two
   * cannot drift.
   */
  private enforceMaxEntries(): void {
    while (this.entries.size > this.maxEntries) {
      while (this.oldestId < this.nextId && !this.entries.has(this.oldestId)) {
        this.oldestId += 1;
      }

      // Nothing left to evict that this counter knows about — only reachable
      // if ids were removed some other way, and better than spinning.
      if (this.oldestId >= this.nextId) return;

      this.entries.delete(this.oldestId);
      this.removeEntryTagsInternal(this.oldestId);
      this.oldestId += 1;
    }
  }

  private async countWithFilters(
    type: EntryType | undefined,
    filters: CursorPaginationParams['filters'],
  ): Promise<number> {
    let results = Array.from(this.entries.values());

    if (type) {
      results = results.filter((e) => e.type === type);

      // Exclude GraphQL requests from regular requests count
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (type === 'request') {
        results = results.filter((e) => {
          const isGraphQL = (e.payload as { isGraphQL?: boolean }).isGraphQL;
          return !isGraphQL;
        });
      }
    }

    if (filters) {
      results = this.applyAdvancedFilters(results, filters);
    }

    return results.length;
  }

  private applyAdvancedFilters(
    entries: StoredEntry[],
    filters: CursorPaginationParams['filters'],
  ): StoredEntry[] {
    return entries.filter((entry) => matchesEntryFilters(entry, filters));
  }
}
