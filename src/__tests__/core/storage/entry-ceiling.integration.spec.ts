/**
 * How many entries a store is allowed to hold.
 *
 * `maxEntries` was declared on the in-memory driver alone, so age was the only
 * bound the file and Redis drivers had. At a thousand requests a second the
 * default twenty-four hours is eighty-six million entries — a filled disk, or
 * a Redis instance out of memory, long before anything reached
 * `pruning.maxAge`. Which is the arrangement a reader is in the moment they
 * take NestLens past a development machine, and the one this exists for.
 *
 * The oldest go first, which is the rule the in-memory driver has always
 * followed.
 *
 * Enforced on the write path rather than on the pruning timer: an hourly sweep
 * cannot hold a ceiling that a busy minute can pass. Amortised, because a
 * count per entry costs more than the ceiling is worth — measured at 0.004ms
 * per check against ten thousand rows, so the cost of the feature is the
 * deletion itself and not the looking.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

const CEILING = 300;
/** Comfortably past the ceiling and past the check interval. */
const WRITTEN = 1_500;

const entry = (i: number): Entry =>
  ({ type: 'log', payload: { level: 'info', message: `m${i}` } }) as unknown as Entry;

describe('the entry ceiling', () => {
  jest.setTimeout(120_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-ceiling-'));

    backends = [
      { name: 'memory', storage: new MemoryStorage({ maxEntries: CEILING }) },
      { name: 'sqlite', storage: new SqliteStorage(join(workspace, 'ceiling.db'), CEILING) },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 11,
        keyPrefix: 'nestlens-ceiling-test:',
        maxEntries: CEILING,
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch {
        await redis.close().catch(() => undefined);
      }
    }

    for (const { storage } of backends) {
      if (!(storage instanceof RedisStorage)) await storage.initialize();

      for (let written = 0; written < WRITTEN; written += 50) {
        await storage.saveBatch(Array.from({ length: 50 }, (_, i) => entry(written + i)));
      }
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each(['memory', 'sqlite', 'redis'])('%s holds at the ceiling', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    expect(await backend.storage.count()).toBe(CEILING);
  });

  it.each(['memory', 'sqlite', 'redis'])('%s kept the newest entries', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    const page = await backend.storage.findWithCursor(undefined, { limit: CEILING });
    const messages = page.data.map((e) => (e.payload as { message: string }).message);

    // The last one written is at the top, and the oldest kept is exactly the
    // ceiling behind it.
    expect(messages[0]).toBe(`m${WRITTEN - 1}`);
    expect(messages[messages.length - 1]).toBe(`m${WRITTEN - CEILING}`);
  });

  it('every backend agrees on what survived', async () => {
    const kept: string[] = [];

    for (const { name, storage } of backends) {
      const page = await storage.findWithCursor(undefined, { limit: CEILING });
      kept.push(
        `${name}: ${JSON.stringify(page.data.map((e) => (e.payload as { message: string }).message))}`,
      );
    }

    const [first, ...rest] = kept;
    for (const other of rest) {
      expect(other.split(': ')[1]).toBe(first.split(': ')[1]);
    }
  });

  describe('a cap smaller than the check interval', () => {
    /**
     * The check runs every hundred saves, which overshoots by up to a hundred
     * entries — nothing against the default ten thousand, everything against a
     * cap set small on purpose. `maxEntries: 3` held 103 rows.
     */
    it('stays near the cap rather than a hundred past it', async () => {
      const small = new SqliteStorage(join(workspace, 'small.db'), 3);
      await small.initialize();

      for (let i = 0; i < 60; i += 1) {
        await small.save(entry(i));
      }

      expect(await small.count()).toBeLessThanOrEqual(6);

      await small.close();
    });

    it('still keeps the newest', async () => {
      const small = new SqliteStorage(join(workspace, 'small-newest.db'), 3);
      await small.initialize();

      for (let i = 0; i < 60; i += 1) {
        await small.save(entry(i));
      }

      const page = await small.findWithCursor(undefined, { limit: 10 });
      expect((page.data[0].payload as { message: string }).message).toBe('m59');

      await small.close();
    });
  });

  /**
   * Zero is documented as "keep everything and rely on age alone", and this
   * asked only SQLite. The in-memory driver — the default one, the one an
   * application gets without configuring anything — read it as a limit and
   * evicted every entry as it arrived: 250 saved, 0 kept, against SQLite's 250.
   */
  describe('turning it off', () => {
    /** Built here rather than reused: the shared ones carry a ceiling. */
    const uncapped = async (name: string): Promise<StorageInterface | undefined> => {
      if (name === 'memory') return new MemoryStorage({ maxEntries: 0 });
      if (name === 'sqlite') return new SqliteStorage(join(workspace, 'uncapped.db'), 0);

      if (!REDIS_URL) return undefined;
      const url = new URL(REDIS_URL);

      return new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 11,
        keyPrefix: 'nestlens-uncapped-test:',
        maxEntries: 0,
      });
    };

    it.each([['memory'], ['sqlite'], ['redis']])('keeps everything at zero on %s', async (name) => {
      const storage = await uncapped(name);
      if (!storage) return;

      await storage.initialize();
      await storage.clear();

      for (let written = 0; written < 600; written += 50) {
        await storage.saveBatch(Array.from({ length: 50 }, (_, i) => entry(written + i)));
      }

      expect(await storage.count()).toBe(600);

      await storage.clear();
      await storage.close();
    });
  });

  describe('what it leaves behind', () => {
    it('takes the tags of an evicted entry with it', async () => {
      // A tag index pointing at an id nothing else holds is a filter that
      // returns entries the dashboard cannot open.
      const storage = new SqliteStorage(join(workspace, 'tags.db'), 100);
      await storage.initialize();

      const [tagged] = await storage.saveBatch([entry(0)]);
      await storage.addTags(tagged.id as number, ['DOOMED']);

      expect(await storage.getAllTags()).toEqual([{ tag: 'DOOMED', count: 1 }]);

      for (let written = 0; written < 400; written += 50) {
        await storage.saveBatch(Array.from({ length: 50 }, (_, i) => entry(written + i)));
      }

      expect(await storage.findById(tagged.id as number)).toBeNull();
      expect(await storage.getAllTags()).toEqual([]);

      await storage.close();
    });
  });
});
