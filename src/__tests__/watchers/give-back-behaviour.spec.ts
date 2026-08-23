/**
 * Every borrowing watcher, given a host object and then closed.
 *
 * The guard that exists reads the source: it looks for the shapes that borrow
 * and requires an `onModuleDestroy` to be declared. Declaring one is not
 * restoring one, and its detector does not see a watcher that assigns a method
 * directly — `commandBus.execute = …` matches none of its patterns.
 *
 * The behavioural test beside it covers seven watchers. These are the other
 * six, and two of them are named in that file's own history as things that
 * were broken and fixed:
 *
 *     Bull queue      5 listeners per round, never removed
 *     EventEmitter2   one `onAny` per round
 *
 * Three lifecycles against one object, then: is the object as it was found?
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { CacheWatcher } from '../../watchers/cache.watcher';
import { CommandWatcher } from '../../watchers/command.watcher';
import { EventWatcher } from '../../watchers/event.watcher';
import { JobWatcher } from '../../watchers/job.watcher';
import { NotificationWatcher } from '../../watchers/notification.watcher';
import { RedisWatcher } from '../../watchers/redis.watcher';
import { BatchWatcher } from '../../watchers/batch.watcher';
import { DumpWatcher } from '../../watchers/dump.watcher';
import { GateWatcher } from '../../watchers/gate.watcher';
import { MailWatcher } from '../../watchers/mail.watcher';
import { ViewWatcher } from '../../watchers/view.watcher';

const collector = {
  collect: async () => undefined,
  collectImmediate: async () => null,
} as unknown as CollectorService;

const config = (watchers: Record<string, unknown>): NestLensConfig =>
  ({ watchers }) as unknown as NestLensConfig;

interface Lifecycle {
  onModuleInit?: () => void | Promise<void>;
  onApplicationBootstrap?: () => void | Promise<void>;
  onModuleDestroy?: () => void | Promise<void>;
}

/** Runs a watcher's whole lifecycle, three times over, against one host. */
const threeLifecycles = async (make: () => Lifecycle): Promise<void> => {
  for (let round = 0; round < 3; round += 1) {
    const watcher = make();
    await watcher.onModuleInit?.();
    await watcher.onApplicationBootstrap?.();
    await watcher.onModuleDestroy?.();
  }
};

/** The own function-valued properties of an object, by name. */
const methodsOf = (host: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(host).filter(([, value]) => typeof value === 'function'));

