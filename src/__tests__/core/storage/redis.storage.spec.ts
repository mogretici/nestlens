/**
 * Redis storage, against sorted sets and hashes that behave like Redis.
 *
 * These tests used to hand the storage a client made of `jest.fn()`s, which
 * answered whatever the test told it to and recorded the calls. That is enough
 * to check that a command was issued, and blind to what the command means: for
 * a long time the code asked `zrevrangebyscore` for members scored below an
 * entry's *id* while every member was scored by its *save time*. The call
 * looked right, the assertion passed, and on Redis the dashboard's second page
 * came back empty — every time, for everyone. The same blindness hid filters
 * that were nine rules of forty-four, and tag counts that drifted negative.
 *
 * It also meant a change that kept every behaviour and only stopped spending a
 * round trip per row failed forty-six tests, because what they measured was
 * which commands the implementation happened to choose.
 *
 * `ioredis-mock` implements the data structures, so these seed entries and read
 * back what the storage returns. The parity suite covers the same ground
 * against a real server where one is reachable.
 */
import { RedisStorage } from '../../../core/storage/redis.storage';
import { Entry, EntryType } from '../../../types';

type Testable = { client: unknown; migrateIndexScores: () => Promise<void> };

/** What `save` gives back: the entry, now with the id and stamp it was given. */
type Saved = Entry & { id: number; createdAt: string };

const save = async (storage: RedisStorage, entry: Entry): Promise<Saved> =>
  (await storage.save(entry)) as Saved;

const saveAll = async (storage: RedisStorage, entries: Entry[]): Promise<Saved[]> =>
  (await storage.saveBatch(entries)) as Saved[];

/**
 * A storage on a freshly emptied mock.
 *
 * Instances of the mock share their data, so each test clears it — otherwise
 * the sequence counter carries over and the ids under test are whatever the
 * previous test left behind.
 */
const openStorage = async (): Promise<RedisStorage> => {
  const RedisMock = (await import('ioredis-mock')).default;
  const client = new RedisMock();
  await client.flushall();

  const storage = new RedisStorage({ keyPrefix: 'test:' });
  (storage as unknown as Testable).client = client;
  await (storage as unknown as Testable).migrateIndexScores();

  return storage;
};

const entry = (type: EntryType, payload: Record<string, unknown> = {}, requestId?: string): Entry =>
  ({ type, payload, requestId }) as Entry;

const request = (path: string, extra: Record<string, unknown> = {}): Entry =>
  entry('request', { method: 'GET', url: path, path, statusCode: 200, duration: 1, ...extra });

const ids = (entries: { id?: number }[]): number[] => entries.map((e) => e.id as number);

