import {
  DynamicModule,
  Global,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
  Provider,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { DEFAULT_CONFIG, NestLensConfig, NESTLENS_CONFIG } from './nestlens.config';
import { CollectorService } from './core/collector.service';
import { PruningService } from './core/pruning.service';
import { TagService } from './core/tag.service';
import { FamilyHashService } from './core/family-hash.service';
import { STORAGE } from './core/storage';
import { createStorage } from './core/storage/storage.factory';
import { NestLensApiController, DashboardController, NestLensGuard, TagController } from './api';
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
      TagService,
      FamilyHashService,
      CollectorService,
      PruningService,
    ];

    const exports: (
      | Provider
      | symbol
      | typeof TagService
      | typeof FamilyHashService
      | typeof CollectorService
      | typeof PruningService
      | typeof GraphQLWatcher
    )[] = [
      NESTLENS_CONFIG,
      STORAGE,
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
      providers: [QueryWatcher],
      exports: [QueryWatcher],
    };
  }
}

@Module({})
export class NestLensModule implements NestModule, OnModuleInit {
  private static readonly logger = new Logger('NestLens');

  static forRoot(config: NestLensConfig = {}): DynamicModule {
    const mergedConfig = this.mergeConfig(config);

    // If disabled, return empty module
    if (mergedConfig.enabled === false) {
      this.logger.warn('NestLens is disabled');
      return {
        module: NestLensModule,
        providers: [
          {
            provide: NESTLENS_CONFIG,
            useValue: mergedConfig,
          },
        ],
      };
    }

    const providers: Provider[] = [NestLensGuard];
    // API controllers must be registered before Dashboard to prevent catch-all from overriding API routes
    const controllers = [NestLensApiController, TagController, DashboardController];

    const imports: DynamicModule['imports'] = [
      // Core module provides shared services (config, storage, collector, pruning)
      NestLensCoreModule.forRoot(mergedConfig),
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
    if (mergedConfig.watchers?.log !== false) {
      providers.push(NestLensLogger);
    }

    // Add HTTP Client Watcher
    if (mergedConfig.watchers?.httpClient) {
      providers.push(HttpClientWatcher);
    }

    // Add Cache Watcher
    if (mergedConfig.watchers?.cache) {
      providers.push(CacheWatcher);
    }

    // Add Event Watcher
    if (mergedConfig.watchers?.event) {
      providers.push(EventWatcher);
    }

    // Add Job Watcher
    if (mergedConfig.watchers?.job) {
      providers.push(JobWatcher);
    }

    // Add Schedule Watcher
    if (mergedConfig.watchers?.schedule) {
      providers.push(ScheduleWatcher);
    }

    // Add Mail Watcher
    if (mergedConfig.watchers?.mail) {
      providers.push(MailWatcher);
    }

    // Add Redis Watcher
    if (mergedConfig.watchers?.redis) {
      providers.push(RedisWatcher);
    }

    // Add Model Watcher
    if (mergedConfig.watchers?.model) {
      providers.push(ModelWatcher);
    }

    // Add Notification Watcher
    if (mergedConfig.watchers?.notification) {
      providers.push(NotificationWatcher);
    }

    // Add View Watcher
    if (mergedConfig.watchers?.view) {
      providers.push(ViewWatcher);
    }

    // Add Command Watcher
    if (mergedConfig.watchers?.command) {
      providers.push(CommandWatcher);
    }

    // Add Gate Watcher
    if (mergedConfig.watchers?.gate) {
      providers.push(GateWatcher);
    }

    // Add Batch Watcher
    if (mergedConfig.watchers?.batch) {
      providers.push(BatchWatcher);
    }

    // Add Dump Watcher
    if (mergedConfig.watchers?.dump) {
      providers.push(DumpWatcher);
    }

    // NOTE: GraphQL Watcher is provided by NestLensCoreModule (global)
    // so it's accessible via moduleRef.get(GraphQLWatcher) from any module

    // Build exports list - only export what's actually provided
    const exports: Provider[] = [NestLensLogger];
    // GraphQLWatcher is already exported from NestLensCoreModule (global)

    return {
      module: NestLensModule,
      imports,
      controllers,
      providers,
      exports,
    };
  }

  private static mergeConfig(config: NestLensConfig): NestLensConfig {
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

  configure(consumer: MiddlewareConsumer) {
    // Middleware configuration if needed
  }

  async onModuleInit() {
    NestLensModule.logger.log('NestLens initialized');
  }
}
