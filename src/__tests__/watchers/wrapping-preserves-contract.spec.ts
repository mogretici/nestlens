/**
 * What replacing a method on the application's own object is allowed to change.
 *
 * Several watchers record by putting their own function where one the host
 * wrote used to be. The replacement has to be indistinguishable from what it
 * replaced, and three of them were not.
 *
 * **The gate watcher turned every synchronous decision into a promise.** Its
 * wrapper was written `async`, and an authorization service's `can`, `allows`
 * and `denies` are usually synchronous — callers write
 * `if (ability.can('read', post))`, and a promise is always truthy:
 *
 *     ability.can('Post', 'delete')      false  ->  Promise  ->  if() runs
 *     ability.denies('Post', 'delete')   true   ->  Promise  ->  if() runs
 *
 * Enabling a watcher granted every permission the watched application checked
 * synchronously. A debugging tool must not be able to do that.
 *
 * **The mail watcher dropped arguments.** Nodemailer documents
 * `sendMail(options, callback)` alongside the promise form, and the wrapper
 * accepted only the first parameter, so the callback never reached the
 * transport and its continuation never ran.
 *
 * **Eight watchers never gave back what they took.** Closing the module left
 * the host calling through a watcher whose collector was gone, and a process
 * that builds the module twice against the same object — tests, `nest start
 * --hmr` — stacked each round on the last. Measured at three lifecycles:
 *
 *     axios instance      3 request and 3 response interceptors
 *     view engine         one render recorded 3 entries
 *     TypeORM subscriber  `afterLoad` never restored
 *     Bull queue          5 listeners per round, never removed
 *
 * The model watcher had one more: it called its own handler *before* the
 * application's, outside a `try`. An entry that could not be built threw out
 * of the subscriber, and the hook the application wrote never ran at all.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { BatchWatcher, NESTLENS_BATCH_PROCESSOR } from '../../watchers/batch.watcher';
import { DumpWatcher, NESTLENS_DUMP_SERVICE } from '../../watchers/dump.watcher';
import { GateWatcher, NESTLENS_GATE_SERVICE } from '../../watchers/gate.watcher';
import { HttpClientWatcher } from '../../watchers/http-client.watcher';
import { MailWatcher } from '../../watchers/mail.watcher';
import { ModelWatcher } from '../../watchers/model.watcher';
import { ViewWatcher } from '../../watchers/view.watcher';

void NESTLENS_BATCH_PROCESSOR;
void NESTLENS_DUMP_SERVICE;
void NESTLENS_GATE_SERVICE;

const collected: { type: string; payload: unknown }[] = [];

const collector = {
  collect: async (type: string, payload: unknown) => void collected.push({ type, payload }),
  collectImmediate: async () => null,
} as unknown as CollectorService;

const config = (watchers: Record<string, unknown>): NestLensConfig =>
  ({ watchers }) as unknown as NestLensConfig;

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  collected.length = 0;
});

describe('a wrapped gate service', () => {
  /** The CASL / Laravel-Gate shape: synchronous, boolean. */
  const syncAbility = () => ({
    can: (subject: string, action: string) => action === 'read',
    denies: (subject: string, action: string) => action !== 'read',
    check: (gate: string) => gate === 'open',
  });

  const watch = (service: object) => {
    const watcher = new GateWatcher(collector, config({ gate: true }), service);
    watcher.onModuleInit();
    return watcher;
  };

  it('still answers with a boolean', () => {
    const ability = syncAbility();
    watch(ability);

    expect(ability.can('Post', 'read')).toBe(true);
    expect(ability.can('Post', 'delete')).toBe(false);
  });

  it('still refuses what it refused', () => {
    // The failure: `if (ability.can(...))` took the branch for every check.
    const ability = syncAbility();
    watch(ability);

    expect(Boolean(ability.can('Post', 'delete'))).toBe(false);
  });

  it('keeps the meaning of a method that answers the opposite question', () => {
    const ability = syncAbility();
    watch(ability);

    expect(ability.denies('Post', 'delete')).toBe(true);
    expect(ability.denies('Post', 'read')).toBe(false);
  });

  it('records the decision it passed through', async () => {
    const ability = syncAbility();
    watch(ability);

    ability.can('Post', 'delete');
    await settle();

    expect(collected).toHaveLength(1);
    expect((collected[0].payload as { allowed: boolean }).allowed).toBe(false);
  });

  it('records a refusal from a method that answers the opposite question', async () => {
    const ability = syncAbility();
    watch(ability);

    // `denies` returning true is a refusal, not a grant.
    ability.denies('Post', 'delete');
    await settle();

    expect((collected[0].payload as { allowed: boolean }).allowed).toBe(false);
  });

  it('still works for an asynchronous service', async () => {
    const ability = { can: async (subject: string, action: string) => action === 'read' };
    watch(ability);

    await expect(ability.can('Post', 'read')).resolves.toBe(true);
    await expect(ability.can('Post', 'delete')).resolves.toBe(false);
  });

  it('lets a synchronous throw stay synchronous', () => {
    const ability = {
      can: () => {
        throw new Error('policy is missing');
      },
    };
    watch(ability);

    expect(() => ability.can()).toThrow('policy is missing');
  });

  it('gives the service back when the module closes', () => {
    const ability = syncAbility();
    const before = ability.can;

    const watcher = watch(ability);
    expect(ability.can).not.toBe(before);

    watcher.onModuleDestroy();
    expect(ability.can).toBe(before);
  });

  it('does not stack wrappers across module lifecycles', async () => {
    const ability = syncAbility();

    for (let i = 0; i < 3; i += 1) {
      const watcher = watch(ability);
      watcher.onModuleDestroy();
    }

    const watcher = watch(ability);
    ability.can('Post', 'read');
    await settle();

    // One call, one entry — not one per layer.
    expect(collected).toHaveLength(1);
    watcher.onModuleDestroy();
  });

  it('does not let a recording failure reach the caller', () => {
    const exploding = {
      collect: () => {
        throw new Error('storage is gone');
      },
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const ability = syncAbility();
    const watcher = new GateWatcher(exploding, config({ gate: true }), ability);
    watcher.onModuleInit();

    expect(ability.can('Post', 'read')).toBe(true);
    watcher.onModuleDestroy();
  });
});

