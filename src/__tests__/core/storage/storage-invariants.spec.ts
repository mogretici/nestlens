/**
 * What every backend must do with whatever an application produced.
 *
 * The shapes that broke storage this session — a bidirectional relation, a
 * bigint, a Buffer, a `toJSON` that throws — each arrived as a surprise, and
 * each was fixed with a test for that shape. These are the rules underneath,
 * checked against payloads assembled at random and run through the whole path
 * a real entry takes: masking, then the driver.
 *
 *   1. every payload can be saved
 *   2. what is saved can be read back
 *   3. one entry that cannot be written does not stop the ones behind it
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CollectorService } from '../../../core/collector.service';
import { DataMaskerService } from '../../../core/data-masker.service';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { NestLensConfig } from '../../../nestlens.config';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';

const REDIS_URL = process.env.REDIS_URL ?? (process.env.CI ? 'redis://127.0.0.1:6379' : undefined);

const random = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

/** A payload from the shapes an application puts in one. */
const payloadFor = (seed: number): Record<string, unknown> => {
  const next = random(seed);
  const root: Record<string, unknown> = { level: 'info', message: `m${seed}` };

  const value = (depth: number): unknown => {
    switch (Math.floor(next() * 12)) {
      case 0:
        return new Date(Math.floor(next() * 1e12));
      case 1:
        return 10n ** BigInt(Math.floor(next() * 18));
      case 2:
        return Buffer.alloc(Math.floor(next() * 50));
      case 3:
        return new Map([['a', 1]]);
      case 4:
        return new Error('boom');
      case 5:
        return root;
      case 6:
        return {
          toJSON(): never {
            throw new Error('refuses');
          },
        };
      case 7:
        return () => 'a function';
      case 8:
        return depth > 4 ? 'deep' : [value(depth + 1), value(depth + 1)];
      default:
        return depth > 4 ? 'deep' : { nested: value(depth + 1), password: 'hunter2' };
    }
  };

  root.detail = value(0);
  root.items = [value(0), value(0)];

  return root;
};

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('every backend, given whatever an application produced', () => {
  jest.setTimeout(120_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-invariants-'));

    const sqlite = new SqliteStorage(join(workspace, 'invariants.db'), 10_000);
    const memory = new MemoryStorage({ maxEntries: 10_000 });
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
        db: 4,
        keyPrefix: 'nestlens-invariants-test:',
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
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each(['memory', 'sqlite', 'redis'])('%s records every one of them', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    await backend.storage.clear();

    const collector = new CollectorService(
      backend.storage,
      {} as NestLensConfig,
      new DataMaskerService({}),
    );

    for (const seed of SEEDS) {
      await collector.collect('log', payloadFor(seed) as never);
    }
    await collector.flush();

    expect(await backend.storage.count()).toBe(SEEDS.length);

    await collector.onModuleDestroy();
  });

  it.each(['memory', 'sqlite', 'redis'])('%s reads back what it wrote', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    const page = await backend.storage.findWithCursor('log', { limit: 100 });

    expect(page.data).toHaveLength(SEEDS.length);
    expect(page.data.every((entry) => typeof entry.payload === 'object')).toBe(true);
  });

  it.each(['memory', 'sqlite', 'redis'])('%s keeps no secret it was given', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    const page = await backend.storage.findWithCursor('log', { limit: 100 });

    expect(JSON.stringify(page.data)).not.toContain('hunter2');
  });
});
