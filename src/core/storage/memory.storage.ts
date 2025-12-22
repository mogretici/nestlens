import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
  private entries: Map<number, Entry> = new Map();
  private nextId = 1;

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

  async save(entry: Entry): Promise<Entry> {
    const id = this.nextId++;
    const savedEntry: Entry = {
      ...entry,
      id,
      createdAt: new Date().toISOString(),
    };

    this.entries.set(id, savedEntry);
    this.enforceMaxEntries();

    return savedEntry;
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    const savedEntries: Entry[] = [];

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
    }
    if (filter.requestId) {
      results = results.filter((e) => e.requestId === filter.requestId);
    }
    if (filter.from) {
      const fromTime = filter.from.getTime();
      results = results.filter((e) => new Date(e.createdAt!).getTime() >= fromTime);
    }
    if (filter.to) {
      const toTime = filter.to.getTime();
      results = results.filter((e) => new Date(e.createdAt!).getTime() <= toTime);
    }

    // Sort by createdAt DESC (newest first)
    results.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

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
    }

    // Apply cursor pagination
    if (params.beforeSequence !== undefined) {
      results = results.filter((e) => e.id! < params.beforeSequence!);
    }
    if (params.afterSequence !== undefined) {
      results = results.filter((e) => e.id! > params.afterSequence!);
    }

    // Apply advanced filters
    if (params.filters) {
      results = this.applyAdvancedFilters(results, params.filters);
    }

    // Sort
    if (params.afterSequence !== undefined) {
      results.sort((a, b) => a.id! - b.id!);
    } else {
      results.sort((a, b) => b.id! - a.id!);
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
        oldestSequence: hydratedResults.length > 0 ? hydratedResults[hydratedResults.length - 1].id! : null,
        newestSequence: hydratedResults.length > 0 ? hydratedResults[0].id! : null,
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
    return Array.from(this.entries.values()).filter((e) => e.type === type).length;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.entryTags.clear();
    this.tagIndex.clear();
    this.nextId = 1;
    this.logger.log('Storage cleared');
  }

  async close(): Promise<void> {
    this.logger.log('In-memory storage closed');
  }

  // ==================== Statistics ====================

  async getLatestSequence(type?: EntryType): Promise<number | null> {
    const entries = Array.from(this.entries.values()).filter((e) => !type || e.type === type);
    if (entries.length === 0) return null;
    return Math.max(...entries.map((e) => e.id!));
  }

  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> {
    return Array.from(this.entries.values()).filter(
      (e) => e.id! > sequence && (!type || e.type === type),
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

    const sorted = [...entries].sort((a, b) => a.id! - b.id!);

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
      if (new Date(entry.createdAt!).getTime() < beforeTime) {
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
      if (entry.type === type && new Date(entry.createdAt!).getTime() < beforeTime) {
        this.entries.delete(id);
        this.removeEntryTagsInternal(id);
        deleted++;
      }
    }

    return deleted;
  }

  // ==================== Tag Methods ====================

  async addTags(entryId: number, tags: string[]): Promise<void> {
    if (!this.entryTags.has(entryId)) {
      this.entryTags.set(entryId, new Set());
    }
    const entryTagSet = this.entryTags.get(entryId)!;

    for (const tag of tags) {
      entryTagSet.add(tag);

      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(entryId);
    }
  }

  async removeTags(entryId: number, tags: string[]): Promise<void> {
    const entryTagSet = this.entryTags.get(entryId);
    if (!entryTagSet) return;

    for (const tag of tags) {
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

    let matchingIds: Set<number>;

    if (logic === 'OR') {
      matchingIds = new Set();
      for (const tag of tags) {
        const ids = this.tagIndex.get(tag);
        if (ids) {
          for (const id of ids) matchingIds.add(id);
        }
      }
    } else {
      // AND logic - entries must have ALL specified tags
      const tagSets = tags.map((tag) => this.tagIndex.get(tag) || new Set<number>());

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
      .filter((e): e is Entry => e !== undefined)
      .sort((a, b) => b.id! - a.id!)
      .slice(0, limit);

    return this.hydrateEntriesWithTags(entries);
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(tag: string): Promise<MonitoredTag> {
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

  async removeMonitoredTag(tag: string): Promise<void> {
    this.monitoredTags.delete(tag);
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
      .sort((a, b) => b.id! - a.id!)
      .slice(0, limit);

    return this.hydrateEntriesWithTags(entries);
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit = 50,
  ): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]> {
    const groups = new Map<string, Entry[]>();

    for (const entry of this.entries.values()) {
      if (!entry.familyHash) continue;
      if (type && entry.type !== type) continue;

      if (!groups.has(entry.familyHash)) {
        groups.set(entry.familyHash, []);
      }
      groups.get(entry.familyHash)!.push(entry);
    }

    const result: { familyHash: string; count: number; latestEntry: Entry }[] = [];

    for (const [familyHash, entries] of groups) {
      entries.sort((a, b) => b.id! - a.id!);
      const [latestEntry] = this.hydrateEntriesWithTags([entries[0]]);
      result.push({
        familyHash,
        count: entries.length,
        latestEntry,
      });
    }

    return result.sort((a, b) => b.count - a.count || b.latestEntry.id! - a.latestEntry.id!).slice(0, limit);
  }

  // ==================== Lifecycle ====================

  onModuleDestroy(): void {
    // Nothing to clean up for memory storage
  }

  // ==================== Private Helpers ====================

  private hydrateEntriesWithTags(entries: Entry[]): Entry[] {
    return entries.map((entry) => ({
      ...entry,
      tags: Array.from(this.entryTags.get(entry.id!) || []),
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

  private enforceMaxEntries(): void {
    if (this.entries.size > this.maxEntries) {
      // Remove oldest entries (lowest IDs)
      const sorted = Array.from(this.entries.keys()).sort((a, b) => a - b);
      const toRemove = sorted.slice(0, this.entries.size - this.maxEntries);

      for (const id of toRemove) {
        this.entries.delete(id);
        this.removeEntryTagsInternal(id);
      }

      this.logger.debug(`Enforced max entries limit, removed ${toRemove.length} oldest entries`);
    }
  }

  private async countWithFilters(
    type: EntryType | undefined,
    filters: CursorPaginationParams['filters'],
  ): Promise<number> {
    let results = Array.from(this.entries.values());

    if (type) {
      results = results.filter((e) => e.type === type);
    }

    if (filters) {
      results = this.applyAdvancedFilters(results, filters);
    }

    return results.length;
  }

  private applyAdvancedFilters(entries: Entry[], filters: CursorPaginationParams['filters']): Entry[] {
    if (!filters) return entries;

    return entries.filter((entry) => {
      const payload = entry.payload as Record<string, unknown>;

      // Log filters
      if (filters.levels?.length && entry.type === 'log') {
        if (!filters.levels.includes(payload.level as string)) return false;
      }
      if (filters.contexts?.length && entry.type === 'log') {
        if (!filters.contexts.includes(payload.context as string)) return false;
      }

      // Query filters
      if (filters.queryTypes?.length && entry.type === 'query') {
        const query = (payload.query as string) || '';
        if (!filters.queryTypes.some((qt) => query.toUpperCase().startsWith(qt))) return false;
      }
      if (filters.sources?.length) {
        if (!filters.sources.includes(payload.source as string)) return false;
      }
      if (filters.slow !== undefined && entry.type === 'query') {
        if (payload.slow !== filters.slow) return false;
      }

      // Exception filters
      if (filters.names?.length && entry.type === 'exception') {
        const name = payload.name as string;
        if (!filters.names.some((n) => name?.includes(n))) return false;
      }
      if (filters.resolved !== undefined) {
        const isResolved = !!entry.resolvedAt;
        if (isResolved !== filters.resolved) return false;
      }

      // Request filters
      if (filters.methods?.length) {
        const method = (payload.method as string) || (payload.request as { method?: string })?.method;
        if (!method || !filters.methods.includes(method)) return false;
      }
      if (filters.paths?.length) {
        const path = (payload.path as string) || (payload.request as { url?: string })?.url || '';
        if (!filters.paths.some((p) => {
          const pattern = p.replace(/\*/g, '.*');
          return new RegExp(pattern).test(path);
        })) return false;
      }
      if (filters.statuses?.length) {
        const status = payload.statusCode as number | undefined;
        const hasErr = filters.statuses.includes('ERR');
        const numericStatuses = filters.statuses.filter((s): s is number => s !== 'ERR');

        if (status === undefined || status === null) {
          if (!hasErr) return false;
        } else {
          if (!numericStatuses.includes(status)) return false;
        }
      }
      if (filters.hostnames?.length) {
        const host =
          (payload.headers as { host?: string; Host?: string })?.host ||
          (payload.headers as { host?: string; Host?: string })?.Host ||
          (payload.hostname as string);
        if (!host || !filters.hostnames.some((h) => host.includes(h))) return false;
      }
      if (filters.controllers?.length) {
        if (!filters.controllers.includes(payload.controllerAction as string)) return false;
      }
      if (filters.ips?.length) {
        if (!filters.ips.includes(payload.ip as string)) return false;
      }

      // Schedule filters
      if (filters.scheduleStatuses?.length && entry.type === 'schedule') {
        if (!filters.scheduleStatuses.includes(payload.status as string)) return false;
      }

      // Job filters
      if (filters.jobStatuses?.length && entry.type === 'job') {
        if (!filters.jobStatuses.includes(payload.status as string)) return false;
      }
      if (filters.queues?.length && entry.type === 'job') {
        if (!filters.queues.includes(payload.queue as string)) return false;
      }

      // Cache filters
      if (filters.cacheOperations?.length && entry.type === 'cache') {
        if (!filters.cacheOperations.includes(payload.operation as string)) return false;
      }

      // Mail filters
      if (filters.mailStatuses?.length && entry.type === 'mail') {
        if (!filters.mailStatuses.includes(payload.status as string)) return false;
      }

      // Redis filters
      if (filters.redisStatuses?.length && entry.type === 'redis') {
        if (!filters.redisStatuses.includes(payload.status as string)) return false;
      }
      if (filters.redisCommands?.length && entry.type === 'redis') {
        if (!filters.redisCommands.includes(payload.command as string)) return false;
      }

      // Model filters
      if (filters.modelActions?.length && entry.type === 'model') {
        if (!filters.modelActions.includes(payload.action as string)) return false;
      }
      if (filters.entities?.length && entry.type === 'model') {
        if (!filters.entities.includes(payload.entity as string)) return false;
      }
      if (filters.modelSources?.length && entry.type === 'model') {
        if (!filters.modelSources.includes(payload.source as string)) return false;
      }

      // Notification filters
      if (filters.notificationTypes?.length && entry.type === 'notification') {
        if (!filters.notificationTypes.includes(payload.type as string)) return false;
      }
      if (filters.notificationStatuses?.length && entry.type === 'notification') {
        if (!filters.notificationStatuses.includes(payload.status as string)) return false;
      }

      // View filters
      if (filters.viewFormats?.length && entry.type === 'view') {
        if (!filters.viewFormats.includes(payload.format as string)) return false;
      }
      if (filters.viewStatuses?.length && entry.type === 'view') {
        if (!filters.viewStatuses.includes(payload.status as string)) return false;
      }

      // Command filters
      if (filters.commandStatuses?.length && entry.type === 'command') {
        if (!filters.commandStatuses.includes(payload.status as string)) return false;
      }
      if (filters.commandNames?.length && entry.type === 'command') {
        const name = payload.name as string;
        if (!filters.commandNames.some((n) => name?.includes(n))) return false;
      }

      // Gate filters
      if (filters.gateNames?.length && entry.type === 'gate') {
        const gate = payload.gate as string;
        if (!filters.gateNames.some((n) => gate?.includes(n))) return false;
      }
      if (filters.gateResults?.length && entry.type === 'gate') {
        const allowed = payload.allowed as boolean;
        const result = allowed ? 'allowed' : 'denied';
        if (!filters.gateResults.includes(result)) return false;
      }

      // Batch filters
      if (filters.batchStatuses?.length && entry.type === 'batch') {
        if (!filters.batchStatuses.includes(payload.status as string)) return false;
      }
      if (filters.batchOperations?.length && entry.type === 'batch') {
        if (!filters.batchOperations.includes(payload.operation as string)) return false;
      }

      // Dump filters
      if (filters.dumpStatuses?.length && entry.type === 'dump') {
        if (!filters.dumpStatuses.includes(payload.status as string)) return false;
      }
      if (filters.dumpOperations?.length && entry.type === 'dump') {
        if (!filters.dumpOperations.includes(payload.operation as string)) return false;
      }
      if (filters.dumpFormats?.length && entry.type === 'dump') {
        if (!filters.dumpFormats.includes(payload.format as string)) return false;
      }

      // Tag filter
      if (filters.tags?.length) {
        const entryTagSet = this.entryTags.get(entry.id!);
        if (!entryTagSet || !filters.tags.some((t) => entryTagSet.has(t))) return false;
      }

      // Search filter
      if (filters.search) {
        const payloadStr = JSON.stringify(payload).toLowerCase();
        if (!payloadStr.includes(filters.search.toLowerCase())) return false;
      }

      return true;
    });
  }
}
