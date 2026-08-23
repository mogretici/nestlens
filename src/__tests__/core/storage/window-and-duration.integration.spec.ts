/**
 * Narrowing a list by when it happened and how long it took.
 *
 * Neither was possible. `entries/cursor` is what every dashboard list is paged
 * through and it took no window at all, so "what happened at 14:03" had no
 * answer; `entries`, `requests` and `exceptions` accepted `from` and `to`
 * through a different path while `logs` and `queries` accepted them and
 * ignored them, which is worse than refusing. And of forty-five filters the
 * only one about time taken was `slow`, a boolean the query watcher sets from
 * its own threshold — so "requests over 500ms", which is the first question
 * anybody asks a debugging tool, could not be asked.
 *
 * The window is compared as text, which is what `createdAt` is on every
 * backend and what SQLite's index can answer.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

describe('the window and the duration', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];
  let before: string;
  let after: string;

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-window-'));

    backends = [
      { name: 'memory', storage: new MemoryStorage({ maxEntries: 10_000 }) },
      { name: 'sqlite', storage: new SqliteStorage(join(workspace, 'window.db')) },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 12,
        keyPrefix: 'nestlens-window-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch {
        await redis.close().catch(() => undefined);
      }
    }

    before = new Date(Date.now() - 3_600_000).toISOString();

    for (const { storage } of backends) {
      if (!(storage instanceof RedisStorage)) await storage.initialize();

      for (const duration of [5, 50, 500, 5000]) {
        await storage.save({
          type: 'request',
          payload: {
            method: 'GET',
            path: `/p${duration}`,
            url: `/p${duration}`,
            statusCode: 200,
            duration,
          },
        } as unknown as Entry);
      }

      // Something that measures nothing, which a duration bound has to exclude.
      await storage.save({
        type: 'log',
        payload: { level: 'info', message: 'no duration here' },
      } as unknown as Entry);
    }

    after = new Date(Date.now() + 3_600_000).toISOString();
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  /** One question of every backend, expecting one answer. */
  const agree = async (ask: (storage: StorageInterface) => Promise<unknown>): Promise<unknown> => {
    const answers: { name: string; value: string }[] = [];

    for (const { name, storage } of backends) {
      answers.push({ name, value: JSON.stringify(await ask(storage)) });
    }

    const [first, ...rest] = answers;
    for (const other of rest) {
      expect(`${other.name}: ${other.value}`).toBe(`${other.name}: ${first.value}`);
    }

    return JSON.parse(first.value);
  };

  const count =
    (type: string, filters: Record<string, unknown>) => async (storage: StorageInterface) =>
      (await storage.findWithCursor(type as never, { limit: 100, filters: filters as never })).data
        .length;

  describe('the window', () => {
    it('keeps everything inside it', async () => {
      expect(await agree(count('request', { from: before, to: after }))).toBe(4);
    });

    it('keeps nothing that starts after it', async () => {
      expect(await agree(count('request', { from: after }))).toBe(0);
    });

    it('keeps nothing that ends before it', async () => {
      expect(await agree(count('request', { to: before }))).toBe(0);
    });

    it('takes a lower bound on its own', async () => {
      expect(await agree(count('request', { from: before }))).toBe(4);
    });

    it('takes an upper bound on its own', async () => {
      expect(await agree(count('request', { to: after }))).toBe(4);
    });

    it('reports the count of what fell inside, not of the type', async () => {
      const totals = await agree(async (storage) => {
        const page = await storage.findWithCursor('request', {
          limit: 100,
          filters: { from: after },
        });
        return page.meta.total;
      });

      expect(totals).toBe(0);
    });
  });

  describe('how long it took', () => {
    it('keeps what is at least as slow as the bound', async () => {
      expect(await agree(count('request', { minDuration: 500 }))).toBe(2);
    });

    it('keeps what is no slower than the bound', async () => {
      expect(await agree(count('request', { maxDuration: 50 }))).toBe(2);
    });

    it('takes both bounds together', async () => {
      expect(await agree(count('request', { minDuration: 50, maxDuration: 500 }))).toBe(2);
    });

    it('keeps everything when the bound is zero', async () => {
      expect(await agree(count('request', { minDuration: 0 }))).toBe(4);
    });

    it('keeps nothing an entry that measures nothing could satisfy', async () => {
      // A log line has no duration, so it cannot be inside a bound on one.
      expect(await agree(count('log', { minDuration: 1 }))).toBe(0);
    });

    it('still returns that entry when no duration is asked about', async () => {
      expect(await agree(count('log', {}))).toBe(1);
    });
  });

  describe('together', () => {
    it('narrows by both at once', async () => {
      expect(await agree(count('request', { from: before, to: after, minDuration: 500 }))).toBe(2);
    });

    it('agrees when the two exclude each other', async () => {
      expect(await agree(count('request', { from: after, minDuration: 0 }))).toBe(0);
    });
  });
});
