/**
 * Sampling keeps whole requests, or it is not worth having.
 *
 * The failure it has to avoid is a dashboard full of half-recorded requests:
 * queries whose request was dropped, requests whose queries were. A detail page
 * that is missing most of itself is worse than a shorter list of complete ones,
 * so the decision is made from the request id and every entry under that id
 * gets the same answer.
 */
import { createSampler } from '../../core/sampling';
import { Entry } from '../../types';

const entry = (type: Entry['type'], requestId?: string): Entry =>
  ({ type, requestId, payload: {} }) as unknown as Entry;

describe('sampling', () => {
  it('is absent unless configured', () => {
    expect(createSampler(undefined)).toBeUndefined();
  });

  it('is absent when the rate keeps everything', () => {
    // Nothing to call per entry on the default path.
    expect(createSampler({ rate: 1 })).toBeUndefined();
    expect(createSampler({})).toBeUndefined();
  });

  describe('a request is kept or dropped whole', () => {
    const sampler = createSampler({ rate: 0.5 })!;

    it('gives every entry under one request the same answer', () => {
      const ids = Array.from({ length: 200 }, (_, i) => `req-${i}`);

      for (const id of ids) {
        const verdicts = (['request', 'query', 'log', 'cache'] as const).map((type) =>
          sampler.shouldRecord(entry(type, id)),
        );

        expect(new Set(verdicts).size).toBe(1);
      }
    });

    it('gives the same answer however many times it is asked', () => {
      // No state is held between calls, so an entry arriving after the response
      // has been sent must not disagree with one recorded during it.
      for (const id of ['req-a', 'req-b', 'req-c']) {
        const first = sampler.shouldRecord(entry('query', id));

        for (let i = 0; i < 50; i += 1) {
          expect(sampler.shouldRecord(entry('query', id))).toBe(first);
        }
      }
    });
  });

  describe('the rate is honoured', () => {
    const kept = (rate: number, count = 20_000): number => {
      const sampler = createSampler({ rate, always: [] });
      if (!sampler) return count;

      let n = 0;
      for (let i = 0; i < count; i += 1) {
        if (sampler.shouldRecord(entry('request', `request-id-${i}`))) n += 1;
      }
      return n;
    };

    it.each([0.1, 0.25, 0.5, 0.9])('keeps about %s of requests', (rate) => {
      const fraction = kept(rate) / 20_000;

      // Hashing ids rather than flipping coins, so the spread is tight; the
      // tolerance is for the hash's distribution, not for randomness.
      expect(fraction).toBeGreaterThan(rate - 0.03);
      expect(fraction).toBeLessThan(rate + 0.03);
    });

    it('keeps nothing at a rate of zero', () => {
      expect(kept(0)).toBe(0);
    });

    it('treats a negative rate as zero rather than as a surprise', () => {
      expect(kept(-1)).toBe(0);
    });
  });

  describe('exceptions survive', () => {
    it('records an exception the rate would have dropped', () => {
      const sampler = createSampler({ rate: 0 })!;

      // Whatever the id, and there is no rate lower than this one.
      for (let i = 0; i < 100; i += 1) {
        expect(sampler.shouldRecord(entry('exception', `req-${i}`))).toBe(true);
      }
    });

    it('lets the exemption list be replaced', () => {
      const sampler = createSampler({ rate: 0, always: ['schedule'] })!;

      expect(sampler.shouldRecord(entry('schedule', 'req-1'))).toBe(true);
      expect(sampler.shouldRecord(entry('exception', 'req-1'))).toBe(false);
    });

    it('lets the exemption list be emptied', () => {
      const sampler = createSampler({ rate: 0, always: [] })!;

      expect(sampler.shouldRecord(entry('exception', 'req-1'))).toBe(false);
    });
  });

  describe('entries with no request to belong to', () => {
    it('samples them on their own', () => {
      // A scheduled task or a console command has no request id. It cannot be
      // correlated with anything, so it is sampled independently rather than
      // all such entries sharing one verdict.
      const sampler = createSampler({ rate: 0.5, always: [] })!;

      let kept = 0;
      for (let i = 0; i < 20_000; i += 1) {
        if (sampler.shouldRecord(entry('schedule'))) kept += 1;
      }

      expect(kept / 20_000).toBeGreaterThan(0.45);
      expect(kept / 20_000).toBeLessThan(0.55);
    });

    it('keeps all of them at a rate of one', () => {
      // `rate: 1` produces no sampler at all, so this is really asserting that
      // the default path is untouched.
      expect(createSampler({ rate: 1, always: [] })).toBeUndefined();
    });
  });
});
