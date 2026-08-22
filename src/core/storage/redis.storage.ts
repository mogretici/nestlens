import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
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
import { hasFilters, matchesEntryFilters } from './entry-filter';
import { StorageInterface } from './storage.interface';
import { normalizeTag } from './tag-normalization';
import { RedisStorageConfig } from '../../nestlens.config';

/**
 * Redis storage implementation for NestLens.
 * Requires ioredis to be installed.
 * Ideal for production environments with horizontal scaling.
 *
 * Redis Key Structure:
 * - {prefix}entries:{id} - Hash storing entry data
 * - {prefix}entries:all - Sorted set of all entry IDs (score = id)
 * - {prefix}entries:type:{type} - Sorted set of entry IDs by type (score = id)
 * - {prefix}entries:createdAt - Sorted set of entry IDs by save time, for pruning
 * - {prefix}entries:request:{requestId} - Set of entry IDs for a request
 * - {prefix}entries:sequence - Counter for entry IDs
 * - {prefix}schema - Index layout version, so an upgrade rescores once
 * - {prefix}tags:{entryId} - Set of tags for an entry
 * - {prefix}tags:index:{tag} - Set of entry IDs with this tag
 * - {prefix}tags:counts - Hash of tag -> count
 * - {prefix}monitored - Hash of monitored tags
 * - {prefix}monitored:sequence - Counter for monitored tag IDs
 * - {prefix}family:{hash} - Set of entry IDs with this family hash
 */
/**
 * Bumped when the meaning of an index score changes, so an existing database is
 * rewritten once rather than read with the wrong assumption.
 */
const INDEX_SCHEMA_VERSION = '4';

/**
 * How many ids one pipeline carries.
 *
 * A pipeline is one round trip whatever its length, but the whole reply is
 * held in memory at both ends, so an unbounded one turns a large prune into a
 * large allocation. Five hundred keeps the reply small while spending one
 * round trip per five hundred entries instead of one per entry.
 */
const PIPELINE_CHUNK = 500;

/**
 * Whether an entry belongs on the Requests page.
 *
 * A GraphQL operation arrives over HTTP, so the request watcher records it as a
 * request as well, flagged; it belongs to the GraphQL page instead. Excluding
 * it after a page of ids had already been read meant a page of fifty came back
 * with however many were left — and the count above the list was of the whole
 * type index, so it disagreed with the list under it. The entries that belong
 * on the page have an index of their own, so paging and counting both read the
 * answer directly.
 */
const isPlainRequest = (entry: Pick<Entry, 'type' | 'payload'>): boolean =>
  entry.type === 'request' && (entry.payload as { isGraphQL?: boolean })?.isGraphQL !== true;

/** Splits ids into pipeline-sized runs. */
const inChunks = <T>(items: T[], size = PIPELINE_CHUNK): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

@Injectable()
export class RedisStorage implements StorageInterface, OnModuleDestroy {
  private readonly logger = new Logger(RedisStorage.name);
  private client: Redis | null = null;
  private readonly keyPrefix: string;
  /**
   * The most entries to keep, or `0` to keep everything.
   *
   * Age was the only bound this driver had, and Redis holds everything in
   * memory: a busy application filled the instance long before anything
   * reached `pruning.maxAge`.
   */
  private readonly maxEntries: number;
  /** Saves since the ceiling was last checked. See `enforceEntryLimit`. */
  private sinceLimitCheck = 0;
  private static readonly LIMIT_CHECK_EVERY = 100;
  /**
   * How many saves pass between limit checks, for this store's cap.
   *
   * The amortisation overshoots by up to a hundred entries, which is nothing
   * against the ten thousand of the default and everything against a small cap
   * set on purpose. Checking at whichever is smaller keeps the store within
   * twice what was asked for.
   */
  private readonly limitCheckEvery: number;
  private readonly config: RedisStorageConfig;

  constructor(config: RedisStorageConfig = {}) {
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? 'nestlens:';
    this.maxEntries = Math.max(0, config.maxEntries ?? 10_000);
    this.limitCheckEvery = Math.max(1, Math.min(RedisStorage.LIMIT_CHECK_EVERY, this.maxEntries));
  }

  /**
   * Builds a Redis key with the configured prefix
   */
  private key(...parts: string[]): string {
    return this.keyPrefix + parts.join(':');
  }

