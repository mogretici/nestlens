/**
 * What the watchers leave behind when the module closes.
 *
 * Five watchers work by replacing methods on objects the application owns and
 * keeps — the cache manager, the command bus, the mailer, the Redis client, the
 * notification service. None of them gave those methods back. The host went on
 * calling through a watcher whose collector was gone, and a process that builds
 * the module more than once against the same object — tests, `nest start --hmr`
 * — wrapped the previous wrapper: one call recorded one entry per layer.
 *
 * Measured before the fix: three rounds of setup produced three entries for a
 * single cache read.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { CacheWatcher } from '../../watchers/cache.watcher';
import { CommandWatcher } from '../../watchers/command.watcher';
import { NestLensConfig } from '../../nestlens.config';
import { CollectorService } from '../../core/collector.service';

const collectorRecording = (into: string[]): CollectorService =>
  ({
    collect: (type: string) => {
      into.push(type);
      return Promise.resolve();
    },
  }) as unknown as CollectorService;

describe('watchers put back what they replaced', () => {
  describe('cache manager', () => {
    const config = { enabled: true, watchers: { cache: true } } as NestLensConfig;

    const cacheManager = (): Record<string, unknown> => ({
      get: async (key: string) => `value-for-${key}`,
      set: async () => undefined,
      del: async () => undefined,
      reset: async () => undefined,
    });

    it('records one entry per call however many times the module was built', async () => {
      // Arrange
      const recorded: string[] = [];
      const manager = cacheManager();
      const collector = collectorRecording(recorded);

      // Act - the lifecycle a test suite or an HMR reload goes through
      for (let round = 0; round < 3; round++) {
        const watcher = new CacheWatcher(collector, config, manager as never);
        watcher.onModuleInit();
        await (manager.get as (k: string) => Promise<unknown>)('orders');
        watcher.onModuleDestroy();
      }

      // Assert - three reads, three entries; not one, three and six
      expect(recorded).toEqual(['cache', 'cache', 'cache']);
    });

    it('leaves the application unwrapped afterwards', async () => {
      // Arrange
      const recorded: string[] = [];
      const manager = cacheManager();
      const watcher = new CacheWatcher(collectorRecording(recorded), config, manager as never);

      // Act
      watcher.onModuleInit();
      watcher.onModuleDestroy();
      const value = await (manager.get as (k: string) => Promise<unknown>)('orders');

      // Assert - the original answers, and nothing is recorded into a collector
      // that no longer belongs to a running module
      expect(value).toBe('value-for-orders');
      expect(recorded).toEqual([]);
    });
  });

  describe('command bus', () => {
    const config = { enabled: true, watchers: { command: true } } as NestLensConfig;

    it('gives execute back', async () => {
      // Arrange
      const recorded: string[] = [];
      const bus: Record<string, unknown> = { execute: async () => 'result' };
      const original = bus.execute;
      const watcher = new CommandWatcher(collectorRecording(recorded), config, bus as never);

      // Act
      watcher.onModuleInit();
      expect(bus.execute).not.toBe(original);
      watcher.onModuleDestroy();

      // Assert
      expect(bus.execute).toBe(original);
      await (bus.execute as () => Promise<unknown>)();
      expect(recorded).toEqual([]);
    });
  });
});
