/**
 * Every backend answers the same question the same way.
 *
 * An application choosing SQLite over memory, or Redis over SQLite, is choosing
 * where entries live — not what the dashboard shows. Each backend implements
 * `StorageInterface` separately though, and a rule added to one has repeatedly
 * been missed on another: GraphQL operations were excluded from the request
 * list on two backends and counted on the third, so the badge above the list
 * disagreed with the list under it.
 *
 * This drives the interface across every backend available and compares the
 * answers, rather than asserting a hand-written expectation per backend — the
 * hand-written ones are what drifted.
 *
 * Redis runs only where a server is reachable (`REDIS_URL`, or localhost in
 * CI). Its unit tests are written against a mock, which is why its tag counts
 * could drift for as long as they did: the mock agreed with the code.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry, EntryType } from '../../../types';

const REDIS_URL = process.env.REDIS_URL ?? (process.env.CI ? 'redis://127.0.0.1:6379' : undefined);

const entry = (type: EntryType, i: number, extra: Record<string, unknown> = {}): Entry =>
  ({
    type,
    requestId: `req-${i % 3}`,
    payload: {
      method: 'GET',
      url: `/item/${i}`,
      path: '/item/:id',
      statusCode: i % 2 ? 200 : 500,
      duration: i,
      ...extra,
    },
  }) as unknown as Entry;

/** Ids and timestamps are allowed to differ; everything else is not. */
const shape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shape);

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === 'id' || key === 'createdAt' || key === 'timestamp') continue;
      out[key] = shape((value as Record<string, unknown>)[key]);
    }
    return out;
  }

  return value;
};