  /**
   * Lazily loads ioredis and creates a client
   */
  private async loadRedisClient(): Promise<Redis> {
    try {
      // Dynamic import - ioredis is an optional peer dependency
      const { default: RedisClient } = await import('ioredis');

      const commandTimeout = this.config.commandTimeout ?? 5000;

      const client = this.config.url
        ? new RedisClient(this.config.url, { commandTimeout })
        : new RedisClient({
            host: this.config.host ?? 'localhost',
            port: this.config.port ?? 6379,
            password: this.config.password,
            db: this.config.db ?? 0,
            commandTimeout,
          });

      return this.quieten(client);
    } catch (error) {
      // The message only fits a missing package, but this catch also covers a
      // failed connection or a bad option — reporting those as "install
      // ioredis" sends people looking in the wrong place entirely.
      const reason = error instanceof Error ? error.message : String(error);
      const missingModule = reason.includes('Cannot find module');

      throw new Error(
        missingModule
          ? 'ioredis is required for Redis storage. Install it with: npm install ioredis'
          : `Failed to initialize Redis storage: ${reason}`,
      );
    }
  }

  /**
   * Stops ioredis writing into the host application's logs.
   *
   * With no `error` listener, ioredis prints
   * `[ioredis] Unhandled error event: Error: connect ECONNREFUSED …` on every
   * reconnection attempt, forever. So a Redis that goes down does not degrade
   * NestLens quietly — it floods the logs of the application NestLens is
   * supposed to be helping somebody read.
   *
   * Reported once and then counted: the first failure is the news, and the
   * hundredth is the same news. The count goes out when the connection comes
   * back, because "it was down for 4,812 attempts" is worth knowing.
   */
  private quieten(client: Redis): Redis {
    let suppressed = 0;

    client.on('error', (error: Error) => {
      if (suppressed === 0) {
        this.logger.warn(
          `Redis connection error: ${error.message}. ` +
            'Entries are not being stored; further errors will be counted rather than logged.',
        );
      }

      suppressed += 1;
    });

    client.on('ready', () => {
      if (suppressed > 0) {
        this.logger.log(`Redis connection restored after ${suppressed} failed attempts`);
        suppressed = 0;
      }
    });

    return client;
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  async initialize(): Promise<void> {
    this.client = await this.loadRedisClient();

    // ioredis connects in the background, so this is the first command anything
    // sends — and the first chance for an unreachable Redis to throw. NestLens
    // is a debugging tool: it does not get to stop the application it is
    // watching from starting. The rescore is retried on the next boot.
    try {
      await this.migrateIndexScores();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not prepare the entry indexes: ${reason}`);
    }

    this.logger.log('Redis storage initialized');
  }

  /**
   * Rescores an index written by an earlier version.
   *
   * Entries used to be scored by their save time, which put a millisecond clock
   * where the cursor expects a sequence number. Left alone after an upgrade, the
   * old members would keep their huge timestamp scores and sort above every new
   * entry — so the listing would open on yesterday's data and paging would
   * misbehave around the boundary.
   *
   * The ids are already there as members, so the scores can simply be rewritten
   * and the time index rebuilt from each entry's own `createdAt`. Nothing is
   * deleted: an upgrade keeps whatever the application had recorded.
   */
  private async migrateIndexScores(): Promise<void> {
    const client = this.getClient();
    const schemaKey = this.key('schema');

    if ((await client.get(schemaKey)) === INDEX_SCHEMA_VERSION) {
      return;
    }

    const ids = await client.zrange(this.key('entries', 'all'), 0, -1);
    let rescored = 0;

    // Chunked: reading every entry ever stored into one reply is an allocation
    // that grows with the store, on the path an application takes to start.
    for (const chunk of inChunks(ids)) {
      const reader = client.pipeline();
      for (const id of chunk) {
        reader.hgetall(this.key('entries', id));
      }
      const hashes = (await reader.exec()) ?? [];

      const writer = client.pipeline();

      chunk.forEach((id, index) => {
        const [error, value] = hashes[index] ?? [];
        const hash = error ? undefined : (value as Record<string, string> | undefined);
        if (!hash?.type) {
          return;
        }

        writer.zadd(this.key('entries', 'all'), Number(id), id);
        writer.zadd(this.key('entries', 'type', hash.type), Number(id), id);

        const createdAt = Date.parse(hash.createdAt ?? '');
        writer.zadd(
          this.key('entries', 'createdAt'),
          Number.isNaN(createdAt) ? Number(id) : createdAt,
          id,
        );

        // The flag was only ever kept inside the payload, so entries stored
        // before this version have to be read once to build the index the
        // Requests page now pages and counts against.
        if (hash.type === 'request' && !this.wasGraphQL(hash.payload)) {
          writer.zadd(this.key('entries', 'type', 'request', 'rest'), Number(id), id);
        }

        rescored += 1;
      });

      await writer.exec();
    }

    if (rescored > 0) {
      this.logger.log(`Rescored ${rescored} entries onto the sequence index`);
    }

    await client.set(schemaKey, INDEX_SCHEMA_VERSION);
  }

  /** Reads the GraphQL flag out of a stored payload, which may be anything. */
  private wasGraphQL(payload: string | undefined): boolean {
    if (!payload) return false;
    try {
      return (JSON.parse(payload) as { isGraphQL?: boolean })?.isGraphQL === true;
    } catch {
      return false;
    }
  }

  // ==================== Core CRUD Operations ====================

  async save(entry: Entry): Promise<Entry> {
    const client = this.getClient();

    const id = await client.incr(this.key('entries', 'sequence'));
    // The collector stamps an entry when the thing happened; the buffer holds
    // it for up to a second, so stamping it here recorded the flush instead.
    const createdAt = entry.createdAt ?? new Date().toISOString();
    // The index pruning asks its time question of, from the same stamp the
    // entry carries — otherwise an entry that happened before a flush was
    // pruned as though it had happened at the flush.
    const timestamp = Date.parse(createdAt);

    const savedEntry: Entry = {
      ...entry,
      id,
      createdAt,
    };

    // One pipeline rather than five awaits. Every write below is independent of
    // the others' replies, and `save` is what the exception filter calls
    // directly — six sequential round trips cost 15 ms per entry against a
    // Redis one millisecond away, where the whole set costs one.
    const writes = client.pipeline();

    writes.hset(
      this.key('entries', String(id)),
      'id',
      String(id),
      'type',
      entry.type,
      'requestId',
      entry.requestId ?? '',
      'payload',
      JSON.stringify(entry.payload),
      'createdAt',
      createdAt,
      'familyHash',
      entry.familyHash ?? '',
      'resolvedAt',
      entry.resolvedAt ?? '',
    );

    // Scored by id, not by time: the id is what a cursor carries, and it is
    // unique. Scoring by timestamp made `beforeSequence` compare an id against a
    // millisecond clock — every page after the first came back empty — and gave
    // entries saved in the same millisecond equal scores, so an exclusive range
    // would have skipped them.
    writes.zadd(this.key('entries', 'all'), id, String(id));
    writes.zadd(this.key('entries', 'type', entry.type), id, String(id));
    // Pruning is the one thing that genuinely asks a time question.
    writes.zadd(this.key('entries', 'createdAt'), timestamp, String(id));

    // Add to request index if applicable
    if (entry.requestId) {
      writes.sadd(this.key('entries', 'request', entry.requestId), String(id));
    }

    if (isPlainRequest(entry)) {
      writes.zadd(this.key('entries', 'type', 'request', 'rest'), id, String(id));
    }

    await writes.exec();
    await this.enforceEntryLimit(1);

    return savedEntry;
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    if (entries.length === 0) return [];

    const client = this.getClient();
    const pipeline = client.pipeline();
    const results: Entry[] = [];

    // Pre-fetch IDs
    const startId = await client.incrby(this.key('entries', 'sequence'), entries.length);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const id = startId - entries.length + 1 + i;
      const createdAt = entry.createdAt ?? new Date().toISOString();

      const savedEntry: Entry = { ...entry, id, createdAt };
      results.push(savedEntry);

      pipeline.hset(
        this.key('entries', String(id)),
        'id',
        String(id),
        'type',
        entry.type,
        'requestId',
        entry.requestId ?? '',
        'payload',
        JSON.stringify(entry.payload),
        'createdAt',
        createdAt,
        'familyHash',
        entry.familyHash ?? '',
        'resolvedAt',
        entry.resolvedAt ?? '',
      );

      pipeline.zadd(this.key('entries', 'all'), id, String(id));
      pipeline.zadd(this.key('entries', 'type', entry.type), id, String(id));
      // From the entry's own stamp. `+ i` keeps two entries of the same
      // millisecond apart, which the score has to do to be a total order.
      pipeline.zadd(this.key('entries', 'createdAt'), Date.parse(createdAt) + i, String(id));

      if (entry.requestId) {
        pipeline.sadd(this.key('entries', 'request', entry.requestId), String(id));
      }

      if (isPlainRequest(entry)) {
        pipeline.zadd(this.key('entries', 'type', 'request', 'rest'), id, String(id));
      }
    }

    await pipeline.exec();
    await this.enforceEntryLimit(entries.length);

    return results;
  }

  /**
   * Keeps the newest `maxEntries` and deletes the rest.
   *
   * `zcard` is O(1) and the oldest ids come straight off the front of the same
   * sorted set, so the cost is one command plus whatever is actually over the
   * line. Amortised anyway: checking on every write would be a round trip per
   * entry, and overshooting by up to a hundred out of thousands is not worth
   * one.
   */
  private async enforceEntryLimit(saved: number): Promise<void> {
    if (this.maxEntries <= 0) return;

    this.sinceLimitCheck += saved;
    if (this.sinceLimitCheck < this.limitCheckEvery) return;
    this.sinceLimitCheck = 0;

    const client = this.getClient();
    const total = await client.zcard(this.key('entries', 'all'));
    const overflow = total - this.maxEntries;

    if (overflow <= 0) return;

    const oldest = await client.zrange(this.key('entries', 'all'), 0, overflow - 1);
    await this.deleteEntries(oldest);
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    const client = this.getClient();

    let ids: string[];

    if (filter.requestId) {
      ids = await client.smembers(this.key('entries', 'request', filter.requestId));
    } else {
      // Through `indexFor`, so a page of requests is a page of the entries the
      // Requests page lists. Reading the type index and dropping the GraphQL
      // operations afterwards returned however many of the fifty were left.
      const start = filter.offset ?? 0;
      const end = start + (filter.limit ?? 100) - 1;
      ids = await client.zrevrange(this.indexFor(filter.type), start, end);
    }

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids);

    // Apply date filters
    let filtered = entries;
    if (filter.from) {
      const fromTime = filter.from.getTime();
      filtered = filtered.filter((e) => new Date(e.createdAt).getTime() >= fromTime);
    }
    if (filter.to) {
      const toTime = filter.to.getTime();
      filtered = filtered.filter((e) => new Date(e.createdAt).getTime() <= toTime);
    }

    return this.hydrateEntriesWithTags(filtered);
  }

  async findWithCursor(
    type: EntryType | undefined,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const indexKey = this.indexFor(type);

    return hasFilters(params.filters)
      ? this.findFiltered(indexKey, params)
      : this.findPage(indexKey, params);
  }

  /**
   * A page with no filter on it: one ranged read of the index.
   *
   * The common case, and the one the live tail polls, so it stays proportional
   * to the page rather than to the store.
   */
  private async findPage(
    indexKey: string,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const client = this.getClient();
    const limit = params.limit ?? 50;

    let ids = await this.readIds(indexKey, params, limit + 1);

    const hasMore = ids.length > limit;
    if (hasMore) ids = ids.slice(0, limit);

    if (params.afterSequence !== undefined) {
      ids.reverse();
    }

    const entries = await this.hydrateEntriesWithTags(await this.fetchEntriesByIds(ids));
    const total = await client.zcard(indexKey);

    return this.pageOf(entries, hasMore, total);
  }

  /**
   * A page with a filter on it.
   *
   * The filter used to be applied to the page after it had been read, so it
   * removed rows from the fifty that happened to be newest instead of choosing
   * fifty from the rows that match. Anything whose matches were not in the
   * newest page came back empty — measured at 0 rows where the other two
   * backends returned 5 — and `total` counted the whole index, so the heading
   * said 205 above an empty list.
   *
   * Both numbers need the same walk, so one pass does both: it reads the index
   * in chunks from the cursor outwards, keeps the first `limit` matches and
   * counts the rest. That is proportional to the store, which is what the other
   * two backends also pay for a filtered view — `countWithFilters` scans in
   * memory, and SQLite counts with a `WHERE`. Only here does the walk cross a
   * network, so it goes out in pipelines rather than one command at a time.
   */
  private async findFiltered(
    indexKey: string,
    params: CursorPaginationParams,
  ): Promise<CursorPaginatedResponse<Entry>> {
    const limit = params.limit ?? 50;
    const ascending = params.afterSequence !== undefined;

    const candidates = await this.readIds(indexKey, params);
    const matches: StoredEntry[] = [];
    let total = 0;

    for (const chunk of inChunks(candidates)) {
      const entries = await this.hydrateEntriesWithTags(await this.fetchEntriesByIds(chunk));

      for (const entry of entries) {
        if (!matchesEntryFilters(entry, params.filters)) continue;
        total += 1;
        if (matches.length < limit + 1) matches.push(entry);
      }
    }

    const hasMore = matches.length > limit;
    const page = matches.slice(0, limit);

    if (ascending) page.reverse();

    return this.pageOf(page, hasMore, total);
  }

  /**
   * The ids the cursor selects, newest first unless it asks for what is newer.
   *
   * `count` bounds the read where the caller only needs a page; a filtered walk
   * leaves it out, because it cannot know how far it has to go.
   */
  private async readIds(
    indexKey: string,
    params: CursorPaginationParams,
    count?: number,
  ): Promise<string[]> {
    const client = this.getClient();
    const window: [string, string, string] | [] =
      count === undefined ? [] : ['LIMIT', '0', String(count)];

    if (params.beforeSequence !== undefined) {
      return client.zrevrangebyscore(
        indexKey,
        `(${params.beforeSequence}`,
        '-inf',
        ...(window as ['LIMIT', string, string]),
      );
    }

    if (params.afterSequence !== undefined) {
      return client.zrangebyscore(
        indexKey,
        `(${params.afterSequence}`,
        '+inf',
        ...(window as ['LIMIT', string, string]),
      );
    }

    return count === undefined
      ? client.zrevrange(indexKey, 0, -1)
      : client.zrevrange(indexKey, 0, count - 1);
  }

  private pageOf(
    entries: StoredEntry[],
    hasMore: boolean,
    total: number,
  ): CursorPaginatedResponse<Entry> {
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

  async findById(id: number): Promise<Entry | null> {
    const client = this.getClient();
    const hash = await client.hgetall(this.key('entries', String(id)));

    if (!hash?.id) return null;

    const entry = this.hashToEntry(hash);
    if (!entry) return null;

    const [hydrated] = await this.hydrateEntriesWithTags([entry]);
    return hydrated;
  }

  async count(type?: EntryType): Promise<number> {
    const client = this.getClient();

    if (!type) {
      return client.zcard(this.key('entries', 'all'));
    }

    // A GraphQL operation arrives over HTTP, so the request watcher records it
    // as a request too, flagged. It belongs to the GraphQL page and not to the
    // Requests page, and `find` and `findWithCursor` have excluded it here for
    // some time — this did not, so the badge above the list disagreed with the
    // list under it.
    if (type !== 'request') {
      return client.zcard(this.key('entries', 'type', type));
    }

    // The index the Requests page pages against, so the badge cannot disagree
    // with the list under it. This used to read the payload of every request
    // entry ever recorded and parse each one — a reply that grew with the
    // store, for a number the dashboard polls.
    return client.zcard(this.indexFor('request'));
  }

  /**
   * The sorted set a type is listed and counted from.
   *
   * Requests have two: the type index, which includes the GraphQL operations
   * the request watcher also records, and the one the Requests page means.
   */
  private indexFor(type?: EntryType): string {
    if (!type) return this.key('entries', 'all');
    if (type === 'request') return this.key('entries', 'type', 'request', 'rest');
    return this.key('entries', 'type', type);
  }

  /**
   * Removes everything NestLens has stored.
   *
   * Scanned rather than listed. `KEYS` walks the entire keyspace in one
   * uninterruptible step, so on a Redis shared with the application — the
   * ordinary arrangement — a reader pressing Clear stalled every other client
   * for as long as the walk took. This is reachable from the dashboard, so it
   * must not be able to do that. `SCAN` gives the server its loop back between
   * batches, and the deletes go out in pipelines rather than as one `DEL` with
   * a million arguments.
   */
  async clear(): Promise<void> {
    const client = this.getClient();
    let cursor = '0';
    let removed = 0;

    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${this.keyPrefix}*`, 'COUNT', 500);
      cursor = next;

      if (keys.length > 0) {
        const deletes = client.pipeline();
        for (const key of keys) {
          deletes.del(key);
        }
        await deletes.exec();
        removed += keys.length;
      }
    } while (cursor !== '0');

    this.logger.log(`Storage cleared (${removed} keys)`);
  }

  /**
   * Closes the connection, whether or not there ever was one.
   *
   * `quit()` sends a command and waits for the answer, so against a server
   * that never accepted the connection it waited out `commandTimeout` and then
   * *rejected* — from `onModuleDestroy`, where nothing catches it. Shutting
   * down an application whose Redis was unreachable ended the process on an
   * unhandled rejection, which is the one thing a debugging tool must never do
   * to the thing it is watching.
   *
   * `disconnect()` closes the socket without asking, which is the only thing
   * left to do when there is nobody to ask — and asking a client that is not
   * ready costs the whole command timeout before it fails, five seconds of a
   * shutdown for a question that cannot be answered.
   */
  async close(): Promise<void> {
    const client = this.client;
    this.client = null;

    if (!client) {
      this.logger.log('Redis storage closed');
      return;
    }

    if (client.status === 'ready') {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    } else {
      client.disconnect();
    }

    this.logger.log('Redis storage closed');
  }

  // ==================== Statistics ====================

  /**
   * How many entries each type holds, in one round trip.
   *
   * Eighteen sequential `zcard` calls were 50 ms of a dashboard refresh against
   * a Redis one millisecond away, for eighteen numbers that do not depend on
   * each other.
   */
  private async countByType(
    types: EntryType[],
  ): Promise<{ byType: Record<EntryType, number>; total: number }> {
    const reader = this.getClient().pipeline();
    for (const type of types) {
      reader.zcard(this.key('entries', 'type', type));
    }

    const results = (await reader.exec()) ?? [];
    const byType: Record<EntryType, number> = {} as Record<EntryType, number>;
    let total = 0;

    types.forEach((type, index) => {
      const [error, value] = results[index] ?? [];
      const count = error ? 0 : Number(value ?? 0);
      if (count > 0) {
        byType[type] = count;
        total += count;
      }
    });

    return { byType, total };
  }

  async getLatestSequence(type?: EntryType): Promise<number | null> {
    const client = this.getClient();
    const key = type ? this.key('entries', 'type', type) : this.key('entries', 'all');

    const result = await client.zrevrange(key, 0, 0);
    return result.length > 0 ? parseInt(result[0], 10) : null;
  }

  async hasEntriesAfter(sequence: number, type?: EntryType): Promise<number> {
    const client = this.getClient();
    const key = type ? this.key('entries', 'type', type) : this.key('entries', 'all');
    return client.zcount(key, `(${sequence}`, '+inf');
  }

  async getStats(): Promise<EntryStats> {
    // Get counts by type
    const types: EntryType[] = [
      'request',
      'query',
      'exception',
      'log',
      'cache',
      'event',
      'job',
      'schedule',
      'mail',
      'http-client',
      'redis',
      'model',
      'notification',
      'view',
      'command',
      'gate',
      'batch',
      'dump',
    ];

    const { byType, total } = await this.countByType(types);

    // For avgResponseTime and slowQueries, we'd need to iterate over entries
    // which is expensive in Redis. Return undefined for now.

    return {
      total,
      byType,
      avgResponseTime: undefined,
      slowQueries: 0,
      exceptions: byType.exception || 0,
      unresolvedExceptions: 0,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    const client = this.getClient();

    const types: EntryType[] = [
      'request',
      'query',
      'exception',
      'log',
      'cache',
      'event',
      'job',
      'schedule',
      'mail',
      'http-client',
      'redis',
      'model',
      'notification',
      'view',
      'command',
      'gate',
      'batch',
      'dump',
    ];

    const { byType, total } = await this.countByType(types);

    const [oldest, newest] = await client
      .pipeline()
      .zrange(this.key('entries', 'all'), 0, 0)
      .zrevrange(this.key('entries', 'all'), 0, 0)
      .exec()
      .then((results) => (results ?? []).map(([, value]) => (value as string[]) ?? []));

    const ends = client.pipeline();
    if (oldest.length > 0) ends.hget(this.key('entries', oldest[0]), 'createdAt');
    if (newest.length > 0) ends.hget(this.key('entries', newest[0]), 'createdAt');
    const stamps = (await ends.exec()) ?? [];

    const oldestEntry = oldest.length > 0 ? ((stamps[0]?.[1] as string) ?? null) : null;
    const newestEntry =
      newest.length > 0 ? ((stamps[oldest.length > 0 ? 1 : 0]?.[1] as string) ?? null) : null;

    return {
      total,
      byType,
      oldestEntry,
      newestEntry,
      databaseSize: undefined, // Redis doesn't expose this easily
    };
  }

  // ==================== Pruning ====================

  async prune(before: Date): Promise<number> {
    const client = this.getClient();
    const maxScore = before.getTime();

    const ids = await client.zrangebyscore(this.key('entries', 'createdAt'), '-inf', maxScore);
    if (ids.length === 0) return 0;

    await this.deleteEntries(ids);

    this.logger.log(`Pruned ${ids.length} entries older than ${before.toISOString()}`);
    return ids.length;
  }

  async pruneByType(type: EntryType, before: Date): Promise<number> {
    const client = this.getClient();
    const maxScore = before.getTime();

    const olderThanCutoff = await client.zrangebyscore(
      this.key('entries', 'createdAt'),
      '-inf',
      maxScore,
    );

    // The type index is scored by id now, so it can no longer answer a time
    // question on its own; membership is what it is asked for instead.
    const typeKey = this.key('entries', 'type', type);
    const membership: (string | null)[] = [];

    for (const chunk of inChunks(olderThanCutoff)) {
      const reader = client.pipeline();
      for (const id of chunk) {
        reader.zscore(typeKey, id);
      }
      for (const [error, score] of (await reader.exec()) ?? []) {
        membership.push(error ? null : ((score as string | null) ?? null));
      }
    }

    const ids = olderThanCutoff.filter((_, index) => membership[index] !== null);

    if (ids.length === 0) return 0;

    await this.deleteEntries(ids);

    return ids.length;
  }

  // ==================== Tag Methods ====================

  async addTags(entryId: number, tags: string[]): Promise<void> {
    const client = this.getClient();

    // An entry that is not there cannot be tagged — the same rule the other
    // two backends follow. The collector tags an entry just after saving it,
    // and pruning or the entry cap can remove it in between; storing the tag
    // anyway left it counted for an id nothing else knows about.
    if (!(await client.exists(this.key('entries', String(entryId))))) {
      return;
    }

    const pipeline = client.pipeline();

    for (const rawTag of tags) {
      // Normalize tags to uppercase for consistent storage
      const tag = rawTag.toUpperCase();
      pipeline.sadd(this.key('tags', String(entryId)), tag);
      pipeline.sadd(this.key('tags', 'index', tag), String(entryId));
      // The tag's name, so `getAllTags` knows which sets to measure. How many
      // entries carry it is not recorded here — see `getAllTags`.
      pipeline.sadd(this.key('tags', 'names'), tag);
    }

    await pipeline.exec();
  }

  async removeTags(entryId: number, tags: string[]): Promise<void> {
    if (tags.length === 0) return;

    const pipeline = this.getClient().pipeline();

    for (const rawTag of tags) {
      // Normalize to uppercase for consistent lookup
      const tag = rawTag.toUpperCase();
      pipeline.srem(this.key('tags', String(entryId)), tag);
      pipeline.srem(this.key('tags', 'index', tag), String(entryId));
    }

    await pipeline.exec();
  }

  async getEntryTags(entryId: number): Promise<string[]> {
    const client = this.getClient();
    const tags = await client.smembers(this.key('tags', String(entryId)));
    return tags.sort();
  }

  /**
   * Every tag in use, and how many entries carry it.
   *
   * Counted from the sets that hold the answer rather than from a running
   * total kept alongside them. The total was maintained by three call sites,
   * none of which could see whether the set had actually changed: tagging an
   * entry twice counted it twice, removing a tag left the count behind, and
   * removing one that was never there drove it negative — `NEVER: -1`, hidden
   * from this list only by the filter below. A second source of truth for
   * something already recorded exactly once can only ever drift from it.
   *
   * One round trip: the names in one read, the sizes in one pipeline.
   */
  async getAllTags(): Promise<TagWithCount[]> {
    const client = this.getClient();
    const names = await client.smembers(this.key('tags', 'names'));

    if (names.length === 0) {
      return [];
    }

    const pipeline = client.pipeline();
    for (const tag of names) {
      pipeline.scard(this.key('tags', 'index', tag));
    }

    const results = (await pipeline.exec()) ?? [];

    return (
      names
        .map((tag, index) => {
          const [error, size] = results[index] ?? [null, 0];
          return { tag, count: error ? 0 : Number(size ?? 0) };
        })
        // A tag whose last entry was pruned keeps its name here and no members;
        // it is not in use, so it is not listed.
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    );
  }

  async findByTags(tags: string[], logic: 'AND' | 'OR' = 'OR', limit = 50): Promise<Entry[]> {
    if (tags.length === 0) return [];

    const client = this.getClient();
    // Normalize input tags to uppercase for case-insensitive matching
    const normalizedTags = tags.map((t) => t.toUpperCase());
    const tagKeys = normalizedTags.map((t) => this.key('tags', 'index', t));

    let ids: string[];
    if (logic === 'AND') {
      ids = await client.sinter(...tagKeys);
    } else {
      ids = await client.sunion(...tagKeys);
    }

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids.slice(0, limit));
    const sorted = entries.sort((a, b) => b.id - a.id);
    return this.hydrateEntriesWithTags(sorted);
  }

  // ==================== Monitored Tags ====================

  async addMonitoredTag(rawTag: string): Promise<MonitoredTag> {
    const tag = normalizeTag(rawTag);
    const client = this.getClient();
    const existing = await client.hget(this.key('monitored'), tag);

    if (existing) {
      return JSON.parse(existing);
    }

    const id = await client.incr(this.key('monitored', 'sequence'));
    const monitored: MonitoredTag = {
      id,
      tag,
      createdAt: new Date().toISOString(),
    };

    await client.hset(this.key('monitored'), tag, JSON.stringify(monitored));
    return monitored;
  }

  async removeMonitoredTag(rawTag: string): Promise<void> {
    const client = this.getClient();
    await client.hdel(this.key('monitored'), normalizeTag(rawTag));
  }

  async getMonitoredTags(): Promise<MonitoredTag[]> {
    const client = this.getClient();
    const all = await client.hgetall(this.key('monitored'));

    return Object.values(all)
      .filter((v) => v && v !== '')
      .map((v) => JSON.parse(v) as MonitoredTag)
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // ==================== Resolution ====================

  async resolveEntry(id: number): Promise<void> {
    const client = this.getClient();
    await client.hset(this.key('entries', String(id)), 'resolvedAt', new Date().toISOString());
  }

  async unresolveEntry(id: number): Promise<void> {
    const client = this.getClient();
    await client.hset(this.key('entries', String(id)), 'resolvedAt', '');
  }

  // ==================== Family Hash ====================

  async updateFamilyHash(id: number, familyHash: string): Promise<void> {
    const client = this.getClient();
    await client.hset(this.key('entries', String(id)), 'familyHash', familyHash);
    await client.sadd(this.key('family', familyHash), String(id));
  }

  async findByFamilyHash(familyHash: string, limit = 50): Promise<Entry[]> {
    const client = this.getClient();
    const ids = await client.smembers(this.key('family', familyHash));

    if (ids.length === 0) return [];

    const entries = await this.fetchEntriesByIds(ids);
    const sorted = entries.sort((a, b) => b.id - a.id).slice(0, limit);
    return this.hydrateEntriesWithTags(sorted);
  }

  async getGroupedByFamilyHash(
    type?: EntryType,
    limit = 50,
  ): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]> {
    const client = this.getClient();

    // Get all family hash keys
    const familyKeys = await client.keys(this.key('family', '*'));
    const groups: { familyHash: string; count: number; latestEntry: StoredEntry }[] = [];

    for (const key of familyKeys) {
      const familyHash = key.replace(this.key('family', ''), '');
      const ids = await client.smembers(key);

      if (ids.length === 0) continue;

      // Get entries for this family
      const entries = await this.fetchEntriesByIds(ids);
      const filtered = type ? entries.filter((e) => e.type === type) : entries;

      if (filtered.length === 0) continue;

      // Sort and get latest
      filtered.sort((a, b) => b.id - a.id);
      const [latestEntry] = await this.hydrateEntriesWithTags([filtered[0]]);

      groups.push({
        familyHash,
        count: filtered.length,
        latestEntry,
      });
    }

    return groups
      .sort((a, b) => b.count - a.count || b.latestEntry.id - a.latestEntry.id)
      .slice(0, limit);
  }

  // ==================== Lifecycle ====================

  onModuleDestroy(): void {
    this.close().catch((err) => {
      this.logger.error('Error closing Redis connection', err);
    });
  }

  // ==================== Private Helpers ====================

  private async fetchEntriesByIds(ids: string[]): Promise<StoredEntry[]> {
    if (ids.length === 0) return [];

    const client = this.getClient();
    const pipeline = client.pipeline();

    for (const id of ids) {
      pipeline.hgetall(this.key('entries', id));
    }

    const results = await pipeline.exec();
    const entries: StoredEntry[] = [];

    for (const [err, data] of results ?? []) {
      if (err || !data || typeof data !== 'object') continue;
      const hash = data as Record<string, string>;
      if (!hash.id) continue;

      const entry = this.hashToEntry(hash);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private hashToEntry(hash: Record<string, string>): StoredEntry | null {
    try {
      return {
        id: parseInt(hash.id, 10),
        type: hash.type as EntryType,
        requestId: hash.requestId || undefined,
        payload: JSON.parse(hash.payload || '{}'),
        createdAt: hash.createdAt,
        familyHash: hash.familyHash || undefined,
        resolvedAt: hash.resolvedAt || undefined,
      } as StoredEntry;
    } catch {
      return null;
    }
  }

  /**
   * Attaches each entry's tags.
   *
   * One round trip for the page. It used to be one per row, which a list of
   * fifty paid fifty times over on every poll — 146 ms of a 257 ms dashboard
   * refresh against a Redis one millisecond away, nearly all of it waiting.
   */
  private async hydrateEntriesWithTags(entries: StoredEntry[]): Promise<StoredEntry[]> {
    if (entries.length === 0) return [];

    const client = this.getClient();
    const reader = client.pipeline();

    for (const entry of entries) {
      reader.smembers(this.key('tags', String(entry.id)));
    }

    const results = (await reader.exec()) ?? [];

    return entries.map((entry, index) => {
      const [error, tags] = results[index] ?? [];
      return {
        ...entry,
        tags: error || !Array.isArray(tags) ? [] : (tags as string[]).slice().sort(),
      };
    });
  }

  /**
   * Removes entries and every index that mentions them.
   *
   * In pipelines, because this is what pruning does and pruning is the only
   * thing keeping the store bounded. One entry at a time cost eight sequential
   * round trips — 22 ms an entry against a Redis one millisecond away, so an
   * hourly prune of ten thousand entries took nearly four minutes of solid
   * traffic. Past a few hundred entries an hour it could not keep up at all,
   * and a store nothing removes from grows until Redis runs out of memory.
   */
  private async deleteEntries(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = this.getClient();

    for (const chunk of inChunks(ids)) {
      // What each entry belongs to has to be read before it can be unlinked.
      const reader = client.pipeline();
      for (const id of chunk) {
        reader.hgetall(this.key('entries', id));
        reader.smembers(this.key('tags', id));
      }
      const read = (await reader.exec()) ?? [];

      const writer = client.pipeline();

      chunk.forEach((id, index) => {
        const [hashError, hashValue] = read[index * 2] ?? [];
        const [tagError, tagValue] = read[index * 2 + 1] ?? [];

        const hash = hashError ? undefined : (hashValue as Record<string, string> | undefined);
        if (!hash?.type) return;

        writer.del(this.key('entries', id));
        writer.zrem(this.key('entries', 'all'), id);
        writer.zrem(this.key('entries', 'type', hash.type), id);
        writer.zrem(this.key('entries', 'createdAt'), id);
        writer.zrem(this.key('entries', 'type', 'request', 'rest'), id);

        if (hash.requestId) {
          writer.srem(this.key('entries', 'request', hash.requestId), id);
        }

        if (hash.familyHash) {
          writer.srem(this.key('family', hash.familyHash), id);
        }

        const tags = tagError ? [] : ((tagValue as string[]) ?? []);
        for (const tag of tags) {
          writer.srem(this.key('tags', 'index', tag), id);
        }
        writer.del(this.key('tags', id));
      });

      await writer.exec();
    }
  }
}
