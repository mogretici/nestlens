/**
 * Recording an entity must not break the query that produced it.
 *
 * The model watcher masked entities itself, by field name, with no bound on
 * depth and no memory of where it had been. An entity with a relation pointing
 * back at its parent — which is what a bidirectional mapping is — ended in
 * `RangeError: Maximum call stack size exceeded`, thrown from inside TypeORM's
 * subscriber and therefore out of the application's own `save()`:
 *
 * ```text
 * captureData: true, order.items[0].order === order  ->  save() throws
 * ```
 *
 * The collector masks every payload it is given, by the same field names and
 * with a cycle, a depth and a walk bound behind them, so the watcher only has
 * to decide how much of the entity to keep.
 */
import { CollectorService } from '../../core/collector.service';
import { DataMaskerService } from '../../core/data-masker.service';
import { ModelWatcher } from '../../watchers/model.watcher';
import { NestLensConfig } from '../../nestlens.config';

interface Recorded {
  action: string;
  entity: string;
  data?: unknown;
}

const build = (captureData: boolean) => {
  const recorded: Recorded[] = [];

  const collector = {
    collect: async (_type: string, payload: Recorded) => void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new ModelWatcher(collector, {
    watchers: { model: { enabled: true, captureData } },
  } as unknown as NestLensConfig);

  const handlers = Object.getPrototypeOf(watcher) as {
    handleBeforeInsert: (event: unknown) => void;
    handleAfterInsert: (event: unknown) => void;
  };

  return {
    recorded,
    insert: (entity: unknown) => {
      handlers.handleBeforeInsert.call(watcher, { metadata: { name: 'Order' } });
      handlers.handleAfterInsert.call(watcher, { metadata: { name: 'Order' }, entity });
    },
  };
};

/** An ORM's ordinary shape: the child points back at its parent. */
const bidirectional = (): Record<string, unknown> => {
  const order: Record<string, unknown> = { id: 1, password: 'hunter2', items: [] as unknown[] };
  (order.items as unknown[]).push({ id: 10, order });

  return order;
};

describe('recording an entity that points back at itself', () => {
  it('does not throw into the ORM', () => {
    const { insert } = build(true);

    expect(() => insert(bidirectional())).not.toThrow();
  });

  it('records the entity', () => {
    const { insert, recorded } = build(true);

    insert(bidirectional());

    expect((recorded[0].data as { id: number }).id).toBe(1);
  });

  it('is masked by the collector, cycle and all', () => {
    const { insert, recorded } = build(true);

    insert(bidirectional());

    const masked = new DataMaskerService({}).maskBody(recorded[0]) as {
      data: Record<string, unknown>;
    };
    expect(masked.data.password).toBe('***REDACTED***');
    expect(JSON.stringify(masked)).toContain('[Circular]');
  });

  it('records nothing about the entity when capture is off', () => {
    const { insert, recorded } = build(false);

    insert(bidirectional());

    expect(recorded[0].data).toBeUndefined();
  });

  it('records the size of an entity too large to keep', () => {
    const { insert, recorded } = build(true);

    insert({ id: 1, blob: 'x'.repeat(100_000) });

    expect(recorded[0].data).toEqual({ _truncated: true, _size: expect.any(Number) });
  });

  it('keeps an ordinary entity whole', () => {
    const { insert, recorded } = build(true);
    const entity = { id: 1, total: 99 };

    insert(entity);

    expect(recorded[0].data).toBe(entity);
  });
});
