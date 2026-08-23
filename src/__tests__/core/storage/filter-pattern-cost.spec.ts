/**
 * A filter must not cost more than the store it walks.
 *
 * A path pattern was compiled with `new RegExp` for every entry it was tested
 * against, and a filtered walk tests every entry in the store against every
 * pattern the query carries — a hundred of them, by the same limit that bounds
 * every other filter array. Measured over ten thousand entries:
 *
 * ```text
 * 100 patterns  ->  1,000,000 compilations, 2,749ms
 * ```
 *
 * all of it on the event loop of the application being watched, from one query
 * string. The same query is 253ms with each pattern compiled once.
 */
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { Entry } from '../../../types';

const ENTRIES = 10_000;

describe('the cost of a path filter', () => {
  jest.setTimeout(60_000);

  let storage: MemoryStorage;

  beforeAll(async () => {
    storage = new MemoryStorage({ maxEntries: ENTRIES });
    await storage.initialize();

    const batch: Entry[] = [];
    for (let i = 0; i < ENTRIES; i += 1) {
      batch.push({
        type: 'request',
        payload: {
          method: 'GET',
          url: `/x/${i}`,
          path: `/some/quite/long/path/segment/${i}`,
          statusCode: 200,
          duration: 1,
        },
        createdAt: new Date().toISOString(),
      } as unknown as Entry);

      if (batch.length === 500) await storage.saveBatch(batch.splice(0));
    }
  });

  afterAll(async () => {
    await storage.close();
  });

  const timeFilter = async (paths: string[]): Promise<number> => {
    const started = Date.now();
    await storage.findWithCursor('request', { limit: 50, filters: { paths } });

    return Date.now() - started;
  };

  it('answers a hostile set of patterns in a fraction of what it cost', async () => {
    const hostile = Array.from({ length: 100 }, () => '*a*b*c*d*e*f*g*h*i*j*k*'.repeat(3));

    // Generous for a loaded runner, far under the 2,749ms it was.
    expect(await timeFilter(hostile)).toBeLessThan(1_500);
  });

  it('answers an ordinary pattern quickly', async () => {
    expect(await timeFilter(['/some/*'])).toBeLessThan(500);
  });

  it('still matches what the pattern means', async () => {
    const page = await storage.findWithCursor('request', {
      limit: 5,
      filters: { paths: ['/some/*'] },
    });

    expect(page.meta.total).toBe(ENTRIES);
  });

  it('still matches nothing when the pattern matches nothing', async () => {
    const page = await storage.findWithCursor('request', {
      limit: 5,
      filters: { paths: ['/nowhere/*'] },
    });

    expect(page.meta.total).toBe(0);
  });

  it('still treats a pattern without a wildcard as a substring', async () => {
    const page = await storage.findWithCursor('request', {
      limit: 5,
      filters: { paths: ['quite/long'] },
    });

    expect(page.meta.total).toBe(ENTRIES);
  });

  it('still keeps regular-expression characters literal', async () => {
    const page = await storage.findWithCursor('request', {
      limit: 5,
      filters: { paths: ['/some/quite.long/*'] },
    });

    expect(page.meta.total).toBe(0);
  });
});
