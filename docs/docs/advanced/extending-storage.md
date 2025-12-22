---
sidebar_position: 2
---

# Extending Storage

Create custom storage backends to store NestLens data in your preferred database or service.

## Overview

NestLens uses a pluggable storage system that allows you to:
- Use different databases (PostgreSQL, MySQL, MongoDB, etc.)
- Integrate with external logging services
- Implement custom data retention policies
- Optimize storage for your needs

## Storage Interface

Implement the `StorageInterface` to create a custom backend:

```typescript
import { StorageInterface } from 'nestlens';

export interface StorageInterface {
  // Initialization
  initialize(): Promise<void>;

  // Entry management
  save(entry: Entry): Promise<Entry>;
  saveBatch(entries: Entry[]): Promise<Entry[]>;
  find(filter: EntryFilter): Promise<Entry[]>;
  findById(id: number): Promise<Entry | null>;
  findWithCursor(type: EntryType | undefined, params: CursorPaginationParams): Promise<CursorPaginatedResponse<Entry>>;

  // Statistics
  count(type?: EntryType): Promise<number>;
  getStats(): Promise<EntryStats>;
  getStorageStats(): Promise<StorageStats>;
  getLatestSequence(type?: EntryType): Promise<number | null>;
  hasEntriesAfter(sequence: number, type?: EntryType): Promise<number>;

  // Data management
  prune(before: Date): Promise<number>;
  pruneByType(type: EntryType, before: Date): Promise<number>;
  clear(): Promise<void>;
  close(): Promise<void>;

  // Tags
  addTags(entryId: number, tags: string[]): Promise<void>;
  removeTags(entryId: number, tags: string[]): Promise<void>;
  getEntryTags(entryId: number): Promise<string[]>;
  getAllTags(): Promise<TagWithCount[]>;
  findByTags(tags: string[], logic?: 'AND' | 'OR', limit?: number): Promise<Entry[]>;

  // Monitored tags
  addMonitoredTag(tag: string): Promise<MonitoredTag>;
  removeMonitoredTag(tag: string): Promise<void>;
  getMonitoredTags(): Promise<MonitoredTag[]>;

  // Resolution
  resolveEntry(id: number): Promise<void>;
  unresolveEntry(id: number): Promise<void>;

  // Family hash
  updateFamilyHash(id: number, familyHash: string): Promise<void>;
  findByFamilyHash(familyHash: string, limit?: number): Promise<Entry[]>;
  getGroupedByFamilyHash(type?: EntryType, limit?: number): Promise<{ familyHash: string; count: number; latestEntry: Entry }[]>;
}
```

## Creating a Custom Storage Backend

### PostgreSQL Example

