/**
 * A database written before the tag table had a uniqueness constraint.
 *
 * `addTags` has always written `INSERT OR IGNORE`, which does nothing unless a
 * constraint exists to be violated — and none did. Files on disk therefore hold
 * one row per tagging rather than one row per tag, and adding the constraint on
 * its own would fail against them.
 *
 * The upgrade path matters more than the fresh one: nobody deletes their
 * database to take a patch release.
 */
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SCHEMA_VERSION, SqliteStorage } from '../../../core/storage/sqlite.storage';

/** The schema exactly as version 2 wrote it: no UNIQUE on (entry_id, tag). */
function writeLegacyDatabase(file: string): void {
  const db = new Database(file);

  db.exec(`
    CREATE TABLE nestlens_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      request_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      family_hash TEXT,
      resolved_at DATETIME
    );
    CREATE TABLE nestlens_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entry_id) REFERENCES nestlens_entries(id) ON DELETE CASCADE
    );
    CREATE TABLE nestlens_monitored_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.prepare('INSERT INTO nestlens_entries (type, payload) VALUES (?, ?)').run('request', '{}');
  db.prepare('INSERT INTO nestlens_entries (type, payload) VALUES (?, ?)').run('request', '{}');

  const insert = db.prepare('INSERT INTO nestlens_tags (entry_id, tag) VALUES (?, ?)');
  insert.run(1, 'ALPHA');
  insert.run(1, 'ALPHA');
  insert.run(1, 'ALPHA');
  insert.run(1, 'BETA');
  insert.run(2, 'ALPHA');

  db.pragma('user_version = 2');
  db.close();
}

describe('opening a database written before tag uniqueness', () => {
  let dir: string;
  let file: string;
  let storage: SqliteStorage;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'nestlens-migrate-'));
    file = join(dir, 'legacy.db');
    writeLegacyDatabase(file);

    storage = new SqliteStorage(file);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('collapses the duplicate rows it already holds', () => {
    const db = new Database(file, { readonly: true });
    const rows = (db.prepare('SELECT COUNT(*) AS c FROM nestlens_tags').get() as { c: number }).c;
    db.close();

    // Five rows in, three tag/entry pairs out.
    expect(rows).toBe(3);
  });

  it('reports each tag once per entry afterwards', async () => {
    expect((await storage.getEntryTags(1)).sort()).toEqual(['ALPHA', 'BETA']);
    expect((await storage.getAllTags()).map((t) => `${t.tag}:${t.count}`).sort()).toEqual([
      'ALPHA:2',
      'BETA:1',
    ]);
  });

  it('keeps the constraint for everything added later', async () => {
    await storage.addTags(1, ['alpha']);
    await storage.addTags(1, ['ALPHA']);

    expect((await storage.getEntryTags(1)).sort()).toEqual(['ALPHA', 'BETA']);
  });

  it('stamps the file with the schema version it now has', () => {
    const db = new Database(file, { readonly: true });
    const version = db.pragma('user_version', { simple: true });
    db.close();

    // Read from the source rather than kept as a second copy here, which
    // would fail on every bump for the one reason that is never interesting.
    expect(version).toBe(SCHEMA_VERSION);
  });

  it('is safe to open twice', async () => {
    // The migration has to notice it has already run, or it would rebuild the
    // index on every startup.
    await storage.close();

    const reopened = new SqliteStorage(file);
    await reopened.initialize();

    expect((await reopened.getEntryTags(1)).sort()).toEqual(['ALPHA', 'BETA']);

    await reopened.close();
    storage = new SqliteStorage(file);
    await storage.initialize();
  });
});
