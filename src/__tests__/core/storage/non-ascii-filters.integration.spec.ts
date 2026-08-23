/**
 * A filter has to mean the same thing whatever alphabet the text is in.
 *
 * SQLite's `LIKE` and `lower()` fold ASCII and nothing else. The other two
 * drivers compare with `includes` after `toLowerCase`, which is Unicode-aware,
 * so the same entries answered three different ways:
 *
 * ```text
 * search "ünlü"   memory 2   redis 2   sqlite 1
 * search "ÜNLÜ"   memory 2   redis 2   sqlite 0
 * names  "ödemehatası"        memory 1   sqlite 0
 * paths  "/ürünler"           memory 1   sqlite 0
 * ```
 *
 * A reader searching their own application's text on the file driver found
 * what happened to match in case, and nothing else — silently, since a search
 * that finds nothing looks like a search with no matches.
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

const MESSAGES = [
  'İstanbul şubesi',
  'istanbul subesi',
  'ÄPFEL geliefert',
  'äpfel geliefert',
  'ЖУРНАЛ записи',
  'журнал записи',
  'Ünlü müşteri',
  'ünlü müşteri',
];

describe('filtering text that is not English', () => {
  jest.setTimeout(60_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-unicode-'));

    const sqlite = new SqliteStorage(join(workspace, 'unicode.db'), 1_000);
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
        db: 3,
        keyPrefix: 'nestlens-unicode-test:',
      });

      try {
        await redis.initialize();
        await redis.clear();
        backends.push({ name: 'redis', storage: redis });
      } catch (error) {
        await redis.close().catch(() => undefined);
        throw new Error(`Redis was expected at ${REDIS_URL}: ${String(error)}`);
      }
    }

    for (const { storage } of backends) {
      for (const message of MESSAGES) {
        await storage.save({
          type: 'log',
          payload: { level: 'info', message },
        } as unknown as Entry);
      }
      await storage.save({
        type: 'exception',
        payload: { name: 'ÖdemeHatası', message: 'x' },
      } as unknown as Entry);
      await storage.save({
        type: 'request',
        payload: {
          method: 'GET',
          url: '/Ürünler/42',
          path: '/Ürünler/42',
          statusCode: 200,
          duration: 1,
        },
      } as unknown as Entry);
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  /** One question, every backend, one answer. */
  const agree = async (
    ask: (storage: StorageInterface) => Promise<unknown>,
  ): Promise<{ answers: string[]; first: string }> => {
    const answers: string[] = [];

    for (const { name, storage } of backends) {
      answers.push(`${name}: ${JSON.stringify(await ask(storage))}`);
    }

    return { answers, first: answers[0].split(': ')[1] };
  };

  const totalFor =
    (type: string, filters: Record<string, unknown>) => async (storage: StorageInterface) =>
      (await storage.findWithCursor(type as never, { limit: 50, filters: filters as never })).meta
        .total;

  it.each([
    ['ünlü', 2],
    ['ÜNLÜ', 2],
    ['äpfel', 2],
    ['ÄPFEL', 2],
    ['журнал', 2],
    ['ЖУРНАЛ', 2],
  ])('finds the same entries searching %s', async (term, expected) => {
    const { answers, first } = await agree(totalFor('log', { search: term }));

    expect(first).toBe(String(expected));
    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe(first);
    }
  });

  it('finds an exception by a name that is not English', async () => {
    const { answers, first } = await agree(totalFor('exception', { names: ['ödemehatası'] }));

    expect(first).toBe('1');
    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe(first);
    }
  });

  it('finds a request by a path that is not English', async () => {
    const { answers, first } = await agree(totalFor('request', { paths: ['/ürünler'] }));

    expect(first).toBe('1');
    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe(first);
    }
  });

  it('finds a request by a path pattern that is not English', async () => {
    const { answers, first } = await agree(totalFor('request', { paths: ['/ürünler/*'] }));

    expect(first).toBe('1');
    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe(first);
    }
  });

  it('still finds nothing for a term nobody has', async () => {
    const { answers } = await agree(totalFor('log', { search: 'nichts' }));

    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe('0');
    }
  });

  it('still treats a per cent sign as a character', async () => {
    const { answers } = await agree(totalFor('log', { search: '%' }));

    for (const answer of answers) {
      expect(answer.split(': ')[1]).toBe('0');
    }
  });
});