describe('RedisStorage', () => {
  let storage: RedisStorage;

  beforeEach(async () => {
    storage = await openStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('save', () => {
    it('returns the entry with an id and a timestamp', async () => {
      const saved = await save(storage, request('/test'));

      expect(saved.id).toBe(1);
      expect(saved.type).toBe('request');
      expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);
    });

    it('stores what it says it stored', async () => {
      const saved = await save(storage, request('/test', { statusCode: 404 }));
      const read = await storage.findById(saved.id);

      expect(read).not.toBeNull();
      expect(read!.payload).toEqual(saved.payload);
      expect(read!.createdAt).toBe(saved.createdAt);
    });

    it('indexes the entry under its type', async () => {
      await save(storage, request('/a'));
      await save(storage, entry('query', { query: 'SELECT 1', source: 'x', duration: 1 }));

      expect(await storage.count('query')).toBe(1);
      expect(await storage.count()).toBe(2);
    });

    it('indexes the entry under its request', async () => {
      await save(storage, entry('log', { level: 'info', message: 'x' }, 'req-123'));
      await save(storage, entry('log', { level: 'info', message: 'y' }, 'other'));

      const found = await storage.find({ requestId: 'req-123' });

      expect(found).toHaveLength(1);
      expect(found[0].requestId).toBe('req-123');
    });

    it('assigns incrementing ids', async () => {
      const first = await save(storage, request('/1'));
      const second = await save(storage, entry('query', {}));
      const third = await save(storage, entry('log', {}));

      expect([first.id, second.id, third.id]).toEqual([1, 2, 3]);
    });
  });

  describe('saveBatch', () => {
    it('saves every entry and numbers them in order', async () => {
      const saved = await saveAll(storage, [request('/1'), request('/2'), request('/3')]);

      expect(ids(saved)).toEqual([1, 2, 3]);
      expect(await storage.count()).toBe(3);
    });

    it('stores what a batch says it stored', async () => {
      const [saved] = await saveAll(storage, [request('/batched', { statusCode: 201 })]);

      expect((await storage.findById(saved.id))!.payload).toEqual(saved.payload);
    });

    it('returns nothing for an empty batch', async () => {
      expect(await storage.saveBatch([])).toEqual([]);
    });
  });

  describe('find', () => {
    it('finds entries by type, newest first', async () => {
      await save(storage, request('/a'));
      await save(storage, request('/b'));
      await save(storage, entry('query', {}));

      const found = await storage.find({ type: 'request' });

      expect(ids(found)).toEqual([2, 1]);
    });

    it('finds the entries belonging to one request', async () => {
      await save(storage, entry('query', { query: 'SELECT 1' }, 'req-1'));
      await save(storage, entry('log', { message: 'x' }, 'req-1'));
      await save(storage, entry('log', { message: 'y' }, 'req-2'));

      expect(await storage.find({ requestId: 'req-1' })).toHaveLength(2);
    });

    it('returns nothing when the type has no entries', async () => {
      expect(await storage.find({ type: 'exception' })).toEqual([]);
    });

    it('honours limit and offset', async () => {
      for (let i = 0; i < 5; i += 1) await save(storage, request(`/p${i}`));

      expect(ids(await storage.find({ type: 'request', limit: 2 }))).toEqual([5, 4]);
      expect(ids(await storage.find({ type: 'request', limit: 2, offset: 2 }))).toEqual([3, 2]);
    });
  });

  describe('findById', () => {
    it('returns the entry', async () => {
      const saved = await save(storage, request('/one'));
      const found = await storage.findById(saved.id);

      expect(found!.id).toBe(saved.id);
      expect(found!.type).toBe('request');
    });

    it('returns null for an id nothing was stored under', async () => {
      expect(await storage.findById(999)).toBeNull();
    });
  });

  describe('count', () => {
    it('counts everything', async () => {
      await saveAll(storage, [request('/a'), entry('query', {}), entry('log', {})]);

      expect(await storage.count()).toBe(3);
    });

    it('counts one type', async () => {
      await saveAll(storage, [entry('query', {}), entry('query', {}), request('/a')]);

      expect(await storage.count('query')).toBe(2);
    });
  });

  describe("count('request')", () => {
    // A GraphQL operation reaches the request watcher too, flagged. It belongs
    // to the GraphQL page, and both other backends have always excluded it
    // here — this one counted it, so the badge above the request list
    // disagreed with the list under it.
    it('leaves GraphQL operations out', async () => {
      await save(storage, request('/rest'));
      await save(storage, request('/graphql', { isGraphQL: true }));
      await save(storage, request('/rest2'));

      expect(await storage.count('request')).toBe(2);
    });

    it('agrees with the list it sits above', async () => {
      await saveAll(storage, [
        request('/rest'),
        request('/graphql', { isGraphQL: true }),
        request('/rest2'),
      ]);

      const listed = await storage.findWithCursor('request', { limit: 50 });

      expect(await storage.count('request')).toBe(listed.data.length);
    });

    it('counts nothing when there are no requests', async () => {
      expect(await storage.count('request')).toBe(0);
    });

    it('stops counting a GraphQL operation once it is pruned', async () => {
      await save(storage, request('/graphql', { isGraphQL: true }));
      await save(storage, request('/rest'));

      await storage.prune(new Date(Date.now() + 60_000));
      await save(storage, request('/after'));

      expect(await storage.count('request')).toBe(1);
    });
  });

  describe('addTags', () => {
    it('tags an entry', async () => {
      const saved = await save(storage, request('/a'));
      await storage.addTags(saved.id, ['bug', 'urgent']);

      expect(await storage.getEntryTags(saved.id)).toEqual(['BUG', 'URGENT']);
    });

    it('does not keep a tag for an entry that is not there', async () => {
      // The collector tags an entry just after saving it, and pruning can
      // remove it in between. Nothing to record, and nothing to throw about.
      await storage.addTags(999, ['ghost']);

      expect(await storage.getAllTags()).toEqual([]);
    });

    it('counts an entry once however often it is tagged', async () => {
      // The count used to be maintained alongside the sets and drifted from
      // them on every path. `getAllTags` measures the sets instead.
      const saved = await save(storage, request('/a'));
      await storage.addTags(saved.id, ['bug']);
      await storage.addTags(saved.id, ['bug']);

      expect(await storage.getAllTags()).toEqual([{ tag: 'BUG', count: 1 }]);
    });
  });

  describe('getEntryTags', () => {
    it('returns the tags in order', async () => {
      const saved = await save(storage, request('/a'));
      await storage.addTags(saved.id, ['urgent', 'bug']);

      expect(await storage.getEntryTags(saved.id)).toEqual(['BUG', 'URGENT']);
    });

    it('returns nothing for an untagged entry', async () => {
      const saved = await save(storage, request('/a'));

      expect(await storage.getEntryTags(saved.id)).toEqual([]);
    });
  });

  describe('getAllTags', () => {
    it('returns every tag with how many entries carry it', async () => {
      const [a, b, c] = await saveAll(storage, [request('/a'), request('/b'), request('/c')]);
      await storage.addTags(a.id, ['bug', 'urgent']);
      await storage.addTags(b.id, ['bug']);
      await storage.addTags(c.id, ['bug']);

      expect(await storage.getAllTags()).toEqual([
        { tag: 'BUG', count: 3 },
        { tag: 'URGENT', count: 1 },
      ]);
    });

    it('returns nothing when no tag has ever been used', async () => {
      expect(await storage.getAllTags()).toEqual([]);
    });

    it('leaves out a tag no entry carries any more', async () => {
      // The name stays registered after its last entry is pruned; an empty
      // index set is what says it is no longer in use.
      const saved = await save(storage, request('/a'));
      await storage.addTags(saved.id, ['gone']);
      await storage.removeTags(saved.id, ['gone']);

      expect(await storage.getAllTags()).toEqual([]);
    });

    it('never reports a negative count', async () => {
      const saved = await save(storage, request('/a'));
      await storage.removeTags(saved.id, ['never-there']);

      expect(await storage.getAllTags()).toEqual([]);
    });
  });

  describe('findByTags', () => {
    const seedTagged = async () => {
      const [a, b, c] = await saveAll(storage, [
        entry('exception', { name: 'Error' }),
        entry('exception', { name: 'TypeError' }),
        entry('exception', { name: 'RangeError' }),
      ]);
      await storage.addTags(a.id, ['bug', 'urgent']);
      await storage.addTags(b.id, ['bug']);
      await storage.addTags(c.id, ['other']);
      return { a, b, c };
    };

    it('finds entries carrying either tag by default', async () => {
      const { a, b } = await seedTagged();

      const found = await storage.findByTags(['bug', 'urgent']);

      expect(ids(found).sort()).toEqual([a.id, b.id].sort());
    });

    it('finds entries carrying both tags on AND', async () => {
      const { a } = await seedTagged();

      expect(ids(await storage.findByTags(['bug', 'urgent'], 'AND'))).toEqual([a.id]);
    });

    it('returns nothing for a tag no entry carries', async () => {
      await seedTagged();

      expect(await storage.findByTags(['nonexistent'])).toEqual([]);
    });
  });

  describe('addMonitoredTag', () => {
    it('records the tag, normalised', async () => {
      const monitored = await storage.addMonitoredTag('critical');

      expect(monitored.id).toBe(1);
      expect(monitored.tag).toBe('CRITICAL');
      expect(Number.isNaN(Date.parse(monitored.createdAt))).toBe(false);
    });

    it('returns the existing one rather than adding it twice', async () => {
      const first = await storage.addMonitoredTag('critical');
      const second = await storage.addMonitoredTag('critical');

      expect(second).toEqual(first);
      expect(await storage.getMonitoredTags()).toHaveLength(1);
    });
  });

  describe('getMonitoredTags', () => {
    it('returns every monitored tag', async () => {
      await storage.addMonitoredTag('critical');
      await storage.addMonitoredTag('important');

      const tags = await storage.getMonitoredTags();

      expect(tags.map((t) => t.tag).sort()).toEqual(['CRITICAL', 'IMPORTANT']);
    });

    it('returns nothing when none are monitored', async () => {
      expect(await storage.getMonitoredTags()).toEqual([]);
    });
  });

  describe('resolveEntry', () => {
    it('marks the entry resolved', async () => {
      const saved = await save(storage, entry('exception', { name: 'Error' }));
      await storage.resolveEntry(saved.id);

      const read = await storage.findById(saved.id);

      expect(read!.resolvedAt).toBeTruthy();
      expect(Number.isNaN(Date.parse(read!.resolvedAt as string))).toBe(false);
    });
  });

  describe('unresolveEntry', () => {
    it('marks the entry unresolved again', async () => {
      const saved = await save(storage, entry('exception', { name: 'Error' }));
      await storage.resolveEntry(saved.id);
      await storage.unresolveEntry(saved.id);

      expect((await storage.findById(saved.id))!.resolvedAt).toBeFalsy();
    });
  });

  describe('updateFamilyHash', () => {
    it('records the hash on the entry and in its family', async () => {
      const saved = await save(storage, entry('exception', { name: 'Error' }));
      await storage.updateFamilyHash(saved.id, 'abc123');

      expect((await storage.findById(saved.id))!.familyHash).toBe('abc123');
      expect(ids(await storage.findByFamilyHash('abc123'))).toEqual([saved.id]);
    });
  });

  describe('findByFamilyHash', () => {
    it('finds every entry in the family', async () => {
      const [a, b, c] = await saveAll(storage, [
        entry('exception', { name: 'Error' }),
        entry('exception', { name: 'Error' }),
        entry('exception', { name: 'Other' }),
      ]);
      await storage.updateFamilyHash(a.id, 'abc123');
      await storage.updateFamilyHash(b.id, 'abc123');
      await storage.updateFamilyHash(c.id, 'zzz');

      expect(ids(await storage.findByFamilyHash('abc123')).sort()).toEqual([a.id, b.id].sort());
    });

    it('returns nothing for a family that has no entries', async () => {
      expect(await storage.findByFamilyHash('nonexistent')).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('counts each type and totals them', async () => {
      await saveAll(storage, [
        request('/a'),
        request('/b'),
        entry('query', {}),
        entry('exception', {}),
      ]);

      const stats = await storage.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byType.request).toBe(2);
      expect(stats.byType.query).toBe(1);
      expect(stats.byType.exception).toBe(1);
    });

    it('leaves out a type nothing was recorded under', async () => {
      await save(storage, request('/a'));

      expect(await storage.getStats().then((s) => s.byType.job)).toBeUndefined();
    });
  });

  describe('getStorageStats', () => {
    it('reports the oldest and newest entry', async () => {
      const first = await save(storage, request('/first'));
      const last = await save(storage, request('/last'));

      const stats = await storage.getStorageStats();

      expect(stats.oldestEntry).toBe((await storage.findById(first.id))!.createdAt);
      expect(stats.newestEntry).toBe((await storage.findById(last.id))!.createdAt);
      expect(stats.total).toBe(2);
    });

    it('reports nothing for an empty store', async () => {
      const stats = await storage.getStorageStats();

      expect(stats.total).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('prune', () => {
    it('deletes entries older than the cutoff', async () => {
      await saveAll(storage, [request('/a'), request('/b')]);

      expect(await storage.prune(new Date(Date.now() + 60_000))).toBe(2);
      expect(await storage.count()).toBe(0);
    });

    it('keeps entries newer than the cutoff', async () => {
      await saveAll(storage, [request('/a'), request('/b')]);

      expect(await storage.prune(new Date(Date.now() - 60_000))).toBe(0);
      expect(await storage.count()).toBe(2);
    });

    it('returns 0 when there is nothing to prune', async () => {
      expect(await storage.prune(new Date())).toBe(0);
    });

    it('takes the entry out of every index it was in', async () => {
      // A prune that unlinks the entry but leaves an index mentioning it makes
      // the dashboard ask for something that is no longer there.
      const saved = await save(storage, entry('query', { query: 'SELECT 1' }, 'req-9'));
      await storage.addTags(saved.id, ['slow']);
      await storage.updateFamilyHash(saved.id, 'fam-1');

      await storage.prune(new Date(Date.now() + 60_000));

      expect(await storage.findById(saved.id)).toBeNull();
      expect(await storage.find({ requestId: 'req-9' })).toEqual([]);
      expect(await storage.findByFamilyHash('fam-1')).toEqual([]);
      expect(await storage.findByTags(['slow'])).toEqual([]);
      expect(await storage.getEntryTags(saved.id)).toEqual([]);
      expect(await storage.getAllTags()).toEqual([]);
      expect(await storage.count('query')).toBe(0);
    });

    it('prunes more entries than one pipeline carries', async () => {
      // Pruning goes out in chunks; the boundary is worth crossing.
      await saveAll(
        storage,
        Array.from({ length: 1_200 }, (_, i) => request(`/p${i}`)),
      );

      expect(await storage.prune(new Date(Date.now() + 60_000))).toBe(1_200);
      expect(await storage.count()).toBe(0);
    });
  });

  describe('pruneByType', () => {
    it('deletes only the type it was asked about', async () => {
      await saveAll(storage, [request('/a'), entry('query', {}), entry('query', {})]);

      expect(await storage.pruneByType('query', new Date(Date.now() + 60_000))).toBe(2);
      expect(await storage.count('query')).toBe(0);
      expect(await storage.count('request')).toBe(1);
    });

    it('returns 0 when that type has nothing old enough', async () => {
      await save(storage, request('/a'));

      expect(await storage.pruneByType('query', new Date(Date.now() + 60_000))).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes everything', async () => {
      await saveAll(storage, [request('/a'), request('/b')]);
      await storage.addTags(1, ['bug']);

      await storage.clear();

      expect(await storage.count()).toBe(0);
      expect(await storage.getAllTags()).toEqual([]);
      expect(await storage.findById(1)).toBeNull();
    });

    it('handles an empty store', async () => {
      // Answers with what it deleted, which is nothing.
      await expect(storage.clear()).resolves.toBe(0);
    });

    it('leaves keys that are not ours alone', async () => {
      // NestLens shares the server with the application more often than not.
      const client = (storage as unknown as Testable).client as {
        set: (k: string, v: string) => Promise<'OK'>;
        get: (k: string) => Promise<string | null>;
      };
      await client.set('someone-elses-key', 'keep me');
      await save(storage, request('/a'));

      await storage.clear();

      expect(await client.get('someone-elses-key')).toBe('keep me');
    });
  });

  describe('getLatestSequence', () => {
    it('returns the newest id', async () => {
      await saveAll(storage, [request('/a'), request('/b')]);

      expect(await storage.getLatestSequence()).toBe(2);
    });

    it('returns the newest id of one type', async () => {
      await saveAll(storage, [request('/a'), entry('query', {}), request('/b')]);

      expect(await storage.getLatestSequence('query')).toBe(2);
    });

    it('returns null for an empty store', async () => {
      expect(await storage.getLatestSequence()).toBeNull();
    });
  });

  describe('hasEntriesAfter', () => {
    it('counts what is newer than the sequence', async () => {
      await saveAll(storage, [request('/a'), request('/b'), request('/c')]);

      expect(await storage.hasEntriesAfter(1)).toBe(2);
    });

    it('counts nothing when the sequence is the newest', async () => {
      await saveAll(storage, [request('/a')]);

      expect(await storage.hasEntriesAfter(1)).toBe(0);
    });
  });

  describe('findWithCursor', () => {
    it('returns a page with its cursors', async () => {
      await saveAll(storage, [request('/a'), request('/b')]);

      const result = await storage.findWithCursor(undefined, { limit: 10 });

      expect(ids(result.data)).toEqual([2, 1]);
      expect(result.meta.total).toBe(2);
      expect(result.meta.newestSequence).toBe(2);
      expect(result.meta.oldestSequence).toBe(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('says when there is more to come', async () => {
      await saveAll(
        storage,
        Array.from({ length: 5 }, (_, i) => request(`/p${i}`)),
      );

      expect((await storage.findWithCursor(undefined, { limit: 2 })).meta.hasMore).toBe(true);
    });

    it('filters by type', async () => {
      await saveAll(storage, [request('/a'), entry('query', { query: 'SELECT 1' })]);

      const result = await storage.findWithCursor('query', { limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('query');
    });

    it('carries each entry its tags', async () => {
      const saved = await save(storage, request('/a'));
      await storage.addTags(saved.id, ['slow', 'bug']);

      const result = await storage.findWithCursor(undefined, { limit: 10 });

      expect(result.data[0].tags).toEqual(['BUG', 'SLOW']);
    });

    it('carries tags for every row of a page, not just the first', async () => {
      // Tags are hydrated in one round trip now; the reply has to be lined up
      // with the rows it answers.
      const saved = await saveAll(storage, [request('/a'), request('/b'), request('/c')]);
      await storage.addTags(saved[0].id, ['first']);
      await storage.addTags(saved[2].id, ['third']);

      const result = await storage.findWithCursor(undefined, { limit: 10 });
      const byId = new Map(result.data.map((e) => [e.id, e.tags]));

      expect(byId.get(saved[0].id)).toEqual(['FIRST']);
      expect(byId.get(saved[1].id)).toEqual([]);
      expect(byId.get(saved[2].id)).toEqual(['THIRD']);
    });
  });
});

/**
 * Cursor pagination, and the failure that made these worth writing.
 *
 * The code asked `zrevrangebyscore` for members scored below an entry's id
 * while every member was scored by its save time, so the dashboard's second
 * page came back empty.
 */
describe('RedisStorage cursor pagination', () => {
  const seedCount = 5;

  const seeded = async (): Promise<RedisStorage> => {
    const storage = await openStorage();
    for (let index = 0; index < seedCount; index++) {
      await save(storage, request(`/page-${index}`));
    }
    return storage;
  };

  /**
   * ioredis connects in the background, so the rescore is the first command
   * anything sends — and the first chance an unreachable Redis has to throw.
   * A monitoring tool does not get to stop the application it is watching from
   * starting, which is what CI caught when this went out without a guard.
   */
  it('starts even when Redis cannot answer', async () => {
    const storage = new RedisStorage({ keyPrefix: 'unreachable:' });
    const unreachable = {
      get: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    };
    (storage as unknown as Testable).client = unreachable;
    (storage as unknown as { loadRedisClient: () => Promise<unknown> }).loadRedisClient =
      async () => unreachable;

    await expect(storage.initialize()).resolves.toBeUndefined();
    expect(unreachable.get).toHaveBeenCalled();
  });

  it('walks back through the list one page at a time', async () => {
    const storage = await seeded();

    const firstPage = await storage.findWithCursor('request', { limit: 2 });
    const secondPage = await storage.findWithCursor('request', {
      limit: 2,
      beforeSequence: firstPage.meta.oldestSequence ?? undefined,
    });

    // The regression: the second page used to come back empty.
    expect(ids(firstPage.data)).toEqual([5, 4]);
    expect(ids(secondPage.data)).toEqual([3, 2]);

    await storage.close();
  });

  it('answers "anything newer than this" with only what is newer', async () => {
    const storage = await seeded();

    const newer = await storage.findWithCursor('request', { limit: 10, afterSequence: 3 });

    // This used to return the entire set, oldest first.
    expect(ids(newer.data)).toEqual([5, 4]);

    await storage.close();
  });

  /**
   * Entries saved inside the same millisecond used to share a score, so an
   * exclusive range around the cursor dropped whichever ones sat on the
   * boundary. Ids are unique, so a page cannot swallow its neighbours.
   */
  it('loses nothing when entries share a timestamp', async () => {
    const storage = await seeded();

    const collected: number[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < seedCount; page++) {
      const result = await storage.findWithCursor('request', { limit: 2, beforeSequence: cursor });
      collected.push(...ids(result.data));
      if (!result.meta.hasMore) break;
      cursor = result.meta.oldestSequence ?? undefined;
    }

    expect(collected).toEqual([5, 4, 3, 2, 1]);

    await storage.close();
  });

  it('still prunes by age once the index is scored by sequence', async () => {
    const storage = await seeded();

    const pruned = await storage.prune(new Date(Date.now() + 1000));

    expect(pruned).toBe(seedCount);
    expect((await storage.findWithCursor('request', { limit: 10 })).data).toEqual([]);

    await storage.close();
  });
});
