/**
 * A wrapped method has to hand back what the original handed back.
 *
 * Three watchers replaced a method with an `async` one, which turns anything
 * synchronous into a promise. The authorization watcher's version of this was
 * found and fixed — `if (ability.can(...))` became always true — and the same
 * mistake was left in three more places:
 *
 * ```text
 * res.send(engine.render('index', data))  ->  sends [object Promise]
 * ```
 *
 * A template engine's render is synchronous in every common engine, and what
 * it returns is written straight into a response.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { NotificationWatcher } from '../../watchers/notification.watcher';
import { RedisWatcher } from '../../watchers/redis.watcher';
import { ViewWatcher } from '../../watchers/view.watcher';

const collected: { type: string; payload: Record<string, unknown> }[] = [];

const collector = {
  collect: async (type: string, payload: Record<string, unknown>) =>
    void collected.push({ type, payload }),
  collectImmediate: async () => null,
} as unknown as CollectorService;

const config = (watchers: Record<string, unknown>): NestLensConfig =>
  ({ watchers }) as unknown as NestLensConfig;

beforeEach(() => {
  collected.length = 0;
});

describe('a synchronous method a watcher wrapped', () => {
  it('gives the view engine’s rendered string back, not a promise', () => {
    const engine = { render: (..._args: unknown[]) => '<h1>hello</h1>' };
    new ViewWatcher(collector, config({ view: true }), engine).onModuleInit();

    expect(engine.render('index', {})).toBe('<h1>hello</h1>');
  });

  it('still records the render', () => {
    const engine = { render: (..._args: unknown[]) => '<h1>hello</h1>' };
    new ViewWatcher(collector, config({ view: true }), engine).onModuleInit();

    engine.render('index', {});

    expect(collected[0].payload.template).toBe('index');
  });

  it('gives a synchronous Redis client’s value back', () => {
    const client = { get: (key: string) => `value-for-${key}` };
    new RedisWatcher(collector, config({ redis: true }), client).onModuleInit();

    expect(client.get('k')).toBe('value-for-k');
  });

  it('gives a synchronous notification result back', () => {
    const service = { sendEmail: (_message: unknown) => ({ id: 1 }) };
    new NotificationWatcher(collector, config({ notification: true }), service).onModuleInit();

    expect(service.sendEmail({ to: 'ada@example.com' })).toEqual({ id: 1 });
  });
});

describe('an asynchronous method a watcher wrapped', () => {
  it('still returns a promise, and its value', async () => {
    const client = { get: async (key: string) => `value-for-${key}` };
    new RedisWatcher(collector, config({ redis: true }), client).onModuleInit();

    const pending = client.get('k');

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe('value-for-k');
  });

  it('records it once it settles', async () => {
    const client = { get: async (_key: string) => 'v' };
    new RedisWatcher(collector, config({ redis: true }), client).onModuleInit();

    await client.get('k');
    await Promise.resolve();

    expect(collected.some((entry) => entry.type === 'redis')).toBe(true);
  });

  it('lets a rejection through unchanged', async () => {
    const client = {
      get: async (_key: string) => {
        throw new Error('connection lost');
      },
    };
    new RedisWatcher(collector, config({ redis: true }), client).onModuleInit();

    await expect(client.get('k')).rejects.toThrow('connection lost');
  });

  it('lets a synchronous throw through unchanged', () => {
    const engine = {
      render: (..._args: unknown[]) => {
        throw new Error('template missing');
      },
    };
    new ViewWatcher(collector, config({ view: true }), engine).onModuleInit();

    expect(() => engine.render('missing')).toThrow('template missing');
  });

  it('records the failure', () => {
    const engine = {
      render: (..._args: unknown[]) => {
        throw new Error('template missing');
      },
    };
    new ViewWatcher(collector, config({ view: true }), engine).onModuleInit();

    expect(() => engine.render('missing')).toThrow();
    expect(collected[0].payload.status).toBe('error');
  });
});
