/**
 * What monitoring a tag is for.
 *
 * A monitored tag was stored, listed and counted, and did nothing: pruning
 * deleted its entries with the rest, no watcher treated them differently, and
 * the dashboard never mentioned them. In Telescope — which this library takes
 * its shape from — monitoring is how a reader says *do not let these go*.
 *
 * Age is what it protects against. The store's `maxEntries` ceiling still
 * applies: that is what bounds how much NestLens holds, and a monitored tag on
 * a busy route would otherwise have no bound at all.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL ?? (process.env.CI ? 'redis://127.0.0.1:6379' : undefined);

const OLD = '2020-01-01T00:00:00.000Z';

const entry = (message: string): Entry =>
  ({ type: 'log', payload: { level: 'info', message }, createdAt: OLD }) as unknown as Entry;

describe('a monitored tag, when pruning runs', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-monitored-'));

    const sqlite = new SqliteStorage(join(workspace, 'monitored.db'), 1_000);
    const memory = new MemoryStorage({ maxEntries: 1_000 });
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
        db: 6,
        keyPrefix: 'nestlens-monitored-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch (error) {
        await redis.close().catch(() => undefined);
        if (process.env.CI) {
          throw new Error(`Redis was expected at ${REDIS_URL}: ${String(error)}`);
        }
      }
    }

    for (const { storage } of backends) {
      const kept = await storage.save(entry('worth keeping'));
      await storage.save(entry('ordinary'));
      await storage.addTags(kept.id as number, ['CHECKOUT']);
      await storage.addMonitoredTag('checkout');
    }
  });

  afterEach(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each(['memory', 'sqlite', 'redis'])('%s keeps the entry that carries it', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.prune(new Date());

    const left = await backend.storage.find({});
    expect(left.map((e) => (e.payload as { message: string }).message)).toEqual(['worth keeping']);
  });

  it.each(['memory', 'sqlite', 'redis'])('%s reports only what it deleted', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    expect(await backend.storage.prune(new Date())).toBe(1);
  });

  it.each(['memory', 'sqlite', 'redis'])('%s keeps it through a typed prune too', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.pruneByType('log', new Date());

    expect(await backend.storage.count()).toBe(1);
  });

  it.each(['memory', 'sqlite', 'redis'])(
    '%s lets it go once the tag is no longer monitored',
    async (name) => {
      const backend = backends.find((candidate) => candidate.name === name);
      if (!backend) return;

      await backend.storage.removeMonitoredTag('checkout');
      await backend.storage.prune(new Date());

      expect(await backend.storage.count()).toBe(0);
    },
  );

  it.each(['memory', 'sqlite', 'redis'])(
    '%s prunes everything when nothing is monitored',
    async (name) => {
      const backend = backends.find((candidate) => candidate.name === name);
      if (!backend) return;

      await backend.storage.clear();
      await backend.storage.save(entry('a'));
      await backend.storage.save(entry('b'));

      expect(await backend.storage.prune(new Date())).toBe(2);
    },
  );
});
