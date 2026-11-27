import {
  Inject,
  MiddlewareConsumer,
  NestModule,
  DynamicModule,
  Global,
  Logger,
  Module,
  OnModuleInit,
  Optional,
  Provider,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_INTERCEPTOR, DiscoveryModule, ModuleRef } from '@nestjs/core';
import { applyPreset } from './presets';
import { startupSummary } from './startup-summary';
import {
  DEFAULT_CONFIG,
  NestLensConfig,
  NESTLENS_API_PREFIX,
  NESTLENS_CONFIG,
} from './nestlens.config';
import { toRoutePrefix } from './api/route-path';
import { CollectorService } from './core/collector.service';
import { AlertingService } from './core/alerting.service';
import { PruningService } from './core/pruning.service';
import { TagService } from './core/tag.service';
import { FamilyHashService } from './core/family-hash.service';
import { STORAGE } from './core/storage';
import { RequestContextMiddleware } from './core/request-context.middleware';
import { DataMaskerService } from './core/data-masker.service';
import { createStorage } from './core/storage/storage.factory';
import {
  NestLensApiController,
  DashboardController,
  NestLensDashboardServer,
  NestLensGuard,
  NestLensStreamController,
  NESTLENS_SERVER_CONFIG,
  SpaRouteRegistrar,
  TagController,
} from './api';
import {
  RequestWatcher,
  QueryWatcher,
  ExceptionWatcher,
  NestLensLogger,
  HttpClientWatcher,
  CacheWatcher,
  EventWatcher,
  JobWatcher,
  ScheduleWatcher,
  MailWatcher,
  RedisWatcher,
  ModelWatcher,
  NotificationWatcher,
  ViewWatcher,
  CommandWatcher,
  GateWatcher,
  BatchWatcher,
  DumpWatcher,
  GraphQLWatcher,
} from './watchers';
import {
  NestLensApolloPlugin,
  MercuriusAutoRegistrar,
  isPackageAvailable,
} from './watchers/graphql/adapters';

/**
 * Internal module for core services
 * Provides shared services to other internal modules
 */
@Global()
@Module({})
class NestLensCoreModule {
  static forRoot(config: NestLensConfig): DynamicModule {
    const providers: Provider[] = [
      {
        provide: NESTLENS_CONFIG,
        useValue: config,
      },
      {
        provide: STORAGE,
        useFactory: async () => {
          return createStorage(config.storage ?? {});
        },
      },
      {
        // The documented flow is Watcher → collect() → DataMasker → Storage
        // (CLAUDE.md) and `security.dataMasking` is documented as configuring
        // "the global DataMaskerService … across watchers". The service existed
        // and was never provided, so neither happened.
        provide: DataMaskerService,
        useFactory: () =>
          new DataMaskerService({
            ...config.security?.dataMasking,
            stackTraceSanitization: config.security?.stackTraceSanitization,
          }),
      },
      TagService,
      FamilyHashService,
      CollectorService,
      PruningService,
    ];

    const exports: (
      | Provider
      | symbol
      | typeof DataMaskerService
      | typeof TagService
      | typeof FamilyHashService
      | typeof CollectorService
      | typeof PruningService
      | typeof GraphQLWatcher
    )[] = [
      NESTLENS_CONFIG,
      STORAGE,
      DataMaskerService,
      TagService,
      FamilyHashService,
      CollectorService,
      PruningService,
    ];

    // Add GraphQL Watcher to core module (global) so it's accessible from other modules
    // This allows moduleRef.get(GraphQLWatcher) to work in GraphQLModule.forRootAsync
    if (config.watchers?.graphql) {
      providers.push(GraphQLWatcher);
      exports.push(GraphQLWatcher);

      // Add auto-registration providers based on detected GraphQL server
      // These providers enable zero-config GraphQL monitoring
      if (isPackageAvailable('@nestjs/apollo') || isPackageAvailable('@apollo/server')) {
        providers.push(NestLensApolloPlugin);
      }

      if (isPackageAvailable('mercurius') || isPackageAvailable('@nestjs/mercurius')) {
        providers.push(MercuriusAutoRegistrar);
      }
    }

    return {
      module: NestLensCoreModule,
      providers,
      exports,
    };
  }
}

/**
 * Internal module for Query Watcher
 * Separated to ensure proper dependency injection of ModuleRef
 */
