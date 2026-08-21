/**
 * Tags mean the same thing on every backend.
 *
 * Tagging is not a side feature: the dashboard filters by tag, `monitoredTags`
 * decides what an alert fires on, and `getAllTags` is what the reader picks
 * from. All three read a count, and each backend arrived at that count its own
 * way — so a parity sweep across the whole `StorageInterface` was run, and
 * every difference it found was in this corner:
 *
 *   - SQLite had no `UNIQUE (entry_id, tag)`, so `INSERT OR IGNORE` in
 *     `addTags` had nothing to ignore. Tagging an entry twice stored the tag
 *     twice, `getAllTags` counted it twice, and `removeTags` left a copy.
 *   - SQLite threw `FOREIGN KEY constraint failed` when asked to tag an entry
 *     that was no longer there — out of the collector, mid-collection.
 *   - Redis kept a running total beside the sets, maintained from three call
 *     sites, none of which could see whether the set had changed. Measured:
 *     `ALPHA:2` for one entry, `ALPHA:1` after removing it, and `NEVER:-1`
 *     for a tag that never existed.
 *   - Memory stored tags for ids it did not hold, which nothing would ever
 *     clean up.
 *
 * These run against the two backends that need no server. The Redis behaviour
 * is pinned by the same expectations in the parity sweep.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry } from '../../../types';

const entry = (): Entry =>
  ({
    type: 'request',
    payload: { method: 'GET', url: '/a', path: '/a', statusCode: 200, duration: 1 },
  }) as unknown as Entry;

describe.each<[string, () => { storage: StorageInterface; cleanup: () => void }]>([
  [
    'memory',
    () => ({ storage: new MemoryStorage({ maxEntries: 1000 }), cleanup: () => undefined }),
  ],
  [
    'sqlite',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'nestlens-tags-'));
      return {
        storage: new SqliteStorage(join(dir, 'tags.db')),
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
      };
    },
  ],
])('tags on %s storage', (_name, make) => {
  let storage: StorageInterface;
  let cleanup: () => void;
  let id: number;

  beforeEach(async () => {
    ({ storage, cleanup } = make());
    await storage.initialize();
    id = (await storage.save(entry())).id as number;
  });

  afterEach(async () => {
    await storage.close();
    cleanup();
  });

  it('holds a tag once, however many times it is added', async () => {
    await storage.addTags(id, ['alpha', 'beta']);
    await storage.addTags(id, ['alpha']);
    await storage.addTags(id, ['ALPHA']);

    expect((await storage.getEntryTags(id)).sort()).toEqual(['ALPHA', 'BETA']);
  });

  it('counts each tag once per entry that carries it', async () => {
    await storage.addTags(id, ['alpha']);
    await storage.addTags(id, ['alpha']);

    const second = (await storage.save(entry())).id as number;
    await storage.addTags(second, ['alpha']);

    const counts = (await storage.getAllTags()).map((t) => `${t.tag}:${t.count}`);
    expect(counts).toEqual(['ALPHA:2']);
  });

  it('removes a tag completely', async () => {
    await storage.addTags(id, ['alpha', 'beta']);
    await storage.addTags(id, ['alpha']);

    await storage.removeTags(id, ['alpha']);

    expect(await storage.getEntryTags(id)).toEqual(['BETA']);
    expect((await storage.getAllTags()).map((t) => t.tag)).toEqual(['BETA']);
  });

  it('forgets a tag once no entry carries it', async () => {
    await storage.addTags(id, ['alpha']);
    await storage.removeTags(id, ['alpha']);

    expect(await storage.getAllTags()).toEqual([]);
  });

  it('does not go negative when removing a tag that was never there', async () => {
    await storage.removeTags(id, ['never-applied']);

    expect(await storage.getAllTags()).toEqual([]);
    expect(await storage.getEntryTags(id)).toEqual([]);
  });

  it('ignores a tag for an entry that is not there', async () => {
    // The collector tags an entry just after saving it, and pruning or the
    // entry cap can remove it in between. There is nothing for the caller to do
    // about that, so it must not throw — and the tag must not be kept either.
    await expect(storage.addTags(999_999, ['ghost'])).resolves.toBeUndefined();

    expect(await storage.getEntryTags(999_999)).toEqual([]);
    expect(await storage.getAllTags()).toEqual([]);
  });

  it('finds entries by tag without duplicating them', async () => {
    await storage.addTags(id, ['alpha']);
    await storage.addTags(id, ['alpha']);

    const found = await storage.findByTags(['alpha']);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);
  });

  it('drops an entry’s tags when the entry goes', async () => {
    await storage.addTags(id, ['alpha']);
    await storage.prune(new Date(Date.now() + 60_000));

    expect(await storage.getAllTags()).toEqual([]);
    expect(await storage.getEntryTags(id)).toEqual([]);
  });
});
