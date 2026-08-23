/**
 * When an entry says it happened.
 *
 * Entries are buffered and written in batches, and every storage stamped
 * `createdAt` at the moment it did the writing. So an entry carried the time of
 * the flush rather than the time of the thing:
 *
 *     recorded at   14:40:48.808
 *     createdAt     14:40:49.810      1.00s later
 *
 * The buffer holds for up to a second by default, so every entry of a busy
 * second landed on the same instant and in flush order rather than in the
 * order things happened. That is the axis the list is sorted on, the one the
 * window filters, and the one any timeline would be drawn from.
 *
 * Exceptions never had the problem — they are written immediately — which is
 * why the two could disagree about which came first.
 *
 * The collector stamps the entry where the thing happens; a storage uses that
 * and only invents one for a caller who supplied none.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CollectorService } from '../../../core/collector.service';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { NestLensConfig } from '../../../nestlens.config';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

/** Longer than the collector's flush interval, so a batch really waits. */
const HELD_FOR_MS = 1_200;

describe('an entry carries the time it happened', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-stamp-'));

    backends = [
      { name: 'memory', storage: new MemoryStorage({ maxEntries: 1_000 }) },
      { name: 'sqlite', storage: new SqliteStorage(join(workspace, 'stamp.db'), 0) },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 10,
        keyPrefix: 'nestlens-stamp-test:',
        maxEntries: 0,
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch {
        await redis.close().catch(() => undefined);
      }
    }

    for (const { storage } of backends) {
      if (!(storage instanceof RedisStorage)) await storage.initialize();
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  const collectorFor = (storage: StorageInterface): CollectorService =>
    new CollectorService(storage, {} as NestLensConfig);

  it.each(['memory', 'sqlite', 'redis'])('%s keeps the moment, not the flush', async (name) => {
    const backend = backends.find((candidate) => candidate.name === name);
    if (!backend) return;

    const collector = collectorFor(backend.storage);
    const happenedAt = Date.now();

    await collector.collect('log', {
      level: 'info',
      message: `stamp-${name}`,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, HELD_FOR_MS));
    await collector.flush();

    const [stored] = await backend.storage.find({ type: 'log', limit: 1 });
    const drift = Date.parse(stored.createdAt as string) - happenedAt;

    // Within a few milliseconds of the call, not within a second of it.
    expect(Math.abs(drift)).toBeLessThan(100);

    await collector.onModuleDestroy?.();
  });

  it('keeps the order things happened in, not the order they were written', async () => {
    const storage = backends[0].storage;
    const collector = collectorFor(storage);

    // Two entries a measurable moment apart, both inside one flush.
    await collector.collect('log', { level: 'info', message: 'first' } as never);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await collector.collect('log', { level: 'info', message: 'second' } as never);
    await collector.flush();

    const entries = (await storage.find({ type: 'log', limit: 10 })) as Entry[];
    const stamps = new Map(
      entries.map((entry) => [
        (entry.payload as { message: string }).message,
        Date.parse(entry.createdAt as string),
      ]),
    );

    expect(stamps.get('second')! - stamps.get('first')!).toBeGreaterThanOrEqual(40);

    await collector.onModuleDestroy?.();
  });

  it('still invents one for a caller that supplied none', async () => {
    // A storage used directly, which the interface allows and the tests do.
    const before = Date.now();
    const saved = await backends[0].storage.save({
      type: 'log',
      payload: { level: 'info', message: 'no stamp' },
    } as unknown as Entry);

    const stamped = Date.parse(saved.createdAt as string);

    expect(stamped).toBeGreaterThanOrEqual(before - 1);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('answers a window with the moment, not the flush', async () => {
    // The filter reads the same field, so a flush-time stamp put an entry in
    // the wrong second of any window that narrow.
    const storage = backends[0].storage;
    const collector = collectorFor(storage);

    const before = new Date(Date.now() - 500).toISOString();
    await collector.collect('log', { level: 'info', message: 'windowed' } as never);
    const after = new Date(Date.now() + 500).toISOString();

    await new Promise((resolve) => setTimeout(resolve, HELD_FOR_MS));
    await collector.flush();

    const page = await storage.findWithCursor('log', {
      limit: 50,
      filters: { from: before, to: after },
    });

    expect(
      page.data.some((entry) => (entry.payload as { message: string }).message === 'windowed'),
    ).toBe(true);

    await collector.onModuleDestroy?.();
  });
});