@Module({})
class NestLensQueryModule {
  static forRoot(): DynamicModule {
    return {
      module: NestLensQueryModule,
      imports: [DiscoveryModule],
      providers: [QueryWatcher],
      exports: [QueryWatcher],
    };
  }
}

/**
 * Internal module for Schedule Watcher
 * Imports DiscoveryModule so the watcher can locate @nestjs/schedule's
 * SchedulerRegistry from the global container at bootstrap.
 */
@Module({})
class NestLensScheduleModule {
  static forRoot(): DynamicModule {
    return {
      module: NestLensScheduleModule,
      imports: [DiscoveryModule],
      providers: [ScheduleWatcher],
      exports: [ScheduleWatcher],
    };
  }
}

/**
 * A configuration with its `undefined` values left out, at every depth.
 *
 * `undefined` is "not configured", so it has to leave the default in place.
 * Spread as it was, `watchers: { gate: undefined }` replaced the default
 * `false` with `undefined` — which a watcher reads as on — and
 * `path: process.env.NESTLENS_PATH` with the variable unset replaced the mount
 * point. Only plain objects are walked: an array is a value, and an object of a
 * class is the application's, to be handed on as it is.
 */
const withoutUndefined = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  ) as T;
};

/** The watchers an application can switch on, each with a manual API of some kind. */
const OPT_IN_WATCHERS = [
  HttpClientWatcher,
  CacheWatcher,
  EventWatcher,
  JobWatcher,
  MailWatcher,
  RedisWatcher,
  ModelWatcher,
  NotificationWatcher,
  ViewWatcher,
  CommandWatcher,
  GateWatcher,
  BatchWatcher,
  DumpWatcher,
];

/** What the watchers are given when NestLens is off: nothing is ever collected. */
const INERT_COLLECTOR = {
  collect: async (): Promise<void> => undefined,
  collectImmediate: async (): Promise<null> => null,
} as unknown as CollectorService;

const ALL_WATCHERS_OFF: NestLensConfig = {
  enabled: false,
  watchers: Object.fromEntries(
    Object.keys(DEFAULT_CONFIG.watchers ?? {}).map((key) => [key, false]),
  ) as NestLensConfig['watchers'],
};

/**
 * The configuration as `forRoot` resolved it, for the module `forRoot` returned.
 *
 * Provided there and never exported. `imports: [NestLensModule]` in a feature
 * module makes Nest instantiate the class a second time, and the hooks below
 * belong to the class: through the global `NESTLENS_CONFIG` that instance
 * printed the startup summary again and applied the request-context middleware
 * a second time on every request — and with NestLens off, where nothing shares
 * `NESTLENS_CONFIG`, it stopped the application booting. Only the module
 * `forRoot` built can see this token, so the other instance does nothing.
 */
const FOR_ROOT_CONFIG = Symbol('NESTLENS_FOR_ROOT_CONFIG');

/** Whether a `forRoot` anywhere in this application provided a configuration. */
const configuredElsewhere = (moduleRef: ModuleRef): boolean => {
  try {
    moduleRef.get(NESTLENS_CONFIG, { strict: false });
    return true;
  } catch {
    return false;
  }
};

@Module({})
export class NestLensModule implements NestModule, OnModuleInit {
  constructor(
    @Optional()
    @Inject(FOR_ROOT_CONFIG)
    private readonly config: NestLensConfig | undefined,
    moduleRef: ModuleRef,
  ) {
    // The class imported with no `forRoot` in the application configures
    // nothing. Asked through the container rather than a static flag, so two
    // applications in one process each get their own answer.
    if (!config && !configuredElsewhere(moduleRef)) {
      throw new Error(
        'NestLensModule was imported without NestLensModule.forRoot(), so nothing configures it ' +
          'and it would record nothing. Call NestLensModule.forRoot() once, in the root module; ' +
          'it is global, so feature modules do not import NestLensModule.',
      );
    }
  }

  /**
   * Opens a request context around every request.
   *
   * Middleware rather than an interceptor: it calls into the rest of the
   * request synchronously, so a query or cache read recorded deep inside the
   * handler still knows which request it belongs to. See request-context.ts.
   *
   * Not applied when NestLens is switched off. `forRoot` returns an empty
   * module for `enabled: false`, but this hook belongs to the class rather
   * than to what `forRoot` returned, so it ran anyway: a uuid and an
   * `AsyncLocalStorage.run` on every request of an application that had turned
   * the library off, plus a property written onto every request object.
   */
  configure(consumer: MiddlewareConsumer): void {
    if (!this.config || this.config.enabled === false) {
      return;
    }

    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }

