import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
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
import { StorageInterface } from './storage.interface';
import { normalizeTag } from './tag-normalization';

/**
 * Database row type for nestlens_entries table
 */
interface EntryRow {
  id: number;
  type: EntryType;
  request_id: string | null;
  payload: string;
  created_at: string;
  family_hash: string | null;
  resolved_at: string | null;
}

/**
 * Monitored tag row type
 */
interface MonitoredTagRow {
  id: number;
  tag: string;
  created_at: string;
}

/**
 * Aggregation row types
 */
interface CountRow {
  count: number;
}

interface TypeCountRow {
  type: EntryType;
  count: number;
}

/**
 * The on-disk schema this version writes, recorded in `PRAGMA user_version`.
 *
 *   1  the original table: id, type, request_id, payload, created_at
 *   2  adds family_hash and resolved_at
 *   3  adds UNIQUE (entry_id, tag) — see `migrateTagUniqueness`
 *   4  timestamps in one format — see `migrateTimestampFormat`, and an index
 *      over the GraphQL flag
 *
 * Bump it whenever the schema changes, alongside the migration that performs
 * the change. Files written before versioning read as 0 and are migrated the
 * same way — the column probing below has always been idempotent.
 *
 * Exported so the tests read it from here rather than keeping their own copy:
 * a hand-maintained second copy is a test that fails on every bump for the one
 * reason that is never interesting.
 */
export const SCHEMA_VERSION = 4;

/**
 * What a timestamp column defaults to when an INSERT does not name it.
 *
 * `CURRENT_TIMESTAMP` writes `2026-08-21 14:29:25`. Read back and parsed by a
 * browser, a space where the `T` belongs means local time rather than UTC, so
 * every entry displayed at the reader's offset from the truth — three hours
 * out in Istanbul — and the seconds-only resolution lost the rest. The other
 * two backends have always written `toISOString()`, and this now writes what
 * they write, to the millisecond.
 */
const ISO_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/**
 * Escapes the characters `LIKE` treats as wildcards.
 *
 * A reader searching for `50%` means the three characters, not "anything
 * starting with 50" — and a search for `%` alone matched every row rather than
 * the rows containing a percent sign. The other two backends compare with
 * `includes`, where these are ordinary characters, so SQLite was reading the
 * same query differently: `%` returned 4 of 4 entries against their 1.
 *
 * Paired with `ESCAPE '\\'` on every `LIKE` below. The backslash has to go
 * first, or it would escape the escapes.
 */
const escapeLike = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

