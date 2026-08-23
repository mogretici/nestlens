/**
 * `storage.redis.db` decides the database, whether or not a `url` is given.
 *
 * The two look additive — the URL for where the server is, `db` for which
 * database — and ioredis does not read them that way: the database comes from
 * the URL's path and the option beside it is ignored. Measured:
 * `new Redis('redis://127.0.0.1:6379/0', { db: 9 })` connects to 0.
 *
 * So this configuration, which a deployment actually shipped, wrote every entry
 * into database 0 without a word:
 *
 * ```ts
 * redis: { url: process.env.REDIS_URL, db: 1, keyPrefix: 'nestlens:' }
 * ```
 *
 * `keyPrefix` keeps the keys apart from the application's own; `FLUSHDB` does
 * not, and neither does an eviction policy — under `allkeys-lru` NestLens
 * entries and the application's cache evict each other.
 */
import { Logger } from '@nestjs/common';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { withDatabase } from '../../../core/storage/redis-url';
import { Entry } from '../../../types';

const REDIS_URL = process.env.REDIS_URL;

const entry = (): Entry =>
  ({ type: 'log', payload: { level: 'info', message: 'which database' } }) as unknown as Entry;

describe('the database a URL-configured store writes to', () => {
  describe('the URL it builds', () => {
    it('puts the configured database in the path', () => {
      expect(withDatabase('redis://127.0.0.1:6379', 4)).toBe('redis://127.0.0.1:6379/4');
    });

    it('replaces a database the URL already named', () => {
      expect(withDatabase('redis://127.0.0.1:6379/0', 4)).toBe('redis://127.0.0.1:6379/4');
    });

    it('leaves the URL alone when no database is configured', () => {
      expect(withDatabase('redis://127.0.0.1:6379/2', undefined)).toBe('redis://127.0.0.1:6379/2');
    });

    it('keeps credentials and options', () => {
      expect(withDatabase('rediss://user:secret@host:6380/1?family=6', 3)).toBe(
        'rediss://user:secret@host:6380/3?family=6',
      );
    });

    it('passes on something it cannot parse', () => {
      // ioredis has its own parser and may accept what this cannot.
      expect(withDatabase('not-a-url', 3)).toBe('not-a-url');
    });

    it('says so when the two disagree', () => {
      const warnings: string[] = [];
      const spy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: unknown) => void warnings.push(String(message)));

      withDatabase('redis://127.0.0.1:6379/7', 4);

      expect(warnings.join('\n')).toContain('database 7');
      expect(warnings.join('\n')).toContain('says 4');
      spy.mockRestore();
    });

    it('stays quiet when they agree', () => {
      const warnings: string[] = [];
      const spy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: unknown) => void warnings.push(String(message)));

      withDatabase('redis://127.0.0.1:6379/4', 4);

      expect(warnings).toHaveLength(0);
      spy.mockRestore();
    });
  });

  /** Against a real server, because the point is where the keys land. */
  (REDIS_URL ? describe : describe.skip)('against a running Redis', () => {
    jest.setTimeout(30_000);

    it('writes to the configured database and not to the URL’s', async () => {
      const url = new URL(REDIS_URL as string);
      url.pathname = '/0';

      const store = (db: number): RedisStorage =>
        new RedisStorage({ url: url.toString(), db, keyPrefix: 'nestlens-db-test:' });

      // The database the URL names, emptied first: what is being measured is
      // where this write lands, not what an earlier run left behind.
      const urlDatabase = store(0);
      await urlDatabase.initialize();
      await urlDatabase.clear();

      const configured = store(15);
      await configured.initialize();
      await configured.clear();
      await configured.save(entry());

      expect(await configured.count()).toBe(1);
      expect(await urlDatabase.count()).toBe(0);

      await configured.clear();
      await configured.close();
      await urlDatabase.close();
    });
  });
});
