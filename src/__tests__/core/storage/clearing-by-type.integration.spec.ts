/**
 * Deleting the entries of one watcher.
 *
 * `pruneByType` existed on every storage and on the interface, and nothing ever
 * called it: not the pruning service, not the API. So the dashboard offered
 * two things — *Prune Now*, which deletes by age, and *Clear all entries*,
 * which deletes everything — and no way to say "these, now". The capability
 * was there and had no door.
 *
 * Clearing is not pruning, in two ways that are deliberate: age is not
 * consulted, and a monitored tag does not stand in the way. Monitoring says
 * *do not let pruning take these*; pressing delete says something else.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry, EntryType } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

const entry = (type: EntryType, i: number): Entry =>
  ({
    type,
    payload: { message: `m${i}`, level: 'info', query: 'SELECT 1', method: 'GET', url: '/x' },
  }) as unknown as Entry;

describe('clearing entries', () => {
  jest.setTimeout(60_000);

  let workspace: string;

  const drivers: [string, () => StorageInterface | undefined][] = [
    ['memory', () => new MemoryStorage({ maxEntries: 1000 })],
    ['sqlite', () => new SqliteStorage(join(workspace, 'clear.db'), 1000)],
    [
      'redis',
      () => {
        if (!REDIS_URL) return undefined;
        const url = new URL(REDIS_URL);

        return new RedisStorage({
          host: url.hostname,
          port: Number(url.port || 6379),
          db: 9,
          keyPrefix: 'nestlens-clear-test:',
        });
      },
    ],
  ];

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-clear-'));
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const filled = async (build: () => StorageInterface | undefined) => {
    const storage = build();
    if (!storage) return undefined;

    await storage.initialize();
    await storage.clear();

    for (let i = 0; i < 4; i += 1) await storage.save(entry('query', i));
    for (let i = 0; i < 3; i += 1) await storage.save(entry('log', i));

    return storage;
  };

  it.each(drivers)('%s deletes one type and leaves the rest', async (_name, build) => {
    const storage = await filled(build);
    if (!storage) return;

    const deleted = await storage.clear('query');

    expect(deleted).toBe(4);
    expect(await storage.count('query')).toBe(0);
    expect(await storage.count('log')).toBe(3);

    await storage.clear();
    await storage.close();
  });

  it.each(drivers)('%s still deletes everything when asked for nothing', async (_name, build) => {
    const storage = await filled(build);
    if (!storage) return;

    const deleted = await storage.clear();

    expect(deleted).toBe(7);
    expect(await storage.count()).toBe(0);

    await storage.close();
  });

  it.each(drivers)('%s takes a monitored entry with it', async (_name, build) => {
    // Monitoring exempts entries from *pruning*. Somebody pressing delete has
    // said something else, and a store that quietly kept them would be lying
    // about what it holds.
    const storage = await filled(build);
    if (!storage) return;

    const [first] = await storage.find({ type: 'query', limit: 1 });
    await storage.addTags(first.id as number, ['KEEP']);
    await storage.addMonitoredTag('KEEP');

    expect(await storage.clear('query')).toBe(4);
    expect(await storage.count('query')).toBe(0);

    await storage.removeMonitoredTag('KEEP');
    await storage.clear();
    await storage.close();
  });

  it.each(drivers)('%s deletes the tags of what it deleted', async (_name, build) => {
    const storage = await filled(build);
    if (!storage) return;

    const [first] = await storage.find({ type: 'query', limit: 1 });
    await storage.addTags(first.id as number, ['SLOW']);

    await storage.clear('query');

    // A tag index pointing at an entry nothing holds is a filter that finds a
    // row it cannot show. `find` takes no tag filter, so this asks the index
    // itself.
    const remaining = await storage.findByTags(['SLOW'], 'OR', 10);

    expect(remaining).toHaveLength(0);

    await storage.clear();
    await storage.close();
  });

  it.each(drivers)('%s says nothing was there when nothing was', async (_name, build) => {
    const storage = await filled(build);
    if (!storage) return;

    expect(await storage.clear('mail')).toBe(0);
    expect(await storage.count()).toBe(7);

    await storage.clear();
    await storage.close();
  });
});
