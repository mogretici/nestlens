/**
 * The upgrade path of a file that outlives the package that wrote it.
 *
 * A SQLite database sits on disk across NestLens upgrades — it is the reason
 * anyone chooses that driver. The schema has already changed once (`family_hash`
 * and `resolved_at` were added after the first release), and it was handled by
 * probing for missing columns, which works but left two things unproven: that a
 * file written by an older NestLens still opens and still reads back, and that
 * a file written by a *newer* one is noticed rather than silently misread.
 *
 * The fixtures are built here rather than committed as binaries, so what an old
 * schema looked like is readable in the test instead of hidden in a blob.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { Entry, EntryType } from '../../../types';

/** Matches `SCHEMA_VERSION` in the storage. */
const CURRENT_SCHEMA = 2;

let workspace: string;

/** The table as it was before `family_hash` and `resolved_at` existed. */
const writeLegacyDatabase = (file: string, options: { userVersion: number }): void => {
  const db = new Database(file);

  db.exec(`
    CREATE TABLE nestlens_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      request_id TEXT,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare('INSERT INTO nestlens_entries (type, request_id, payload) VALUES (?, ?, ?)').run(
    'request',
    'req-from-an-older-release',
    JSON.stringify({ method: 'GET', path: '/legacy', statusCode: 200, duration: 3, memory: 1 }),
  );
  db.pragma(`user_version = ${options.userVersion}`);
  db.close();
};

const versionOf = (file: string): number => {
  const db = new Database(file, { readonly: true });
  const version = db.pragma('user_version', { simple: true }) as number;
  db.close();

  return version;
};

const entry = (type: EntryType): Entry =>
  ({
    type,
    payload: { method: 'POST', path: '/new', statusCode: 201, duration: 1, memory: 1 },
  }) as unknown as Entry;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'nestlens-sqlite-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('opening a database written by an older NestLens', () => {
  it('adds the columns it is missing and stamps the schema version', () => {
    // Arrange
    const file = join(workspace, 'legacy.db');
    writeLegacyDatabase(file, { userVersion: 0 });

    // Act
    const storage = new SqliteStorage(file);

    // Assert
    expect(versionOf(file)).toBe(CURRENT_SCHEMA);
    (storage as unknown as { db: { close: () => void } }).db.close();
  });

  it('still reads the entries that were already in it', async () => {
    // Arrange
    const file = join(workspace, 'legacy.db');
    writeLegacyDatabase(file, { userVersion: 0 });

    // Act
    const storage = new SqliteStorage(file);
    const found = await storage.find({ type: 'request' as EntryType });

    // Assert
    expect(found).toHaveLength(1);
    expect(found[0]?.requestId).toBe('req-from-an-older-release');
    (storage as unknown as { db: { close: () => void } }).db.close();
  });

  it('keeps writing to it, alongside what was there before', async () => {
    // Arrange
    const file = join(workspace, 'legacy.db');
    writeLegacyDatabase(file, { userVersion: 0 });
    const storage = new SqliteStorage(file);

    // Act
    await storage.save(entry('request' as EntryType));
    const found = await storage.find({ type: 'request' as EntryType });

    // Assert
    expect(found).toHaveLength(2);
    (storage as unknown as { db: { close: () => void } }).db.close();
  });

  /**
   * Reopening must not undo anything: `initializeDatabase` runs on every
   * construction, and an application restarts far more often than it upgrades.
   */
  it('opens a second time without touching the version again', () => {
    // Arrange
    const file = join(workspace, 'legacy.db');
    writeLegacyDatabase(file, { userVersion: 0 });
    const first = new SqliteStorage(file);
    (first as unknown as { db: { close: () => void } }).db.close();

    // Act
    const second = new SqliteStorage(file);

    // Assert
    expect(versionOf(file)).toBe(CURRENT_SCHEMA);
    (second as unknown as { db: { close: () => void } }).db.close();
  });
});

describe('opening a database written by a newer NestLens', () => {
  it('warns instead of reading it as if it understood the file', () => {
    // Arrange
    const file = join(workspace, 'future.db');
    writeLegacyDatabase(file, { userVersion: CURRENT_SCHEMA + 5 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    const storage = new SqliteStorage(file);

    // Assert
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('newer NestLens'));
    // And it must not pretend the file is older than it is.
    expect(versionOf(file)).toBe(CURRENT_SCHEMA + 5);

    (storage as unknown as { db: { close: () => void } }).db.close();
    warn.mockRestore();
  });
});

describe('a database this version creates', () => {
  it('is stamped with the current schema version', () => {
    // Arrange
    const file = join(workspace, 'fresh.db');

    // Act
    const storage = new SqliteStorage(file);

    // Assert
    expect(versionOf(file)).toBe(CURRENT_SCHEMA);
    (storage as unknown as { db: { close: () => void } }).db.close();
  });
});
