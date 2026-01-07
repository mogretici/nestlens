/**
 * GraphQL Watcher
 *
 * Main orchestrator for GraphQL monitoring.
 * Automatically detects and configures the appropriate adapter
 * based on installed packages.
 */

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig, NESTLENS_CONFIG } from '../../nestlens.config';
import {
  ResolvedGraphQLConfig,
  resolveGraphQLConfig,
} from './types';
import {
  BaseGraphQLAdapter,
  isPackageAvailable,
} from './adapters/base.adapter';
import { ApolloAdapter, createApolloAdapter } from './adapters/apollo.adapter';
import { MercuriusAdapter, createMercuriusAdapter } from './adapters/mercurius.adapter';
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
 * - 'auto': Registered via @Plugin decorator (Apollo) or onApplicationBootstrap (Mercurius)
 * - 'manual': Registered manually via getPlugin()
 */
export type RegistrationMode = 'pending' | 'auto' | 'manual';

@Injectable()
export class GraphQLWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphQLWatcher.name);
  private config!: ResolvedGraphQLConfig;
  private adapter?: BaseGraphQLAdapter;
  private subscriptionTracker?: SubscriptionTracker;
  private initialized = false;
  private registrationMode: RegistrationMode = 'pending';

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.graphql;
    this.config = resolveGraphQLConfig(watcherConfig);
  }

  /**
   * Initialize the watcher on module init
   */
  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('GraphQL watcher is disabled');
      return;
    }

    try {
      await this.initialize();
    } catch (error) {
      this.logger.error('Failed to initialize GraphQL watcher', error);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    this.destroy();
  }

  /**
   * Initialize the GraphQL watcher
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Detect server if auto
    const serverType = this.config.server === 'auto'
      ? this.detectServer()
      : this.config.server;

    if (serverType === 'none' || !serverType) {
      this.logger.warn(
        'No GraphQL server detected. Install @apollo/server or mercurius to enable GraphQL tracking.',
      );
      return;
    }

    // Create adapter
    this.adapter = this.createAdapter(serverType);

    if (!this.adapter) {
      this.logger.warn(`Failed to create adapter for ${serverType}`);
      return;
    }

    // Initialize adapter
    this.adapter.initialize(this.config, this.collector);

    // Create subscription tracker
    if (this.config.subscriptions.enabled) {
      this.subscriptionTracker = createSubscriptionTracker(
        this.collector,
        this.config,
      );
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
      this.initializeSync();
    }

    if (!this.adapter) {
      this.logger.warn('GraphQL adapter not initialized');
      return {};
    }

    return this.adapter.getPlugin();
  }

  /**
   * Synchronous initialization for lazy plugin creation
   */
  private initializeSync(): void {
    if (this.initialized) {
      return;
    }

    // Detect server if auto
    const serverType = this.config.server === 'auto'
      ? this.detectServer()
      : this.config.server;

    if (serverType === 'none' || !serverType) {
      return;
    }

    // Create adapter
    this.adapter = this.createAdapter(serverType);

    if (!this.adapter) {
      return;
    }

    // Initialize adapter
    this.adapter.initialize(this.config, this.collector);

    // Create subscription tracker
    if (this.config.subscriptions.enabled) {
      this.subscriptionTracker = createSubscriptionTracker(
        this.collector,
        this.config,
      );
    }

    this.initialized = true;
    this.logger.log(`GraphQL watcher initialized with ${serverType} adapter`);
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

/**
 * Factory function for creating a GraphQL watcher
 */
export function createGraphQLWatcher(
  collector: CollectorService,
  config: NestLensConfig,
): GraphQLWatcher {
  return new GraphQLWatcher(collector, config);
}