```typescript
// postgres.storage.ts
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { StorageInterface, Entry, EntryFilter } from 'nestlens';

@Injectable()
export class PostgresStorage implements StorageInterface {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }

  async initialize(): Promise<void> {
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        request_id VARCHAR(100),
        family_hash VARCHAR(64),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_type ON entries(type);
      CREATE INDEX IF NOT EXISTS idx_request_id ON entries(request_id);
      CREATE INDEX IF NOT EXISTS idx_family_hash ON entries(family_hash);
      CREATE INDEX IF NOT EXISTS idx_created_at ON entries(created_at);

      CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
        tag VARCHAR(100) NOT NULL,
        PRIMARY KEY (entry_id, tag)
      );

      CREATE INDEX IF NOT EXISTS idx_tag ON entry_tags(tag);
    `);
  }

  async save(entry: Entry): Promise<Entry> {
    const result = await this.pool.query(
      `INSERT INTO entries (type, payload, request_id, family_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [entry.type, JSON.stringify(entry.payload), entry.requestId, entry.familyHash]
    );

    return {
      ...entry,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const savedEntries: Entry[] = [];
      for (const entry of entries) {
        const result = await client.query(
          `INSERT INTO entries (type, payload, request_id, family_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`,
          [entry.type, JSON.stringify(entry.payload), entry.requestId, entry.familyHash]
        );

        savedEntries.push({
          ...entry,
          id: result.rows[0].id,
          createdAt: result.rows[0].created_at,
        });
      }

      await client.query('COMMIT');
      return savedEntries;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    let query = 'SELECT * FROM entries WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(filter.type);
    }

    if (filter.requestId) {
      query += ` AND request_id = $${paramIndex++}`;
      params.push(filter.requestId);
    }

    if (filter.from) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filter.from);
    }

    if (filter.to) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filter.to);
    }

    query += ` ORDER BY created_at DESC`;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filter.offset);
    }

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      requestId: row.request_id,
      familyHash: row.family_hash,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    }));
  }

  async findById(id: number): Promise<Entry | null> {
    const result = await this.pool.query(
      'SELECT * FROM entries WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      requestId: row.request_id,
      familyHash: row.family_hash,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    };
  }

  async count(type?: EntryType): Promise<number> {
    let query = 'SELECT COUNT(*) FROM entries';
    const params: any[] = [];

    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }

    const result = await this.pool.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async prune(before: Date): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM entries WHERE created_at < $1',
      [before]
    );

    return result.rowCount || 0;
  }

  async clear(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE entries CASCADE');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Implement remaining methods...
  // (getStats, addTags, etc.)
}
```

### MongoDB Example

```typescript
// mongodb.storage.ts
import { Injectable } from '@nestjs/common';
import { MongoClient, Db, Collection } from 'mongodb';
import { StorageInterface, Entry } from 'nestlens';

@Injectable()
export class MongoDBStorage implements StorageInterface {
  private client: MongoClient;
  private db: Db;
  private entries: Collection;

  async initialize(): Promise<void> {
    this.client = await MongoClient.connect(process.env.MONGODB_URI);
    this.db = this.client.db('nestlens');
    this.entries = this.db.collection('entries');

    // Create indexes
    await this.entries.createIndex({ type: 1 });
    await this.entries.createIndex({ requestId: 1 });
    await this.entries.createIndex({ createdAt: -1 });
    await this.entries.createIndex({ familyHash: 1 });
  }

  async save(entry: Entry): Promise<Entry> {
    const doc = {
      ...entry,
      createdAt: new Date(),
    };

    const result = await this.entries.insertOne(doc);

    return {
      ...entry,
      id: result.insertedId.toString(),
      createdAt: doc.createdAt.toISOString(),
    };
  }

  async saveBatch(entries: Entry[]): Promise<Entry[]> {
    const docs = entries.map(entry => ({
      ...entry,
      createdAt: new Date(),
    }));

    const result = await this.entries.insertMany(docs);

    return entries.map((entry, index) => ({
      ...entry,
      id: result.insertedIds[index].toString(),
      createdAt: docs[index].createdAt.toISOString(),
    }));
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    const query: any = {};

    if (filter.type) {
      query.type = filter.type;
    }

    if (filter.requestId) {
      query.requestId = filter.requestId;
    }

    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) {
        query.createdAt.$gte = filter.from;
      }
      if (filter.to) {
        query.createdAt.$lte = filter.to;
      }
    }

    let cursor = this.entries.find(query).sort({ createdAt: -1 });

    if (filter.limit) {
      cursor = cursor.limit(filter.limit);
    }

    if (filter.offset) {
      cursor = cursor.skip(filter.offset);
    }

    const docs = await cursor.toArray();

    return docs.map(doc => ({
      id: doc._id.toString(),
      type: doc.type,
      payload: doc.payload,
      requestId: doc.requestId,
      familyHash: doc.familyHash,
      resolvedAt: doc.resolvedAt,
      createdAt: doc.createdAt.toISOString(),
      tags: doc.tags,
    }));
  }

  async prune(before: Date): Promise<number> {
    const result = await this.entries.deleteMany({
      createdAt: { $lt: before },
    });

    return result.deletedCount;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  // Implement remaining methods...
}
```

## Registering Custom Storage

Replace the default storage with your custom implementation:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { NestLensModule, STORAGE } from 'nestlens';
import { PostgresStorage } from './postgres.storage';

@Module({
  imports: [
    NestLensModule.forRoot({
      // NestLens configuration
    }),
  ],
  providers: [
    PostgresStorage,
    {
      provide: STORAGE,
      useClass: PostgresStorage,
    },
  ],
})
export class AppModule {}
```

## External Service Integration

### Elasticsearch Example

```typescript
// elasticsearch.storage.ts
import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { StorageInterface, Entry } from 'nestlens';

@Injectable()
export class ElasticsearchStorage implements StorageInterface {
  private client: Client;
  private index = 'nestlens-entries';

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL,
    });
  }

  async initialize(): Promise<void> {
    const exists = await this.client.indices.exists({
      index: this.index,
    });

    if (!exists) {
      await this.client.indices.create({
        index: this.index,
        body: {
          mappings: {
            properties: {
              type: { type: 'keyword' },
              payload: { type: 'object', enabled: true },
              requestId: { type: 'keyword' },
              familyHash: { type: 'keyword' },
              createdAt: { type: 'date' },
              tags: { type: 'keyword' },
            },
          },
        },
      });
    }
  }

  async save(entry: Entry): Promise<Entry> {
    const result = await this.client.index({
      index: this.index,
      body: {
        ...entry,
        createdAt: new Date().toISOString(),
      },
    });

    return {
      ...entry,
      id: result._id,
      createdAt: new Date().toISOString(),
    };
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    const must: any[] = [];

    if (filter.type) {
      must.push({ term: { type: filter.type } });
    }

    if (filter.requestId) {
      must.push({ term: { requestId: filter.requestId } });
    }

    if (filter.from || filter.to) {
      const range: any = {};
      if (filter.from) range.gte = filter.from;
      if (filter.to) range.lte = filter.to;
      must.push({ range: { createdAt: range } });
    }

    const result = await this.client.search({
      index: this.index,
      body: {
        query: {
          bool: { must },
        },
        sort: [{ createdAt: 'desc' }],
        size: filter.limit || 100,
        from: filter.offset || 0,
      },
    });

    return result.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source,
    } as Entry));
  }

  // Implement remaining methods...
}
```

## Hybrid Storage

Combine multiple storage backends:

```typescript
@Injectable()
export class HybridStorage implements StorageInterface {
  constructor(
    private primaryStorage: SqliteStorage,
    private archiveStorage: S3Storage,
  ) {}

