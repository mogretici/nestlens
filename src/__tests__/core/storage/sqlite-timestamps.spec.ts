/**
 * What a stored timestamp says, and to whom.
 *
 * SQLite wrote `created_at` with `CURRENT_TIMESTAMP`, which produces
 * `2026-08-21 14:29:25`: UTC, to the second, with a space where ISO 8601 puts
 * a `T`. Every consumer of that string is JavaScript, and JavaScript reads a
 * date with no timezone and no `T` as *local* time. So a dashboard in Istanbul
 * showed every entry three hours from where it belonged, and "2 minutes ago"
 * read as "3 hours ago".
 *
 *     stored     2026-08-21 14:29:25
 *     displayed  2026-08-21T11:29:25.000Z   (TZ=Europe/Istanbul)
 *
 * `save` compounded it by returning `new Date().toISOString()` — a value the
 * row did not hold — so the entry arrived in the list at one time and moved
 * when the page was refreshed.
 *
 * The other two backends have always written `toISOString()`. This one does
 * now, which also lets `created_at < ?` use its index: see
 * `sqlite-query-plans.spec.ts`.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { Entry } from '../../../types';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const entry = (path = '/x'): Entry =>
  ({
    type: 'request',
    payload: { method: 'GET', url: path, path, statusCode: 200, duration: 1 },
  }) as unknown as Entry;

describe('SQLite timestamps', () => {
  let workspace: string;
  let file: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-stamps-'));
    file = join(workspace, 'entries.db');
    storage = new SqliteStorage(file);
  });

  afterEach(async () => {
    await storage.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  const columnValue = (id: number): string =>
    (
      (storage as unknown as { db: Database.Database }).db
        .prepare('SELECT created_at FROM nestlens_entries WHERE id = ?')
        .get(id) as { created_at: string }
    ).created_at;

  it('writes an ISO timestamp to the column', async () => {
    const saved = await storage.save(entry());

    expect(columnValue(saved.id as number)).toMatch(ISO);
  });

  it('returns the value it stored', async () => {
    // These used to be two different strings for the same entry.
    const saved = await storage.save(entry());

    expect(saved.createdAt).toBe(columnValue(saved.id as number));
  });

  it('reads back what it returned', async () => {
    const saved = await storage.save(entry());
    const read = await storage.findById(saved.id as number);

    expect(read!.createdAt).toBe(saved.createdAt);
  });

  it('returns the value it stored from a batch too', async () => {
    const [saved] = await storage.saveBatch([entry('/batched')]);

    expect(saved.createdAt).toBe(columnValue(saved.id as number));
    expect(saved.createdAt).toMatch(ISO);
  });

  it('means the same moment wherever it is read', async () => {
    // The failure: parsed in a non-UTC zone, the old format moved.
    const before = Date.now();
    const saved = await storage.save(entry());
    const after = Date.now();

    const parsed = Date.parse((await storage.findById(saved.id as number))!.createdAt as string);

    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it('keeps the milliseconds', async () => {
    // `CURRENT_TIMESTAMP` resolves to the second, so entries written inside one
    // second all claimed the same moment.
    const saved = await storage.save(entry());

    expect(saved.createdAt).toMatch(/\.\d{3}Z$/);
  });

  it('stamps a resolution the same way', async () => {
    const saved = await storage.save(entry());
    await storage.resolveEntry(saved.id as number);

    const read = await storage.findById(saved.id as number);

    expect(read!.resolvedAt).toMatch(ISO);
  });

  it('stamps a monitored tag the same way', async () => {
    const monitored = await storage.addMonitoredTag('critical');

    expect(monitored.createdAt).toMatch(ISO);
  });

  describe('a file written by an earlier version', () => {
    /** Writes rows the way `CURRENT_TIMESTAMP` used to. */
    const withLegacyRows = (): string => {
      const legacyFile = join(workspace, 'legacy.db');
      const db = new Database(legacyFile);
      db.exec(`
        CREATE TABLE nestlens_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          request_id TEXT,
          payload TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          family_hash TEXT,
          resolved_at DATETIME
        );
        CREATE TABLE nestlens_monitored_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tag TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO nestlens_entries (type, payload, created_at, resolved_at)
          VALUES ('request', '{"method":"GET"}', '2026-08-12 21:55:45', '2026-08-13 08:00:00');
        INSERT INTO nestlens_entries (type, payload, created_at)
          VALUES ('query', '{"query":"SELECT 1"}', '2026-08-13 09:15:00');
        INSERT INTO nestlens_monitored_tags (tag, created_at)
          VALUES ('CRITICAL', '2026-08-01 10:00:00');
      `);
      db.close();
      return legacyFile;
    };

    it('converts every timestamp it finds', async () => {
      const migrated = new SqliteStorage(withLegacyRows());

      const entries = await migrated.find({ limit: 10 });

      expect(entries).toHaveLength(2);
      for (const stored of entries) {
        expect(stored.createdAt).toMatch(ISO);
      }

      await migrated.close();
    });

    it('converts them to the same moment they recorded', async () => {
      const migrated = new SqliteStorage(withLegacyRows());

      const [newest] = await migrated.find({ type: 'query', limit: 1 });

      // The stored value was UTC; only its spelling changes.
      expect(newest.createdAt).toBe('2026-08-13T09:15:00.000Z');

      await migrated.close();
    });

    it('converts a resolution stamp', async () => {
      const migrated = new SqliteStorage(withLegacyRows());

      const [resolved] = await migrated.find({ type: 'request', limit: 1 });

      expect(resolved.resolvedAt).toBe('2026-08-13T08:00:00.000Z');

      await migrated.close();
    });

    it('converts a monitored tag', async () => {
      const migrated = new SqliteStorage(withLegacyRows());

      const [monitored] = await migrated.getMonitoredTags();

      expect(monitored.createdAt).toBe('2026-08-01T10:00:00.000Z');

      await migrated.close();
    });

    it('leaves an already-converted file alone', async () => {
      const legacyFile = withLegacyRows();
      const first = new SqliteStorage(legacyFile);
      const [before] = await first.find({ type: 'query', limit: 1 });
      await first.close();

      const second = new SqliteStorage(legacyFile);
      const [after] = await second.find({ type: 'query', limit: 1 });
      await second.close();

      expect(after.createdAt).toBe(before.createdAt);
    });

    it('orders converted rows against new ones correctly', async () => {
      // Two formats in one column would sort a space before a "T" and put
      // every migrated row after every new one whatever their times.
      const legacyFile = withLegacyRows();
      const migrated = new SqliteStorage(legacyFile);
      await migrated.save(entry('/new'));

      const listed = await migrated.find({ limit: 10 });
      const stamps = listed.map((e) => Date.parse(e.createdAt as string));

      expect(stamps).toEqual([...stamps].sort((a, b) => b - a));

      await migrated.close();
    });
  });
});
