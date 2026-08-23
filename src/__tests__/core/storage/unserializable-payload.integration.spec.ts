/**
 * One payload the storage cannot write must not stop the ones behind it.
 *
 * The file and Redis drivers store `JSON.stringify(entry.payload)`, which
 * throws on a bigint or on an own `toJSON` that throws. The collector reads a
 * throwing save as storage being down: the batch goes back into the buffer and
 * fails every flush after it. Measured, against a database that was answering
 * perfectly:
 *
 * ```text
 * 1 unserialisable payload + 20 ordinary entries  ->  0 stored
 * ```
 *
 * and `Failed to flush entries, will keep retrying` in the log, until the
 * buffer's ceiling dropped the poisoned entry a thousand entries later.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CollectorService } from '../../../core/collector.service';
import { DataMaskerService } from '../../../core/data-masker.service';
import { NestLensConfig } from '../../../nestlens.config';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';

const REDIS_URL = process.env.REDIS_URL;

/** A payload no serialiser can take, and one masking does not know about. */
const poisoned = (): Record<string, unknown> => ({
  id: 1,
  toJSON(): never {
    throw new Error('this object refuses to be serialised');
  },
});

describe('an entry whose payload cannot be serialised', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-poison-'));

    const sqlite = new SqliteStorage(join(workspace, 'poison.db'), 10_000);
    await sqlite.initialize();
    backends = [{ name: 'sqlite', storage: sqlite }];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 10,
        keyPrefix: 'nestlens-poison-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch {
        await redis.close().catch(() => undefined);
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

  it.each(['sqlite', 'redis'])('%s records the entries behind it', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.clear();

    const collector = new CollectorService(
      backend.storage,
      {} as NestLensConfig,
      new DataMaskerService({}),
    );

    await collector.collect('job', { queue: 'q', name: 'n', data: poisoned() } as never);
    for (let i = 0; i < 20; i += 1) {
      await collector.collect('log', { level: 'info', message: `after ${i}` } as never);
    }
    await collector.flush();

    expect(await backend.storage.count()).toBe(21);

    await collector.onModuleDestroy();
  });

  it.each(['sqlite', 'redis'])('%s says what happened to that payload', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.clear();
    await backend.storage.save({
      type: 'job',
      payload: poisoned(),
      createdAt: new Date().toISOString(),
    } as never);

    const [stored] = await backend.storage.find({});

    expect(JSON.stringify(stored.payload)).toContain('could not be recorded');
  });

  it.each(['sqlite', 'redis'])('%s still writes an ordinary payload whole', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.clear();
    await backend.storage.save({
      type: 'log',
      payload: { level: 'info', message: 'ordinary' },
      createdAt: new Date().toISOString(),
    } as never);

    const [stored] = await backend.storage.find({});

    expect(stored.payload).toEqual({ level: 'info', message: 'ordinary' });
  });
});
