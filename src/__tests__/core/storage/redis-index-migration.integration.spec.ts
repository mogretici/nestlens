/**
 * Bringing an existing Redis store onto the current indexes.
 *
 * `migrateIndexScores` runs on startup, against whatever the application
 * already had, and rebuilds four sorted sets from the entries themselves. It
 * had no test at all: fifty lines that touch every entry a user has ever
 * stored, on the path their application takes to boot.
 *
 * What it repairs is real. Entries were once scored by `Date.now()` on the
 * sequence indexes, so cursor pagination — which pages by id — walked a set
 * ordered by something else entirely. The `createdAt` index and the
 * REST-only request index did not exist, and the Requests page pages and
 * counts against the latter.
 */
import Redis from 'ioredis';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL ?? (process.env.CI ? 'redis://127.0.0.1:6379' : undefined);
const PREFIX = 'nestlens-migration-test:';
const DB = 13;

const describeWithRedis = REDIS_URL ? describe : describe.skip;

describeWithRedis('migrating a Redis store onto the current indexes', () => {
  jest.setTimeout(60_000);

  let raw: Redis;
  let storage: RedisStorage | undefined;

  const key = (...parts: string[]): string => PREFIX + parts.join(':');

  const removeEverything = async (): Promise<void> => {
    const keys = await raw.keys(`${PREFIX}*`);
    if (keys.length > 0) await raw.del(...keys);
  };

  /** Writes an entry the way a store from before this version held it. */
  const writeOldEntry = async (
    id: number,
    type: string,
    createdAt: string,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    await raw.hset(key('entries', String(id)), {
      id: String(id),
      type,
      createdAt,
      payload: JSON.stringify(payload),
    });
    // Scored by time, which is what cursor pagination could not page. An
    // unreadable timestamp was scored by id even then — Redis refuses NaN.
    const parsed = Date.parse(createdAt);
    const timeScore = Number.isNaN(parsed) ? id : parsed;
    await raw.zadd(key('entries', 'all'), timeScore, String(id));
    await raw.zadd(key('entries', 'type', type), timeScore, String(id));
  };

  const open = async (): Promise<RedisStorage> => {
    const url = new URL(REDIS_URL as string);
    const opened = new RedisStorage({
      host: url.hostname,
      port: Number(url.port || 6379),
      db: DB,
      keyPrefix: PREFIX,
    });
    await opened.initialize();
    return opened;
  };

  beforeAll(async () => {
    const url = new URL(REDIS_URL as string);
    raw = new Redis({ host: url.hostname, port: Number(url.port || 6379), db: DB });
  });

  afterEach(async () => {
    await storage?.close();
    storage = undefined;
    await removeEverything();
  });

  afterAll(async () => {
    await removeEverything();
    await raw.quit();
  });

  describe('a store written before this version', () => {
    beforeEach(async () => {
      await removeEverything();
      await writeOldEntry(10, 'request', '2026-08-01T10:00:00.000Z', {
        method: 'GET',
        path: '/a',
        duration: 1,
      });
      await writeOldEntry(20, 'request', '2026-08-01T09:00:00.000Z', {
        method: 'POST',
        path: '/graphql',
        duration: 2,
        isGraphQL: true,
      });
      await writeOldEntry(30, 'query', '2026-08-01T11:00:00.000Z', { query: 'SELECT 1' });
    });

    it('scores the sequence index by id, not by time', async () => {
      storage = await open();

      // Entry 20 is older in time but higher in sequence: the index has to
      // order by id or the cursor walks it backwards.
      expect(await raw.zscore(key('entries', 'all'), '20')).toBe('20');
      expect(await raw.zscore(key('entries', 'all'), '10')).toBe('10');
    });

    it('scores the per-type index by id too', async () => {
      storage = await open();

      expect(await raw.zscore(key('entries', 'type', 'request'), '20')).toBe('20');
      expect(await raw.zscore(key('entries', 'type', 'query'), '30')).toBe('30');
    });

    it('builds the time index it never had', async () => {
      storage = await open();

      expect(await raw.zscore(key('entries', 'createdAt'), '10')).toBe(
        String(Date.parse('2026-08-01T10:00:00.000Z')),
      );
    });

    it('builds the REST-only request index the Requests page pages against', async () => {
      storage = await open();

      const rest = await raw.zrange(key('entries', 'type', 'request', 'rest'), 0, -1);
      expect(rest).toEqual(['10']);
    });

    it('leaves the entries themselves alone', async () => {
      storage = await open();

      const found = await storage.findById(10);
      expect(found?.type).toBe('request');
      expect((found?.payload as { path?: string }).path).toBe('/a');
    });

    it('pages by cursor afterwards', async () => {
      storage = await open();

      const page = await storage.findWithCursor(undefined, { limit: 2 });
      expect(page.data.map((entry) => entry.id)).toEqual([30, 20]);
    });

    it('marks the store as current', async () => {
      storage = await open();

      expect(await raw.get(key('schema'))).toBeTruthy();
    });

    it('does not read every entry again on the next boot', async () => {
      // The guard is what keeps startup from re-reading the whole store every
      // time. Its absence is observable: an entry written straight into the
      // hash after the first migration would be picked up by a second one.
      storage = await open();
      await storage.close();

      await raw.hset(key('entries', '99'), {
        id: '99',
        type: 'request',
        createdAt: '2026-08-01T12:00:00.000Z',
        payload: '{}',
      });
      await raw.zadd(key('entries', 'all'), 1, '99');

      storage = await open();

      expect(await raw.zscore(key('entries', 'createdAt'), '99')).toBeNull();
    });
  });

  /**
   * The tag list moved from a counts hash to a set of names without the schema
   * version being bumped, so a store written by 0.10.0 skipped the migration
   * and answered with no tags at all — a dashboard whose tag filter was empty
   * while every entry still carried its tags. Measured on a store seeded by
   * the published 0.10.0 and read by this build: `getAllTags` returned 4 on
   * the file driver and 0 on this one.
   */
  describe('a store whose tags were written before the tag list moved', () => {
    beforeEach(async () => {
      await removeEverything();
      await writeOldEntry(10, 'request', '2026-08-01T10:00:00.000Z', {
        method: 'GET',
        path: '/a',
        duration: 1,
      });

      // The layout 0.10.0 wrote: an index set per tag, a counts hash, a schema
      // marked current, and no set of names.
      await raw.sadd(key('tags', '10'), 'LEGACY', 'CHECKOUT');
      await raw.sadd(key('tags', 'index', 'LEGACY'), '10');
      await raw.sadd(key('tags', 'index', 'CHECKOUT'), '10');
      await raw.hset(key('tags', 'counts'), 'LEGACY', 1, 'CHECKOUT', 1);
      await raw.set(key('schema'), '4');
    });

    it('lists the tags that were already there', async () => {
      storage = new RedisStorage({ host: '127.0.0.1', port: 6379, db: DB, keyPrefix: PREFIX });
      await storage.initialize();

      const tags = (await storage.getAllTags()).map((tag) => tag.tag).sort();
      expect(tags).toEqual(['CHECKOUT', 'LEGACY']);
    });

    it('counts the entries behind each of them', async () => {
      storage = new RedisStorage({ host: '127.0.0.1', port: 6379, db: DB, keyPrefix: PREFIX });
      await storage.initialize();

      const counts = (await storage.getAllTags()).map((tag) => `${tag.tag}:${tag.count}`).sort();
      expect(counts).toEqual(['CHECKOUT:1', 'LEGACY:1']);
    });

    it('still finds the entries by tag', async () => {
      storage = new RedisStorage({ host: '127.0.0.1', port: 6379, db: DB, keyPrefix: PREFIX });
      await storage.initialize();

      expect(await storage.findByTags(['LEGACY'])).toHaveLength(1);
    });

    it('marks the store as current afterwards', async () => {
      storage = new RedisStorage({ host: '127.0.0.1', port: 6379, db: DB, keyPrefix: PREFIX });
      await storage.initialize();

      expect(await raw.get(key('schema'))).toBe('5');
    });
  });

  describe('what it does with what it cannot read', () => {
    it('skips an entry with no type rather than indexing a broken one', async () => {
      await removeEverything();
      await raw.hset(key('entries', '5'), { id: '5', payload: '{}' });
      await raw.zadd(key('entries', 'all'), 1, '5');

      storage = await open();

      expect(await raw.zscore(key('entries', 'createdAt'), '5')).toBeNull();
    });

    it('falls back to the id when the time cannot be read', async () => {
      await removeEverything();
      await writeOldEntry(7, 'log', 'not a date', { message: 'x' });

      storage = await open();

      expect(await raw.zscore(key('entries', 'createdAt'), '7')).toBe('7');
    });

    it('survives a payload that is not JSON', async () => {
      await removeEverything();
      await raw.hset(key('entries', '9'), {
        id: '9',
        type: 'request',
        createdAt: '2026-08-01T10:00:00.000Z',
        payload: 'not json at all',
      });
      await raw.zadd(key('entries', 'all'), 1, '9');

      storage = await open();

      // Unreadable means "not known to be GraphQL", so it counts as REST.
      expect(await raw.zrange(key('entries', 'type', 'request', 'rest'), 0, -1)).toEqual(['9']);
    });
  });

  it('starts an empty store without rescoring anything', async () => {
    await removeEverything();

    storage = await open();

    const saved = await storage.save({
      type: 'log',
      payload: { level: 'log', message: 'x' },
    } as Entry);
    expect(saved.id).toBe(1);
  });
});
