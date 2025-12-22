import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
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
 * Tag row type
 */
interface TagRow {
  id: number;
  entry_id: number;
  tag: string;
  created_at: string;
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

interface AvgRow {
  avg: number | null;
}

@Injectable()
export class SqliteStorage implements StorageInterface, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteStorage.name);
  private db: DatabaseType;

  constructor(private readonly filename: string = '.cache/nestlens.db') {
    // Ensure directory exists
    const dir = path.dirname(filename);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.initializeDatabase();
  }

  onModuleInit(): void {
    // Already initialized in constructor
  }

  private initializeDatabase(): void {
    // Create main entries table (base schema without new columns)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        request_id TEXT,
        payload TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_nestlens_type ON nestlens_entries(type);
      CREATE INDEX IF NOT EXISTS idx_nestlens_request_id ON nestlens_entries(request_id);
      CREATE INDEX IF NOT EXISTS idx_nestlens_created_at ON nestlens_entries(created_at);
    `);

    // Migrate existing database - add new columns if they don't exist
    this.migrateDatabase();

    // Create tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entry_id) REFERENCES nestlens_entries(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nestlens_tags_entry_id ON nestlens_tags(entry_id);
      CREATE INDEX IF NOT EXISTS idx_nestlens_tags_tag ON nestlens_tags(tag);
    `);

    // Create monitored tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nestlens_monitored_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.logger.log(`Database initialized: ${this.filename}`);
  }

  private migrateDatabase(): void {
    // Check and add family_hash column
    const columns = this.db.prepare("PRAGMA table_info(nestlens_entries)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('family_hash')) {
      this.db.exec('ALTER TABLE nestlens_entries ADD COLUMN family_hash TEXT');
    }

    if (!columnNames.includes('resolved_at')) {
      this.db.exec('ALTER TABLE nestlens_entries ADD COLUMN resolved_at DATETIME');
    }

    // Create index for family_hash if column exists
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_nestlens_family_hash ON nestlens_entries(family_hash)');
  }

  async initialize(): Promise<void> {
    this.initializeDatabase();
  }

  async save(entry: Entry): Promise<Entry> {
    const stmt = this.db.prepare(`
      INSERT INTO nestlens_entries (type, request_id, payload)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      entry.type,
      entry.requestId || null,
      JSON.stringify(entry.payload),
    );

    return {
      ...entry,
      id: result.lastInsertRowid as number,
      createdAt: new Date().toISOString(),
    };
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    const stmt = this.db.prepare(`
      INSERT INTO nestlens_entries (type, request_id, payload)
      VALUES (?, ?, ?)
    `);

    const savedEntries: Entry[] = [];

    const insertMany = this.db.transaction((items: Entry[]) => {
      for (const entry of items) {
        const result = stmt.run(
          entry.type,
          entry.requestId || null,
          JSON.stringify(entry.payload),
        );
        savedEntries.push({
          ...entry,
          id: Number(result.lastInsertRowid),
          createdAt: new Date().toISOString(),
        });
      }
    });

    insertMany(entries);
    return savedEntries;
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    let sql = 'SELECT * FROM nestlens_entries WHERE 1=1';
    const params: unknown[] = [];

    if (filter.type) {
      sql += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter.requestId) {
      sql += ' AND request_id = ?';
      params.push(filter.requestId);
    }

    if (filter.from) {
      sql += ' AND created_at >= ?';
      params.push(filter.from.toISOString());
    }

    if (filter.to) {
      sql += ' AND created_at <= ?';
      params.push(filter.to.toISOString());
    }

    sql += ' ORDER BY created_at DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    if (filter.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EntryRow[];

    const entries = rows.map((row) => this.rowToEntry(row)) as Entry[];
    return this.hydrateEntriesWithTags(entries);
  }

  private rowToEntry(row: EntryRow): Entry {
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
    } as Entry;
  }

  /**
   * Hydrate entries with their tags (for batch efficiency)
   */
  private hydrateEntriesWithTags(entries: Entry[]): Entry[] {
    if (entries.length === 0) return entries;

    const entryIds = entries.map(e => e.id).filter((id): id is number => id !== undefined);
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
      const existing = tagsByEntryId.get(row.entry_id) || [];
      existing.push(row.tag);
      tagsByEntryId.set(row.entry_id, existing);
    }

    // Assign tags to entries
    return entries.map(entry => ({
      ...entry,
      tags: entry.id ? tagsByEntryId.get(entry.id) || [] : [],
    }));
  }

  async findById(id: number): Promise<Entry | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM nestlens_entries WHERE id = ?',
    );
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
      total: aggregateRow.total || 0,
      byType,
      avgResponseTime: aggregateRow.avg_response_time || undefined,
      slowQueries: aggregateRow.slow_queries,
      exceptions: byType.exception || 0,
      unresolvedExceptions: aggregateRow.unresolved_exceptions,
    };
  }

  async prune(before: Date): Promise<number> {
    const stmt = this.db.prepare(
      'DELETE FROM nestlens_entries WHERE created_at < ?',
    );
    const result = stmt.run(before.toISOString());
    return result.changes;
  }

  async pruneByType(type: EntryType, before: Date): Promise<number> {
    const stmt = this.db.prepare(
      'DELETE FROM nestlens_entries WHERE type = ? AND created_at < ?',
    );
    const result = stmt.run(type, before.toISOString());
    return result.changes;
  }

  /**
   * Build SQL filter conditions from CursorPaginationParams filters
   * This centralizes all filter logic to avoid duplication
   */
  private buildFilterConditions(
    filters: CursorPaginationParams['filters'],
  ): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filters) {
      return { conditions, params };
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
      const queryConditions = filters.queryTypes.map(() => `json_extract(e.payload, '$.query') LIKE ?`).join(' OR ');
      conditions.push(`(${queryConditions})`);
      params.push(...filters.queryTypes.map(qt => `${qt}%`));
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
      const nameConditions = filters.names.map(() => `json_extract(e.payload, '$.name') LIKE ?`).join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.names.map(n => `%${n}%`));
    }

    // Requests & Exceptions: methods filter
    if (filters.methods && filters.methods.length > 0) {
      const placeholders = filters.methods.map(() => '?').join(', ');
      conditions.push(`(json_extract(e.payload, '$.method') IN (${placeholders}) OR json_extract(e.payload, '$.request.method') IN (${placeholders}))`);
      params.push(...filters.methods, ...filters.methods);
    }

    // Requests & Exceptions: paths filter (supports LIKE)
    if (filters.paths && filters.paths.length > 0) {
      const requestConditions = filters.paths.map(() => `json_extract(e.payload, '$.path') LIKE ?`).join(' OR ');
      const exceptionConditions = filters.paths.map(() => `json_extract(e.payload, '$.request.url') LIKE ?`).join(' OR ');
      conditions.push(`((${requestConditions}) OR (${exceptionConditions}))`);
      const pathParams = filters.paths.map(p => p.includes('*') ? p.replace(/\*/g, '%') : `%${p}%`);
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
      const hostnameConditions = filters.hostnames.map(() =>
        `(json_extract(e.payload, '$.headers.host') LIKE ? OR json_extract(e.payload, '$.headers.Host') LIKE ? OR json_extract(e.payload, '$.hostname') LIKE ?)`
      ).join(' OR ');
      conditions.push(`(${hostnameConditions})`);
      filters.hostnames.forEach(h => {
        params.push(`%${h}%`, `%${h}%`, `%${h}%`);
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

    // Schedule: scheduleStatuses filter (started, completed, failed)
    if (filters.scheduleStatuses && filters.scheduleStatuses.length > 0) {
      const placeholders = filters.scheduleStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.scheduleStatuses);
    }

    // Jobs: jobStatuses filter (waiting, active, completed, failed, delayed)
    if (filters.jobStatuses && filters.jobStatuses.length > 0) {
      const placeholders = filters.jobStatuses.map(() => '?').join(', ');
      conditions.push(`json_extract(e.payload, '$.status') IN (${placeholders})`);
      params.push(...filters.jobStatuses);
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
      const nameConditions = filters.commandNames.map(() => `json_extract(e.payload, '$.name') LIKE ?`).join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.commandNames.map(n => `%${n}%`));
    }

    // Gate: gateNames filter
    if (filters.gateNames && filters.gateNames.length > 0) {
      const nameConditions = filters.gateNames.map(() => `json_extract(e.payload, '$.gate') LIKE ?`).join(' OR ');
      conditions.push(`(${nameConditions})`);
      params.push(...filters.gateNames.map(n => `%${n}%`));
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

    // Tags filter (OR logic) - handled separately since it requires JOIN
    if (filters.tags && filters.tags.length > 0) {
      const placeholders = filters.tags.map(() => '?').join(', ');
      conditions.push(`t.tag IN (${placeholders})`);
      params.push(...filters.tags);
    }

    // Search filter (searches in payload)
    if (filters.search) {
      conditions.push(`e.payload LIKE ?`);
      params.push(`%${filters.search}%`);
    }

    return { conditions, params };
  }

  async findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const limit = params.limit || 50;
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
        oldestSequence: entries.length > 0 ? entries[entries.length - 1].id! : null,
        newestSequence: entries.length > 0 ? entries[0].id! : null,
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
    if (!filters || Object.keys(filters).every(k => {
      const val = filters[k as keyof typeof filters];
      return val === undefined || (Array.isArray(val) && val.length === 0);
    })) {
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
    const totalStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM nestlens_entries',
    );
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
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO nestlens_tags (entry_id, tag)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((items: string[]) => {
      for (const tag of items) {
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
      for (const tag of items) {
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
    return rows.map(r => r.tag);
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

  async findByTags(tags: string[], logic: 'AND' | 'OR' = 'OR', limit: number = 50): Promise<Entry[]> {
    if (tags.length === 0) {
      return [];
    }

    let sql: string;
    const params: unknown[] = [];

    if (logic === 'AND') {
      // Entries that have ALL specified tags
      const placeholders = tags.map(() => '?').join(', ');
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
      params.push(...tags, tags.length, limit);
    } else {
      // Entries that have ANY of the specified tags
      const placeholders = tags.map(() => '?').join(', ');
      sql = `
        SELECT DISTINCT e.* FROM nestlens_entries e
        INNER JOIN nestlens_tags t ON e.id = t.entry_id
        WHERE t.tag IN (${placeholders})
        ORDER BY e.id DESC
        LIMIT ?
      `;
      params.push(...tags, limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EntryRow[];
    return rows.map(row => this.rowToEntry(row));
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(tag: string): Promise<MonitoredTag> {
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

  async removeMonitoredTag(tag: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM nestlens_monitored_tags WHERE tag = ?
    `);
    stmt.run(tag);
  }

  async getMonitoredTags(): Promise<MonitoredTag[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM nestlens_monitored_tags ORDER BY tag
    `);
    const rows = stmt.all() as MonitoredTagRow[];
    return rows.map(row => ({
      id: row.id,
      tag: row.tag,
      createdAt: row.created_at,
    }));
  }

  // ==================== Resolution ====================

  async resolveEntry(id: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE nestlens_entries
      SET resolved_at = CURRENT_TIMESTAMP
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
    return rows.map(row => this.rowToEntry(row));
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit: number = 50
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
    const ids = rows.map(row => row.latest_id);
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
