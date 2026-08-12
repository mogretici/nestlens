/**
 * One behaviour contract, asked of every storage backend.
 *
 * Which backend runs is a configuration line, and the dashboard behaves as if
 * the answer is the same either way. It has not always been: Redis paginated by
 * timestamp while the cursor carried an id, so paging through entries on Redis
 * returned the wrong window with nothing to notice — and Memory and SQLite only
 * started breaking timestamp ties by id after a page in the dashboard was seen
 * repeating a row.
 *
 * `filter-parity.spec.ts` covers the filters. This covers the rest of the
 * interface the API actually calls: cursor pagination, sequences, pruning, tags,
 * monitored tags and lookups that find nothing. Each expectation is written so
 * that a backend which does nothing at all fails it.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import RedisMock from 'ioredis-mock';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry, EntryType } from '../../../types';

const REQUEST = 'request' as EntryType;
const LOG = 'log' as EntryType;

const entry = (type: EntryType, payload: Record<string, unknown> = {}): Entry =>
  ({ type, payload }) as unknown as Entry;

class RedisStorageWithFake extends RedisStorage {
  async useFakeClient(): Promise<void> {
    const client = new RedisMock();
    await client.flushall();
    (this as unknown as { client: unknown }).client = client;
  }
}

const BACKENDS: Array<[string, () => Promise<StorageInterface>]> = [
  ['MemoryStorage', async () => new MemoryStorage({}) as unknown as StorageInterface],
  [
    'SqliteStorage',
    async () => {
      const storage = new SqliteStorage(':memory:');
      await (storage as unknown as { onModuleInit: () => Promise<void> }).onModuleInit();

      return storage as unknown as StorageInterface;
    },
  ],
  [
    'RedisStorage',
    async () => {
      const storage = new RedisStorageWithFake({ keyPrefix: `contract-${Math.random()}:` });
      await storage.useFakeClient();

      return storage as unknown as StorageInterface;
    },
  ],
];

describe.each(BACKENDS)('storage contract: %s', (_name, create) => {
  let storage: StorageInterface;

  beforeEach(async () => {
    storage = await create();
  });

  describe('saving and reading back', () => {
    it('gives every entry an id and returns it by that id', async () => {
      const saved = await storage.save(entry(REQUEST, { path: '/orders' }));

      expect(typeof saved.id).toBe('number');
      const found = await storage.findById(saved.id as number);
      expect(found?.payload).toMatchObject({ path: '/orders' });
    });

    it('returns null for an id that was never saved', async () => {
      expect(await storage.findById(987654)).toBeNull();
    });

    it('counts entries by type, and everything when asked for no type', async () => {
      await storage.saveBatch([entry(REQUEST), entry(REQUEST), entry(LOG)]);

      expect(await storage.count(REQUEST)).toBe(2);
      expect(await storage.count()).toBe(3);
    });
  });

  describe('cursor pagination', () => {
    /**
     * Entries saved in one go land on the same millisecond, which is exactly
     * the case that used to break: ordering by time alone left the boundary
     * between pages undefined, so a row could appear twice or not at all.
     */
    const seed = async (count: number): Promise<Entry[]> =>
      storage.saveBatch(Array.from({ length: count }, (_, index) => entry(REQUEST, { index })));

    it('walks the whole set in pages without repeating or dropping one', async () => {
      await seed(10);

      const seen: number[] = [];
      let cursor: number | undefined;

      for (let page = 0; page < 10; page += 1) {
        const result = await storage.findWithCursor(REQUEST, { limit: 3, beforeSequence: cursor });
        if (result.data.length === 0) break;

        seen.push(...result.data.map((found) => found.id as number));
        cursor = result.data[result.data.length - 1]?.id as number;
      }

      expect(seen).toHaveLength(10);
      expect(new Set(seen).size).toBe(10);
    });

    it('honours the page size', async () => {
      await seed(10);

      const page = await storage.findWithCursor(REQUEST, { limit: 4 });

      expect(page.data).toHaveLength(4);
    });

    it('returns newest first', async () => {
      const saved = await seed(5);
      const newest = Math.max(...saved.map((found) => found.id as number));

      const page = await storage.findWithCursor(REQUEST, { limit: 5 });

      expect(page.data[0]?.id).toBe(newest);
    });

    it('returns an empty page past the end rather than wrapping around', async () => {
      const saved = await seed(3);
      const oldest = Math.min(...saved.map((found) => found.id as number));

      const page = await storage.findWithCursor(REQUEST, { limit: 3, beforeSequence: oldest });

      expect(page.data).toEqual([]);
    });

    it('reads forwards from a cursor with afterSequence', async () => {
      const saved = await seed(5);
      const oldest = Math.min(...saved.map((found) => found.id as number));

      const page = await storage.findWithCursor(REQUEST, { limit: 10, afterSequence: oldest });

      expect(page.data.length).toBe(4);
      expect(page.data.every((found) => (found.id as number) > oldest)).toBe(true);
    });

    it('pages one type without letting another type in', async () => {
      await storage.saveBatch([entry(LOG), entry(REQUEST), entry(LOG)]);

      const page = await storage.findWithCursor(REQUEST, { limit: 10 });

      expect(page.data).toHaveLength(1);
    });
  });

  describe('sequences', () => {
    it('reports the newest id as the latest sequence', async () => {
      const saved = await storage.saveBatch([entry(REQUEST), entry(REQUEST)]);
      const newest = Math.max(...saved.map((found) => found.id as number));

      expect(await storage.getLatestSequence(REQUEST)).toBe(newest);
    });

    it('reports nothing as the latest sequence when there is nothing', async () => {
      expect(await storage.getLatestSequence(REQUEST)).toBeNull();
    });

    it('counts what arrived after a sequence, and nothing after the newest', async () => {
      const saved = await storage.saveBatch([entry(REQUEST), entry(REQUEST), entry(REQUEST)]);
      const ids = saved.map((found) => found.id as number).sort((a, b) => a - b);

      expect(await storage.hasEntriesAfter(ids[0] as number, REQUEST)).toBe(2);
      expect(await storage.hasEntriesAfter(ids[2] as number, REQUEST)).toBe(0);
    });
  });

  describe('pruning', () => {
    it('deletes what is older than the cutoff and keeps what is not', async () => {
      const old = await storage.save(entry(REQUEST, { age: 'old' }));
      await ageEntry(storage, old.id as number, new Date(Date.now() - 60 * 60 * 1000));
      const fresh = await storage.save(entry(REQUEST, { age: 'fresh' }));

      const removed = await storage.prune(new Date(Date.now() - 30 * 60 * 1000));

      expect(removed).toBe(1);
      expect(await storage.findById(old.id as number)).toBeNull();
      expect(await storage.findById(fresh.id as number)).not.toBeNull();
    });

    it('prunes only the type it was asked about', async () => {
      const request = await storage.save(entry(REQUEST));
      const log = await storage.save(entry(LOG));
      const cutoff = new Date(Date.now() + 60 * 1000);

      await storage.pruneByType(REQUEST, cutoff);

      expect(await storage.findById(request.id as number)).toBeNull();
      expect(await storage.findById(log.id as number)).not.toBeNull();
    });

    it('empties everything on clear', async () => {
      await storage.saveBatch([entry(REQUEST), entry(LOG)]);

      await storage.clear();

      expect(await storage.count()).toBe(0);
    });
  });

  describe('tags', () => {
    /**
     * Tags are normalised to upper case on the way in, on every backend, so
     * that `slow` and `SLOW` are one tag rather than two. The contract is what
     * comes back, not what went in.
     */
    it('attaches tags to an entry and reads them back, normalised', async () => {
      const saved = await storage.save(entry(REQUEST));

      await storage.addTags(saved.id as number, ['slow', 'checkout']);

      expect((await storage.getEntryTags(saved.id as number)).sort()).toEqual(['CHECKOUT', 'SLOW']);
    });

    it('removes a tag without removing the others', async () => {
      const saved = await storage.save(entry(REQUEST));
      await storage.addTags(saved.id as number, ['slow', 'checkout']);

      await storage.removeTags(saved.id as number, ['slow']);

      expect(await storage.getEntryTags(saved.id as number)).toEqual(['CHECKOUT']);
    });

    it('finds entries by any of the given tags', async () => {
      const first = await storage.save(entry(REQUEST));
      const second = await storage.save(entry(REQUEST));
      await storage.addTags(first.id as number, ['slow']);
      await storage.addTags(second.id as number, ['checkout']);

      const found = await storage.findByTags(['slow', 'checkout'], 'OR');

      expect(found).toHaveLength(2);
    });

    it('finds only entries carrying every tag when asked for AND', async () => {
      const both = await storage.save(entry(REQUEST));
      const one = await storage.save(entry(REQUEST));
      await storage.addTags(both.id as number, ['slow', 'checkout']);
      await storage.addTags(one.id as number, ['slow']);

      const found = await storage.findByTags(['slow', 'checkout'], 'AND');

      expect(found.map((entryFound) => entryFound.id)).toEqual([both.id]);
    });

    it('reports how many entries carry each tag', async () => {
      const first = await storage.save(entry(REQUEST));
      const second = await storage.save(entry(REQUEST));
      await storage.addTags(first.id as number, ['slow']);
      await storage.addTags(second.id as number, ['slow']);

      const tags = await storage.getAllTags();

      expect(tags.find((tag) => tag.tag === 'SLOW')?.count).toBe(2);
    });
  });

  describe('monitored tags', () => {
    it('remembers a monitored tag and forgets it again', async () => {
      await storage.addMonitoredTag('checkout');
      expect((await storage.getMonitoredTags()).map((tag) => tag.tag)).toEqual(['CHECKOUT']);

      await storage.removeMonitoredTag('checkout');
      expect(await storage.getMonitoredTags()).toEqual([]);
    });

    it('does not list the same tag twice', async () => {
      await storage.addMonitoredTag('checkout');
      await storage.addMonitoredTag('checkout');

      expect(await storage.getMonitoredTags()).toHaveLength(1);
    });
  });

  describe('family hash', () => {
    it('groups entries that share a hash, and excludes the ones that do not', async () => {
      const first = await storage.save(entry(REQUEST));
      const second = await storage.save(entry(REQUEST));
      const other = await storage.save(entry(REQUEST));
      await storage.updateFamilyHash(first.id as number, 'family-a');
      await storage.updateFamilyHash(second.id as number, 'family-a');
      await storage.updateFamilyHash(other.id as number, 'family-b');

      const found = await storage.findByFamilyHash('family-a');

      expect(found).toHaveLength(2);
    });
  });
});