describe('the watchers that wrap methods on a service they are handed', () => {
  /**
   * These five borrow through `WrappedMethods` and declare a destroy hook.
   * Declaring one is not restoring one, and only the six above were ever
   * checked behaviourally — so the guarantee held for the watchers that had
   * once been broken and was untested for the rest.
   */
  it('gives the mailer back', async () => {
    const mailer = { sendMail: async () => ({ messageId: '1' }) };
    const before = methodsOf(mailer);

    await threeLifecycles(
      () => new MailWatcher(collector, config({ mail: true }), mailer) as unknown as Lifecycle,
    );

    expect(methodsOf(mailer)).toEqual(before);
  });

  it('gives the authorization service back', async () => {
    const gate = {
      check: () => true,
      allows: () => true,
      denies: () => false,
      authorize: () => true,
      can: () => true,
    };
    const before = methodsOf(gate);

    await threeLifecycles(
      () => new GateWatcher(collector, config({ gate: true }), gate) as unknown as Lifecycle,
    );

    expect(methodsOf(gate)).toEqual(before);
  });

  it('gives the view engine back', async () => {
    const engine = { render: (..._args: unknown[]) => '<html></html>' };
    const before = methodsOf(engine);

    await threeLifecycles(
      () => new ViewWatcher(collector, config({ view: true }), engine) as unknown as Lifecycle,
    );

    expect(methodsOf(engine)).toEqual(before);
  });

  it('gives the batch processor back', async () => {
    const processor = {
      process: async () => ({ processed: 1 }),
      processBatch: async () => ({ processed: 1 }),
      bulk: async () => ({ processed: 1 }),
      bulkProcess: async () => ({ processed: 1 }),
    };
    const before = methodsOf(processor);

    await threeLifecycles(
      () => new BatchWatcher(collector, config({ batch: true }), processor) as unknown as Lifecycle,
    );

    expect(methodsOf(processor)).toEqual(before);
  });

  it('gives the dump service back', async () => {
    const service = {
      export: async () => ({ recordCount: 1 }),
      import: async () => ({ recordCount: 1 }),
      backup: async () => ({}),
      restore: async () => ({}),
      migrate: async () => ({}),
      dump: async () => ({}),
    };
    const before = methodsOf(service);

    await threeLifecycles(
      () => new DumpWatcher(collector, config({ dump: true }), service) as unknown as Lifecycle,
    );

    expect(methodsOf(service)).toEqual(before);
  });

  it('still records through the wrappers it installed', async () => {
    // A restore that removed the wrapper too early would pass the test above.
    const collected: string[] = [];
    const recording = {
      collect: async (type: string) => void collected.push(type),
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const engine = { render: (..._args: unknown[]) => '<html></html>' };
    const watcher = new ViewWatcher(
      recording,
      config({ view: true }),
      engine,
    ) as unknown as Lifecycle;

    await watcher.onModuleInit?.();
    engine.render();

    expect(collected).toContain('view');

    await watcher.onModuleDestroy?.();
  });
});

describe('a watcher that borrows, three times over', () => {
  it('gives the cache manager back', async () => {
    const manager = {
      get: async () => 'v',
      set: async () => undefined,
      del: async () => undefined,
      reset: async () => undefined,
    };
    const before = methodsOf(manager);

    await threeLifecycles(
      () => new CacheWatcher(collector, config({ cache: true }), manager) as unknown as Lifecycle,
    );

    expect(methodsOf(manager)).toEqual(before);
  });

  it('gives the command bus back', async () => {
    const bus = { execute: async (command: unknown) => command };
    const before = bus.execute;

    await threeLifecycles(
      () => new CommandWatcher(collector, config({ command: true }), bus) as unknown as Lifecycle,
    );

    expect(bus.execute).toBe(before);
  });

  it('gives the notification service back', async () => {
    const service = {
      sendEmail: async () => 'sent',
      sendSms: async () => 'sent',
      sendPush: async () => 'sent',
      send: async () => 'sent',
    };
    const before = methodsOf(service);

    await threeLifecycles(
      () =>
        new NotificationWatcher(
          collector,
          config({ notification: true }),
          service,
        ) as unknown as Lifecycle,
    );

    expect(methodsOf(service)).toEqual(before);
  });

  it('gives the Redis client back', async () => {
    const client = {
      get: async () => 'v',
      set: async () => 'OK',
      del: async () => 1,
      incr: async () => 1,
      expire: async () => 1,
    };
    const before = methodsOf(client);

    await threeLifecycles(
      () => new RedisWatcher(collector, config({ redis: true }), client) as unknown as Lifecycle,
    );

    expect(methodsOf(client)).toEqual(before);
  });

  it('takes its listener off the event emitter', async () => {
    const listeners: unknown[] = [];
    const emitter = {
      onAny: (listener: unknown) => listeners.push(listener),
      offAny: (listener: unknown) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
      on: () => undefined,
      eventNames: () => [],
      listeners: () => [],
      emit: () => true,
    };

    await threeLifecycles(
      () => new EventWatcher(collector, config({ event: true }), emitter) as unknown as Lifecycle,
    );

    expect(listeners).toEqual([]);
  });

  it('still records through the wrapper it installed', async () => {
    // The point of restoring is that the wrapper does its job while it is
    // there. A watcher that gave everything back by never wrapping would pass
    // every test above.
    const recorded: string[] = [];
    const watching = {
      collect: async (type: string) => void recorded.push(type),
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const client = { get: async () => 'v', set: async () => 'OK' };
    const watcher = new RedisWatcher(
      watching,
      config({ redis: true }),
      client,
    ) as unknown as Lifecycle & { onModuleInit(): void };

    watcher.onModuleInit();
    await client.get();
    await watcher.onModuleDestroy?.();
    await client.get();

    // One call while wrapped, one after: one entry.
    expect(recorded).toEqual(['redis']);
  });

  it('calls the original with the right receiver', async () => {
    // The bound copy is what the wrapper calls through. Storing the unbound
    // one for restoring must not change that.
    const client = {
      prefix: 'nl:',
      async get(this: { prefix: string }, key: string) {
        return `${this.prefix}${key}`;
      },
    };
    const watcher = new RedisWatcher(
      collector,
      config({ redis: true }),
      client,
    ) as unknown as Lifecycle & { onModuleInit(): void };

    watcher.onModuleInit();

    expect(await client.get('a')).toBe('nl:a');
    await watcher.onModuleDestroy?.();
  });

  it('takes its listeners off the queues', async () => {
    const attached = new Map<string, unknown[]>();
    const queue = {
      name: 'orders',
      on(event: string, listener: unknown) {
        attached.set(event, [...(attached.get(event) ?? []), listener]);
        return this;
      },
      off(event: string, listener: unknown) {
        attached.set(
          event,
          (attached.get(event) ?? []).filter((each) => each !== listener),
        );
        return this;
      },
      removeListener(event: string, listener: unknown) {
        return this.off(event, listener);
      },
    };

    await threeLifecycles(
      () => new JobWatcher(collector, config({ job: { queues: [queue] } })) as unknown as Lifecycle,
    );

    const left = [...attached.values()].flat();
    expect(left).toEqual([]);
  });
});
