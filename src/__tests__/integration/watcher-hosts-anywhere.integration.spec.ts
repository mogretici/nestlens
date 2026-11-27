/**
 * A watcher finds the service it is handed wherever the application provides it.
 *
 * Eleven watchers record a client or service the application owns, handed over
 * under a token — `NESTLENS_GATE_SERVICE`, `NESTLENS_REDIS_CLIENT` and the rest
 * — and the cache watcher reads `CACHE_MANAGER` the same way. Every page
 * showed the token provided in `AppModule`. The watchers live in
 * `NestLensModule`, and Nest resolves a constructor's dependencies in the
 * module that declares it, so a token in `AppModule` never reached them: the
 * watcher logged, at debug level, that it had nothing to watch, and recorded
 * nothing. Measured on NestJS 12.6 with the gate watcher:
 *
 *     provided in AppModule            wrapped nothing
 *     provided by a @Global() module   wrapped the service
 *
 * These boot a real application on each arrangement a reader would write and
 * ask the host object whether it was wrapped.
 */
import { DynamicModule, Global, Injectable, Logger, Module, Provider, Scope } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { NestLensModule } from '../../nestlens.module';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import {
  NESTLENS_BATCH_PROCESSOR,
  NESTLENS_COMMAND_BUS,
  NESTLENS_DUMP_SERVICE,
  NESTLENS_EVENT_EMITTER,
  NESTLENS_GATE_SERVICE,
  NESTLENS_HTTP_CLIENT,
  NESTLENS_MAILER_SERVICE,
  NESTLENS_MODEL_SUBSCRIBER,
  NESTLENS_NOTIFICATION_SERVICE,
  NESTLENS_REDIS_CLIENT,
  NESTLENS_VIEW_ENGINE,
  GateWatcher,
} from '../../index';

type Host = Record<string, unknown>;

interface Case {
  watcher: keyof NonNullable<NestLensConfig['watchers']>;
  token: string | symbol;
  host: () => Host;
  /** Whether the watcher has put something of its own on the host. */
  wrapped: (host: Host, before: Host) => boolean;
}

const method =
  (name: string) =>
  (host: Host, before: Host): boolean =>
    host[name] !== before[name];

const handlers = (host: Host): number =>
  (host as unknown as { interceptors: { request: { handlers: unknown[] } } }).interceptors.request
    .handlers.length;

const CASES: Case[] = [
  {
    watcher: 'gate',
    token: NESTLENS_GATE_SERVICE,
    host: () => ({ can: () => true }),
    wrapped: method('can'),
  },
  {
    watcher: 'event',
    token: NESTLENS_EVENT_EMITTER,
    host: () => ({ emit: () => true, listeners: () => [] }),
    wrapped: method('emit'),
  },
  {
    watcher: 'redis',
    token: NESTLENS_REDIS_CLIENT,
    host: () => ({ get: async () => 'v' }),
    wrapped: method('get'),
  },
  {
    watcher: 'notification',
    token: NESTLENS_NOTIFICATION_SERVICE,
    host: () => ({ send: async () => undefined }),
    wrapped: method('send'),
  },
  {
    watcher: 'view',
    token: NESTLENS_VIEW_ENGINE,
    host: () => ({ render: () => '<p></p>' }),
    wrapped: method('render'),
  },
  {
    watcher: 'httpClient',
    token: NESTLENS_HTTP_CLIENT,
    host: () => axios.create() as unknown as Host,
    wrapped: (host) => handlers(host) > 0,
  },
  {
    watcher: 'mail',
    token: NESTLENS_MAILER_SERVICE,
    host: () => ({ sendMail: async () => ({}) }),
    wrapped: method('sendMail'),
  },
  {
    watcher: 'command',
    token: NESTLENS_COMMAND_BUS,
    host: () => ({ execute: async () => undefined }),
    wrapped: method('execute'),
  },
  {
    watcher: 'batch',
    token: NESTLENS_BATCH_PROCESSOR,
    host: () => ({ process: async () => ({}) }),
    wrapped: method('process'),
  },
  {
    watcher: 'dump',
    token: NESTLENS_DUMP_SERVICE,
    host: () => ({ export: async () => ({}) }),
    wrapped: method('export'),
  },
  {
    watcher: 'model',
    token: NESTLENS_MODEL_SUBSCRIBER,
    host: () => ({ afterInsert: () => undefined }),
    wrapped: method('afterInsert'),
  },
  {
    watcher: 'cache',
    token: 'CACHE_MANAGER',
    host: () => ({ get: async () => 1 }),
    wrapped: method('get'),
  },
];

/** Where the application puts the provider. */
const ARRANGEMENTS: Record<
  string,
  (provider: Provider) => { imports: unknown[]; providers: Provider[] }
