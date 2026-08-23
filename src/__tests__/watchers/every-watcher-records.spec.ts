/**
 * A watcher that is switched on has to record something.
 *
 * Every one of these borrows an object the application owns and replaces a
 * method on it. Whether that still works is invisible from the outside — the
 * watcher logs *interceptors installed* either way — and this repository has
 * found the silent version four times:
 *
 * ```text
 * Mercurius      hooks read arguments that were never there   nothing recorded
 * Prisma         the client was looked for on `global` only   nothing recorded
 * subscriptions  the connection was removed before the end    no end recorded
 * monitored tags counts keyed on a different spelling         every count zero
 * ```
 *
 * One assertion each: enable it, call the method it wrapped, and see an entry.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { BatchWatcher } from '../../watchers/batch.watcher';
import { CacheWatcher } from '../../watchers/cache.watcher';
import { CommandWatcher } from '../../watchers/command.watcher';
import { DumpWatcher } from '../../watchers/dump.watcher';
import { EventWatcher } from '../../watchers/event.watcher';
import { GateWatcher } from '../../watchers/gate.watcher';
import { HttpClientWatcher } from '../../watchers/http-client.watcher';
import { MailWatcher } from '../../watchers/mail.watcher';
import { NotificationWatcher } from '../../watchers/notification.watcher';
import { RedisWatcher } from '../../watchers/redis.watcher';
import { ViewWatcher } from '../../watchers/view.watcher';

interface Lifecycle {
  onModuleInit?: () => void | Promise<void>;
  onModuleDestroy?: () => void | Promise<void>;
}

const recorder = () => {
  const types: string[] = [];

  return {
    types,
    collector: {
      collect: async (type: string) => void types.push(type),
      collectImmediate: async (type: string) => {
        types.push(type);
        return null;
      },
    } as unknown as CollectorService,
  };
};

const config = (watchers: Record<string, unknown>): NestLensConfig =>
  ({ watchers }) as unknown as NestLensConfig;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('a watcher that is switched on', () => {
  it('records a cache read', async () => {
    const { types, collector } = recorder();
    const manager = { get: async () => 'value', set: async () => undefined };

    const watcher = new CacheWatcher(collector, config({ cache: true }), manager) as Lifecycle;
    await watcher.onModuleInit?.();
    await manager.get();
    await settle();

    expect(types).toContain('cache');
  });

  it('records a Redis command', async () => {
    const { types, collector } = recorder();
    const client = { get: async (_key: string) => 'value' };

    const watcher = new RedisWatcher(collector, config({ redis: true }), client) as Lifecycle;
    await watcher.onModuleInit?.();
    await client.get('k');
    await settle();

    expect(types).toContain('redis');
  });

  it('records a rendered view', async () => {
    const { types, collector } = recorder();
    const engine = { render: (..._args: unknown[]) => '<html></html>' };

    const watcher = new ViewWatcher(collector, config({ view: true }), engine) as Lifecycle;
    await watcher.onModuleInit?.();
    engine.render('index', {});
    await settle();

    expect(types).toContain('view');
  });

  it('records a sent mail', async () => {
    const { types, collector } = recorder();
    const mailer = { sendMail: async (_options: unknown) => ({ messageId: '1' }) };

    const watcher = new MailWatcher(collector, config({ mail: true }), mailer) as Lifecycle;
    await watcher.onModuleInit?.();
    await mailer.sendMail({ to: 'ada@example.com', subject: 'hello' });
    await settle();

    expect(types).toContain('mail');
  });

  it('records a notification', async () => {
    const { types, collector } = recorder();
    const service = { sendEmail: async (_message: unknown) => ({ id: 1 }) };

    const watcher = new NotificationWatcher(
      collector,
      config({ notification: true }),
      service,
    ) as Lifecycle;
    await watcher.onModuleInit?.();
    await service.sendEmail({ to: 'ada@example.com' });
    await settle();

    expect(types).toContain('notification');
  });

  it('records a command', async () => {
    const { types, collector } = recorder();
    const bus = { execute: async (_command: unknown) => ({ ok: true }) };

    const watcher = new CommandWatcher(collector, config({ command: true }), bus) as Lifecycle;
    await watcher.onModuleInit?.();
    await bus.execute({ name: 'user:create' });
    await settle();

    expect(types).toContain('command');
  });

  it('records an authorization check', async () => {
    const { types, collector } = recorder();
    const gate = { can: () => true };

    const watcher = new GateWatcher(collector, config({ gate: true }), gate) as Lifecycle;
    await watcher.onModuleInit?.();
    gate.can();
    await settle();

    expect(types).toContain('gate');
  });

  it('records a batch operation', async () => {
    const { types, collector } = recorder();
    const processor = { process: async (..._args: unknown[]) => ({ processed: 1 }) };

    const watcher = new BatchWatcher(collector, config({ batch: true }), processor) as Lifecycle;
    await watcher.onModuleInit?.();
    await processor.process('import', [1]);
    await settle();

    expect(types).toContain('batch');
  });

  it('records an export', async () => {
    const { types, collector } = recorder();
    const service = { export: async (..._args: unknown[]) => ({ recordCount: 1 }) };

    const watcher = new DumpWatcher(collector, config({ dump: true }), service) as Lifecycle;
    await watcher.onModuleInit?.();
    await service.export({ format: 'json' });
    await settle();

    expect(types).toContain('dump');
  });

  it('records an emitted event', async () => {
    const { types, collector } = recorder();
    let listener: ((event: string, ...values: unknown[]) => void) | undefined;
    const emitter = {
      onAny: (handler: (event: string, ...values: unknown[]) => void) => void (listener = handler),
      offAny: () => undefined,
      listeners: () => [],
    };

    const watcher = new EventWatcher(collector, config({ event: true }), emitter) as Lifecycle;
    await watcher.onModuleInit?.();
    listener?.('order.created', { id: 1 });
    await settle();

    expect(types).toContain('event');
  });

  it('records an outgoing HTTP call', async () => {
    const { types, collector } = recorder();
    let onFulfilled: ((response: unknown) => unknown) | undefined;
    const axios = {
      interceptors: {
        request: { use: () => 1, eject: () => undefined },
        response: {
          use: (fulfilled: (response: unknown) => unknown) => {
            onFulfilled = fulfilled;
            return 1;
          },
          eject: () => undefined,
        },
      },
    };

    const watcher = new HttpClientWatcher(
      collector,
      config({ httpClient: true }),
      axios,
    ) as Lifecycle;
    await watcher.onModuleInit?.();
    onFulfilled?.({
      config: { url: 'https://api.example.com/x', method: 'get', headers: {}, metadata: {} },
      status: 200,
      headers: {},
      data: {},
    });
    await settle();

    expect(types).toContain('http-client');
  });
});