describe('a wrapped mailer', () => {
  /** A transport supporting both of nodemailer's documented shapes. */
  const transport = () => ({
    sendMail: (options: unknown, callback?: (error: unknown, info: unknown) => void) => {
      if (callback) {
        setImmediate(() => callback(null, { messageId: 'abc' }));
        return undefined;
      }
      return Promise.resolve({ messageId: 'abc' });
    },
  });

  const watch = (mailer: object) => {
    const watcher = new MailWatcher(collector, config({ mail: true }), mailer);
    watcher.onModuleInit();
    return watcher;
  };

  const sendWithCallback = (mailer: ReturnType<typeof transport>): Promise<string> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve('never'), 200);
      mailer.sendMail({ to: 'a@b.c' }, () => {
        clearTimeout(timer);
        resolve('fired');
      });
    });

  it('still calls the callback it was given', async () => {
    const mailer = transport();
    watch(mailer);

    expect(await sendWithCallback(mailer)).toBe('fired');
  });

  it('records the send once the callback has fired', async () => {
    const mailer = transport();
    watch(mailer);

    await sendWithCallback(mailer);
    await settle();

    expect(collected).toHaveLength(1);
    expect((collected[0].payload as { status: string }).status).toBe('sent');
  });

  it('records a failure the callback reports', async () => {
    const failing = {
      sendMail: (options: unknown, callback: (error: unknown) => void) => {
        setImmediate(() => callback(new Error('relay refused')));
      },
    };
    watch(failing);

    await new Promise<void>((resolve) => failing.sendMail({ to: 'a@b.c' }, () => resolve()));
    await settle();

    expect((collected[0].payload as { status: string }).status).toBe('failed');
  });

  it('still returns a promise when no callback is given', async () => {
    const mailer = transport();
    watch(mailer);

    await expect(mailer.sendMail({ to: 'a@b.c' })).resolves.toEqual({ messageId: 'abc' });
  });

  it('gives sendMail back when the module closes', () => {
    const mailer = transport();
    const before = mailer.sendMail;

    const watcher = watch(mailer);
    watcher.onModuleDestroy();

    expect(mailer.sendMail).toBe(before);
  });

  it('gives back a mailer wrapped by hand as well', () => {
    const mailer = transport();
    const before = mailer.sendMail;

    const watcher = new MailWatcher(collector, config({ mail: true }), undefined);
    watcher.setupMailer(mailer);
    expect(mailer.sendMail).not.toBe(before);

    watcher.onModuleDestroy();
    expect(mailer.sendMail).toBe(before);
  });
});

describe('a wrapped batch processor', () => {
  const processor = () => ({
    process: async (name: string, items: unknown[]) => ({ processed: items.length, failed: 0 }),
    bulk: (name: string, items: unknown[]) => items.length,
  });

  const watch = (service: object) => {
    const watcher = new BatchWatcher(collector, config({ batch: true }), service);
    watcher.onModuleInit();
    return watcher;
  };

  it('passes an asynchronous result through', async () => {
    const service = processor();
    watch(service);

    await expect(service.process('import', [1, 2, 3])).resolves.toEqual({
      processed: 3,
      failed: 0,
    });
  });

  it('keeps a synchronous method synchronous', () => {
    const service = processor();
    watch(service);

    expect(service.bulk('import', [1, 2])).toBe(2);
  });

  it('gives the processor back when the module closes', () => {
    const service = processor();
    const before = service.process;

    const watcher = watch(service);
    watcher.onModuleDestroy();

    expect(service.process).toBe(before);
  });
});

