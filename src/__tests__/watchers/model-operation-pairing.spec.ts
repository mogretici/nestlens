/**
 * Every model operation, not one in ten.
 *
 * A start was remembered under `insert-${entityName}-${Date.now()}` and its
 * completion looked the partner up by prefix. Ten inserts of one entity inside
 * a millisecond — which is what an ordinary batch is — collided onto one key:
 *
 * ```text
 * ten begins, ten ends
 *   tracked   1
 *   recorded  1     nine operations vanished
 * ```
 *
 * And an operation whose completion never fires, which is what a rolled-back
 * transaction is, left its start behind for good.
 */
import { CollectorService } from '../../core/collector.service';
import { ModelWatcher } from '../../watchers/model.watcher';
import { NestLensConfig } from '../../nestlens.config';
import { ModelEntry } from '../../types';

type Hook = (...args: unknown[]) => unknown;

const build = (): {
  watcher: ModelWatcher;
  subscriber: Record<string, Hook>;
  recorded: ModelEntry['payload'][];
  pending: Map<string, number[]>;
} => {
  const recorded: ModelEntry['payload'][] = [];
  const collector = {
    collect: async (_type: string, payload: ModelEntry['payload']) => void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const subscriber: Record<string, Hook> = {
    beforeInsert: () => undefined,
    afterInsert: () => undefined,
    beforeUpdate: () => undefined,
    afterUpdate: () => undefined,
    beforeRemove: () => undefined,
    afterRemove: () => undefined,
  };

  const watcher = new ModelWatcher(
    collector,
    { watchers: { model: true } } as NestLensConfig,
    subscriber,
  );
  watcher.onModuleInit();

  return {
    watcher,
    subscriber,
    recorded,
    pending: (watcher as unknown as { pending: Map<string, number[]> }).pending,
  };
};

const event = (name: string) => ({ metadata: { name } });

describe('pairing a model operation with its completion', () => {
  it('records every insert in a batch', () => {
    const { watcher, subscriber, recorded } = build();

    for (let i = 0; i < 10; i += 1) subscriber.beforeInsert(event('Order'));
    for (let i = 0; i < 10; i += 1) subscriber.afterInsert(event('Order'));

    expect(recorded).toHaveLength(10);
    expect(recorded.every((entry) => entry.entity === 'Order')).toBe(true);
    watcher.onModuleDestroy();
  });

  it.each([
    ['updates', 'beforeUpdate', 'afterUpdate'],
    ['removes', 'beforeRemove', 'afterRemove'],
  ])('records every one of a batch of %s', (_name, begin, end) => {
    const { watcher, subscriber, recorded } = build();

    for (let i = 0; i < 8; i += 1) subscriber[begin](event('Order'));
    for (let i = 0; i < 8; i += 1) subscriber[end](event('Order'));

    expect(recorded).toHaveLength(8);
    watcher.onModuleDestroy();
  });

  it('keeps entities apart', () => {
    const { watcher, subscriber, recorded } = build();

    subscriber.beforeInsert(event('Order'));
    subscriber.beforeInsert(event('Item'));
    subscriber.afterInsert(event('Item'));
    subscriber.afterInsert(event('Order'));

    expect(recorded.map((entry) => entry.entity).sort()).toEqual(['Item', 'Order']);
    watcher.onModuleDestroy();
  });

  it('keeps actions apart', () => {
    const { watcher, subscriber, recorded } = build();

    subscriber.beforeInsert(event('Order'));
    subscriber.beforeUpdate(event('Order'));
    subscriber.afterUpdate(event('Order'));
    subscriber.afterInsert(event('Order'));

    expect(recorded.map((entry) => entry.action).sort()).toEqual(['create', 'update']);
    watcher.onModuleDestroy();
  });

  it('forgets nothing while operations are still running', () => {
    const { watcher, subscriber, pending } = build();

    for (let i = 0; i < 5; i += 1) subscriber.beforeInsert(event('Order'));

    expect(pending.get('insert:Order')).toHaveLength(5);
    watcher.onModuleDestroy();
  });

  it('lets go once they finish', () => {
    const { watcher, subscriber, pending } = build();

    subscriber.beforeInsert(event('Order'));
    subscriber.afterInsert(event('Order'));

    expect(pending.size).toBe(0);
    watcher.onModuleDestroy();
  });

  it('does not grow without bound when completions never come', () => {
    // A rolled-back transaction fires the first half and not the second.
    const { watcher, subscriber, pending } = build();

    for (let i = 0; i < 5_000; i += 1) subscriber.beforeUpdate(event('Ghost'));

    expect(pending.get('update:Ghost')?.length).toBeLessThanOrEqual(1_000);
    watcher.onModuleDestroy();
  });

  it('records nothing for a completion it never saw begin', () => {
    const { watcher, subscriber, recorded } = build();

    subscriber.afterInsert(event('Order'));

    expect(recorded).toEqual([]);
    watcher.onModuleDestroy();
  });

  it('measures how long the operation took', async () => {
    const { watcher, subscriber, recorded } = build();

    subscriber.beforeInsert(event('Order'));
    await new Promise((resolve) => setTimeout(resolve, 12));
    subscriber.afterInsert(event('Order'));

    expect(recorded[0].duration).toBeGreaterThanOrEqual(10);
    watcher.onModuleDestroy();
  });
});
