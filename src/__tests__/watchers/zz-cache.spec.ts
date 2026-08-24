import { CacheWatcher } from '../../watchers/cache.watcher';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';

describe('probe: a cache manager whose methods are synchronous', () => {
  it('reports what the host gets back', () => {
    const collector = {
      collect: async () => undefined,
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const store = new Map<string, unknown>([['k', 'v']]);
    const cache = {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => void store.set(key, value),
      del: (key: string) => void store.delete(key),
    };

    const watcher = new CacheWatcher(
      collector,
      { watchers: { cache: true } } as NestLensConfig,
      cache as never,
    );
    watcher.onModuleInit();

    const read = cache.get('k') as unknown;
    console.log('get returned:', read instanceof Promise ? 'a Promise' : JSON.stringify(read));
    const written = cache.set('k2', 'v2') as unknown;
    console.log(
      'set returned:',
      written instanceof Promise ? 'a Promise' : JSON.stringify(written),
    );

    watcher.onModuleDestroy();
    expect(true).toBe(true);
  });
});
