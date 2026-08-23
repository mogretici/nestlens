/**
 * GraphQL Watcher
 *
 * Main orchestrator for GraphQL monitoring.
 * Automatically detects and configures the appropriate adapter
 * based on installed packages.
 */

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig, NESTLENS_CONFIG } from '../../nestlens.config';
import { ResolvedGraphQLConfig, resolveGraphQLConfig } from './types';
import { resolveSensitiveParams } from '../../core/data-masker.service';
import { BaseGraphQLAdapter, isPackageAvailable } from './adapters/base.adapter';
import { createApolloAdapter } from './adapters/apollo.adapter';
import { createMercuriusAdapter } from './adapters/mercurius.adapter';
import { instrumentSubscriptions } from './subscription/schema-instrumentation';
import { instrumentFieldResolvers } from './field-instrumentation';
import { MercuriusAdapter } from './adapters/mercurius.adapter';
import {
  SubscriptionTracker,
  createSubscriptionTracker,
} from './subscription/subscription.tracker';

/**
 * Detected GraphQL server type
 */
export type DetectedServer = 'apollo' | 'mercurius' | 'none';

/**
 * GraphQL Watcher Provider Token
 */
export const GRAPHQL_WATCHER = Symbol('GRAPHQL_WATCHER');

/**
 * GraphQL Watcher
 *
 * Manages GraphQL monitoring including:
 * - Server detection and adapter selection
 * - Plugin registration
 * - Subscription tracking
 */
/**
 * Registration mode for GraphQL plugin
 * - 'pending': Not yet registered
 * - 'auto': Registered via the `@Plugin` decorator (Apollo) or onApplicationBootstrap (Mercurius)
 * - 'manual': Registered manually via getPlugin()
 */
export type RegistrationMode = 'pending' | 'auto' | 'manual';

