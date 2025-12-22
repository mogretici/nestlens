import {
  Entry,
  EntryFilter,
  EntryStats,
  EntryType,
  CursorPaginationParams,
  CursorPaginatedResponse,
  StorageStats,
  Tag,
  MonitoredTag,
  TagWithCount,
} from '../../types';

export interface StorageInterface {
  /**
   * Initialize the storage (create tables, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Save an entry to storage
   */
  save(entry: Entry): Promise<Entry>;

  /**
   * Save multiple entries at once
   * Returns the saved entries with IDs
   */
  saveBatch(entries: Entry[]): Promise<Entry[]>;

  /**
   * Find entries by filter
   */
  find(filter: EntryFilter): Promise<Entry[]>;

  /**
   * Find entries with cursor-based pagination
   */
  findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>>;

  /**
   * Find a single entry by ID
   */
  findById(id: number): Promise<Entry | null>;

  /**
   * Get entries count by type
   */
  count(type?: EntryType): Promise<number>;

  /**
   * Get the latest entry sequence (ID)
   */
  getLatestSequence(type?: EntryType): Promise<number | null>;

  /**
   * Check if there are entries after a given sequence
   */
  hasEntriesAfter(sequence: number, type?: EntryType): Promise<number>;

  /**
   * Get statistics
   */
  getStats(): Promise<EntryStats>;

  /**
   * Get storage statistics including size info
   */
  getStorageStats(): Promise<StorageStats>;

  /**
   * Delete entries older than given date
   */
  prune(before: Date): Promise<number>;

  /**
   * Delete entries older than given date for a specific type
   */
  pruneByType(type: EntryType, before: Date): Promise<number>;

  /**
   * Delete all entries
   */
  clear(): Promise<void>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;

  // ==================== Tag Methods ====================

  /**
   * Add tags to an entry
   */
  addTags(entryId: number, tags: string[]): Promise<void>;

  /**
   * Remove tags from an entry
   */
  removeTags(entryId: number, tags: string[]): Promise<void>;

  /**
   * Get tags for an entry
   */
  getEntryTags(entryId: number): Promise<string[]>;

  /**
   * Get all tags with their counts
   */
  getAllTags(): Promise<TagWithCount[]>;

  /**
   * Find entries by tags
   */
  findByTags(tags: string[], logic?: 'AND' | 'OR', limit?: number): Promise<Entry[]>;

  // ==================== Monitored Tags ====================

  /**
   * Add a monitored tag
   */
  addMonitoredTag(tag: string): Promise<MonitoredTag>;

  /**
   * Remove a monitored tag
   */
  removeMonitoredTag(tag: string): Promise<void>;

  /**
   * Get all monitored tags
   */
  getMonitoredTags(): Promise<MonitoredTag[]>;

  // ==================== Resolution ====================

  /**
   * Mark an entry as resolved
   */
  resolveEntry(id: number): Promise<void>;

  /**
   * Mark an entry as unresolved
   */
  unresolveEntry(id: number): Promise<void>;

  // ==================== Family Hash ====================

  /**
   * Update family hash for an entry
   */
  updateFamilyHash(id: number, familyHash: string): Promise<void>;

  /**
   * Find entries by family hash
   */
  findByFamilyHash(familyHash: string, limit?: number): Promise<Entry[]>;

  /**
   * Get grouped entries by family hash
   */
  getGroupedByFamilyHash(type?: EntryType, limit?: number): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]>;
}

export const STORAGE = Symbol('STORAGE');
