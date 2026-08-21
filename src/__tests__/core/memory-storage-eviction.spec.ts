/**
 * Evicting the oldest entry has to be cheap, and it has been wrong twice.
 *
 * A capped storage spends its whole life at the cap: after the first
 * `maxEntries` entries, every single save evicts one. So whatever eviction
 * costs is paid on every request the application serves, forever.
 *
 *  1. It sorted every key on each save. 32% of the process's CPU under load.
 *  2. It took `entries.keys().next()`, which reads correct. V8 leaves a
 *     tombstone behind each deleted key and a fresh iterator walks them all
 *     before reaching a live one, so it got slower the longer the process ran:
 *     1,566ms against 16ms for 200,000 inserts.
 *
 * Both passed every correctness test there was, because both evicted the right
 * entry. So the cost is asserted here as well as the behaviour — and asserted
 * by counting work rather than by timing it, since a clock measures the machine
 * as much as the code.
 */
import { MemoryStorage } from '../../core/storage/memory.storage';
import { Entry } from '../../types';

const request = (i: number): Entry =>
  ({
    type: 'request',
    payload: { method: 'GET', url: `/item/${i}`, path: '/item/:id', statusCode: 200, duration: 1 },
  }) as unknown as Entry;

describe('memory storage eviction', () => {
  describe('keeps the newest entries', () => {
    it('drops the oldest once the cap is passed', async () => {
      const storage = new MemoryStorage({ maxEntries: 10 });
      await storage.initialize();

      for (let i = 0; i < 25; i += 1) await storage.save(request(i));

      const kept = await storage.find({});
      const urls = kept.map((entry) => (entry.payload as { url: string }).url);

      expect(kept).toHaveLength(10);
      expect(urls).toEqual(expect.arrayContaining(['/item/24', '/item/15']));
      expect(urls).not.toContain('/item/14');
      expect(urls).not.toContain('/item/0');

      await storage.close();
    });

    it('holds the line over many times the cap', async () => {
      const storage = new MemoryStorage({ maxEntries: 50 });
      await storage.initialize();

      for (let i = 0; i < 5_000; i += 1) await storage.save(request(i));

      expect((await storage.getStats()).total).toBe(50);

      const urls = (await storage.find({})).map((entry) => (entry.payload as { url: string }).url);
      expect(urls).toContain('/item/4999');
      expect(urls).toContain('/item/4950');
      expect(urls).not.toContain('/item/4949');

      await storage.close();
    });

    it('starts counting again after a clear', async () => {
      // `clear()` resets the id allocator, so the eviction cursor has to reset
      // with it or it will point past everything that exists.
      const storage = new MemoryStorage({ maxEntries: 5 });
      await storage.initialize();

      for (let i = 0; i < 20; i += 1) await storage.save(request(i));
      await storage.clear();
      for (let i = 100; i < 120; i += 1) await storage.save(request(i));

      const urls = (await storage.find({})).map((entry) => (entry.payload as { url: string }).url);

      expect(urls).toHaveLength(5);
      expect(urls).toContain('/item/119');
      expect(urls).not.toContain('/item/114');

      await storage.close();
    });

    it('survives entries removed by pruning', async () => {
      // The eviction cursor walks forward over ids that are already gone. The
      // pruning service removes entries by age, out from under it, so it has to
      // skip them rather than stall on the first one that is missing.
      const storage = new MemoryStorage({ maxEntries: 10 });
      await storage.initialize();

      for (let i = 0; i < 10; i += 1) await storage.save(request(i));

      // Everything so far is older than this instant.
      const removed = await storage.prune(new Date(Date.now() + 1_000));
      expect(removed).toBe(10);

      for (let i = 10; i < 40; i += 1) await storage.save(request(i));

      expect((await storage.getStats()).total).toBe(10);

      const urls = (await storage.find({})).map((entry) => (entry.payload as { url: string }).url);
      expect(urls).toContain('/item/39');
      expect(urls).not.toContain('/item/29');

      await storage.close();
    });
  });

  describe('costs the same whether or not it is evicting', () => {
    /**
     * Counts how much work a run of saves does, in `Map` operations.
     *
     * Both previous versions failed this: the sort called `Array.prototype.sort`
     * once per save, and the iterator version called `Map.prototype.keys` once
     * per save and then walked every tombstone inside it. Counting the calls
     * catches the first exactly; for the second, the comparison against an
     * uncapped storage catches the growth.
     */
    it('does not sort, and does not open an iterator, per save', async () => {
      const sort = jest.spyOn(Array.prototype, 'sort');
      const keys = jest.spyOn(Map.prototype, 'keys');

      try {
        const storage = new MemoryStorage({ maxEntries: 100 });
        await storage.initialize();

        for (let i = 0; i < 50; i += 1) await storage.save(request(i));
        sort.mockClear();
        keys.mockClear();

        // Every one of these evicts.
        for (let i = 50; i < 1_050; i += 1) await storage.save(request(i));

        expect(sort).not.toHaveBeenCalled();
        expect(keys).not.toHaveBeenCalled();

        await storage.close();
      } finally {
        sort.mockRestore();
        keys.mockRestore();
      }
    });

    it('fills a capped storage about as fast as an uncapped one', async () => {
      // The tombstone version was ~100x slower here and grew with the run
      // length, so the ratio is what this is watching rather than either
      // figure. Generous enough that a loaded machine does not fail it.
      const fill = async (maxEntries: number): Promise<number> => {
        const storage = new MemoryStorage({ maxEntries });
        await storage.initialize();

        const started = process.hrtime.bigint();
        for (let i = 0; i < 20_000; i += 1) await storage.save(request(i));
        const elapsed = Number(process.hrtime.bigint() - started);

        await storage.close();
        return elapsed;
      };

      await fill(1_000);

      const capped = await fill(1_000);
      const uncapped = await fill(100_000);

      expect(capped).toBeLessThan(uncapped * 10);
    });
  });
});
