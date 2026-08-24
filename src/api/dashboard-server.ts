import {
  DynamicModule,
  Inject,
  INestApplication,
  Injectable,
  Logger,
  LoggerService,
  Module,
  OnModuleDestroy,
  OnApplicationBootstrap,
  Optional,
  Provider,
} from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost, ModuleRef, NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'net';
import { DashboardServerConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { STORAGE } from '../core/storage/storage.interface';
import { CollectorService } from '../core/collector.service';
import { PruningService } from '../core/pruning.service';
import { TagService } from '../core/tag.service';
import { NestLensApiController } from './api.controller';
import { DashboardController } from './dashboard.controller';
import { NestLensStreamController } from './stream.controller';
import { TagController } from './tag.controller';
import { NestLensGuard } from './api.guard';
import { SpaRouteRegistrar } from './spa-wildcard';
import { toBaseHref } from './route-path';

/** The resolved `server` block, provided only when one was configured. */
export const NESTLENS_SERVER_CONFIG = Symbol('NESTLENS_SERVER_CONFIG');

/**
 * Hooks Nest calls on every instance it holds, including value providers.
 *
 * The dashboard application below is handed the *running* collector, storage
 * and pruning service rather than copies — one process, one set of entries, one
 * SQLite handle. Nest does not know they are on loan: it would call
 * `onModuleInit` on them a second time, starting a second pruning timer, and
 * `onModuleDestroy` when the dashboard listener closes, flushing and completing
 * the collector of an application that is still running.
 *
 * So the borrowed instances are handed over without these. Ownership stays with
 * the module that created them.
 */
const LIFECYCLE_HOOKS = new Set([
  'onModuleInit',
  'onModuleDestroy',
  'onApplicationBootstrap',
  'onApplicationShutdown',
  'beforeApplicationShutdown',
]);

/**
 * The host application's logger, put back once the dashboard's own is silent.
 *
 * `NestFactory.create` applies its `logger` option through
 * `Logger.overrideLogger`, which is static and therefore process-wide: passing
 * `logger: false` to a second application silences the first one as well, for
 * the rest of its life. Measured on a deployment before this existed — the
 * host logged normally through startup, reached this hook inside
 * `app.listen()`, and never logged again. Not its guards, not its errors, not
 * even the message below explaining a dashboard that could not bind. A
 * debugging tool that blinds the application it reports on is worse than no
 * debugging tool.
 *
 * `staticInstanceRef` is `protected static`, so a subclass is the typed way to
 * read it and hand it back; nothing here reaches around the type system.
 */
class HostLogger extends Logger {
  static capture(): LoggerService | undefined {
    return HostLogger.staticInstanceRef;
  }

  /**
   * Assigning `HostLogger.staticInstanceRef` would not do this: a write to a
   * static through a subclass creates an own property on the subclass, and the
   * base class — the one every `Logger` call reads — keeps the value it had.
   * The test that pins this failed on exactly that first.
   *
   * `false` is how `overrideLogger` spells "no instance", which is the state a
   * host that never installed a logger of its own is in.
   */
  static restore(instance: LoggerService | undefined): void {
    Logger.overrideLogger(instance ?? false);
  }
}

/**
 * The same object, minus its lifecycle hooks.
 *
 * Methods are bound to the original so `this` is never the proxy — the services
 * behind these read their own fields, and a proxied receiver is exactly the
 * kind of difference that shows up much later as something subtle.
 */
function borrow<T extends object>(instance: T): T {
  return new Proxy(instance, {
    get(target, property) {
      if (typeof property === 'string' && LIFECYCLE_HOOKS.has(property)) {
        return undefined;
      }

      const value = Reflect.get(target, property) as unknown;

      return typeof value === 'function'
        ? (value as (...args: never[]) => unknown).bind(target)
        : value;
    },
    has(target, property) {
      if (typeof property === 'string' && LIFECYCLE_HOOKS.has(property)) {
        return false;
      }

      return Reflect.has(target, property);
    },
  });
}

/**
 * The dashboard, its API and its event stream — and nothing else.
 *
 * The application's own controllers, middleware and global interceptors are not
 * here, which is the point: this listener answers for NestLens and has no route
 * that reaches anything else.
 */
@Module({})
export class NestLensDashboardModule {
  static forRoot(shared: Provider[]): DynamicModule {
    return {
      module: NestLensDashboardModule,
      // Same order as the mounted arrangement: the dashboard's SPA catch-all is
      // last so it cannot swallow the API routes.
      controllers: [
        NestLensApiController,
        TagController,
        NestLensStreamController,
        DashboardController,
      ],
      providers: [NestLensGuard, SpaRouteRegistrar, ...shared],
    };
  }
}

/** An HTTP platform NestLens can build a second listener on. */
interface Platform {
  readonly type: string;
  readonly packageName: string;
  readonly exportName: string;
}

const PLATFORMS: readonly Platform[] = [
  { type: 'express', packageName: '@nestjs/platform-express', exportName: 'ExpressAdapter' },
  { type: 'fastify', packageName: '@nestjs/platform-fastify', exportName: 'FastifyAdapter' },
];

/**
 * An adapter of the same kind the application is already running on.
 *
 * Neither platform package is a dependency of NestLens, so both are required
 * lazily and the application's own choice is tried first: matching it means the
 * dashboard's request handling on this listener is the handling it gets on the
 * mounted path, rather than a second code path that only this mode exercises.
 */
function createAdapter(preferredType: string | undefined): AbstractHttpAdapter {
  const ordered = [
    ...PLATFORMS.filter((platform) => platform.type === preferredType),
    ...PLATFORMS.filter((platform) => platform.type !== preferredType),
  ];

  for (const platform of ordered) {
    try {
      const loaded = require(platform.packageName) as Record<string, unknown>;
      const Adapter = loaded[platform.exportName] as (new () => AbstractHttpAdapter) | undefined;

      if (Adapter) {
        return new Adapter();
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'NestLens needs an HTTP platform to serve its dashboard on a listener of its own, and ' +
      'neither @nestjs/platform-express nor @nestjs/platform-fastify could be loaded. ' +
      'Install the one the application uses, or remove `server` from the NestLens configuration ' +
      'to mount the dashboard on the application instead.',
  );
}

/**
 * Runs the dashboard on a socket NestLens owns.
 *
 * Provided only when `server` is configured; without it nothing here is
 * constructed and the dashboard controllers are registered on the application
 * exactly as they always were.
 */
@Injectable()
export class NestLensDashboardServer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('NestLens');
  private application?: INestApplication;
  private bound?: AddressInfo;

  constructor(
    @Inject(NESTLENS_SERVER_CONFIG)
    private readonly server: DashboardServerConfig,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly adapterHost?: HttpAdapterHost,
  ) {}

  /**
   * Where the listener actually ended up, once it is listening.
   *
   * Read from the socket rather than from the configuration, so `port: 0`
   * reports the port the operating system chose and the address is the one the
   * kernel bound — the answer, not the request.
   */
  address(): AddressInfo | undefined {
    return this.bound;
  }

  /**
   * Bound after the application has finished starting, so a dashboard is never
   * reachable before the thing it reports on is ready.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Its own bootstrap log — route mappings for controllers the application
    // already described — would read as a second application starting up. The
    // silence is scoped to that: whatever the host was logging with is taken
    // first and handed back in `finally`, so a failure on either line below
    // still leaves the application able to speak. See `HostLogger`.
    //
    // The host is silent for the width of these two calls, which is
    // unavoidable: Nest applies a `logger` option through a static, so there is
    // no way to quieten one application without quietening the process. It is
    // a few milliseconds inside `listen()`, against a dashboard that would
    // otherwise announce itself as a second application every boot.
    const hostLogger = HostLogger.capture();
    Logger.overrideLogger(false);

    let application: INestApplication;
    let bindError: unknown;

    try {
      application = await NestFactory.create(
        NestLensDashboardModule.forRoot(this.sharedProviders()),
        createAdapter(this.hostAdapterType()),
      );

      try {
        await application.listen(this.server.port, this.server.host);
      } catch (error) {
        bindError = error;
        await application.close().catch(() => undefined);
      }
    } finally {
      HostLogger.restore(hostLogger);
    }

    if (bindError) {
      const error = bindError;

      // Reported, not thrown. A port already taken or an address the host does
      // not hold is a deployment's condition rather than a mistake in its
      // code, and this used to end the application's startup over it — a
      // debugging tool stopping a production deployment from booting, which is
      // the worst available outcome and the one `SqliteStorage` already
      // refuses to cause when its file will not open.
      //
      // Nothing is exposed by carrying on: with `server` configured the
      // dashboard is not registered on the application at all, so the failure
      // costs the dashboard and nothing else. Said at error level, because a
      // reader who asked for it at an address has to be told it is not there.
      this.logger.error(
        `Could not bind the dashboard listener to ${this.server.host}:${this.server.port} — ` +
          `${error instanceof Error ? error.message : String(error)}. The dashboard is not mounted ` +
          'on the application either, so it is not reachable at all; fix the address or remove ' +
          '`server` from the NestLens configuration. The application is starting without it.',
      );

      return;
    }

    this.application = application;
    this.bound = application.getHttpServer().address() as AddressInfo;

    const host = this.bound.family === 'IPv6' ? `[${this.bound.address}]` : this.bound.address;
    this.logger.log(
      `Dashboard on its own listener: http://${host}:${this.bound.port}${toBaseHref(this.config.path)} ` +
        '— not mounted on the application',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.application?.close();
    this.application = undefined;
    this.bound = undefined;
  }

  private hostAdapterType(): string | undefined {
    const adapter = this.adapterHost?.httpAdapter;

    return typeof adapter?.getType === 'function' ? adapter.getType() : undefined;
  }

  /**
   * The running services, lent to the dashboard application.
   *
   * `strict: false` because they live in the global core module, not in the one
   * this service was declared in.
   *
   * `NESTLENS_CONFIG` is passed as it is: a plain configuration object with no
   * lifecycle to protect. `ApplicationConfig` and `HttpAdapterHost` are
   * deliberately *not* lent — the dashboard application supplies its own, which
   * is what makes the mount point come out right. A global prefix set with
   * `app.setGlobalPrefix()` moves the application's routes and has nothing to
   * do with this listener, where `path` is the whole story.
   */
  private sharedProviders(): Provider[] {
    return [
      { provide: NESTLENS_CONFIG, useValue: this.config },
      { provide: STORAGE, useValue: borrow(this.moduleRef.get(STORAGE, { strict: false })) },
      {
        provide: CollectorService,
        useValue: borrow(this.moduleRef.get(CollectorService, { strict: false })),
      },
      {
        provide: PruningService,
        useValue: borrow(this.moduleRef.get(PruningService, { strict: false })),
      },
      {
        provide: TagService,
        useValue: borrow(this.moduleRef.get(TagService, { strict: false })),
      },
    ];
  }
}
