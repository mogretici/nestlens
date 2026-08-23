/**
 * What the field tracer collects, and what it refuses to.
 *
 * It had no tests of its own — 63% line coverage, reached only through the
 * adapters — while carrying `getStats` and `clear` that nothing called and no
 * consumer could (the class is not exported from the package), an `nsToMs`
 * that duplicated the adapters' own, and a `WaterfallItem` interface under a
 * comment promising a `buildWaterfall` that was never written.
 *
 * What it does do matters: it is the only thing standing between a query with
 * ten thousand resolvers and ten thousand traces in one entry.
 */
import { createFieldTracer } from '../../../watchers/graphql/utils/field-tracer';

const start = process.hrtime.bigint();

/** Runs one field through the tracer and returns how many traces it kept. */
const resolveFields = (
  tracer: ReturnType<typeof createFieldTracer>,
  count: number,
  wait = 0,
): void => {
  for (let i = 0; i < count; i += 1) {
    const id = tracer.startField(`Query.field${i}`, 'Query', `field${i}`, 'String');
    if (wait > 0) {
      const until = process.hrtime.bigint() + BigInt(wait * 1_000_000);
      while (process.hrtime.bigint() < until) {
        /* deliberately busy: the tracer measures elapsed time */
      }
    }
    tracer.endField(id);
  }
};

describe('the field tracer', () => {
  describe('whether it traces at all', () => {
    it('does nothing when it is not enabled', () => {
      const tracer = createFieldTracer(start, { enabled: false, sampleRate: 1 });

      expect(tracer.isActive()).toBe(false);
      expect(tracer.startField('Query.a', 'Query', 'a', 'String')).toBeNull();
      expect(tracer.getTraces()).toEqual([]);
    });

    it('traces every request at a sample rate of one', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });

      expect(tracer.isActive()).toBe(true);
    });

    it('traces no request at a sample rate of zero', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 0 });

      expect(tracer.isActive()).toBe(false);
    });
  });

  describe('what it records', () => {
    it('names the field, its parent and what it returns', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });

      tracer.endField(tracer.startField('Query.orders', 'Query', 'orders', '[Order!]!'));

      expect(tracer.getTraces()[0]).toMatchObject({
        path: 'Query.orders',
        parentType: 'Query',
        fieldName: 'orders',
        returnType: '[Order!]!',
      });
    });

    it('measures in nanoseconds', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });

      resolveFields(tracer, 1, 2);

      // Two milliseconds is two million nanoseconds, give or take.
      expect(tracer.getTraces()[0].duration).toBeGreaterThan(1_000_000);
    });

    it('puts them in the order they started', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });

      resolveFields(tracer, 4);

      const offsets = tracer.getTraces().map((trace) => trace.startOffset);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    });
  });

  describe('its ceiling', () => {
    it('stops at the number of traces it was given', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1, maxTraces: 5 });

      resolveFields(tracer, 50);

      expect(tracer.getTraces()).toHaveLength(5);
    });

    it('refuses to open another once it is full', () => {
      // Refused at the start, not merely dropped at the end: a field that can
      // never be kept should not take a slot in the active map on the way
      // through. On a ten-thousand-field query that is ten thousand entries.
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1, maxTraces: 2 });

      resolveFields(tracer, 2);

      expect(tracer.startField('Query.extra', 'Query', 'extra', 'String')).toBeNull();
    });

    it('holds the ceiling when fields resolve at the same time', () => {
      // Refusing at the start is not enough on its own: GraphQL resolves
      // siblings concurrently, so a hundred fields can all begin while there is
      // room and all finish after there is none.
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1, maxTraces: 3 });

      const ids = Array.from({ length: 100 }, (_unused, i) =>
        tracer.startField(`Query.f${i}`, 'Query', `f${i}`, 'String'),
      );
      for (const id of ids) tracer.endField(id);

      expect(tracer.getTraces()).toHaveLength(3);
    });

    it('holds a large query to it', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1, maxTraces: 100 });

      resolveFields(tracer, 10_000);

      expect(tracer.getTraces()).toHaveLength(100);
    });
  });

  describe('its threshold', () => {
    it('keeps only what took longer than it was told', () => {
      const tracer = createFieldTracer(start, {
        enabled: true,
        sampleRate: 1,
        slowThreshold: 5,
      });

      resolveFields(tracer, 3, 0);

      expect(tracer.getTraces()).toEqual([]);
    });

    it('keeps one that did', () => {
      const tracer = createFieldTracer(start, {
        enabled: true,
        sampleRate: 1,
        slowThreshold: 1,
      });

      resolveFields(tracer, 1, 3);

      expect(tracer.getTraces()).toHaveLength(1);
    });

    it('forgets a fast field rather than holding it open', () => {
      // The trace is dropped after the threshold, but the field it was opened
      // for must not stay in the active map.
      const tracer = createFieldTracer(start, {
        enabled: true,
        sampleRate: 1,
        slowThreshold: 1_000,
      });

      resolveFields(tracer, 1_000);

      const active = (tracer as unknown as { activeTraces: Map<string, unknown> }).activeTraces;
      expect(active.size).toBe(0);
    });
  });

  describe('what it does with what it does not have', () => {
    it('ends nothing for a trace it never started', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });

      expect(() => tracer.endField(null)).not.toThrow();
      expect(() => tracer.endField('never-started')).not.toThrow();
      expect(tracer.getTraces()).toEqual([]);
    });

    it('ends a trace once', () => {
      const tracer = createFieldTracer(start, { enabled: true, sampleRate: 1 });
      const id = tracer.startField('Query.a', 'Query', 'a', 'String');

      tracer.endField(id);
      tracer.endField(id);

      expect(tracer.getTraces()).toHaveLength(1);
    });
  });
});
