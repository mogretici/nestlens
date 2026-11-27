/**
 * What an event's `duration` measures.
 *
 * It is documented as the time the listeners took. It was taken from inside an
 * `onAny` handler — which EventEmitter2 calls before any listener — to the next
 * `setImmediate`, so it measured whatever ran until the event loop came round:
 * the listeners, and then everything the emitting code did after `emit()`
 * returned. Against eventemitter2 6.4.9, with a listener that works for 50 ms
 * and a caller that works for 120 ms after emitting:
 *
 *     listener 50 ms, caller 120 ms    recorded 171 ms
 *     listener  0 ms, caller 120 ms    recorded 120 ms
 *     emitAsync, listener 80 ms        recorded what the caller did, not 80
 *
 * The emitter here dispatches the way EventEmitter2 does — any-listeners first,
 * then the event's own — so the measurement is the real one, and the clock is
 * moved by hand so it is exact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { EventWatcher } from '../../watchers/event.watcher';

type AnyListener = (event: string | string[], ...values: unknown[]) => void;

/** EventEmitter2's dispatch order, on Node's emitter. */
class EmitterLikeEventEmitter2 extends EventEmitter {
  private readonly anyListeners: AnyListener[] = [];

  onAny(listener: AnyListener): this {
    this.anyListeners.push(listener);
    return this;
  }

  offAny(listener: AnyListener): this {
    const index = this.anyListeners.indexOf(listener);
    if (index >= 0) this.anyListeners.splice(index, 1);
    return this;
  }

  override emit(event: string, ...values: unknown[]): boolean {
    for (const listener of [...this.anyListeners]) listener(event, ...values);
    return super.emit(event, ...values);
  }

  async emitAsync(event: string, ...values: unknown[]): Promise<unknown[]> {
    for (const listener of [...this.anyListeners]) listener(event, ...values);
    return Promise.all(
      this.listeners(event).map((listener) =>
        (listener as (...args: unknown[]) => unknown)(...values),
      ),
    );
  }
}

const config = { watchers: { event: true } } as unknown as NestLensConfig;

const watching = (emitter: EmitterLikeEventEmitter2) => {
  const durations: number[] = [];
  const collector = {
    collect: (_type: string, payload: { duration: number }) =>
      void durations.push(payload.duration),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new EventWatcher(collector, config, emitter);
  watcher.onModuleInit();
  return { durations, watcher };
};

const advance = (ms: number): void => {
  vi.setSystemTime(Date.now() + ms);
};

describe('an event duration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the time the listeners took, not what the caller did afterwards', () => {
    const emitter = new EmitterLikeEventEmitter2();
    emitter.on('order.created', () => advance(50));
    const { durations, watcher } = watching(emitter);

    emitter.emit('order.created', { id: 1 });
    advance(120);
    vi.runAllTimers();

    expect(durations).toEqual([50]);
    watcher.onModuleDestroy();
  });

  it('is nothing for listeners that do nothing, however long the caller runs', () => {
    const emitter = new EmitterLikeEventEmitter2();
    emitter.on('order.created', () => undefined);
    const { durations, watcher } = watching(emitter);

    emitter.emit('order.created');
    advance(120);
    vi.runAllTimers();

    expect(durations).toEqual([0]);
    watcher.onModuleDestroy();
  });

  it('waits for every listener under emitAsync', async () => {
    const emitter = new EmitterLikeEventEmitter2();
    let finish: () => void = () => undefined;
    emitter.on(
      'order.created',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { durations, watcher } = watching(emitter);

    const settled = emitter.emitAsync('order.created');
    advance(5);
    vi.runAllTimers();
    advance(75);
    finish();
    await settled;
    await Promise.resolve();

    expect(durations).toEqual([80]);
    watcher.onModuleDestroy();
  });

  it('gives the emitter back as it was found', () => {
    const emitter = new EmitterLikeEventEmitter2();
    const before = { emit: emitter.emit, emitAsync: emitter.emitAsync };
    const { watcher } = watching(emitter);

    watcher.onModuleDestroy();

    expect(emitter.emit).toBe(before.emit);
    expect(emitter.emitAsync).toBe(before.emitAsync);
    expect(emitter.listenerCount('order.created')).toBe(0);
  });
});
