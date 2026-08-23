import { Logger } from '@nestjs/common';

const logger = new Logger('RedisStorage');

/**
 * The connection URL with the configured database in it.
 *
 * `url` and `db` look additive — the URL for where the server is, `db` for
 * which database — and they are not: ioredis takes the database from the URL's
 * path and ignores the option beside it. Measured against ioredis:
 * `new Redis('redis://127.0.0.1:6379/0', { db: 9 })` connects to 0.
 *
 * So an application that configured
 *
 * ```ts
 * redis: { url: process.env.REDIS_URL, db: 1, keyPrefix: 'nestlens:' }
 * ```
 *
 * wrote every entry into database 0, silently — reported by a deployment that
 * found it by asking Redis. `keyPrefix` keeps the keys apart from the
 * application's own, but `FLUSHDB` does not, and neither does an eviction
 * policy: under `allkeys-lru` the entries and the application's cache compete
 * for the same memory and evict each other.
 *
 * The setting is honoured instead of ignored: the database goes into the URL,
 * which is the one place ioredis reads it from. Where the URL already names a
 * different one, that is a configuration disagreeing with itself and it is
 * said out loud rather than resolved quietly.
 */
export const withDatabase = (url: string, db: number | undefined): string => {
  if (db === undefined) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL this can read — ioredis has its own parser and may well
    // accept it, so it is passed on untouched rather than refused here.
    return url;
  }

  const inUrl = parsed.pathname.replace(/^\//, '');

  if (inUrl.length > 0 && inUrl !== String(db)) {
    logger.warn(
      `storage.redis.url names database ${inUrl} and storage.redis.db says ${db}. ` +
        `Using ${db}; remove one of them so the configuration says one thing.`,
    );
  }

  parsed.pathname = `/${db}`;

  return parsed.toString();
};
