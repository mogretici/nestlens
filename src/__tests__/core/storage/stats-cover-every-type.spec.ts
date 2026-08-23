/**
 * Every kind of entry there is, is counted.
 *
 * The Redis driver's `getStats()` counted from a list written out by hand:
 * eighteen types where `EntryType` has nineteen. `graphql` was the missing one,
 * so on a GraphQL API the dashboard's headline figures read
 * `{ total: 0, byType: {} }` while the entries were being recorded and listed
 * correctly underneath — measured on a deployment, three times, same worker,
 * same store. A reader concludes the tool is not working and turns it off.
 *
 * The memory and SQLite drivers count from the data and could not drift; only
 * a literal could. It is derived now, and this is the guard for the next type
 * somebody adds.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { ENTRY_TYPES, Entry, EntryType } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

/** A minimal entry of each type, enough to be saved and counted. */
const entry = (type: EntryType): Entry =>
  ({
    type,
    payload: {
      method: 'POST',
      url: '/graphql',
      path: '/graphql',
      statusCode: 200,
      duration: 1,
      message: 'x',
      level: 'info',
      query: 'SELECT 1',
      name: 'thing',
      operationType: 'query',
      operation: 'x',
      key: 'k',
      action: 'find',
      entity: 'Thing',
      status: 'completed',
      gate: 'g',
      allowed: true,
      command: 'GET',
      format: 'html',
      template: 't',
      to: 'a@b.test',
      subject: 's',
      hostname: 'h',
      channel: 'c',
      type: 'x',
      operationName: 'X',
    },
  }) as unknown as Entry;

describe('stats count every type there is', () => {
  jest.setTimeout(60_000);

  const drivers: [string, () => StorageInterface | undefined][] = [
    ['memory', () => new MemoryStorage({ maxEntries: 1000 })],
    ['sqlite', () => new SqliteStorage(join(workspace, 'stats.db'), 1000)],
    [
      'redis',
      () => {
        if (!REDIS_URL) return undefined;
        const url = new URL(REDIS_URL);

        return new RedisStorage({
          host: url.hostname,
          port: Number(url.port || 6379),
          db: 10,
          keyPrefix: 'nestlens-stats-test:',
        });
      },
    ],
  ];

  let workspace: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-stats-'));
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each(drivers)('%s counts one of each', async (_name, build) => {
    const storage = build();
    if (!storage) return;

    await storage.initialize();
    await storage.clear();

    for (const type of ENTRY_TYPES) {
      await storage.save(entry(type));
    }

    const stats = await storage.getStats();

    expect(stats.total).toBe(ENTRY_TYPES.length);
    expect(Object.keys(stats.byType).sort()).toEqual([...ENTRY_TYPES].sort());

    await storage.clear();
    await storage.close();
  });

  it.each(drivers)('%s reports storage stats over every type too', async (_name, build) => {
    // `getStorageStats()` carried its own copy of the same hand-written list,
    // which is what the dashboard's retention card reads.
    const storage = build();
    if (!storage) return;

    await storage.initialize();
    await storage.clear();

    for (const type of ENTRY_TYPES) {
      await storage.save(entry(type));
    }

    const stats = await storage.getStorageStats();

    expect(stats.total).toBe(ENTRY_TYPES.length);
    expect(Object.keys(stats.byType).sort()).toEqual([...ENTRY_TYPES].sort());

    await storage.clear();
    await storage.close();
  });

  it('counts a GraphQL entry, which is the one that was missing', async () => {
    const storage = new MemoryStorage({ maxEntries: 10 });
    await storage.initialize();

    await storage.save(entry('graphql'));

    expect((await storage.getStats()).byType.graphql).toBe(1);

    await storage.close();
  });
});