describe('a wrapped dump service', () => {
  const service = () => ({
    export: async (_options: unknown) => ({ recordCount: 10 }),
    backup: (_options: unknown) => 'done',
  });

  const watch = (target: object) => {
    const watcher = new DumpWatcher(collector, config({ dump: true }), target);
    watcher.onModuleInit();
    return watcher;
  };

  it('passes an asynchronous result through', async () => {
    const target = service();
    watch(target);

    await expect(target.export({})).resolves.toEqual({ recordCount: 10 });
  });

  it('keeps a synchronous method synchronous', () => {
    const target = service();
    watch(target);

    expect(target.backup({})).toBe('done');
  });

  it('gives the service back when the module closes', () => {
    const target = service();
    const before = target.export;

    const watcher = watch(target);
    watcher.onModuleDestroy();

    expect(target.export).toBe(before);
  });
});

describe('a wrapped axios instance', () => {
  /** An interceptor manager that behaves like axios's: `use` returns an id. */
  const manager = () => {
    const handlers: unknown[] = [];
    return {
      handlers,
      use(onFulfilled: unknown, onRejected: unknown) {
        handlers.push([onFulfilled, onRejected]);
        return handlers.length - 1;
      },
      eject(id: number) {
        if (handlers[id]) handlers[id] = null;
      },
      get installed() {
        return handlers.filter(Boolean).length;
      },
    };
  };

  const instance = () => ({ interceptors: { request: manager(), response: manager() } });

  const watch = (axios: object) => {
    const watcher = new HttpClientWatcher(collector, config({ httpClient: true }), axios);
    watcher.onModuleInit();
    return watcher;
  };

  it('installs one interceptor of each kind', () => {
    const axios = instance();
    watch(axios);

    expect(axios.interceptors.request.installed).toBe(1);
    expect(axios.interceptors.response.installed).toBe(1);
  });

  it('takes them off when the module closes', () => {
    const axios = instance();

    watch(axios).onModuleDestroy();

    expect(axios.interceptors.request.installed).toBe(0);
    expect(axios.interceptors.response.installed).toBe(0);
  });

  it('does not stack across lifecycles', () => {
    const axios = instance();

    for (let i = 0; i < 3; i += 1) {
      watch(axios).onModuleDestroy();
    }
    watch(axios);

    expect(axios.interceptors.request.installed).toBe(1);
  });
});

describe('a wrapped view engine', () => {
  const engine = () => ({
    render: (view: string, options: unknown, callback: (e: unknown, html: string) => void) =>
      callback(null, `<${view}/>`),
  });

  const watch = (target: object) => {
    const watcher = new ViewWatcher(collector, config({ view: true }), target);
    watcher.onModuleInit();
    return watcher;
  };

  it('gives the render method back when the module closes', () => {
    const target = engine();
    const before = target.render;

    watch(target).onModuleDestroy();

    expect(target.render).toBe(before);
  });

  it('records one entry per render, not one per lifecycle', async () => {
    const target = engine();

    for (let i = 0; i < 3; i += 1) {
      watch(target).onModuleDestroy();
    }
    const watcher = watch(target);

    collected.length = 0;
    target.render('page', {}, () => undefined);
    await settle();

    expect(collected).toHaveLength(1);
    watcher.onModuleDestroy();
  });
});

describe('a wrapped TypeORM subscriber', () => {
  const subscriber = () => ({
    afterLoad: jest.fn(),
    afterInsert: jest.fn(),
  });

  const watch = (target: object) => {
    const watcher = new ModelWatcher(collector, config({ model: true }), target);
    watcher.onModuleInit();
    return watcher;
  };

  it('gives the hooks back when the module closes', () => {
    const target = subscriber();
    const before = target.afterLoad;

    watch(target).onModuleDestroy();

    expect(target.afterLoad).toBe(before);
  });

  it("still calls the application's own hook", () => {
    const target = subscriber();
    // Held before wrapping: `target.afterLoad` is the wrapper afterwards, and
    // asserting on that would be asserting on our own function.
    const applicationHook = target.afterLoad;
    const watcher = watch(target);

    (target.afterLoad as unknown as (entity: unknown, event: unknown) => void)(
      { id: 1 },
      { metadata: { name: 'Order' } },
    );

    expect(applicationHook).toHaveBeenCalledTimes(1);
    watcher.onModuleDestroy();
  });

  it("calls the application's hook even when recording fails", () => {
    // The failure: recording ran first and outside a `try`, so an entry that
    // could not be built threw out of the subscriber and the application's own
    // hook never ran.
    const exploding = {
      collect: () => {
        throw new Error('storage is gone');
      },
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const called: string[] = [];
    const target = {
      afterInsert: () => called.push('application'),
    };

    const watcher = new ModelWatcher(exploding, config({ model: true }), target);
    watcher.onModuleInit();

    expect(() =>
      (target.afterInsert as unknown as (event: unknown) => void)({
        metadata: { name: 'Order' },
        entity: {},
      }),
    ).not.toThrow();
    expect(called).toEqual(['application']);

    watcher.onModuleDestroy();
  });
});