describe('storage backends agree', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];
  let redisReachable = false;

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-parity-'));

    backends = [
      { name: 'memory', storage: new MemoryStorage({ maxEntries: 100_000 }) },
      { name: 'sqlite', storage: new SqliteStorage(join(workspace, 'parity.db')) },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        // A database of its own, so a developer's data is never touched.
        db: 14,
        keyPrefix: 'nestlens-parity-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        redisReachable = true;
        backends.push({ name: 'redis', storage: redis });
      } catch {
        // Left out; the two remaining backends still catch a divergence.
      }
    }

    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) continue;
      await storage.initialize();
    }

    for (const { storage } of backends) {
      for (let i = 0; i < 12; i += 1) {
        await storage.save(entry(i % 3 === 0 ? 'request' : 'query', i));
      }
      // A GraphQL operation also reaches the request watcher, flagged.
      await storage.save(entry('request', 99, { isGraphQL: true }));
      await storage.save(entry('exception', 100));
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage && redisReachable) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Runs one question against every backend and expects one answer. */
  const agree = async (ask: (storage: StorageInterface) => Promise<unknown>): Promise<void> => {
    const answers: { name: string; value: string }[] = [];

    for (const { name, storage } of backends) {
      answers.push({ name, value: JSON.stringify(shape(await ask(storage))) });
    }

    const [first, ...rest] = answers;
    for (const other of rest) {
      // Named in the message so a failure says which backend broke ranks.
      expect(`${other.name}: ${other.value}`).toBe(`${other.name}: ${first.value}`);
    }
  };

  it('has at least two backends to compare', () => {
    expect(backends.length).toBeGreaterThanOrEqual(2);
  });

  it('counts everything the same', () => agree((s) => s.count()));

  it('counts a type the same', () => agree((s) => s.count('query')));

  it('excludes GraphQL operations from the request count', () => agree((s) => s.count('request')));

  it('reports the same totals in stats', () => agree(async (s) => (await s.getStats()).total));

  it('reports the same breakdown in stats', () => agree(async (s) => (await s.getStats()).byType));

  it('returns the same number of entries', () => agree(async (s) => (await s.find({})).length));

  it('applies a type filter the same way', () =>
    agree(async (s) => (await s.find({ type: 'query' })).length));

  it('excludes GraphQL operations from the request list', () =>
    agree(async (s) => (await s.find({ type: 'request' })).length));

  it('applies limit the same way', () => agree(async (s) => (await s.find({ limit: 5 })).length));

  it('applies offset the same way', () =>
    agree(async (s) => (await s.find({ offset: 3, limit: 5 })).length));

  it('applies an offset with no limit the same way', () =>
    // SQLite will not take an OFFSET without a LIMIT and answered
    // `near "OFFSET": syntax error` while the others skipped and returned the
    // rest. The pair above passed throughout, which is why this is its own
    // case: the combination that was tested was the one that worked.
    agree(async (s) => (await s.find({ offset: 3 })).length));

  it('applies a limit with no offset the same way', () =>
    agree(async (s) => (await s.find({ limit: 4 })).length));

  it('handles an offset past the end the same way', () =>
    agree(async (s) => (await s.find({ offset: 10_000 })).length));

  it('applies a requestId filter the same way', () =>
    agree(async (s) => (await s.find({ requestId: 'req-1' })).length));

  it('returns null for an id nobody holds', () => agree((s) => s.findById(999_999)));

  it('pages the same way', () =>
    agree(async (s) => (await s.findWithCursor(undefined, { limit: 5 })).data.length));

  it('reports the same cursor metadata shape', () =>
    agree(async (s) => Object.keys((await s.findWithCursor(undefined, { limit: 5 })).meta).sort()));

  it('agrees on whether there is more to page through', () =>
    agree(async (s) => (await s.findWithCursor(undefined, { limit: 5 })).meta.hasMore));

  it('keeps GraphQL operations out of the paged request list', () =>
    agree(async (s) =>
      (await s.findWithCursor('request', { limit: 50 })).data.some(
        (e) => (e.payload as { isGraphQL?: boolean }).isGraphQL,
      ),
    ));

  it('answers hasEntriesAfter the same way', () => agree((s) => s.hasEntriesAfter(0)));

  it('answers hasEntriesAfter past the end the same way', () =>
    agree((s) => s.hasEntriesAfter(10 ** 9)));

  it('reports the same storage stats shape', () =>
    agree(async (s) => Object.keys(await s.getStorageStats()).sort()));

  it('starts with no tags', () => agree((s) => s.getAllTags()));

  it('starts with no monitored tags', () => agree((s) => s.getMonitoredTags()));

  it('returns nothing for a tag nobody has', () => agree((s) => s.findByTags(['nobody-has-this'])));

  describe('searching for text that looks like a pattern', () => {
    // SQLite compares with LIKE, where `%` and `_` are wildcards; the others
    // compare with `includes`, where they are ordinary characters. Unescaped,
    // a search for `%` returned every entry on SQLite and one on the others.
    it.each(['%', '_', '50%', 'a_b', '100%_off', '\\'])('agrees on a search for %p', (term) =>
      agree(
        async (s) =>
          (await s.findWithCursor(undefined, { limit: 50, filters: { search: term } })).data.length,
      ),
    );

    it('agrees on a path filter containing a percent sign', () =>
      agree(
        async (s) =>
          (await s.findWithCursor(undefined, { limit: 50, filters: { paths: ['%'] } })).data.length,
      ));

    it('still treats * in a path filter as a wildcard', () =>
      // The documented way to ask for one, and escaping must not take it away.
      agree(
        async (s) =>
          (await s.findWithCursor(undefined, { limit: 50, filters: { paths: ['/item*'] } })).data
            .length,
      ));
  });

  it('returns nothing for a family hash nobody has', () =>
    agree(async (s) => (await s.findByFamilyHash('no-such-family')).length));

  describe('tagging', () => {
    it('holds a tag once however often it is added', () =>
      agree(async (s) => {
        const [target] = await s.find({ limit: 1 });
        await s.addTags(target.id as number, ['alpha', 'beta']);
        await s.addTags(target.id as number, ['alpha']);
        return (await s.getEntryTags(target.id as number)).sort();
      }));

    it('counts a tag once per entry', () =>
      agree(async (s) => (await s.getAllTags()).map((t) => `${t.tag}:${t.count}`).sort()));

    it('finds by tag the same way', () =>
      agree(async (s) => (await s.findByTags(['alpha'])).length));

    it('removes a tag completely', () =>
      agree(async (s) => {
        const [target] = await s.find({ limit: 1 });
        await s.removeTags(target.id as number, ['beta']);
        return (await s.getEntryTags(target.id as number)).sort();
      }));

    it('ignores a tag for an entry nobody holds', () =>
      agree(async (s) => {
        await s.addTags(999_999, ['ghost']);
        return (await s.getEntryTags(999_999)).sort();
      }));

    it('does not go negative on a tag that was never applied', () =>
      agree(async (s) => {
        const [target] = await s.find({ limit: 1 });
        await s.removeTags(target.id as number, ['never-applied']);
        return (await s.getAllTags()).map((t) => `${t.tag}:${t.count}`).sort();
      }));
  });

  describe('monitored tags', () => {
    it('reports the same shape when adding one', () =>
      agree(async (s) => Object.keys(await s.addMonitoredTag('watched')).sort()));

    it('holds it once when added twice', () =>
      agree(async (s) => {
        await s.addMonitoredTag('watched');
        return (await s.getMonitoredTags()).length;
      }));

    it('removes it the same way', () =>
      agree(async (s) => {
        await s.removeMonitoredTag('watched');
        return (await s.getMonitoredTags()).length;
      }));

    it('ignores removing one that was never added', () =>
      agree(async (s) => {
        await s.removeMonitoredTag('never-watched');
        return (await s.getMonitoredTags()).length;
      }));
  });

  describe('pruning and clearing', () => {
    it('prunes a type the same way', () =>
      agree((s) => s.pruneByType('query', new Date(Date.now() + 60_000))));

    it('leaves the same number behind', () => agree((s) => s.count()));

    it('prunes everything the same way', () =>
      agree((s) => s.prune(new Date(Date.now() + 60_000))));

    it('reports the same stats afterwards', () => agree(async (s) => (await s.getStats()).total));

    it('clears to the same empty state', () =>
      agree(async (s) => {
        await s.clear();
        return s.count();
      }));

    it('reports the same cursor metadata when empty', () =>
      agree(async (s) => (await s.findWithCursor(undefined, { limit: 5 })).meta));

    it('reports the same latest sequence when empty', () =>
      agree(async (s) => (await s.getLatestSequence()) ?? null));
  });
});
