/**
 * Two renders the view watcher recorded wrongly.
 *
 * **Locals that point back at themselves.** They were measured and captured
 * with `JSON.stringify`, which throws on a cycle — and an entity graph is what
 * a template is usually handed — so the locals were recorded as
 * `{ _error: 'Unable to serialize locals' }` and the data size as nothing. The
 * other watchers had moved to `capturePayload` for exactly this.
 *
 * **A render that answers through a callback.** `render(name, locals, cb)` is
 * the shape Express's own `app.render` and most engines' `renderFile` have. It
 * returns nothing and calls back later, so the wrapper recorded the moment it
 * returned: no output, a duration of the synchronous part only, and
 * `rendered` for a render that then failed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { ViewWatcher } from '../../watchers/view.watcher';

interface Recorded {
  status: string;
  duration: number;
  outputSize?: number;
  dataSize?: number;
  locals?: Record<string, unknown>;
  error?: string;
}

const watching = (engine: Record<string, unknown>, config: NestLensConfig) => {
  const recorded: Recorded[] = [];
  const collector = {
    collect: (_type: string, payload: Recorded) => void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new ViewWatcher(collector, config, engine as never);
  watcher.onModuleInit();
  return { recorded, watcher };
};

describe('the view watcher', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps locals that point back at themselves', () => {
    const engine = { render: (_name: string, _locals: unknown) => '<p>ok</p>' };
    const { recorded } = watching(engine, {
      watchers: { view: { enabled: true, captureData: true } },
    });
    const order: Record<string, unknown> = { id: 7 };
    order.self = order;

    engine.render('order', { order });

    expect(recorded[0].locals).not.toHaveProperty('_error');
    expect((recorded[0].locals as { order: { id: number } }).order.id).toBe(7);
    expect(recorded[0].dataSize).toBeGreaterThan(0);
  });

  it('times a callback render until it calls back, and records its output', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const engine = {
      render: (_name: string, _locals: unknown, done: (error: unknown, html?: string) => void) => {
        setTimeout(() => done(null, '<p>late</p>'), 40);
      },
    };
    const { recorded } = watching(engine, { watchers: { view: true } });
    let html: string | undefined;

    engine.render('page', {}, (_error, output) => {
      html = output;
    });
    expect(recorded).toEqual([]);

    vi.advanceTimersByTime(40);

    expect(html).toBe('<p>late</p>');
    expect(recorded).toEqual([
      expect.objectContaining({ status: 'rendered', duration: 40, outputSize: 11 }),
    ]);
  });

  it('records a callback render that fails as an error', () => {
    const engine = {
      render: (_name: string, _locals: unknown, done: (error: unknown) => void) => {
        done(new Error('template not found'));
      },
    };
    const { recorded } = watching(engine, { watchers: { view: true } });
    let received: unknown;

    engine.render('missing', {}, (error) => {
      received = error;
    });

    expect((received as Error).message).toBe('template not found');
    expect(recorded).toEqual([
      expect.objectContaining({ status: 'error', error: 'template not found' }),
    ]);
  });
});

describe('a callback render that throws while recording fails too', () => {
  it('still hands the caller the render error, not the recording one', () => {
    const engine = {
      render: (_name: string, _locals: unknown, _done: unknown) => {
        throw new Error('template exploded');
      },
    };
    const collector = {
      collect: () => {
        throw new Error('collector is down');
      },
      collectImmediate: async () => null,
    } as unknown as CollectorService;
    const watcher = new ViewWatcher(collector, { watchers: { view: true } }, engine as never);
    watcher.onModuleInit();

    expect(() => engine.render('page', {}, () => undefined)).toThrow('template exploded');
  });
});