/**
 * Backdates an entry so pruning has something to prune.
 *
 * There is no interface method for this — nothing in the product moves an entry
 * back in time — so each backend is reached through its own storage. Doing it
 * this way keeps the pruning expectations above identical for all three.
 */
async function ageEntry(storage: StorageInterface, id: number, when: Date): Promise<void> {
  const internals = storage as unknown as {
    entries?: Map<number, { createdAt: string }>;
    db?: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
    client?: {
      hget: (key: string, field: string) => Promise<string | null>;
      hset: (key: string, field: string, value: string) => Promise<unknown>;
      zadd: (key: string, score: number, member: string) => Promise<unknown>;
    };
    keyPrefix?: string;
  };

  if (internals.db) {
    internals.db
      .prepare('UPDATE nestlens_entries SET created_at = ? WHERE id = ?')
      .run(when.toISOString(), id);

    return;
  }

  if (internals.client) {
    const prefix = (storage as unknown as { keyPrefix: string }).keyPrefix;
    const raw = await internals.client.hget(`${prefix}entries`, String(id));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      parsed.createdAt = when.toISOString();
      await internals.client.hset(`${prefix}entries`, String(id), JSON.stringify(parsed));
    }
    // Pruning reads the time index, not the stored entry: the sorted set of
    // entries is scored by id so the cursor can use it, which is why a separate
    // index by creation time exists at all.
    await internals.client.zadd(`${prefix}entries:createdAt`, when.getTime(), String(id));

    return;
  }

  const stored = internals.entries?.get(id);
  if (stored) stored.createdAt = when.toISOString();
}