  private static readonly logger = new Logger('NestLens');

  /** Where a previous `forRoot` put the dashboard, if there was one. */
  private static mountedAt?: string;

  static forRoot(config: NestLensConfig = {}): DynamicModule {
    const mergedConfig = this.mergeConfig(config);

    // If disabled, return empty module
    if (mergedConfig.enabled === false) {
      this.logger.warn('NestLens is disabled');
      return {
        module: NestLensModule,
        global: true,
        providers: [
          {
            provide: NESTLENS_CONFIG,
            useValue: mergedConfig,
          },
          { provide: FOR_ROOT_CONFIG, useValue: mergedConfig },
          // Still injectable, and inert: a service written against a watcher's
          // manual API boots, and its calls do nothing.
          ...[...OPT_IN_WATCHERS, NestLensLogger].map((provided) => ({
            provide: provided,
            useFactory: () => new provided(INERT_COLLECTOR, ALL_WATCHERS_OFF),
          })),
        ],
        exports: [...OPT_IN_WATCHERS, NestLensLogger],
      };
    }

    // Given an address of its own, the dashboard is not registered on this
    // application at all. Leaving the controllers here as well and filtering by
    // address later would still put NestLens on the application's socket, where
    // one mistake in front of it publishes everything NestLens has recorded —
    // and a route that exists is a route something can reach. See
    // `DashboardServerConfig`.
    const ownServer = mergedConfig.server;

    // Settles the SPA catch-all's syntax against the adapter Nest was given;
    // see spa-wildcard.ts for why that cannot be decided here.
    const providers: Provider[] = [
      { provide: FOR_ROOT_CONFIG, useValue: mergedConfig },
      ...(ownServer
        ? [{ provide: NESTLENS_SERVER_CONFIG, useValue: ownServer }, NestLensDashboardServer]
        : [NestLensGuard, SpaRouteRegistrar]),
    ];
    // API controllers must be registered before Dashboard to prevent catch-all from overriding API routes
    const controllers = ownServer
      ? []
      : [NestLensApiController, TagController, NestLensStreamController, DashboardController];

    // Applied either way: the dashboard application reads the same metadata, so
    // `path` places the dashboard identically on both arrangements.
    this.mountControllersAt(mergedConfig.path);

    const imports: DynamicModule['imports'] = [
      // Core module provides shared services (config, storage, collector, pruning)
      NestLensCoreModule.forRoot(mergedConfig),
      // The host watchers list every provider of their token through it, so it
      // is here whichever watchers are on.
      DiscoveryModule,
    ];

    // Add Query Watcher module
    if (mergedConfig.watchers?.query !== false) {
      imports.push(NestLensQueryModule.forRoot());
    }

    // Add Request Watcher as global interceptor
    if (mergedConfig.watchers?.request !== false) {
      providers.push(RequestWatcher);
      providers.push({
        provide: APP_INTERCEPTOR,
        useClass: RequestWatcher,
      });
    }

    // Add Exception Watcher as global filter
    if (mergedConfig.watchers?.exception !== false) {
      providers.push(ExceptionWatcher);
      providers.push({
        provide: APP_FILTER,
        useClass: ExceptionWatcher,
      });
    }

    // Add Log Watcher
    // Provided whether or not the log watcher is on. The documentation pairs
    // `enabled: process.env.NODE_ENV !== 'production'` with
    // `app.useLogger(app.get(NestLensLogger))`, so a logger that existed only
    // when it recorded took production down at boot. Off, it prints exactly
    // as the ConsoleLogger it extends and records nothing.
    providers.push(NestLensLogger);

    // Add Schedule Watcher
    if (mergedConfig.watchers?.schedule) {
      imports.push(NestLensScheduleModule.forRoot());
    }

    // Add Alerting (webhook notifications on collected entries)
    if (mergedConfig.alerting?.enabled) {
      providers.push(AlertingService);
    }

    // Every opt-in watcher is provided whether or not it is switched on, and
    // exported. Their manual APIs — `trackCheck`, `setupQueue`,
    // `setupPrismaClient` and the rest — are things an application's service
    // takes in its constructor; providing a watcher only when it was on meant
    // that service stopped booting the day someone wrote `gate: false`. A
    // watcher that is off installs nothing and records nothing.
    providers.push(...OPT_IN_WATCHERS);

    // NOTE: GraphQL Watcher is provided by NestLensCoreModule (global)
    // so it's accessible via moduleRef.get(GraphQLWatcher) from any module

    // Everything exported here is provided above whatever the configuration
    // says, so exporting it can never turn into `UnknownExportException`.
    const exports: Provider[] = [NestLensLogger, ...OPT_IN_WATCHERS];
    // GraphQLWatcher is already exported from NestLensCoreModule (global)

    return {
      module: NestLensModule,
      // Global so a feature module's service can take a watcher without
      // importing NestLensModule a second time.
      global: true,
      imports,
      controllers,
      providers,
      exports,
    };
  }

