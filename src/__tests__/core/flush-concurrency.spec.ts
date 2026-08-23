/**
 * How much NestLens is holding when the storage is slower than the traffic.
 *
 * Every caller used to start its own write — the timer, and each entry that
 * filled the buffer — so a storage that could not keep up was handed more and
 * more at once. Measured against a store taking 300ms a batch:
 *
 * ```text
 * 3,000 entries produced at once  ->  30 concurrent writes, 3,000 entries in flight
 * ```
 *
 * `MAX_BUFFERED_ENTRIES` is what bounds how much this holds, and entries
 * already on their way to the storage were outside it — three times the cap,
 * and growing with how far behind the storage was.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { StorageInterface } from '../../core/storage/storage.interface';

interface SlowStorage {
  storage: StorageInterface;
  peakConcurrency: () => number;
  saved: () => number;
}

const slowStorage = (latencyMs: number): SlowStorage => {
  let inFlight = 0;
  let peak = 0;
  let saved = 0;

  return {
    peakConcurrency: () => peak,
    saved: () => saved,
    storage: {
      save: async (entry: unknown) => entry,
      saveBatch: async (entries: unknown[]) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
        saved += entries.length;
        inFlight -= 1;

        return entries;
      },
      addTags: async () => undefined,
      updateFamilyHash: async () => undefined,
    } as unknown as StorageInterface,
  };
};

const collectorFor = (storage: StorageInterface): CollectorService =>
  new CollectorService(storage, {} as NestLensConfig);

const bufferOf = (collector: CollectorService) => collector.getBufferSize();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a storage slower than the traffic', () => {
  jest.setTimeout(30_000);

  it('is never handed more than one batch at a time', async () => {
    const slow = slowStorage(200);
    const collector = collectorFor(slow.storage);

    for (let i = 0; i < 3_000; i += 1) {
      void collector.collect('log', { level: 'info', message: `m${i}` } as never);
    }
    await wait(2_000);

    expect(slow.peakConcurrency()).toBe(1);

    await collector.onModuleDestroy();
  });

  it('holds no more than its buffer allows', async () => {
    const slow = slowStorage(200);
    const collector = collectorFor(slow.storage);

    for (let i = 0; i < 3_000; i += 1) {
      void collector.collect('log', { level: 'info', message: `m${i}` } as never);
    }
    await wait(500);

    const { pending, capacity } = bufferOf(collector);
    expect(pending).toBeLessThanOrEqual(capacity);

    await collector.onModuleDestroy();
  });

  it('loses nothing at a rate the storage can keep up with', async () => {
    const slow = slowStorage(300);
    const collector = collectorFor(slow.storage);

    // A thousand entries a second for three seconds.
    for (let second = 0; second < 3; second += 1) {
      for (let i = 0; i < 1_000; i += 1) {
        void collector.collect('log', { level: 'info', message: `m${second}-${i}` } as never);
      }
      await wait(1_000);
    }
    await wait(1_500);

    expect(slow.saved()).toBe(3_000);
    expect(bufferOf(collector).dropped).toBe(0);

    await collector.onModuleDestroy();
  });

  it('still writes everything when a caller waits for it', async () => {
    const slow = slowStorage(50);
    const collector = collectorFor(slow.storage);

    for (let i = 0; i < 250; i += 1) {
      await collector.collect('log', { level: 'info', message: `m${i}` } as never);
    }
    await collector.flush();

    expect(slow.saved()).toBe(250);

    await collector.onModuleDestroy();
  });

  it('writes what arrived while a flush was in flight', async () => {
    const slow = slowStorage(100);
    const collector = collectorFor(slow.storage);

    for (let i = 0; i < 150; i += 1) {
      void collector.collect('log', { level: 'info', message: `first-${i}` } as never);
    }
    const first = collector.flush();

    for (let i = 0; i < 10; i += 1) {
      void collector.collect('log', { level: 'info', message: `second-${i}` } as never);
    }

    await first;
    await collector.flush();

    expect(slow.saved()).toBe(160);

    await collector.onModuleDestroy();
  });
});
