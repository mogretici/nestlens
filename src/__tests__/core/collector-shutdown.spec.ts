/**
 * Shutting down must not wait on storage forever.
 *
 * The last thing `CollectorService` does is flush what is still buffered. A
 * storage that has stopped answering does not fail that flush — it never
 * returns — and awaiting it meant the application never finished shutting
 * down. `app.close()` hung, SIGTERM did nothing, and the process waited for
 * whatever eventually killed it.
 *
 * Measured against a storage whose `save` never settles:
 *
 *     healthy storage    app.close() ->  1ms
 *     throwing storage   app.close() ->  302ms
 *     hanging storage    app.close() ->  still going after 6,000ms
 *
 * A monitoring tool must never be the reason a deployment cannot roll.
 */
import { CollectorService } from '../../core/collector.service';
import { StorageInterface } from '../../core/storage/storage.interface';
import { NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const payload = {
  method: 'GET',
  url: '/x',
  path: '/x',
  query: {},
  params: {},
  headers: {},
  statusCode: 200,
  duration: 1,
} as unknown as Extract<Entry, { type: 'request' }>['payload'];

/** A storage that answers, or does not, on demand. */
const makeStorage = (behaviour: 'ok' | 'throws' | 'hangs'): StorageInterface => {
  const answer = async (entries: unknown): Promise<unknown> => {
    if (behaviour === 'throws') throw new Error('storage is down');
    if (behaviour === 'hangs') return new Promise(() => undefined);
    return entries;
  };

  return {
    initialize: async () => undefined,
    save: async (entry: Entry) => (await answer([entry])) as Entry,
    saveBatch: async (entries: Entry[]) =>
      ((await answer(entries.map((e, i) => ({ ...e, id: i + 1 })))) as Entry[]) ?? [],
    find: async () => [],
    findById: async () => null,
    count: async () => 0,
    getLatestSequence: async () => null,
    hasEntriesAfter: async () => 0,
    getStats: async () => ({ total: 0, byType: {} }) as never,
    getStorageStats: async () => ({}) as never,
    prune: async () => 0,
    pruneByType: async () => 0,
    clear: async () => undefined,
    close: async () => undefined,
    addTags: async () => undefined,
    removeTags: async () => undefined,
    getEntryTags: async () => [],
    getAllTags: async () => [],
    findByTags: async () => [],
    addMonitoredTag: async () => ({}) as never,
    removeMonitoredTag: async () => undefined,
    getMonitoredTags: async () => [],
    resolveEntry: async () => undefined,
    unresolveEntry: async () => undefined,
    updateFamilyHash: async () => undefined,
    findByFamilyHash: async () => [],
    findWithCursor: async () => ({ data: [], meta: {} }) as never,
  } as unknown as StorageInterface;
};

const makeCollector = (behaviour: 'ok' | 'throws' | 'hangs'): CollectorService =>
  new CollectorService(makeStorage(behaviour), {} as NestLensConfig);

describe('collector shutdown', () => {
  it('returns promptly when storage is healthy', async () => {
    const collector = makeCollector('ok');
    await collector.collect('request', payload);

    const started = Date.now();
    await collector.shutdown();

    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('returns when storage throws', async () => {
    const collector = makeCollector('throws');
    await collector.collect('request', payload);

    const started = Date.now();
    await expect(collector.shutdown()).resolves.toBeUndefined();

    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('gives up on a storage that never answers', async () => {
    const collector = makeCollector('hangs');
    await collector.collect('request', payload);

    const started = Date.now();

    // The assertion is that this settles at all. Before the deadline it did
    // not, and the suite itself would have hung here.
    await expect(collector.shutdown()).resolves.toBeUndefined();

    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(2_500);
    expect(elapsed).toBeLessThan(6_000);
  }, 10_000);

  it('closes the entry stream even when the flush is abandoned', async () => {
    const collector = makeCollector('hangs');
    await collector.collect('request', payload);

    let completed = false;
    collector.entryStream$.subscribe({ complete: () => (completed = true) });

    await collector.shutdown();

    // Anything subscribed — the SSE endpoint, the alerting hook — has to be
    // told the stream is over, or its own teardown waits on a stream that will
    // never emit again.
    expect(completed).toBe(true);
  }, 10_000);

  it('stops the periodic flush timer', async () => {
    const collector = makeCollector('ok');
    const cleared = jest.spyOn(global, 'clearInterval');

    await collector.shutdown();

    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });

  it('is safe to shut down twice', async () => {
    const collector = makeCollector('ok');
    await collector.collect('request', payload);

    await collector.shutdown();
    await expect(collector.shutdown()).resolves.toBeUndefined();
  });
});
