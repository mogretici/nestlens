/**
 * The three backends have to agree about tags, resolution and families too.
 *
 * `backend-parity` compares the read surface — counts, pages, filters — and
 * checks tags only in their empty state: no tags written, nothing monitored.
 * Everything that writes one was compared nowhere, which is the half where
 * these three have drifted apart before:
 *
 * ```text
 * 0.8.6   cursor paging scored by time, cursor read as an id  ->  Redis paged nowhere
 * 0.8.9   44 filter rules in memory, 9 of them in Redis
 * later   monitored tags stored verbatim, entry tags upper-cased  ->  every count zero
 * ```
 *
 * Each of those was found by a reader noticing, one release at a time.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { TagService } from '../../../core/tag.service';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

const entry = (i: number): Entry =>
  ({
    type: i % 2 === 0 ? 'exception' : 'log',
    payload:
      i % 2 === 0 ? { name: 'Error', message: `boom ${i}` } : { level: 'info', message: `m${i}` },
  }) as unknown as Entry;

/** Ids differ between backends; what is compared is the shape of the answer. */
const withoutIds = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      key === 'id' || key === 'createdAt' || key === 'resolvedAt' ? '<omitted>' : item,
    ),
  );

describe('the backends agree about tagging', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];
  let ids: Map<string, number[]>;

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-tag-parity-'));

    const sqlite = new SqliteStorage(join(workspace, 'tags.db'));
    const memory = new MemoryStorage({});
    await sqlite.initialize();
    await memory.initialize();

    backends = [
      { name: 'memory', storage: memory },
      { name: 'sqlite', storage: sqlite },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 9,
        keyPrefix: 'nestlens-tag-parity-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch (error) {
        await redis.close().catch(() => undefined);
        throw new Error(`Redis was expected at ${REDIS_URL}: ${String(error)}`);
      }
    }

    ids = new Map();
    for (const { name, storage } of backends) {
      const saved: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        saved.push((await storage.save(entry(i))).id as number);
      }
      ids.set(name, saved);

      // Two tags shared, one alone, one written in a different case.
      await storage.addTags(saved[0], ['CHECKOUT', 'SLOW']);
      await storage.addTags(saved[1], ['CHECKOUT']);
      await storage.addTags(saved[2], ['payments']);
      await storage.addMonitoredTag('checkout');
      await storage.addMonitoredTag('PAYMENTS');
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Runs one question against every backend and expects one answer. */
  const agree = async (
    ask: (storage: StorageInterface, entryIds: number[]) => Promise<unknown>,
  ): Promise<void> => {
    const answers: { name: string; value: string }[] = [];

    for (const { name, storage } of backends) {
      answers.push({
        name,
        value: JSON.stringify(withoutIds(await ask(storage, ids.get(name) as number[]))),
      });
    }

    const [first, ...rest] = answers;
    for (const other of rest) {
      expect(`${other.name}: ${other.value}`).toBe(`${other.name}: ${first.value}`);
    }
  };

  /**
   * A filtered walk reads every candidate. Only two filters look at an entry's
   * tags, and reading them for the rest is a second command per entry — a
   * second round trip per chunk, where the walk crosses a network. The page
   * carries its tags either way, which is what these check.
   */
  describe('a filtered page carries its tags', () => {
    it('when the filter does not read tags', () =>
      agree(async (storage) => {
        const page = await storage.findWithCursor('exception', {
          limit: 10,
          filters: { search: undefined, names: ['Error'] },
        });

        return page.data.map((entry) => (entry.tags ?? []).slice().sort());
      }));

    it('when the filter is a tag', () =>
      agree(async (storage) => {
        const page = await storage.findWithCursor(undefined, {
          limit: 10,
          filters: { tags: ['CHECKOUT'] },
        });

        return page.data.map((entry) => (entry.tags ?? []).slice().sort());
      }));

    it('when the search term is a tag', () =>
      agree(async (storage) => {
        const page = await storage.findWithCursor(undefined, {
          limit: 10,
          filters: { search: 'payments' },
        });

        return page.data.map((entry) => (entry.tags ?? []).slice().sort());
      }));
  });

  it('names the backends being compared', () => {
    // Named rather than counted: the suite reports the same number of green
    // tests whether or not Redis was among them, so the only way to tell what
    // was actually compared is to say so.
    expect(backends.map(({ name }) => name)).toEqual(
      REDIS_URL ? ['memory', 'sqlite', 'redis'] : expect.arrayContaining(['memory', 'sqlite']),
    );
  });

  it('lists the same tags with the same counts', () =>
    agree(async (storage) =>
      (await storage.getAllTags()).sort((a, b) => a.tag.localeCompare(b.tag)),
    ));

  it('reports the same tags for one entry', () =>
    agree(async (storage, entryIds) => (await storage.getEntryTags(entryIds[0])).sort()));

  it('reports nothing for an entry with no tags', () =>
    agree(async (storage, entryIds) => storage.getEntryTags(entryIds[5])));

  it('finds the same entries for one tag', () =>
    agree(async (storage) => (await storage.findByTags(['CHECKOUT'])).length));

  it('matches a tag whatever case it was written in', () =>
    agree(async (storage) => (await storage.findByTags(['checkout'])).length));

  it('finds the same entries for either of two tags', () =>
    agree(async (storage) => (await storage.findByTags(['CHECKOUT', 'PAYMENTS'], 'OR')).length));

  it('finds the same entries for both of two tags', () =>
    agree(async (storage) => (await storage.findByTags(['CHECKOUT', 'SLOW'], 'AND')).length));

  it('finds nothing for a pair no entry carries', () =>
    agree(async (storage) => (await storage.findByTags(['CHECKOUT', 'PAYMENTS'], 'AND')).length));

  it('applies the same limit', () =>
    agree(async (storage) => (await storage.findByTags(['CHECKOUT'], 'OR', 1)).length));

  it('reports the same monitored tags', () =>
    agree(async (storage) =>
      (await storage.getMonitoredTags()).map((tag) => tag.tag).sort((a, b) => a.localeCompare(b)),
    ));

  it('counts the entries behind a monitored tag the same way', () =>
    // Through the service, which is where the two spellings are reconciled.
    agree(async (storage) =>
      (await new TagService(storage).getMonitoredTagsWithCounts())
        .map((tag) => `${tag.tag}:${tag.count}`)
        .sort((a, b) => a.localeCompare(b)),
    ));

  it('removes a tag the same way', () =>
    agree(async (storage, entryIds) => {
      await storage.removeTags(entryIds[1], ['CHECKOUT']);
      const after = (await storage.findByTags(['CHECKOUT'])).length;
      await storage.addTags(entryIds[1], ['CHECKOUT']);

      return after;
    }));

  it('stops monitoring a tag the same way', () =>
    agree(async (storage) => {
      await storage.removeMonitoredTag('PAYMENTS');
      const after = (await storage.getMonitoredTags()).length;
      await storage.addMonitoredTag('PAYMENTS');

      return after;
    }));

  it('resolves an entry the same way', () =>
    agree(async (storage, entryIds) => {
      await storage.resolveEntry(entryIds[0]);
      const entry = await storage.findById(entryIds[0]);

      return Boolean(entry?.resolvedAt);
    }));

  it('unresolves an entry the same way', () =>
    agree(async (storage, entryIds) => {
      await storage.unresolveEntry(entryIds[0]);
      const entry = await storage.findById(entryIds[0]);

      return entry?.resolvedAt ?? null;
    }));

  /**
   * These three were `0`, `0` and `undefined` on Redis, under a comment saying
   * that working them out would mean reading entries. They are what the
   * dashboard puts at the top of its first page, so a deployment on the driver
   * the documentation recommends for production opened on *no unresolved
   * exceptions*, *no slow queries* and no latency at all — beside a list of
   * the exceptions it had just recorded.
   */
  describe('the figures the dashboard opens on', () => {
    beforeAll(async () => {
      for (const { storage } of backends) {
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: '/a', path: '/a', statusCode: 200, duration: 10 },
        } as unknown as Entry);
        await storage.save({
          type: 'request',
          payload: { method: 'GET', url: '/b', path: '/b', statusCode: 200, duration: 30 },
        } as unknown as Entry);
        await storage.save({
          type: 'query',
          payload: { query: 'SELECT 1', duration: 900, slow: true },
        } as unknown as Entry);
        await storage.save({
          type: 'query',
          payload: { query: 'SELECT 2', duration: 2, slow: false },
        } as unknown as Entry);
      }
    });

    it('counts unresolved exceptions the same way', () =>
      agree(async (storage) => (await storage.getStats()).unresolvedExceptions));

    it('counts them again after one is resolved', () =>
      agree(async (storage, entryIds) => {
        await storage.resolveEntry(entryIds[0]);
        const counted = (await storage.getStats()).unresolvedExceptions;
        await storage.unresolveEntry(entryIds[0]);

        return counted;
      }));

    it('counts slow queries the same way', () =>
      agree(async (storage) => (await storage.getStats()).slowQueries));

    it('averages request duration the same way', () =>
      agree(async (storage) => (await storage.getStats()).avgResponseTime));

    it('reports a real average rather than nothing', async () => {
      for (const { name, storage } of backends) {
        const { avgResponseTime, unresolvedExceptions } = await storage.getStats();

        expect(`${name}: ${avgResponseTime}`).toBe(`${name}: 20`);
        expect(`${name}: ${(unresolvedExceptions ?? 0) > 0}`).toBe(`${name}: true`);
      }
    });
  });

  it('groups by family hash the same way', () =>
    agree(async (storage, entryIds) => {
      await storage.updateFamilyHash(entryIds[0], 'fam-a');
      await storage.updateFamilyHash(entryIds[2], 'fam-a');
      await storage.updateFamilyHash(entryIds[4], 'fam-b');

      const groups = await storage.getGroupedByFamilyHash('exception');

      return groups
        .map((group) => `${group.familyHash}:${group.count}`)
        .sort((a, b) => a.localeCompare(b));
    }));

  it('finds a family the same way', () =>
    agree(async (storage) => (await storage.findByFamilyHash('fam-a')).length));
});
