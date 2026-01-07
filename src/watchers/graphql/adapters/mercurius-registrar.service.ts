/**
 * NestLens Mercurius Auto-Registrar Service
 *
 * This service automatically registers GraphQL hooks with Mercurius/Fastify
 * during application bootstrap, enabling zero-config GraphQL monitoring.
 *
 * Unlike Apollo's @Plugin decorator approach, Mercurius requires imperative
 * hook registration via fastify.graphql.addHook() after the server is ready.
 *
 * @see https://mercurius.dev/#/docs/hooks
 */

import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { GraphQLWatcher } from '../graphql.watcher';

/**
 * Mercurius hook types that can be registered.
 * Each hook is called at different stages of GraphQL execution.
 */
type MercuriusHookType =
  | 'preParsing'
  | 'preValidation'
  | 'preExecution'
  | 'onResolution'
  | 'preSubscriptionParsing'
  | 'preSubscriptionExecution'
  | 'onSubscriptionResolution'
  | 'onSubscriptionEnd';

/**
 * Shape of the hooks object returned by Mercurius adapter's getPlugin()
 */
interface MercuriusHooks {
  preParsing?: (...args: unknown[]) => Promise<void>;
  preValidation?: (...args: unknown[]) => Promise<void>;
  preExecution?: (...args: unknown[]) => Promise<void>;
  onResolution?: (...args: unknown[]) => Promise<void>;
  preSubscriptionParsing?: (...args: unknown[]) => Promise<void>;
  preSubscriptionExecution?: (...args: unknown[]) => Promise<void>;
  onSubscriptionResolution?: (...args: unknown[]) => Promise<void>;
  onSubscriptionEnd?: (...args: unknown[]) => Promise<void>;
}

/**
 * Fastify instance with Mercurius GraphQL extension
 */
interface FastifyWithGraphQL {
  ready: () => Promise<void>;
  graphql?: {
    addHook: (hookType: MercuriusHookType, hook: (...args: unknown[]) => Promise<void>) => void;
  };
}

/**
 * Auto-registrar service for Mercurius GraphQL hooks.
 *
 * This service implements OnApplicationBootstrap to hook into NestJS lifecycle
 * after all modules are initialized but before the application starts listening.
 * At this point, Mercurius has registered itself with Fastify, so we can
 * access fastify.graphql.addHook() to register our monitoring hooks.
 */
@Injectable()
export class MercuriusAutoRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MercuriusAutoRegistrar.name);

  constructor(
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
    @Optional() private readonly graphqlWatcher?: GraphQLWatcher,
  ) {}

  /**
   * Called after all modules are initialized.
   * Registers Mercurius hooks if the adapter type is 'mercurius'.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Skip if GraphQLWatcher is not available
    if (!this.graphqlWatcher) {
      this.logger.debug('GraphQLWatcher not available - skipping auto-registration');
      return;
    }

    // Skip if adapter is not mercurius type
    const adapter = this.graphqlWatcher.getAdapter();
    if (!adapter) {
      this.logger.debug('GraphQL adapter not initialized - skipping auto-registration');
      return;
    }

    if (adapter.type !== 'mercurius') {
      this.logger.debug(`Adapter type is ${adapter.type}, not mercurius - skipping`);
      return;
    }

    // Get Fastify instance from HttpAdapterHost
    const fastify = this.getFastifyInstance();
    if (!fastify) {
      this.logger.warn(
        'Could not access Fastify instance. ' +
        'Mercurius auto-registration requires Fastify adapter. ' +
        'See: https://github.com/mogretici/nestlens#graphql-manual-setup'
      );
      return;
    }

    // Wait for Fastify to be ready (Mercurius registers during this phase)
    try {
      await fastify.ready();
    } catch (error) {
      this.logger.warn(
        `Fastify ready() failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'Skipping Mercurius auto-registration.'
      );
      return;
    }

    // Check if Mercurius is registered
    if (!fastify.graphql) {
      this.logger.warn(
        'Mercurius GraphQL not found on Fastify instance. ' +
        'Ensure Mercurius is properly configured. ' +
        'See: https://github.com/mogretici/nestlens#graphql-manual-setup'
      );
      return;
    }

    // Get hooks from the adapter
    const hooks = adapter.getPlugin() as MercuriusHooks;
    if (!hooks) {
      this.logger.debug('No hooks returned from Mercurius adapter');
      return;
    }

    // Register each available hook
    const hookTypes: MercuriusHookType[] = [
      'preParsing',
      'preValidation',
      'preExecution',
      'onResolution',
      'preSubscriptionParsing',
      'preSubscriptionExecution',
      'onSubscriptionResolution',
      'onSubscriptionEnd',
    ];

    let registeredCount = 0;
    for (const hookType of hookTypes) {
      const hook = hooks[hookType];
      if (hook && typeof hook === 'function') {
        try {
          fastify.graphql.addHook(hookType, hook);
          registeredCount++;
          this.logger.debug(`Registered Mercurius hook: ${hookType}`);
        } catch (error) {
          this.logger.warn(
            `Failed to register Mercurius hook '${hookType}': ` +
            `${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    if (registeredCount > 0) {
      // Mark as auto-registered
      this.graphqlWatcher.markAutoRegistered();
      this.logger.log(`Mercurius hooks auto-registered (${registeredCount} hooks)`);
    } else {
      this.logger.debug('No Mercurius hooks to register');
    }
  }

  /**
   * Extract the Fastify instance from HttpAdapterHost.
   * Returns undefined if not using Fastify adapter.
   */
  private getFastifyInstance(): FastifyWithGraphQL | undefined {
    if (!this.httpAdapterHost?.httpAdapter) {
      return undefined;
    }

    try {
      // Get the underlying HTTP server instance
      const instance = this.httpAdapterHost.httpAdapter.getInstance?.();

      // Check if it's a Fastify instance (has 'ready' method)
      if (instance && typeof instance.ready === 'function') {
        return instance as FastifyWithGraphQL;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}