  /**
   * Applies the configured `path` to the NestLens controllers.
   *
   * Controller prefixes are compile-time metadata, so a runtime-configurable
   * mount point has to be written back onto the classes before Nest's
   * RoutesResolver reads them during `app.init()`. `forRoot()` runs well ahead
   * of that, so rewriting the metadata here is what makes `path` take effect.
   *
   * Every controller — dashboard, API, tags and the SSE stream — moves as one
   * unit, so the whole surface stays reachable under a single prefix.
   */
  private static mountControllersAt(path: string | undefined): void {
    const prefix = toRoutePrefix(path);

    /*
     * Said out loud when a second call moves it.
     *
     * The prefix is metadata on the controller classes, so the last `forRoot`
     * wins — and where two modules each called it, the dashboard silently
     * answered at one path and 404'd at the other:
     *
     *     forRoot({ path: '/first' })  in one module
     *     forRoot({ path: '/second' }) in another   ->  only /second exists
     *
     * `forRoot` belongs in the root module once, which is what this says.
     */
    const mounted = this.mountedAt;
    this.mountedAt = prefix;

    if (mounted !== undefined && mounted !== prefix) {
      this.logger.warn(
        `NestLensModule.forRoot() was called again with a different path: the dashboard moves ` +
          `from "/${mounted}" to "/${prefix}". Call it once, in the root module.`,
      );
    }

    const withPrefix = (suffix: string): string =>
      [prefix, suffix].filter((part) => part.length > 0).join('/');

    const mounts: ReadonlyArray<[object, string]> = [
      [DashboardController, withPrefix('')],
      [NestLensApiController, withPrefix(`${NESTLENS_API_PREFIX}/api`)],
      [TagController, withPrefix(`${NESTLENS_API_PREFIX}/api/tags`)],
      [NestLensStreamController, withPrefix(`${NESTLENS_API_PREFIX}/stream`)],
    ];

    for (const [controller, routePath] of mounts) {
      Reflect.defineMetadata(PATH_METADATA, routePath, controller);
      // NestLens is a debugging surface, not part of the host's public API. Without
      // this, `app.enableVersioning()` would drag the dashboard to /v1/nestlens and
      // move it again on every version bump.
      Reflect.defineMetadata(VERSION_METADATA, VERSION_NEUTRAL, controller);
    }
  }

  private static mergeConfig(input: NestLensConfig): NestLensConfig {
    // A preset is settings, not behaviour: it is folded in first so everything
    // written here overrides it, exactly as a default would.
    const config = applyPreset(withoutUndefined(input));

    return {
      ...DEFAULT_CONFIG,
      ...config,
      storage: {
        ...DEFAULT_CONFIG.storage,
        ...config.storage,
      },
      pruning: {
        ...DEFAULT_CONFIG.pruning,
        ...config.pruning,
      },
      watchers: {
        ...DEFAULT_CONFIG.watchers,
        ...config.watchers,
      },
    };
  }

  async onModuleInit() {
    // forRoot has already said "NestLens is disabled"; a summary after it
    // described a recorder and a dashboard that do not exist.
    if (!this.config || this.config.enabled === false) return;

    // What it is doing, not that it started: three of the four configuration
    // mistakes an application reported are visible in this line.
    NestLensModule.logger.log(startupSummary(this.config));
  }
}
