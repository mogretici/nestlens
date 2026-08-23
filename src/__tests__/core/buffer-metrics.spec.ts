/**
 * Whether NestLens is keeping up, as a number an operator can read.
 *
 * The performance page has documented a metrics endpoint calling
 * `collector.getBufferSize()` for some time. There was no such method, so a
 * reader copying that example got a compile error — and the thing it was for,
 * knowing whether entries are being lost, had nowhere to be read from at all.
 *
 * The buffer discards its oldest when it fills rather than growing without
 * limit, which is the right choice for a debugging tool inside someone's
 * application. It also means the loss is silent, and `dropped` is the only
 * place it shows.
 */
import { CollectorService } from '../../core/collector.service';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { NestLensConfig } from '../../nestlens.config';
import { StorageInterface } from '../../core/storage/storage.interface';

const build = (storage: StorageInterface): CollectorService =>
  new CollectorService(storage, {} as NestLensConfig);

/**
 * A storage that refuses to write, so the buffer has to hold.
 *
 * Refusing rather than hanging: a `saveBatch` that never settles makes the
 * first flush — which `collect` awaits once a hundred entries are waiting —
 * never return, and the test that filled the buffer simply stopped. Rejecting
 * marks the collector's storage as failing, which is the state this is about.
 */
const refusing = (): StorageInterface => {
  const storage = new MemoryStorage({ maxEntries: 100_000 });
  storage.saveBatch = () => Promise.reject(new Error('storage is down'));
  return storage;
};

const log = (i: number) => ({ level: 'info', message: `m${i}` }) as never;

describe('the buffer metric', () => {
  let collector: CollectorService;

  afterEach(async () => {
    await collector?.onModuleDestroy?.();
  });

  it('starts empty', () => {
    collector = build(new MemoryStorage({ maxEntries: 100 }));

    expect(collector.getBufferSize()).toEqual({
      pending: 0,
      capacity: expect.any(Number),
      dropped: 0,
    });
  });

  it('reports a capacity that is not zero', () => {
    collector = build(new MemoryStorage({ maxEntries: 100 }));

    expect(collector.getBufferSize().capacity).toBeGreaterThan(0);
  });

  it('counts what is waiting while storage refuses', async () => {
    collector = build(refusing());

    for (let i = 0; i < 20; i += 1) {
      await collector.collect('log', log(i));
    }

    expect(collector.getBufferSize().pending).toBeGreaterThan(0);
  });

  it('never reports more pending than the capacity allows', async () => {
    collector = build(refusing());
    const { capacity } = collector.getBufferSize();

    for (let i = 0; i < capacity + 500; i += 1) {
      await collector.collect('log', log(i));
    }

    expect(collector.getBufferSize().pending).toBeLessThanOrEqual(capacity);
  });

  it('says how many entries the limit has cost', async () => {
    // The number that matters: silence here would mean the loss is invisible.
    collector = build(refusing());
    const { capacity } = collector.getBufferSize();

    for (let i = 0; i < capacity + 500; i += 1) {
      await collector.collect('log', log(i));
    }

    expect(collector.getBufferSize().dropped).toBeGreaterThan(0);
  });

  it('reports nothing dropped while the buffer is coping', async () => {
    collector = build(new MemoryStorage({ maxEntries: 100_000 }));

    for (let i = 0; i < 50; i += 1) {
      await collector.collect('log', log(i));
    }
    await collector.flush();

    expect(collector.getBufferSize()).toEqual({
      pending: 0,
      capacity: expect.any(Number),
      dropped: 0,
    });
  });
});
