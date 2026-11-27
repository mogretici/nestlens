/**
 * `storage.redis.maxEntries` was a setting that did nothing.
 *
 * `RedisStorageConfig` is what `storage.redis` is typed as, and it carried a
 * `maxEntries` documented "set by the factory from `storage.maxEntries`; not
 * configured here". The factory spreads `storage.redis` and then writes its
 * own `maxEntries` over it, so `{ redis: { maxEntries: 5 } }` compiled, read
 * as a five-entry ceiling, and kept ten thousand. The ceiling is
 * `storage.maxEntries`, for every driver; a `RedisStorage` built by hand takes
 * one through its own options.
 */
import { describe, it, expect } from 'vitest';
import { NestLensConfig } from '../../../nestlens.config';
import { RedisStorage } from '../../../core/storage/redis.storage';

describe('the Redis ceiling', () => {
  it('is not a storage.redis setting', () => {
    const config: NestLensConfig = {
      storage: {
        driver: 'redis',
        redis: {
          // @ts-expect-error -- the factory overwrote it; `storage.maxEntries` is the setting
          maxEntries: 5,
        },
      },
    };

    expect(config.storage?.driver).toBe('redis');
  });

  it('is still taken by a RedisStorage built by hand', () => {
    const storage = new RedisStorage({ url: 'redis://127.0.0.1:6379', maxEntries: 5 });

    expect((storage as unknown as { maxEntries: number }).maxEntries).toBe(5);
  });
});
