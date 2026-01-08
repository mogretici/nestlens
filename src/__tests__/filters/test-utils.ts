import { SqliteStorage } from '../../core/storage/sqlite.storage';
import { Entry, EntryType, CursorPaginationParams } from '../../types';

/**
 * Creates an in-memory SQLite storage for testing
 */
export function createTestStorage(): SqliteStorage {
  return new SqliteStorage(':memory:');
}

/**
 * Seeds the storage with test entries
 */
export async function seedStorage(storage: SqliteStorage, entries: Entry[]): Promise<Entry[]> {
  const savedEntries: Entry[] = [];
  for (const entry of entries) {
    const saved = await storage.save(entry);
    savedEntries.push(saved);
  }
  return savedEntries;
}

/**
 * Asserts that a filter returns the expected entries
 */
export async function assertFilterReturns(
  storage: SqliteStorage,
  type: EntryType | undefined,
  filters: CursorPaginationParams['filters'],
  expectedCount: number,
): Promise<Entry[]> {
  const result = await storage.findWithCursor(type, { filters });
  expect(result.data).toHaveLength(expectedCount);
  return result.data;
}

/**
 * Asserts that filter returns entries containing specific IDs
 */
export async function assertFilterContainsIds(
  storage: SqliteStorage,
  type: EntryType | undefined,
  filters: CursorPaginationParams['filters'],
  expectedIds: number[],
): Promise<void> {
  const result = await storage.findWithCursor(type, { filters });
  const returnedIds = result.data.map((e) => e.id);
  expectedIds.forEach((id) => {
    expect(returnedIds).toContain(id);
  });
}

/**
 * Asserts that filter excludes entries with specific IDs
 */
export async function assertFilterExcludesIds(
  storage: SqliteStorage,
  type: EntryType | undefined,
  filters: CursorPaginationParams['filters'],
  excludedIds: number[],
): Promise<void> {
  const result = await storage.findWithCursor(type, { filters });
  const returnedIds = result.data.map((e) => e.id);
  excludedIds.forEach((id) => {
    expect(returnedIds).not.toContain(id);
  });
}