  async save(entry: Entry): Promise<Entry> {
    // Save to primary storage
    const saved = await this.primaryStorage.save(entry);

    // Archive critical entries
    if (entry.type === 'exception' || entry.type === 'request') {
      await this.archiveStorage.save(saved);
    }

    return saved;
  }

  async find(filter: EntryFilter): Promise<Entry[]> {
    // Search primary first
    let entries = await this.primaryStorage.find(filter);

    // If not found and date is old, search archive
    if (entries.length === 0 && filter.from) {
      const age = Date.now() - filter.from.getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) { // 7 days
        entries = await this.archiveStorage.find(filter);
      }
    }

    return entries;
  }

  // Implement remaining methods...
}
```

## Best Practices

### 1. Use Transactions

Ensure data consistency:

```typescript
async saveBatch(entries: Entry[]): Promise<Entry[]> {
  const session = await this.db.startSession();
  session.startTransaction();

  try {
    const saved = await this.saveEntriesInTransaction(entries, session);
    await session.commitTransaction();
    return saved;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 2. Optimize Indexes

Create indexes for common queries:

```sql
CREATE INDEX idx_type_created ON entries(type, created_at);
CREATE INDEX idx_request_id ON entries(request_id);
CREATE INDEX idx_family_hash ON entries(family_hash);
```

### 3. Handle Large Payloads

Compress or externalize large data:

```typescript
async save(entry: Entry): Promise<Entry> {
  let payload = entry.payload;

  // Compress large payloads
  const size = JSON.stringify(payload).length;
  if (size > 100000) { // 100KB
    payload = await this.compress(payload);
  }

  return this.db.save({ ...entry, payload });
}
```

### 4. Implement Connection Pooling

Reuse database connections:

```typescript
private pool = new Pool({
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
});
```

### 5. Add Monitoring

Track storage performance:

```typescript
async save(entry: Entry): Promise<Entry> {
  const start = Date.now();

  try {
    const saved = await this.db.save(entry);

    metrics.histogram('storage.save.duration', Date.now() - start);
    metrics.increment('storage.save.success');

    return saved;
  } catch (error) {
    metrics.increment('storage.save.error');
    throw error;
  }
}
```

## Testing Custom Storage

```typescript
describe('PostgresStorage', () => {
  let storage: PostgresStorage;

  beforeAll(async () => {
    storage = new PostgresStorage();
    await storage.initialize();
  });

  afterAll(async () => {
    await storage.close();
  });

  it('should save and retrieve entry', async () => {
    const entry: Entry = {
      type: 'log',
      payload: {
        level: 'info',
        message: 'Test log',
      },
    };

    const saved = await storage.save(entry);
    expect(saved.id).toBeDefined();

    const found = await storage.findById(saved.id);
    expect(found).toEqual(saved);
  });
});
```

## Next Steps

- Create [Custom Watchers](./custom-watchers.md)
- Configure [Entry Filtering](./filtering-entries.md)
- Optimize [Performance](./performance.md)