@Injectable()
export class SqliteStorage implements StorageInterface, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteStorage.name);
  private db: DatabaseType;

  /**
   * The most entries to keep, or `0` to keep everything.
   *
   * Age was the only bound this driver had, so a busy application filled a
   * disk long before anything reached `pruning.maxAge`: at a thousand requests
   * a second the default twenty-four hours is eighty-six million rows.
   */
  private readonly maxEntries: number;

  /**
   * Saves since the ceiling was last checked.
   *
   * Checking on every write would mean a `COUNT(*)` per entry. Checking every
   * hundred costs the same query once per hundred and lets the store overshoot
   * by at most that, which for a ceiling measured in thousands is noise.
   */
  private sinceLimitCheck = 0;
  private static readonly LIMIT_CHECK_EVERY = 100;
  /**
   * How many saves pass between limit checks, for this store's cap.
   *
   * The amortisation below overshoots by up to a hundred entries, which is
   * nothing against the ten thousand of the default and everything against a
   * small cap set on purpose: `maxEntries: 3` held 103 rows. Checking at
   * whichever is smaller keeps the store within twice what was asked for.
   */
  private readonly limitCheckEvery: number;

  constructor(
    private readonly filename: string = '.cache/nestlens.db',
    maxEntries = 10_000,
  ) {
    this.maxEntries = Math.max(0, maxEntries);
    this.limitCheckEvery = Math.max(1, Math.min(SqliteStorage.LIMIT_CHECK_EVERY, this.maxEntries));

    // Ensure directory exists
    const dir = path.dirname(filename);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000'); // 5 second timeout for locked database
    this.initializeDatabase();
  }

  onModuleInit(): void {
    // Already initialized in constructor
  }

  /**
   * Reads the schema version, and says so when the file is from the future.
   *
   * A SQLite file outlives the package that wrote it: it sits on disk across
   * upgrades, and across downgrades. Migrating forward is handled by probing
   * for missing columns, which is idempotent and needs no version — but that
   * only ever adds. Nothing could tell that a file had been written by a newer
   * NestLens, where a column this version has never heard of may be carrying
   * meaning, and the entries would simply read back short.
   */
  private readSchemaVersion(): number {
    const version = this.db.pragma('user_version', { simple: true });
    const parsed = typeof version === 'number' ? version : Number(version);

    if (parsed > SCHEMA_VERSION) {
      this.logger.warn(
        `${this.filename} was written by a newer NestLens (schema ${parsed}, this version reads ${SCHEMA_VERSION}). ` +
          'It will be read as far as this version understands it; upgrade NestLens, or point `storage.sqlite.filename` at a new file.',
      );
    }

    return parsed;
  }

  private initializeDatabase(): void {
    const version = this.readSchemaVersion();

    // Create main entries table (base schema without new columns)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        request_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (${ISO_NOW})
      );

      CREATE INDEX IF NOT EXISTS idx_nestlens_type ON nestlens_entries(type);
      CREATE INDEX IF NOT EXISTS idx_nestlens_request_id ON nestlens_entries(request_id);
      CREATE INDEX IF NOT EXISTS idx_nestlens_created_at ON nestlens_entries(created_at);

      -- A GraphQL operation is recorded as a request too, flagged, and belongs
      -- to the GraphQL page rather than the Requests page. The badge above the
      -- Requests list has to subtract them, and without this it read the
      -- payload of every request row and parsed each one: 56 ms across 200,000
      -- entries, on a driver that is synchronous and so on the application's
      -- event loop, for a number the dashboard polls. Indexing the expression
      -- the count already asks for makes the plan a covering search — 7 ms.
      CREATE INDEX IF NOT EXISTS idx_nestlens_graphql
        ON nestlens_entries(type, json_extract(payload, '$.isGraphQL'));
    `);

    // Migrate existing database - add new columns if they don't exist
    this.migrateDatabase();

    // Create tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT DEFAULT (${ISO_NOW}),
        FOREIGN KEY (entry_id) REFERENCES nestlens_entries(id) ON DELETE CASCADE,
        -- What the INSERT OR IGNORE in addTags needs in order to ignore
        -- anything. Without it the clause is inert: tagging an entry twice
        -- stored the tag twice, getAllTags counted it twice, and removeTags
        -- left a copy behind.
        UNIQUE (entry_id, tag)
      );

      CREATE INDEX IF NOT EXISTS idx_nestlens_tags_entry_id ON nestlens_tags(entry_id);
      CREATE INDEX IF NOT EXISTS idx_nestlens_tags_tag ON nestlens_tags(tag);
    `);

    // Create monitored tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_monitored_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (${ISO_NOW})
      );
    `);

    this.migrateTimestampFormat();

    // Stamped last, so a run that dies midway through leaves the file marked
    // with the version it still is rather than the one it was becoming.
    if (version < SCHEMA_VERSION) {
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }

    this.logger.log(`Database initialized: ${this.filename}`);
  }

  private migrateDatabase(): void {
    // Check and add family_hash column
    const columns = this.db.prepare('PRAGMA table_info(nestlens_entries)').all() as {
      name: string;
    }[];
    const columnNames = columns.map((c) => c.name);

    if (!columnNames.includes('family_hash')) {
      this.db.exec('ALTER TABLE nestlens_entries ADD COLUMN family_hash TEXT');
    }

    if (!columnNames.includes('resolved_at')) {
      this.db.exec('ALTER TABLE nestlens_entries ADD COLUMN resolved_at DATETIME');
    }

    // Create index for family_hash if column exists
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_nestlens_family_hash ON nestlens_entries(family_hash)',
    );

    this.migrateTagUniqueness();
  }

  /**
   * Rewrites timestamps an earlier version left in SQLite's own format.
   *
   * `CURRENT_TIMESTAMP` writes `2026-08-21 14:29:25`. A browser parsing that
   * sees no timezone and a space where the `T` belongs, so it reads it as local
   * time: every entry in a file written before this version displayed at the
   * reader's offset from the truth, three hours out in Istanbul, and to the
   * second rather than the millisecond. The other two backends have always
   * written `toISOString()`.
   *
   * One format in the column is also what lets `created_at < ?` use the index
   * — see `prune` — so this has to convert every row, not only the ones being
   * displayed. The stored value is UTC either way, so the conversion is
   * textual: a `T` for the space and a `.000Z` on the end.
   */
  private migrateTimestampFormat(): void {
    const legacy = "created_at IS NOT NULL AND created_at NOT LIKE '%T%'";
    const converted = "replace(created_at, ' ', 'T') || '.000Z'";

    for (const table of ['nestlens_entries', 'nestlens_tags', 'nestlens_monitored_tags']) {
      this.db.exec(`UPDATE ${table} SET created_at = ${converted} WHERE ${legacy}`);
    }

    this.db.exec(
      `UPDATE nestlens_entries SET resolved_at = replace(resolved_at, ' ', 'T') || '.000Z'
       WHERE resolved_at IS NOT NULL AND resolved_at NOT LIKE '%T%'`,
    );
  }

  /**
   * Gives an existing tag table the uniqueness it was always assumed to have.
   *
   * `addTags` has always written `INSERT OR IGNORE`, which does nothing unless
   * a constraint exists to be violated — and none did. A file written by an
   * earlier version therefore holds one row per tagging rather than one row per
   * tag, so the duplicates have to go before the index can be built.
   *
   * `CREATE TABLE` above carries the constraint for new files; this is for the
   * ones already on disk. Both paths end at the same schema.
   */
  private migrateTagUniqueness(): void {
    const tagTable = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nestlens_tags'")
      .get();

    if (!tagTable) {
      return;
    }

    const alreadyUnique = (
      this.db.prepare('PRAGMA index_list(nestlens_tags)').all() as {
        unique: number;
        name: string;
      }[]
    ).some((index) => index.unique === 1);

    if (alreadyUnique) {
      return;
    }

    // Keep the earliest row for each pair; the later ones were never meant to
    // exist and carry nothing the first does not.
    this.db.exec(`
      DELETE FROM nestlens_tags
      WHERE id NOT IN (
        SELECT MIN(id) FROM nestlens_tags GROUP BY entry_id, tag
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_nestlens_tags_entry_tag
        ON nestlens_tags(entry_id, tag);
    `);
  }

  async initialize(): Promise<void> {
    this.initializeDatabase();
  }

  /**
   * Writes the timestamp rather than leaving it to the column default.
   *
   * `save` reported `new Date().toISOString()` while the row kept whatever
   * `CURRENT_TIMESTAMP` had written, so the two disagreed about the same
   * entry: the dashboard showed one time as the entry arrived and a different
   * one after a refresh. Naming the column makes the value returned and the
   * value stored the same string.
   */
  async save(entry: Entry): Promise<Entry> {
    const stmt = this.db.prepare(`
      INSERT INTO nestlens_entries (type, request_id, payload, created_at)
      VALUES (?, ?, ?, ?)
    `);

    // The collector stamps an entry when the thing happened; the buffer holds
    // it for up to a second, so stamping it here recorded the flush instead.
    const createdAt = entry.createdAt ?? new Date().toISOString();
    const result = stmt.run(
      entry.type,
      entry.requestId || null,
      JSON.stringify(entry.payload),
      createdAt,
    );

    this.enforceEntryLimit(1);

    return {
      ...entry,
      id: result.lastInsertRowid as number,
      createdAt,
    };
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    const stmt = this.db.prepare(`
      INSERT INTO nestlens_entries (type, request_id, payload, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const savedEntries: Entry[] = [];

    const insertMany = this.db.transaction((items: Entry[]) => {
      for (const entry of items) {
        const createdAt = entry.createdAt ?? new Date().toISOString();
        const result = stmt.run(
          entry.type,
          entry.requestId || null,
          JSON.stringify(entry.payload),
          createdAt,
        );
        savedEntries.push({
          ...entry,
          id: Number(result.lastInsertRowid),
          createdAt,
        });
      }
    });

    insertMany(entries);
    this.enforceEntryLimit(entries.length);

    return savedEntries;
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    let sql = 'SELECT * FROM nestlens_entries WHERE 1=1';
    const params: unknown[] = [];

    if (filter.type) {
      sql += ' AND type = ?';
      params.push(filter.type);

      // Exclude GraphQL requests from regular requests list
      // GraphQL requests should only appear in the GraphQL watcher
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (filter.type === 'request') {
        sql +=
          " AND (json_extract(payload, '$.isGraphQL') IS NULL OR json_extract(payload, '$.isGraphQL') = 0)";
      }
    }

    if (filter.requestId) {
      sql += ' AND request_id = ?';
      params.push(filter.requestId);
    }

    // Compared as text, which is what the column holds and what the parameter
    // is: both sides are `toISOString()` now, a fixed-width UTC format whose
    // lexical order is its chronological order. That also lets the comparison
    // use `idx_nestlens_created_at`, which wrapping the column in `datetime()`
    // ruled out.
    if (filter.from) {
      sql += ' AND created_at >= ?';
      params.push(filter.from.toISOString());
    }

    if (filter.to) {
      sql += ' AND created_at <= ?';
      params.push(filter.to.toISOString());
    }

    // id breaks ties so rows written in the same millisecond page consistently.
    sql += ' ORDER BY created_at DESC, id DESC';

    // SQLite will not take an OFFSET without a LIMIT — `near "OFFSET": syntax
    // error` — while the other two backends skip and return the rest. `-1` is
    // SQLite's "no limit", so an offset on its own means the same thing here as
    // it does there.
    if (filter.limit || filter.offset) {
      sql += ' LIMIT ?';
      params.push(filter.limit ?? -1);
    }

    if (filter.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EntryRow[];

    const entries = rows.map((row) => this.rowToEntry(row));
    return this.hydrateEntriesWithTags(entries);
  }

  private rowToEntry(row: EntryRow): StoredEntry {
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // Handle corrupted JSON gracefully
      payload = { _error: 'Failed to parse payload', _raw: row.payload?.substring(0, 100) };
    }

    return {
      id: row.id,
      type: row.type,
      requestId: row.request_id || undefined,
      payload,
      createdAt: row.created_at,
      familyHash: row.family_hash || undefined,
      resolvedAt: row.resolved_at || undefined,
    } as StoredEntry;
  }

  /**
   * Hydrate entries with their tags (for batch efficiency)
   */
  private hydrateEntriesWithTags(entries: StoredEntry[]): StoredEntry[] {
    if (entries.length === 0) return entries;

    const entryIds = entries.map((e) => e.id).filter((id): id is number => id !== undefined);
    if (entryIds.length === 0) return entries;

    // Fetch all tags for these entries in one query
    const placeholders = entryIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT entry_id, tag FROM nestlens_tags
      WHERE entry_id IN (${placeholders})
    `);
    const tagRows = stmt.all(...entryIds) as { entry_id: number; tag: string }[];

    // Group tags by entry ID
    const tagsByEntryId = new Map<number, string[]>();
    for (const row of tagRows) {
      const existing = tagsByEntryId.get(row.entry_id) ?? [];
      existing.push(row.tag);
      tagsByEntryId.set(row.entry_id, existing);
    }

    // Assign tags to entries
    return entries.map((entry) => ({
      ...entry,
      tags: entry.id ? (tagsByEntryId.get(entry.id) ?? []) : [],
    }));
  }

  async findById(id: number): Promise<Entry | null> {
    const stmt = this.db.prepare('SELECT * FROM nestlens_entries WHERE id = ?');
    const row = stmt.get(id) as EntryRow | undefined;

    if (!row) return null;

    const entry = this.rowToEntry(row);
    const [hydratedEntry] = this.hydrateEntriesWithTags([entry]);
    return hydratedEntry;
  }

  async count(type?: EntryType): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM nestlens_entries';
    const params: unknown[] = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);

      // Exclude GraphQL requests from regular requests count
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (type === 'request') {
        sql +=
          " AND (json_extract(payload, '$.isGraphQL') IS NULL OR json_extract(payload, '$.isGraphQL') = 0)";
      }
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as CountRow;
    return row.count;
  }

  async getStats(): Promise<EntryStats> {
    // Optimized: Use a single query with CTE instead of 6 separate queries
    const stmt = this.db.prepare(`
      WITH type_counts AS (
        SELECT type, COUNT(*) as count
        FROM nestlens_entries
        GROUP BY type
      ),
      aggregates AS (
        SELECT
          (SELECT SUM(count) FROM type_counts) as total,
          (SELECT AVG(json_extract(payload, '$.duration'))
           FROM nestlens_entries
           WHERE type = 'request' AND json_extract(payload, '$.duration') IS NOT NULL) as avg_response_time,
          (SELECT COUNT(*)
           FROM nestlens_entries
           WHERE type = 'query' AND json_extract(payload, '$.slow') = 1) as slow_queries,
          (SELECT COUNT(*)
           FROM nestlens_entries
           WHERE type = 'exception' AND resolved_at IS NULL) as unresolved_exceptions
      )
      SELECT * FROM aggregates
    `);

    const aggregateRow = stmt.get() as {
      total: number | null;
      avg_response_time: number | null;
      slow_queries: number;
      unresolved_exceptions: number;
    };

    // Get type counts separately to build the byType object
    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM nestlens_entries
      GROUP BY type
    `);
    const byTypeRows = byTypeStmt.all() as TypeCountRow[];
    const byType = byTypeRows.reduce(
      (acc, row) => {
        acc[row.type] = row.count;
        return acc;
      },
      {} as Record<EntryType, number>,
    );

    return {
      total: aggregateRow.total ?? 0,
      byType,
      avgResponseTime: aggregateRow.avg_response_time ?? undefined,
      slowQueries: aggregateRow.slow_queries,
      exceptions: byType.exception || 0,
      unresolvedExceptions: aggregateRow.unresolved_exceptions,
    };
  }

  /**
   * Keeps the newest `maxEntries` and deletes the rest.
   *
   * By id rather than by count: ids are handed out in order, so the id of the
   * last row over the line is the boundary and everything up to it goes in one
   * indexed delete.
   *
   * Counted from the *oldest* end. Asking for the n-th newest row means
   * `OFFSET maxEntries`, and SQLite walks every one of those index entries to
   * get there — ten thousand steps per check, which cost a third of the write
   * throughput. Walking the overflow instead is at most `LIMIT_CHECK_EVERY`
   * steps, because that is how far the store can have drifted since the last
   * check.
   *
   * Amortised: a count per entry is more than the ceiling is worth, and
   * overshooting by up to a hundred entries out of thousands is not.
   */
  private enforceEntryLimit(saved: number): void {
    if (this.maxEntries <= 0) return;

    this.sinceLimitCheck += saved;
    if (this.sinceLimitCheck < this.limitCheckEvery) return;
    this.sinceLimitCheck = 0;

    const { count } = this.db.prepare('SELECT COUNT(*) as count FROM nestlens_entries').get() as {
      count: number;
    };

    const overflow = count - this.maxEntries;
    if (overflow <= 0) return;

    const boundary = this.db
      .prepare('SELECT id FROM nestlens_entries ORDER BY id ASC LIMIT 1 OFFSET ?')
      .get(overflow - 1) as { id: number } | undefined;

    if (!boundary) return;

    this.db.prepare('DELETE FROM nestlens_entries WHERE id <= ?').run(boundary.id);
  }

  /**
   * Deletes by comparing the column directly, which the index can answer.
   *
   * Both sides used to go through `datetime()`, because the column held
   * `2026-08-12 21:55:45` and the parameter arrived as
   * `2026-08-12T21:25:45.292Z`: compared as text the eleventh character
   * decided, a space sorting before a "T", so every row from the cutoff's date
   * or earlier read as older whatever its time — pruning anything pruned
   * everything recorded that day.
   *
   * Wrapping the column fixed that and cost the index: `EXPLAIN QUERY PLAN`
   * read `SCAN nestlens_entries`, so every prune walked the whole table, on a
   * driver that is synchronous and therefore on the application's event loop.
   * A prune that matched nothing at all still took 21 ms across 200,000
   * entries, and that figure grows with the table.
   *
   * The column holds `toISOString()` now — see `migrateTimestampFormat` — so
   * the two sides are the same fixed-width UTC format, text order is time
   * order, and the plan reads `SEARCH ... USING COVERING INDEX`.
   */
  async prune(before: Date): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM nestlens_entries WHERE created_at < ?');
    const result = stmt.run(before.toISOString());
    return result.changes;
  }

  async pruneByType(type: EntryType, before: Date): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM nestlens_entries WHERE type = ? AND created_at < ?');
    const result = stmt.run(type, before.toISOString());
    return result.changes;
  }

  /**
   * Build SQL filter conditions from CursorPaginationParams filters
   * This centralizes all filter logic to avoid duplication
   */
  private buildFilterConditions(filters: CursorPaginationParams['filters']): {
    conditions: string[];
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filters) {
      return { conditions, params };
    }

    // The window, compared against the column directly so the index on
    // `created_at` can answer it. Both sides are `toISOString()`.
    if (filters.from) {
      conditions.push('e.created_at >= ?');
      params.push(filters.from);
    }

    if (filters.to) {
      conditions.push('e.created_at <= ?');
      params.push(filters.to);
    }

    if (filters.requestId) {
      conditions.push('e.request_id = ?');
      params.push(filters.requestId);
    }

    // How long it took. `json_extract` gives NULL for an entry that measures
    // nothing, and a NULL comparison is not true, so those are excluded — the
    // same answer the other two backends give.
    if (filters.minDuration !== undefined) {
      conditions.push("json_extract(e.payload, '$.duration') >= ?");
      params.push(filters.minDuration);
    }

    if (filters.maxDuration !== undefined) {
      conditions.push("json_extract(e.payload, '$.duration') <= ?");
      params.push(filters.maxDuration);
    }

    // Logs: levels filter
    if (filters.levels && filters.levels.length > 0) {
      const placeholders = filters.levels.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.level') IN (${placeholders})`);
      params.push(...filters.levels);
    }

    // Logs: contexts filter
    if (filters.contexts && filters.contexts.length > 0) {
      const placeholders = filters.contexts.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.context') IN (${placeholders})`);
      params.push(...filters.contexts);
    }

    // Queries: queryTypes filter (SELECT, INSERT, UPDATE, DELETE)
    if (filters.queryTypes && filters.queryTypes.length > 0) {
      const queryConditions = filters.queryTypes
        .map(() => `json_extract(e.payload, '$.query') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${queryConditions})`);
      params.push(...filters.queryTypes.map((qt) => `${escapeLike(qt)}%`));
    }

    // Queries: sources filter (typeorm, prisma, etc)
    if (filters.sources && filters.sources.length > 0) {
      const placeholders = filters.sources.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.source') IN (${placeholders})`);
      params.push(...filters.sources);
    }

    // Queries: slow filter
    if (filters.slow !== undefined) {
      conditions.push(`json_extract(e.payload, '$.slow') = ?`);
      params.push(filters.slow ? 1 : 0);
    }

    // Exceptions: names filter
    if (filters.names && filters.names.length > 0) {
      const nameConditions = filters.names
        .map(() => `json_extract(e.payload, '$.name') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.names.map((n) => `%${escapeLike(n)}%`));
    }

    // Requests & Exceptions: methods filter
    if (filters.methods && filters.methods.length > 0) {
      const placeholders = filters.methods.map(() => '?').join(', ');
      conditions.push(
        `(json_extract(e.payload, '$.method') IN (${placeholders}) OR json_extract(e.payload, '$.request.method') IN (${placeholders}))`,
      );
      params.push(...filters.methods, ...filters.methods);
    }

    // Requests & Exceptions: paths filter (supports LIKE)
    if (filters.paths && filters.paths.length > 0) {
      const requestConditions = filters.paths
        .map(() => `json_extract(e.payload, '$.path') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      const exceptionConditions = filters.paths
        .map(() => `json_extract(e.payload, '$.request.url') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`((${requestConditions}) OR (${exceptionConditions}))`);
      // `*` stays a wildcard — it is the documented way to ask for one — but
      // everything around it is escaped, so a path containing `%` or `_`
      // matches itself.
      // A pattern with a wildcard is anchored — `/item*` means "starts with
      // /item" — and one without matches anywhere. The JavaScript backends
      // follow the same rule; see `matchesPathPattern`.
      const pathParams = filters.paths.map((p) =>
        p.includes('*') ? escapeLike(p).replace(/\*/g, '%') : `%${escapeLike(p)}%`,
      );
      params.push(...pathParams, ...pathParams);
    }

    // Exceptions: resolved filter
    if (filters.resolved !== undefined) {
      conditions.push(filters.resolved ? 'e.resolved_at IS NOT NULL' : 'e.resolved_at IS NULL');
    }

    // Requests & HTTP Client: statuses filter (supports ERR for null status)
    if (filters.statuses && filters.statuses.length > 0) {
      const numericStatuses = filters.statuses.filter((s): s is number => s !== 'ERR');
      const hasErr = filters.statuses.includes('ERR');

      const statusConditions: string[] = [];

      if (numericStatuses.length > 0) {
        const placeholders = numericStatuses.map(() => '?').join(', ');
        statusConditions.push(`json_extract(e.payload, '$.statusCode') IN (${placeholders})`);
        params.push(...numericStatuses);
      }

      if (hasErr) {
        statusConditions.push(`json_extract(e.payload, '$.statusCode') IS NULL`);
      }

      if (statusConditions.length > 0) {
        conditions.push(`(${statusConditions.join(' OR ')})`);
      }
    }

    // Requests & HTTP Client: hostnames filter
    // For requests: search in headers.host or headers.Host
    // For http-client: search in payload.hostname
    if (filters.hostnames && filters.hostnames.length > 0) {
      const hostnameConditions = filters.hostnames
        .map(
          () =>
            `(json_extract(e.payload, '$.headers.host') LIKE ? ESCAPE '\\' OR json_extract(e.payload, '$.headers.Host') LIKE ? ESCAPE '\\' OR json_extract(e.payload, '$.hostname') LIKE ? ESCAPE '\\')`,
        )
        .join(' OR ');
      conditions.push(`(${hostnameConditions})`);
      filters.hostnames.forEach((h) => {
        const pattern = `%${escapeLike(h)}%`;
        params.push(pattern, pattern, pattern);
      });
    }

    // Requests: controllers filter
    if (filters.controllers && filters.controllers.length > 0) {
      const placeholders = filters.controllers.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.controllerAction') IN (${placeholders})`);
      params.push(...filters.controllers);
    }

    // Requests: ips filter
    if (filters.ips && filters.ips.length > 0) {
      const placeholders = filters.ips.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.ip') IN (${placeholders})`);
      params.push(...filters.ips);
    }

    // Events: eventNames filter
    if (filters.eventNames && filters.eventNames.length > 0) {
      const nameConditions = filters.eventNames
        .map(() => `json_extract(e.payload, '$.name') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.eventNames.map((n) => `%${escapeLike(n)}%`));
    }

    // Schedule: scheduleStatuses filter (started, completed, failed)
    if (filters.scheduleStatuses && filters.scheduleStatuses.length > 0) {
      const placeholders = filters.scheduleStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.scheduleStatuses);
    }

    // Schedule: scheduleNames filter
    if (filters.scheduleNames && filters.scheduleNames.length > 0) {
      const nameConditions = filters.scheduleNames
        .map(() => `json_extract(e.payload, '$.name') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.scheduleNames.map((n) => `%${escapeLike(n)}%`));
    }

    // Jobs: jobStatuses filter (waiting, active, completed, failed, delayed)
    if (filters.jobStatuses && filters.jobStatuses.length > 0) {
      const placeholders = filters.jobStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.jobStatuses);
    }

    // Jobs: jobNames filter
    if (filters.jobNames && filters.jobNames.length > 0) {
      const nameConditions = filters.jobNames
        .map(() => `json_extract(e.payload, '$.name') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.jobNames.map((n) => `%${escapeLike(n)}%`));
    }

    // Jobs: queues filter
    if (filters.queues && filters.queues.length > 0) {
      const placeholders = filters.queues.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.queue') IN (${placeholders})`);
      params.push(...filters.queues);
    }

    // Cache: operations filter (get, set, del, clear)
    if (filters.cacheOperations && filters.cacheOperations.length > 0) {
      const placeholders = filters.cacheOperations.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.operation') IN (${placeholders})`);
      params.push(...filters.cacheOperations);
    }

    // Mail: mailStatuses filter (sent, failed)
    if (filters.mailStatuses && filters.mailStatuses.length > 0) {
      const placeholders = filters.mailStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.mailStatuses);
    }

    // Redis: redisStatuses filter (success, error)
    if (filters.redisStatuses && filters.redisStatuses.length > 0) {
      const placeholders = filters.redisStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.redisStatuses);
    }

    // Redis: redisCommands filter
    if (filters.redisCommands && filters.redisCommands.length > 0) {
      const placeholders = filters.redisCommands.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.command') IN (${placeholders})`);
      params.push(...filters.redisCommands);
    }

    // Model: modelActions filter (find, create, update, delete, save)
    if (filters.modelActions && filters.modelActions.length > 0) {
      const placeholders = filters.modelActions.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.action') IN (${placeholders})`);
      params.push(...filters.modelActions);
    }

    // Model: entities filter
    if (filters.entities && filters.entities.length > 0) {
      const placeholders = filters.entities.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.entity') IN (${placeholders})`);
      params.push(...filters.entities);
    }

    // Model: modelSources filter (typeorm, prisma)
    if (filters.modelSources && filters.modelSources.length > 0) {
      const placeholders = filters.modelSources.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.source') IN (${placeholders})`);
      params.push(...filters.modelSources);
    }

    // Notification: notificationTypes filter (email, sms, push, socket, webhook)
    if (filters.notificationTypes && filters.notificationTypes.length > 0) {
      const placeholders = filters.notificationTypes.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.type') IN (${placeholders})`);
      params.push(...filters.notificationTypes);
    }

    // Notification: notificationStatuses filter (sent, failed)
    if (filters.notificationStatuses && filters.notificationStatuses.length > 0) {
      const placeholders = filters.notificationStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.notificationStatuses);
    }

    // View: viewFormats filter (html, json, xml, pdf)
    if (filters.viewFormats && filters.viewFormats.length > 0) {
      const placeholders = filters.viewFormats.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.format') IN (${placeholders})`);
      params.push(...filters.viewFormats);
    }

    // View: viewStatuses filter (rendered, error)
    if (filters.viewStatuses && filters.viewStatuses.length > 0) {
      const placeholders = filters.viewStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.viewStatuses);
    }

    // Command: commandStatuses filter (executing, completed, failed)
    if (filters.commandStatuses && filters.commandStatuses.length > 0) {
      const placeholders = filters.commandStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.commandStatuses);
    }

    // Command: commandNames filter
    if (filters.commandNames && filters.commandNames.length > 0) {
      const nameConditions = filters.commandNames
        .map(() => `json_extract(e.payload, '$.name') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.commandNames.map((n) => `%${escapeLike(n)}%`));
    }

    // Gate: gateNames filter
    if (filters.gateNames && filters.gateNames.length > 0) {
      const nameConditions = filters.gateNames
        .map(() => `json_extract(e.payload, '$.gate') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.gateNames.map((n) => `%${escapeLike(n)}%`));
    }

    // Gate: gateResults filter (allowed, denied mapped from boolean)
    if (filters.gateResults && filters.gateResults.length > 0) {
      const resultConditions: string[] = [];
      if (filters.gateResults.includes('allowed')) {
        resultConditions.push(`json_extract(e.payload, '$.allowed') = 1`);
      }
      if (filters.gateResults.includes('denied')) {
        resultConditions.push(`json_extract(e.payload, '$.allowed') = 0`);
      }
      if (resultConditions.length > 0) {
        conditions.push(`(${resultConditions.join(' OR ')})`);
      }
    }

    // Batch: batchStatuses filter (completed, partial, failed)
    if (filters.batchStatuses && filters.batchStatuses.length > 0) {
      const placeholders = filters.batchStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.batchStatuses);
    }

    // Batch: batchOperations filter
    if (filters.batchOperations && filters.batchOperations.length > 0) {
      const placeholders = filters.batchOperations.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.operation') IN (${placeholders})`);
      params.push(...filters.batchOperations);
    }

    // Dump: dumpStatuses filter (completed, failed)
    if (filters.dumpStatuses && filters.dumpStatuses.length > 0) {
      const placeholders = filters.dumpStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.dumpStatuses);
    }

    // Dump: dumpOperations filter (export, import, backup, restore, migrate)
    if (filters.dumpOperations && filters.dumpOperations.length > 0) {
      const placeholders = filters.dumpOperations.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.operation') IN (${placeholders})`);
      params.push(...filters.dumpOperations);
    }

    // Dump: dumpFormats filter (sql, json, csv, binary)
    if (filters.dumpFormats && filters.dumpFormats.length > 0) {
      const placeholders = filters.dumpFormats.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.format') IN (${placeholders})`);
      params.push(...filters.dumpFormats);
    }

    // GraphQL: operationTypes filter (query, mutation, subscription)
    if (filters.operationTypes && filters.operationTypes.length > 0) {
      const placeholders = filters.operationTypes.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.operationType') IN (${placeholders})`);
      params.push(...filters.operationTypes);
    }

    // GraphQL: operationNames filter
    if (filters.operationNames && filters.operationNames.length > 0) {
      const nameConditions = filters.operationNames
        .map(() => `json_extract(e.payload, '$.operationName') LIKE ? ESCAPE '\\'`)
        .join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.operationNames.map((n) => `%${escapeLike(n)}%`));
    }

    // GraphQL: hasErrors filter
    if (filters.hasErrors !== undefined) {
      conditions.push(`json_extract(e.payload, '$.hasErrors') = ?`);
      params.push(filters.hasErrors ? 1 : 0);
    }

    // GraphQL: hasN1 filter (check if potentialN1 array is non-empty)
    if (filters.hasN1 !== undefined) {
      if (filters.hasN1) {
        conditions.push(`json_array_length(json_extract(e.payload, '$.potentialN1')) > 0`);
      } else {
        conditions.push(
          `(json_extract(e.payload, '$.potentialN1') IS NULL OR json_array_length(json_extract(e.payload, '$.potentialN1')) = 0)`,
        );
      }
    }

    // Tags filter (OR logic, case-insensitive) - handled separately since it requires JOIN
    if (filters.tags && filters.tags.length > 0) {
      // Normalize filter tags to uppercase for case-insensitive matching
      const normalizedTags = filters.tags.map((t) => t.toUpperCase());
      const placeholders = normalizedTags.map(() => '?').join(', ');
      conditions.push(`t.tag IN (${placeholders})`);
      params.push(...normalizedTags);
    }

    // Search filter (searches in payload and entry tags)
    if (filters.search) {
      conditions.push(
        `(e.payload LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM nestlens_tags st WHERE st.entry_id = e.id AND st.tag LIKE ? ESCAPE '\\'))`,
      );
      params.push(`%${escapeLike(filters.search)}%`, `%${escapeLike(filters.search)}%`);
    }

    return { conditions, params };
  }

  async findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const limit = params.limit ?? 50;
    const sqlParams: unknown[] = [];
    const filters = params.filters;

    // Build base query - may need JOIN for tag filtering
    const needsTagJoin = filters?.tags && filters.tags.length > 0;

    let sql = needsTagJoin
      ? 'SELECT DISTINCT e.* FROM nestlens_entries e INNER JOIN nestlens_tags t ON e.id = t.entry_id WHERE 1=1'
      : 'SELECT * FROM nestlens_entries e WHERE 1=1';

    if (type) {
      sql += ' AND e.type = ?';
      sqlParams.push(type);

      // Exclude GraphQL requests from regular requests list
      // GraphQL requests should only appear in the GraphQL watcher
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (type === 'request') {
        sql +=
          " AND (json_extract(e.payload, '$.isGraphQL') IS NULL OR json_extract(e.payload, '$.isGraphQL') = 0)";
      }
    }

    // Apply filters using centralized method
    const { conditions, params: filterParams } = this.buildFilterConditions(filters);
    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
      sqlParams.push(...filterParams);
    }

    // Cursor pagination
    if (params.beforeSequence !== undefined) {
      sql += ' AND e.id < ?';
      sqlParams.push(params.beforeSequence);
      sql += ' ORDER BY e.id DESC';
    } else if (params.afterSequence !== undefined) {
      sql += ' AND e.id > ?';
      sqlParams.push(params.afterSequence);
      sql += ' ORDER BY e.id ASC';
    } else {
      sql += ' ORDER BY e.id DESC';
    }

    sql += ' LIMIT ?';
    sqlParams.push(limit + 1);

    const stmt = this.db.prepare(sql);
    let rows = stmt.all(...sqlParams) as EntryRow[];

    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    if (params.afterSequence !== undefined) {
      rows = rows.reverse();
    }

    const entries = this.hydrateEntriesWithTags(rows.map((row) => this.rowToEntry(row)));

    // Get total count with filters
    const total = await this.countWithFilters(type, filters);

    return {
      data: entries,
      meta: {
        hasMore,
        oldestSequence: entries.length > 0 ? entries[entries.length - 1].id : null,
        newestSequence: entries.length > 0 ? entries[0].id : null,
        total,
      },
    };
  }

  /**
   * Count entries with filters applied
   */
  private async countWithFilters(
    type: EntryType | undefined,
    filters: CursorPaginationParams['filters'],
  ): Promise<number> {
    if (
      !filters ||
      Object.keys(filters).every((k) => {
        const val = filters[k as keyof typeof filters];
        return val === undefined || (Array.isArray(val) && val.length === 0);
      })
    ) {
      return this.count(type);
    }

    const sqlParams: unknown[] = [];
    const needsTagJoin = filters?.tags && filters.tags.length > 0;

    let sql = needsTagJoin
      ? 'SELECT COUNT(DISTINCT e.id) as count FROM nestlens_entries e INNER JOIN nestlens_tags t ON e.id = t.entry_id WHERE 1=1'
      : 'SELECT COUNT(*) as count FROM nestlens_entries e WHERE 1=1';

    if (type) {
      sql += ' AND e.type = ?';
      sqlParams.push(type);

      // Exclude GraphQL requests from regular requests count
      // Uses isGraphQL flag set by request.watcher.ts based on robust detection
      if (type === 'request') {
        sql +=
          " AND (json_extract(e.payload, '$.isGraphQL') IS NULL OR json_extract(e.payload, '$.isGraphQL') = 0)";
      }
    }

    // Apply filters using centralized method
    const { conditions, params: filterParams } = this.buildFilterConditions(filters);
    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
      sqlParams.push(...filterParams);
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...sqlParams) as CountRow;
    return row.count;
  }

  async getLatestSequence(type?: EntryType): Promise<number | null> {
    let sql = 'SELECT MAX(id) as maxId FROM nestlens_entries';
    const params: unknown[] = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as { maxId: number | null };
    return row.maxId;
  }

  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM nestlens_entries WHERE id > ?';
    const params: unknown[] = [sequence];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as CountRow;
    return row.count;
  }

  async getStorageStats(): Promise<StorageStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM nestlens_entries');
    const total = (totalStmt.get() as CountRow).count;

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM nestlens_entries
      GROUP BY type
    `);
    const byTypeRows = byTypeStmt.all() as TypeCountRow[];
    const byType = byTypeRows.reduce(
      (acc, row) => {
        acc[row.type] = row.count;
        return acc;
      },
      {} as Record<EntryType, number>,
    );

    const oldestStmt = this.db.prepare(
      'SELECT created_at FROM nestlens_entries ORDER BY id ASC LIMIT 1',
    );
    const oldestRow = oldestStmt.get() as { created_at: string } | undefined;

    const newestStmt = this.db.prepare(
      'SELECT created_at FROM nestlens_entries ORDER BY id DESC LIMIT 1',
    );
    const newestRow = newestStmt.get() as { created_at: string } | undefined;

    let databaseSize: number | undefined;
    try {
      const stats = fs.statSync(this.filename);
      databaseSize = stats.size;
    } catch {
      // File might not exist or be inaccessible
    }

    return {
      total,
      byType,
      oldestEntry: oldestRow?.created_at || null,
      newestEntry: newestRow?.created_at || null,
      databaseSize,
    };
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM nestlens_tags');
    this.db.exec('DELETE FROM nestlens_entries');
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // ==================== Tag Methods ====================

  async addTags(entryId: number, tags: string[]): Promise<void> {
    // An entry that is not there cannot be tagged, and asking to is not an
    // error worth throwing over: the collector tags an entry just after saving
    // it, and pruning or the entry cap can remove it in between. The foreign
    // key made that race throw out of the collector; there is nothing for the
    // caller to do about it, and nothing to record either.
    const exists = this.db
      .prepare('SELECT 1 FROM nestlens_entries WHERE id = ?')
      .get(entryId) as unknown;

    if (!exists) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO nestlens_tags (entry_id, tag)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((items: string[]) => {
      for (const rawTag of items) {
        // Normalize tags to uppercase for consistent storage
        const tag = rawTag.toUpperCase();
        stmt.run(entryId, tag);
      }
    });

    insertMany(tags);
  }

  async removeTags(entryId: number, tags: string[]): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM nestlens_tags
      WHERE entry_id = ? AND tag = ?
    `);

    const deleteMany = this.db.transaction((items: string[]) => {
      for (const rawTag of items) {
        // Normalize to uppercase for consistent lookup
        const tag = rawTag.toUpperCase();
        stmt.run(entryId, tag);
      }
    });

    deleteMany(tags);
  }

  async getEntryTags(entryId: number): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT tag FROM nestlens_tags
      WHERE entry_id = ?
      ORDER BY tag
    `);
    const rows = stmt.all(entryId) as { tag: string }[];
    return rows.map((r) => r.tag);
  }

  async getAllTags(): Promise<TagWithCount[]> {
    const stmt = this.db.prepare(`
      SELECT tag, COUNT(*) as count
      FROM nestlens_tags
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `);
    const rows = stmt.all() as { tag: string; count: number }[];
    return rows;
  }

  async findByTags(
    tags: string[],
    logic: 'AND' | 'OR' = 'OR',
    limit: number = 50,
  ): Promise<Entry[]> {
    if (tags.length === 0) {
      return [];
    }

    // Normalize input tags to uppercase for case-insensitive matching
    const normalizedTags = tags.map((t) => t.toUpperCase());

    let sql: string;
    const params: unknown[] = [];

    if (logic === 'AND') {
      // Entries that have ALL specified tags
      const placeholders = normalizedTags.map(() => '?').join(', ');
      sql = `
        SELECT e.* FROM nestlens_entries e
        WHERE e.id IN (
          SELECT entry_id FROM nestlens_tags
          WHERE tag IN (${placeholders})
          GROUP BY entry_id
          HAVING COUNT(DISTINCT tag) = ?
        )
        ORDER BY e.id DESC
        LIMIT ?
      `;
      params.push(...normalizedTags, normalizedTags.length, limit);
    } else {
      // Entries that have ANY of the specified tags
      const placeholders = normalizedTags.map(() => '?').join(', ');
      sql = `
        SELECT DISTINCT e.* FROM nestlens_entries e
        INNER JOIN nestlens_tags t ON e.id = t.entry_id
        WHERE t.tag IN (${placeholders})
        ORDER BY e.id DESC
        LIMIT ?
      `;
      params.push(...normalizedTags, limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EntryRow[];
    return rows.map((row) => this.rowToEntry(row));
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(rawTag: string): Promise<MonitoredTag> {
    const tag = normalizeTag(rawTag);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO nestlens_monitored_tags (tag)
      VALUES (?)
    `);
    stmt.run(tag);

    const selectStmt = this.db.prepare(`
      SELECT * FROM nestlens_monitored_tags WHERE tag = ?
    `);
    const row = selectStmt.get(tag) as MonitoredTagRow;

    return {
      id: row.id,
      tag: row.tag,
      createdAt: row.created_at,
    };
  }

  async removeMonitoredTag(rawTag: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM nestlens_monitored_tags WHERE tag = ?
    `);
    stmt.run(normalizeTag(rawTag));
  }

  async getMonitoredTags(): Promise<MonitoredTag[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM nestlens_monitored_tags ORDER BY tag
    `);
    const rows = stmt.all() as MonitoredTagRow[];
    return rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      createdAt: row.created_at,
    }));
  }

  // ==================== Resolution ====================

  async resolveEntry(id: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE nestlens_entries
      SET resolved_at = ${ISO_NOW}
      WHERE id = ?
    `);
    stmt.run(id);
  }

  async unresolveEntry(id: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE nestlens_entries
      SET resolved_at = NULL
      WHERE id = ?
    `);
    stmt.run(id);
  }

  // ==================== Family Hash ====================

  async updateFamilyHash(id: number, familyHash: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE nestlens_entries
      SET family_hash = ?
      WHERE id = ?
    `);
    stmt.run(familyHash, id);
  }

  async findByFamilyHash(familyHash: string, limit: number = 50): Promise<Entry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM nestlens_entries
      WHERE family_hash = ?
      ORDER BY id DESC
      LIMIT ?
    `);
    const rows = stmt.all(familyHash, limit) as EntryRow[];
    return rows.map((row) => this.rowToEntry(row));
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit: number = 50,
  ): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]> {
    let sql = `
      SELECT family_hash, COUNT(*) as count, MAX(id) as latest_id
      FROM nestlens_entries
      WHERE family_hash IS NOT NULL
    `;
    const params: unknown[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += `
      GROUP BY family_hash
      ORDER BY count DESC, latest_id DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { family_hash: string; count: number; latest_id: number }[];

    if (rows.length === 0) {
      return [];
    }

    // Fetch all entries in a single query to avoid N+1
    const ids = rows.map((row) => row.latest_id);
    const placeholders = ids.map(() => '?').join(', ');
    const entriesStmt = this.db.prepare(`
      SELECT * FROM nestlens_entries WHERE id IN (${placeholders})
    `);
    const entryRows = entriesStmt.all(...ids) as EntryRow[];

    // Create a map for O(1) lookup
    const entryMap = new Map<number, Entry>();
    for (const row of entryRows) {
      entryMap.set(row.id, this.rowToEntry(row));
    }

    // Build results maintaining the original order
    const results: { familyHash: string; count: number; latestEntry: Entry }[] = [];
    for (const row of rows) {
      const entry = entryMap.get(row.latest_id);
      if (entry) {
        results.push({
          familyHash: row.family_hash,
          count: row.count,
          latestEntry: entry,
        });
      }
    }

    return results;
  }

  onModuleDestroy() {
    this.db.close();
  }
}
