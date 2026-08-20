import {
  DynamicModule,
  Inject,
  INestApplication,
  Injectable,
  Logger,
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
    const application = await NestFactory.create(
      NestLensDashboardModule.forRoot(this.sharedProviders()),
      createAdapter(this.hostAdapterType()),
      // Its own bootstrap log — route mappings for controllers the application
      // already described — would read as a second application starting up.
      { logger: false },
    );

    try {
      await application.listen(this.server.port, this.server.host);
    } catch (error) {
      await application.close().catch(() => undefined);

      // Thrown, not logged and swallowed. Carrying on would leave the dashboard
      // unreachable at the address that was asked for while the application
      // starts normally — and the failure mode this option exists to prevent is
      // exactly a dashboard that is somewhere other than where it was thought
      // to be.
      throw new Error(
        `NestLens could not bind its dashboard listener to ${this.server.host}:${this.server.port} — ` +
          `${error instanceof Error ? error.message : String(error)}. The dashboard is not mounted on ` +
          'the application either, so it would not be reachable at all; fix the address or remove ' +
          '`server` from the NestLens configuration.',
      );
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
