/**
 * NestLens Apollo Plugin Provider
 *
 * This class is decorated with @Plugin() from @nestjs/apollo which enables
 * automatic discovery and registration by NestJS GraphQL module's PluginsExplorerService.
 *
 * The plugin delegates all functionality to the GraphQLWatcher's Apollo adapter.
 *
 * @see https://docs.nestjs.com/graphql/plugins
 */

import {
  Injectable,
  Optional,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { GraphQLWatcher } from '../graphql.watcher';

/**
 * Type for the @Plugin decorator factory from @nestjs/apollo.
 * The decorator is a factory function that returns a ClassDecorator.
 */
type PluginDecoratorFactory = () => ClassDecorator;

/**
 * Dynamically import @Plugin decorator to avoid hard dependency on @nestjs/apollo.
 * If the package is not installed, the decorator will be undefined and we'll skip decoration.
 *
 * We use a module-level variable to cache the result of the dynamic import.
 */
let PluginDecorator: PluginDecoratorFactory | undefined;
let pluginImportAttempted = false;

function getPluginDecorator(): PluginDecoratorFactory | undefined {
  if (pluginImportAttempted) {
    return PluginDecorator;
  }

  pluginImportAttempted = true;

  try {
    // Dynamic require to check if @nestjs/apollo is installed
    // This is the standard pattern for optional peer dependencies
    const nestApollo = require('@nestjs/apollo') as { Plugin?: PluginDecoratorFactory };
    PluginDecorator = nestApollo.Plugin;
  } catch {
    // @nestjs/apollo not installed - auto-registration won't work
    // Users will need to manually integrate the plugin
  }

  return PluginDecorator;
}

/**
 * Dynamic decorator that applies @Plugin() if available.
 * This allows the class to work even when @nestjs/apollo is not installed.
 *
 * The decorator preserves the original class constructor signature.
 */
function applyPluginDecorator(): ClassDecorator {
  return function <TFunction extends Function>(target: TFunction): TFunction {
    const decorator = getPluginDecorator();
    if (decorator) {
      return decorator()(target) as TFunction;
    }
    return target;
  };
}

/**
 * Apollo Server Plugin that auto-registers with NestJS GraphQL module.
 *
 * When @nestjs/apollo is installed, this class is automatically discovered
 * by PluginsExplorerService and registered with Apollo Server.
 *
 * The class implements the ApolloServerPlugin interface by delegating
 * to the actual plugin from GraphQLWatcher's Apollo adapter.
 */
@Injectable()
@applyPluginDecorator()
export class NestLensApolloPlugin implements OnModuleInit {
  private readonly logger = new Logger(NestLensApolloPlugin.name);
  private plugin: {
    requestDidStart?: (requestContext: unknown) => Promise<unknown>;
  } | null = null;
  private initialized = false;

  constructor(
    @Optional() private readonly graphqlWatcher?: GraphQLWatcher,
  ) {}

  /**
   * Initialize the plugin delegation on module init.
   * This happens before Apollo Server starts, so the plugin is ready.
   */
  onModuleInit(): void {
    if (!this.graphqlWatcher) {
      this.logger.debug('GraphQLWatcher not available - skipping auto-registration');
      return;
    }

    const adapter = this.graphqlWatcher.getAdapter();
    if (!adapter) {
      this.logger.debug('GraphQL adapter not initialized - skipping auto-registration');
      return;
    }

    if (adapter.type !== 'apollo') {
      this.logger.debug(`Adapter type is ${adapter.type}, not apollo - skipping`);
      return;
    }

    // Get the actual plugin from the adapter
    this.plugin = adapter.getPlugin() as typeof this.plugin;
    this.initialized = true;

    // Mark as auto-registered
    this.graphqlWatcher.markAutoRegistered();

    this.logger.log('Apollo plugin auto-registered via @Plugin decorator');
  }

  /**
   * Apollo Server plugin entry point.
   * Delegates to the actual plugin's requestDidStart method.
   *
   * This method is called by Apollo Server for each GraphQL request.
   */
  async requestDidStart(requestContext: unknown): Promise<unknown> {
    if (!this.plugin?.requestDidStart) {
      return undefined;
    }

    return this.plugin.requestDidStart(requestContext);
  }

  /**
   * Check if the plugin is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