> = {
  'the root module': (provider) => ({ imports: [], providers: [provider] }),
  'a feature module that exports it': (provider) => {
    @Module({
      providers: [provider],
      exports: [(provider as { provide: string | symbol }).provide],
    })
    class FeatureModule {}
    return { imports: [FeatureModule], providers: [] };
  },
  'a @Global() module': (provider) => {
    @Global()
    @Module({
      providers: [provider],
      exports: [(provider as { provide: string | symbol }).provide],
    })
    class SharedModule {}
    return { imports: [SharedModule], providers: [] };
  },
  'a feature module that keeps it to itself': (provider) => {
    @Module({ providers: [provider] })
    class PrivateModule {}
    return { imports: [PrivateModule], providers: [] };
  },
};

const boot = async (
  config: NestLensConfig,
  arrangement: { imports: unknown[]; providers: Provider[] },
): Promise<TestingModule> => {
  const moduleRef = await Test.createTestingModule({
    imports: [NestLensModule.forRoot(config), ...(arrangement.imports as DynamicModule[])],
    providers: arrangement.providers,
  }).compile();

  await moduleRef.init();
  return moduleRef;
};

describe('a watcher handed a service under a token', () => {
  jest.setTimeout(30_000);

  describe.each(Object.keys(ARRANGEMENTS))('provided in %s', (where) => {
    it.each(CASES.map((c) => [c.watcher, c] as const))('%s finds it', async (_name, c) => {
      const host = c.host();
      const before = { ...host };
      const app = await boot(
        { watchers: { [c.watcher]: true } },
        ARRANGEMENTS[where]({ provide: c.token, useValue: host }),
      );

      expect(c.wrapped(host, before)).toBe(true);

      await app.close();
      expect(c.wrapped(host, before)).toBe(false);
    });
  });

  it('finds one an async factory produced', async () => {
    const host = { can: () => true };
    const before = { ...host };
    const app = await boot(
      { watchers: { gate: true } },
      ARRANGEMENTS['the root module']({
        provide: NESTLENS_GATE_SERVICE,
        useFactory: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return host;
        },
      }),
    );

    expect(host.can).not.toBe(before.can);
    await app.close();
  });

  it('refuses a request-scoped one and says why', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class ScopedGate {
      can(): boolean {
        return true;
      }
    }

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const app = await boot(
      { watchers: { gate: true } },
      ARRANGEMENTS['the root module']({ provide: NESTLENS_GATE_SERVICE, useClass: ScopedGate }),
    );

    const said = warn.mock.calls.map(([message]) => String(message)).join('\n');
    expect(said).toMatch(/NESTLENS_GATE_SERVICE/);
    expect(said).toMatch(/request-scoped/i);
    expect(ScopedGate.prototype.can.name).toBe('can');

    warn.mockRestore();
    await app.close();
  });

  /**
   * `CacheModule.register()` in two feature modules is two `CACHE_MANAGER`s,
   * and `get(token, { strict: false })` returns one of them: the other cache
   * went unrecorded, silently. Every default-scoped instance is wrapped.
   */
  it.each(CASES.map((c) => [c.watcher, c] as const))(
    '%s wraps every one of several providers of its token',
    async (_name, c) => {
      const first = c.host();
      const second = c.host();
      const before = [{ ...first }, { ...second }];

      @Module({ providers: [{ provide: c.token, useValue: first }] })
      class OneModule {}
      @Module({ providers: [{ provide: c.token, useValue: second }] })
      class OtherModule {}

      const app = await boot(
        { watchers: { [c.watcher]: true } },
        {
          imports: [OneModule, OtherModule],
          providers: [],
        },
      );

      expect([c.wrapped(first, before[0]), c.wrapped(second, before[1])]).toEqual([true, true]);

      await app.close();
      expect([c.wrapped(first, before[0]), c.wrapped(second, before[1])]).toEqual([false, false]);
    },
  );

  /**
   * Two `NestLensModule.forRoot()` imports — one per feature module, as
   * monorepos and copied boilerplate produce — are two sets of watchers looking
   * for the same token. Both wrapped the host, so each call was recorded twice.
   */
  it('wraps a host once however many NestLensModules find it', async () => {
    const collect = jest.spyOn(CollectorService.prototype, 'collect');
    const gate = { can: () => true };

    @Module({ imports: [NestLensModule.forRoot({ path: '/lens-b', watchers: { gate: true } })] })
    class SecondLensModule {}

    const app = await boot(
      { path: '/lens-a', watchers: { gate: true } },
      {
        imports: [SecondLensModule],
        providers: [{ provide: NESTLENS_GATE_SERVICE, useValue: gate }],
      },
    );

    gate.can();
    const gateEntries = collect.mock.calls.filter(([type]) => type === 'gate');
    collect.mockRestore();

    expect(gateEntries).toHaveLength(1);
    await app.close();
  });

  /**
   * A host the watcher could take in its constructor stopped the lookup there:
   * `CacheModule.register({ isGlobal: true })` in AppModule plus
   * `CacheModule.register()` in a feature module recorded the global cache and
   * not the feature's. The container is always asked, and what the constructor
   * received is one of the answers.
   */
  it.each(CASES.map((c) => [c.watcher, c] as const))(
    '%s records a global provider and a feature provider both',
    async (_name, c) => {
      const shared = c.host();
      const local = c.host();
      const before = [{ ...shared }, { ...local }];

      @Global()
      @Module({ providers: [{ provide: c.token, useValue: shared }], exports: [c.token] })
      class GlobalProviderModule {}
      @Module({ providers: [{ provide: c.token, useValue: local }] })
      class FeatureProviderModule {}

      const app = await boot(
        { watchers: { [c.watcher]: true } },
        { imports: [GlobalProviderModule, FeatureProviderModule], providers: [] },
      );

      expect([c.wrapped(shared, before[0]), c.wrapped(local, before[1])]).toEqual([true, true]);
      await app.close();
    },
  );

  /**
   * The mark that keeps a host from being wrapped twice outlived a boot that
   * failed: Nest never calls onModuleDestroy for an application whose init
   * rejected, so the next application on the same host found it taken and
   * recorded nothing — while the dead one's collector went on receiving.
   */
  it('records into a later application after an earlier one failed to boot', async () => {
    const gate = { can: () => true };

    @Injectable()
    class FailsAfterTheWatchers {
      onModuleInit(): void {
        throw new Error('boom');
      }
    }
    @Module({ providers: [FailsAfterTheWatchers] })
    class FailingModule {}

    const failed = await Test.createTestingModule({
      imports: [NestLensModule.forRoot({ watchers: { gate: true } }), FailingModule],
      providers: [{ provide: NESTLENS_GATE_SERVICE, useValue: gate }],
    }).compile();
    await expect(failed.init()).rejects.toThrow('boom');

    const app = await boot(
      { watchers: { gate: true } },
      ARRANGEMENTS['the root module']({ provide: NESTLENS_GATE_SERVICE, useValue: gate }),
    );
    const collector = app.get(CollectorService);
    const collect = jest.spyOn(CollectorService.prototype, 'collect');

    gate.can();
    const ours = collect.mock.calls.filter(
      ([type], index) =>
        type === 'gate' && (collect.mock.instances[index] as unknown) === collector,
    );
    collect.mockRestore();

    expect(ours).toHaveLength(1);
    await app.close();
  });

  it("keeps another module's hold on a host when a watcher that was off closes", async () => {
    const gate = { can: () => true };

    // Global, so the watcher that is off is handed the host in its constructor
    // too — which is what made its onModuleDestroy give the host back.
    @Global()
    @Module({
      providers: [{ provide: NESTLENS_GATE_SERVICE, useValue: gate }],
      exports: [NESTLENS_GATE_SERVICE],
    })
    class SharedGateModule {}
    @Module({ imports: [NestLensModule.forRoot({ path: '/lens-off', watchers: { gate: false } })] })
    class OffLensModule {}

    const app = await boot(
      { path: '/lens-on', watchers: { gate: true } },
      { imports: [SharedGateModule, OffLensModule], providers: [] },
    );
    const watchers = app.get(GateWatcher, { strict: false, each: true });
    const off = watchers.find(
      (w) => !(w as unknown as { config: { enabled: boolean } }).config.enabled,
    );
    expect(off).toBeDefined();

    off?.onModuleDestroy();

    expect(Object.getOwnPropertySymbols(gate)).toContain(Symbol.for('nestlens:watched-by'));
    await app.close();
  });

  /**
   * `HttpService` wraps the axios instance it exposes as `axiosRef`, and the
   * watcher installs on that instance — but claimed the token's value. The same
   * instance provided bare and as `{ axiosRef }` got two interceptors, and
   * every request was recorded twice.
   */
  it('installs once on an axios instance reached two ways', async () => {
    const instance = axios.create();

    @Module({ providers: [{ provide: NESTLENS_HTTP_CLIENT, useValue: instance }] })
    class BareModule {}
    @Module({ providers: [{ provide: NESTLENS_HTTP_CLIENT, useValue: { axiosRef: instance } }] })
    class WrappedModule {}

    const app = await boot(
      { watchers: { httpClient: true } },
      { imports: [BareModule, WrappedModule], providers: [] },
    );

    expect(
      (instance.interceptors.request as unknown as { handlers: unknown[] }).handlers.filter(
        Boolean,
      ),
    ).toHaveLength(1);
    await app.close();
  });

  // `undefined` is "not configured", which for an opt-in watcher is off. The
  // watchers are always provided now, and spreading `{ gate: undefined }` over
  // the defaults replaced their `false`, so writing the key without a value
  // switched the watcher on.
  it.each([false, undefined])('touches nothing when the watcher is %s', async (value) => {
    for (const c of CASES) {
      const host = c.host();
      const before = { ...host };
      const app = await boot(
        { watchers: { [c.watcher]: value } },
        ARRANGEMENTS['the root module']({ provide: c.token, useValue: host }),
      );

      expect([c.watcher, c.wrapped(host, before)]).toEqual([c.watcher, false]);
      await app.close();
    }
  });
});
