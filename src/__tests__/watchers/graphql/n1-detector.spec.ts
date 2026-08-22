/**
 * What counts as an N+1, and what the reader is told to do about it.
 *
 * The detector had no tests of its own — 65% line coverage, reached only
 * through the adapters — while carrying a `parentIds` map, a `parentId` and a
 * `returnType` on its input, and four methods (`getCount`, `getAllCounts`,
 * `reset`, `getStats`) that nothing called and no consumer could: the class is
 * not exported from the package. The map was built on every recorded call and
 * read by nothing.
 */
import { N1Detector } from '../../../watchers/graphql/utils/n1-detector';

const call = (detector: N1Detector, parentType: string, fieldName: string, times: number): void => {
  for (let i = 0; i < times; i += 1) {
    detector.recordCall({ parentType, fieldName });
  }
};

describe('detecting an N+1', () => {
  it('says nothing about a resolver called once', () => {
    const detector = new N1Detector(10);
    call(detector, 'Order', 'items', 1);

    expect(detector.detect()).toEqual({ hasWarnings: false, warnings: [] });
  });

  it('says nothing one call below the threshold', () => {
    const detector = new N1Detector(10);
    call(detector, 'Order', 'items', 9);

    expect(detector.detect().hasWarnings).toBe(false);
  });

  it('says something at the threshold', () => {
    const detector = new N1Detector(10);
    call(detector, 'Order', 'items', 10);

    const { hasWarnings, warnings } = detector.detect();
    expect(hasWarnings).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ parentType: 'Order', field: 'items', count: 10 });
  });

  it('honours a threshold of its own', () => {
    const detector = new N1Detector(3);
    call(detector, 'Order', 'items', 3);

    expect(detector.detect().hasWarnings).toBe(true);
  });

  it('counts each resolver separately', () => {
    const detector = new N1Detector(5);
    call(detector, 'Order', 'items', 6);
    call(detector, 'Order', 'customer', 2);

    const { warnings } = detector.detect();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('items');
  });

  it('separates the same field name on different parents', () => {
    const detector = new N1Detector(5);
    call(detector, 'Order', 'items', 5);
    call(detector, 'Cart', 'items', 5);

    expect(
      detector
        .detect()
        .warnings.map((w) => w.parentType)
        .sort(),
    ).toEqual(['Cart', 'Order']);
  });

  it('puts the worst one first', () => {
    const detector = new N1Detector(2);
    call(detector, 'Order', 'customer', 3);
    call(detector, 'Order', 'items', 40);
    call(detector, 'Order', 'discount', 7);

    expect(detector.detect().warnings.map((w) => w.count)).toEqual([40, 7, 3]);
  });

  describe('what it advises', () => {
    it('names the resolver and how often it ran', () => {
      const detector = new N1Detector(2);
      call(detector, 'Order', 'items', 16);

      expect(detector.detect().warnings[0].suggestion).toContain('Order.items');
      expect(detector.detect().warnings[0].suggestion).toContain('16 times');
    });

    it('suggests batching for something that looks like a relation', () => {
      const detector = new N1Detector(2);
      call(detector, 'Order', 'items', 5);

      expect(detector.detect().warnings[0].suggestion).toContain('DataLoader');
    });

    it('talks about caching for something that looks computed', () => {
      const detector = new N1Detector(2);
      call(detector, 'Order', 'orderTotal', 5);

      expect(detector.detect().warnings[0].suggestion).toMatch(/computed|caching/);
    });

    it('still says something useful for a name it cannot classify', () => {
      const detector = new N1Detector(2);
      call(detector, 'Order', 'x', 5);

      expect(detector.detect().warnings[0].suggestion).toContain('called 5 times');
    });
  });

  it('holds one entry per resolver, however many calls it sees', () => {
    // The map is keyed by resolver, so a query over a large list costs one
    // entry rather than one per item.
    const detector = new N1Detector(10);
    call(detector, 'Order', 'items', 100_000);

    const { warnings } = detector.detect();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].count).toBe(100_000);
  });

  it('can be asked twice and answer the same', () => {
    const detector = new N1Detector(2);
    call(detector, 'Order', 'items', 5);

    expect(detector.detect()).toEqual(detector.detect());
  });
});
