/**
 * Watching a cache must not change what the cache returns.
 *
 * The wrappers were written `async`, which turns a synchronous method into one
 * that returns a promise. `@nestjs/cache-manager` is asynchronous by contract,
 * but the object under `CACHE_MANAGER` is whatever the application provided —
 * and with a synchronous store this handed every caller a promise the moment
 * the watcher was enabled:
 *
 *     const cached = cache.get(key);
 *     if (cached) return cached;      // a promise is always truthy
 *
 * The same shape took an authorization service down once, which is why
 * `wrapMethodPreservingShape` exists. Eight watchers use it; this was the one
 * that did not.
 */
import { CacheWatcher } from '../../watchers/cache.watcher';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { CacheEntry } from '../../types';

const watching = (cache: object) => {
  const recorded: CacheEntry['payload'][] = [];

  const collector = {
    collect: async (_type: string, payload: CacheEntry['payload']) => void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new CacheWatcher(
    collector,
    { watchers: { cache: true } } as NestLensConfig,
    cache as never,
  );
  watcher.onModuleInit();

  return { watcher, recorded };
};

/** A store that answers immediately, as an in-process cache does. */
const synchronousCache = () => {
  const values = new Map<string, unknown>([['known', 'value']]);

  return {
    get: (key: string): unknown => values.get(key),
    set: (key: string, value: unknown): boolean => {
      values.set(key, value);
      return true;
    },
    del: (key: string): boolean => values.delete(key),
    reset: (): void => values.clear(),
  };
};

describe('a cache whose methods answer immediately', () => {
  it('still returns the value, not a promise', () => {
    const cache = synchronousCache();
    const { watcher } = watching(cache);

    expect(cache.get('known')).toBe('value');

    watcher.onModuleDestroy();
  });

  it('still returns what set returned', () => {
    const cache = synchronousCache();
    const { watcher } = watching(cache);

    expect(cache.set('k', 'v')).toBe(true);

    watcher.onModuleDestroy();
  });

  it('still returns what del returned', () => {
    const cache = synchronousCache();
    const { watcher } = watching(cache);

    expect(cache.del('known')).toBe(true);

    watcher.onModuleDestroy();
  });

  it('records the read it passed through', () => {
    const cache = synchronousCache();
    const { watcher, recorded } = watching(cache);

    cache.get('known');
    cache.get('missing');

    expect(recorded.map((entry) => ({ operation: entry.operation, hit: entry.hit }))).toEqual([
      { operation: 'get', hit: true },
      { operation: 'get', hit: false },
    ]);

    watcher.onModuleDestroy();
  });

  it('lets an error through as it was', () => {
    const cache = {
      get: () => {
        throw new Error('the store is gone');
      },
    };
    const { watcher, recorded } = watching(cache);

    expect(() => cache.get()).toThrow('the store is gone');
    expect(recorded).toHaveLength(1);

    watcher.onModuleDestroy();
  });
});

describe('a cache whose methods are asynchronous', () => {
  const asyncCache = () => ({
    get: async (key: string): Promise<unknown> => (key === 'known' ? 'value' : undefined),
    set: async (): Promise<void> => undefined,
    del: async (): Promise<void> => undefined,
  });

  it('still awaits to what it awaited to', async () => {
    const cache = asyncCache();
    const { watcher } = watching(cache);

    await expect(cache.get('known')).resolves.toBe('value');

    watcher.onModuleDestroy();
  });

  it('records the read once it has settled, with the answer', async () => {
    const cache = asyncCache();
    const { watcher, recorded } = watching(cache);

    await cache.get('known');
    await cache.get('missing');

    expect(recorded.map((entry) => entry.hit)).toEqual([true, false]);

    watcher.onModuleDestroy();
  });

  it('rejects as it rejected', async () => {
    const cache = {
      get: async (): Promise<unknown> => {
        throw new Error('timeout');
      },
    };
    const { watcher, recorded } = watching(cache);

    await expect(cache.get()).rejects.toThrow('timeout');
    expect(recorded).toHaveLength(1);

    watcher.onModuleDestroy();
  });
});

describe('giving the cache back', () => {
  it('puts the methods it found back', () => {
    const cache = synchronousCache();
    const before = { get: cache.get, set: cache.set, del: cache.del };

    const { watcher } = watching(cache);
    watcher.onModuleDestroy();

    expect(cache.get).toBe(before.get);
    expect(cache.set).toBe(before.set);
    expect(cache.del).toBe(before.del);
  });
});