@Injectable()
export class GraphQLWatcher implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GraphQLWatcher.name);
  private config!: ResolvedGraphQLConfig;
  private adapter?: BaseGraphQLAdapter;
  private subscriptionTracker?: SubscriptionTracker;
  private initialized = false;
  private registrationMode: RegistrationMode = 'pending';
  /** Puts the schema's subscription fields back. */
  private restoreSubscriptions?: () => void;
  /** Puts the schema's field resolvers back. */
  private restoreFields?: () => void;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    private readonly moduleRef: ModuleRef,
  ) {
    const watcherConfig = nestlensConfig.watchers?.graphql;
    // The collector's terms travel with the watcher's: this watcher marks what
    // it has sanitised and the collector's masker honours the mark, so the two
    // lists have to be one list. See `mergeSensitiveVariables`.
    this.config = resolveGraphQLConfig(
      watcherConfig,
      resolveSensitiveParams(nestlensConfig.security?.dataMasking?.sensitiveParams),
      nestlensConfig.trustProxy,
    );
  }

  /**
   * Initialize the watcher on module init
   */
  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('GraphQL watcher is disabled');
      return;
    }

    try {
      this.initialize();
    } catch (error) {
      // A watcher that cannot start must not stop the application.
      this.logger.error('Failed to initialize GraphQL watcher', error);
    }

    this.warnIfNothingWillBeRecorded();
  }

  /**
   * Says so when the configuration cannot record what it is asking for.
   *
   * `sampling.always` and an alerting webhook's `events` both default to
   * `['exception']`, and with `recordExceptions` turned off a GraphQL API has
   * no exceptions at all — a resolver's failure lives on its `graphql` entry.
   * A deployment reported exactly this: `rate: 0` with the documented
   * defaults, 2,240 entries recorded, every one a health check, and a webhook
   * that never fired.
   *
   * Only for the configuration that really is blind. With `recordExceptions`
   * on, which is the default, `['exception']` means what it says on GraphQL
   * too and there is nothing to warn about.
   */
  private warnIfNothingWillBeRecorded(): void {
    if (this.config.recordExceptions) return;

    const naming = (events: readonly string[] | undefined): boolean =>
      !!events?.length && events.includes('exception') && !events.includes('graphql');

    const sampling = this.nestlensConfig.sampling;
    const blindSampling = sampling !== undefined && naming(sampling.always ?? ['exception']);
    const blindWebhooks = (this.nestlensConfig.alerting?.webhooks ?? []).some((webhook) =>
      naming(webhook.events ?? ['exception']),
    );

    if (!blindSampling && !blindWebhooks) return;

    this.logger.warn(
      'GraphQL is being watched with `recordExceptions: false`, and ' +
        `${blindSampling && blindWebhooks ? '`sampling.always` and an alerting webhook name' : blindSampling ? '`sampling.always` names' : 'an alerting webhook names'} ` +
        '`exception` without `graphql`. A resolver that throws is recorded on its `graphql` ' +
        'entry, not as an exception, so nothing here will keep or announce it. Either leave ' +
        '`recordExceptions` on, or add `graphql` and narrow it with `filter`.',
    );
  }

  /**
   * Wires subscription tracking, once the schema exists.
   *
   * `GraphQLModule` builds the schema during its own initialisation, so there
   * is nothing to instrument at `onModuleInit`. This runs after every module
   * has started, which is the first moment the schema is there to be read.
   */
  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      return;
    }

    // Mercurius has no per-field hook — Apollo's `willResolveField` has no
    // counterpart — so the resolver count, the N+1 detector and the field
    // tracer are fed from the schema instead. Apollo does not need this and
    // would count everything twice.
    const adapter = this.adapter;
    const needsFieldInstrumentation = adapter instanceof MercuriusAdapter;

    if (!this.subscriptionTracker && !needsFieldInstrumentation) {
      return;
    }

    const schema = this.findSchema();
    if (!schema) {
      this.logger.debug('GraphQL tracking is enabled but no schema was found to instrument.');
      return;
    }

    if (this.subscriptionTracker) {
      this.restoreSubscriptions = instrumentSubscriptions(
        schema,
        this.subscriptionTracker,
        this.nestlensConfig.trustProxy,
      );
      this.logger.log('GraphQL subscription tracking installed');
    }

    if (needsFieldInstrumentation) {
      this.restoreFields = instrumentFieldResolvers(schema, (info, context) =>
        adapter.trackResolver(
          { info } as Parameters<MercuriusAdapter['trackResolver']>[0],
          context as Parameters<MercuriusAdapter['trackResolver']>[1],
        ),
      );
    }
  }

  /**
   * The built schema, from whichever GraphQL integration is present.
   *
   * `@nestjs/graphql` is an optional peer, so it is resolved rather than
   * imported: a project without it must not fail to start because a watcher
   * looked for it.
   */
  private findSchema(): unknown {
    try {
      const { GraphQLSchemaHost } = require('@nestjs/graphql') as {
        GraphQLSchemaHost: new (...args: never[]) => { schema?: unknown };
      };

      const host = this.moduleRef.get(GraphQLSchemaHost, { strict: false });
      return host?.schema;
    } catch {
      return undefined;
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.destroy();
  }

  /**
   * Initialize the GraphQL watcher.
   *
   * There were two of these, one `async` and one not, running the same eight
   * steps — and they had already drifted: the lazy one, reached through
   * `getPlugin()`, returned silently when no GraphQL server was found. A
   * project wiring the plugin by hand against a server NestLens could not
   * detect got an empty plugin object and no reason for it, which presents as
   * "the watcher is on and records nothing". Nothing here awaits, so the one
   * that remains does not pretend to.
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    const serverType = this.config.server === 'auto' ? this.detectServer() : this.config.server;

    if (serverType === 'none' || !serverType) {
      this.logger.warn(
        'No GraphQL server detected. Install @apollo/server or mercurius to enable GraphQL tracking.',
      );
      return;
    }

    this.adapter = this.createAdapter(serverType);

    if (!this.adapter) {
      this.logger.warn(`Failed to create adapter for ${serverType}`);
      return;
    }

    this.adapter.initialize(this.config, this.collector);

    if (this.config.subscriptions.enabled) {
      this.subscriptionTracker = createSubscriptionTracker(this.collector, this.config);
    }

    this.initialized = true;
    this.logger.log(`GraphQL watcher initialized with ${serverType} adapter`);
  }

  /**
   * Detect which GraphQL server is installed
   */
  detectServer(): DetectedServer {
    // Check for Apollo Server
    if (isPackageAvailable('@apollo/server')) {
      this.logger.debug('Detected Apollo Server');
      return 'apollo';
    }

    // Check for Mercurius (Fastify GraphQL)
    if (isPackageAvailable('mercurius')) {
      this.logger.debug('Detected Mercurius');
      return 'mercurius';
    }

    // No GraphQL server found
    return 'none';
  }

  /**
   * Create the appropriate adapter
   */
  private createAdapter(serverType: 'apollo' | 'mercurius'): BaseGraphQLAdapter | undefined {
    switch (serverType) {
      case 'apollo':
        return createApolloAdapter();
      case 'mercurius':
        return createMercuriusAdapter();
      default:
        return undefined;
    }
  }

  /**
   * Get the GraphQL plugin to register with the server
   *
   * For Apollo Server:
   * ```typescript
   * const apolloServer = new ApolloServer({
   *   plugins: [graphqlWatcher.getPlugin()],
   * });
   * ```
   *
   * For Mercurius:
   * ```typescript
   * fastify.register(mercurius, {
   *   hooks: graphqlWatcher.getPlugin(),
   * });
   * ```
   */
  getPlugin(): unknown {
    // Lazy initialization - ensure adapter is created when plugin is requested
    if (!this.adapter && this.config.enabled) {
      this.initialize();
    }

    if (!this.adapter) {
      this.logger.warn('GraphQL adapter not initialized');
      return {};
    }

    return this.adapter.getPlugin();
  }

  /**
   * Get the subscription tracker for WebSocket integration
   */
  getSubscriptionTracker(): SubscriptionTracker | undefined {
    return this.subscriptionTracker;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ResolvedGraphQLConfig {
    return this.config;
  }

  /**
   * Get the active adapter
   */
  getAdapter(): BaseGraphQLAdapter | undefined {
    return this.adapter;
  }

  /**
   * Check if the watcher is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark the plugin as auto-registered.
   * Called by NestLensApolloPlugin or MercuriusAutoRegistrar when auto-registration succeeds.
   */
  markAutoRegistered(): void {
    if (this.registrationMode === 'pending') {
      this.registrationMode = 'auto';
      this.logger.debug('Plugin marked as auto-registered');
    }
  }

  /**
   * Mark the plugin as manually registered.
   * Called when getPlugin() is accessed for manual integration.
   */
  markManuallyRegistered(): void {
    if (this.registrationMode === 'pending') {
      this.registrationMode = 'manual';
      this.logger.debug('Plugin marked as manually registered');
    }
  }

  /**
   * Check if the plugin was auto-registered
   */
  isAutoRegistered(): boolean {
    return this.registrationMode === 'auto';
  }

  /**
   * Get the current registration mode
   */
  getRegistrationMode(): RegistrationMode {
    return this.registrationMode;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.adapter) {
      this.adapter.destroy?.();
      this.adapter = undefined;
    }

    this.restoreSubscriptions?.();
    this.restoreSubscriptions = undefined;

    this.restoreFields?.();
    this.restoreFields = undefined;

    if (this.subscriptionTracker) {
      this.subscriptionTracker.clear();
      this.subscriptionTracker = undefined;
    }

    this.initialized = false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    initialized: boolean;
    adapterType?: string;
    registrationMode: RegistrationMode;
    subscriptions?: {
      totalConnections: number;
      totalSubscriptions: number;
    };
  } {
    const stats: ReturnType<GraphQLWatcher['getStats']> = {
      initialized: this.initialized,
      adapterType: this.adapter?.type,
      registrationMode: this.registrationMode,
    };

    if (this.subscriptionTracker) {
      const subStats = this.subscriptionTracker.getStats();
      stats.subscriptions = {
        totalConnections: subStats.totalConnections,
        totalSubscriptions: subStats.totalSubscriptions,
      };
    }

    return stats;
  }
}
