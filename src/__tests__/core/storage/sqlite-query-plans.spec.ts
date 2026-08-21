/**
 * Which of SQLite's answers walk the whole table.
 *
 * better-sqlite3 is synchronous, so every millisecond a query spends is a
 * millisecond the application being watched cannot serve a request in. A plan
 * that reads `SCAN` therefore costs the host directly, and grows with the
 * store — which is the opposite of what pruning is for.
 *
 * Two were scanning:
 *
 *   prune             `datetime(created_at) < datetime(?)` hid the column from
 *                     `idx_nestlens_created_at`. A prune matching nothing at
 *                     all took 21 ms across 200,000 entries.
 *   count('request')  read the payload of every request row and parsed each
 *                     one to subtract the GraphQL operations: 56 ms, for a
 *                     number the dashboard polls.
 *
 * Asserting on the plan rather than on a duration: a timing threshold on a
 * shared runner is either flaky or so loose it proves nothing, while the plan
 * says exactly which of the two shapes the query has.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type Database from 'better-sqlite3';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { Entry } from '../../../types';

const entry = (type: Entry['type'], payload: Record<string, unknown>): Entry =>
  ({ type, payload }) as unknown as Entry;

const request = (path: string, isGraphQL = false): Entry =>
  entry('request', {
    method: 'GET',
    url: path,
    path,
    statusCode: 200,
    duration: 1,
    ...(isGraphQL ? { isGraphQL: true } : {}),
  });

describe('SQLite query plans', () => {
  let workspace: string;
  let storage: SqliteStorage;
  let db: Database.Database;

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-plans-'));
    storage = new SqliteStorage(join(workspace, 'entries.db'));
    db = (storage as unknown as { db: Database.Database }).db;

    await storage.saveBatch([
      request('/a'),
      request('/b'),
      request('/graphql', true),
      entry('query', { query: 'SELECT 1', source: 'x', duration: 1 }),
    ]);
  });

  afterEach(async () => {
    await storage.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  const planFor = (sql: string, ...params: unknown[]): string =>
    (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[])
      .map((row) => row.detail)
      .join(' | ');

  /** The plan for the entries table itself, ignoring cascades into tags. */
  const entriesPlan = (sql: string, ...params: unknown[]): string =>
    planFor(sql, ...params)
      .split(' | ')
      .filter((step) => step.includes('nestlens_entries'))
      .join(' | ');

  describe('pruning', () => {
    const cutoff = new Date().toISOString();

    it('finds the rows through the created_at index', () => {
      const plan = entriesPlan('DELETE FROM nestlens_entries WHERE created_at < ?', cutoff);

      expect(plan).toContain('idx_nestlens_created_at');
      expect(plan).not.toContain('SCAN nestlens_entries');
    });

    it('would scan if the column were wrapped, which is why it is not', () => {
      // Guards the reason: this is the shape the code used to have.
      const plan = entriesPlan(
        'DELETE FROM nestlens_entries WHERE datetime(created_at) < datetime(?)',
        cutoff,
      );

      expect(plan).toContain('SCAN nestlens_entries');
    });

    it('prunes by type through an index as well', () => {
      const plan = entriesPlan(
        'DELETE FROM nestlens_entries WHERE type = ? AND created_at < ?',
        'request',
        cutoff,
      );

      expect(plan).not.toContain('SCAN nestlens_entries');
    });

    it('still deletes exactly what is older than the cutoff', async () => {
      // The plan is only worth having if the answer is still right.
      const future = new Date(Date.now() + 60_000);
      const past = new Date(Date.now() - 60_000);

      expect(await storage.prune(past)).toBe(0);
      expect(await storage.prune(future)).toBe(4);
      expect(await storage.count()).toBe(0);
    });
  });

  describe("count('request')", () => {
    const SQL =
      "SELECT COUNT(*) as count FROM nestlens_entries WHERE type = ? AND (json_extract(payload, '$.isGraphQL') IS NULL OR json_extract(payload, '$.isGraphQL') = 0)";

    it('answers from an index rather than reading every payload', () => {
      const plan = entriesPlan(SQL, 'request');

      expect(plan).toContain('idx_nestlens_graphql');
      expect(plan).not.toContain('SCAN nestlens_entries');
    });

    it('still leaves GraphQL operations out', async () => {
      expect(await storage.count('request')).toBe(2);
    });

    it('still agrees with the list it sits above', async () => {
      const listed = await storage.findWithCursor('request', { limit: 50 });

      expect(await storage.count('request')).toBe(listed.data.length);
    });

    it('follows an entry that stops being a request', async () => {
      // The index is over the expression, so it has nothing to keep in step.
      await storage.prune(new Date(Date.now() + 60_000));
      await storage.saveBatch([request('/only-rest')]);

      expect(await storage.count('request')).toBe(1);
    });
  });

  describe('filtering by date', () => {
    it('uses the index for a lower bound', () => {
      const plan = entriesPlan(
        'SELECT * FROM nestlens_entries WHERE created_at >= ? ORDER BY created_at DESC, id DESC',
        new Date().toISOString(),
      );

      expect(plan).toContain('idx_nestlens_created_at');
    });

    it('still returns only what falls inside the window', async () => {
      const all = await storage.find({ limit: 50 });
      const inside = await storage.find({
        from: new Date(Date.now() - 60_000),
        to: new Date(Date.now() + 60_000),
        limit: 50,
      });
      const outside = await storage.find({ to: new Date(Date.now() - 60_000), limit: 50 });

      expect(inside).toHaveLength(all.length);
      expect(outside).toHaveLength(0);
    });
  });
});
