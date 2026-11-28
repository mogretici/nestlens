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

import { Injectable, Optional, Logger, OnModuleInit } from '@nestjs/common';
import { GraphQLWatcher } from '@/watchers';

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

  // Try to resolve @nestjs/apollo from multiple locations
  // This handles npm link scenarios where the library runs from a different directory
  const resolutionPaths = [
    undefined, // Normal resolution (library's node_modules)
    process.cwd(), // Consuming application's directory
  ];

  for (const basePath of resolutionPaths) {
    try {
      const resolvedPath = basePath
        ? require.resolve('@nestjs/apollo', { paths: [basePath] })
        : require.resolve('@nestjs/apollo');
      const nestApollo = require(resolvedPath) as { Plugin?: PluginDecoratorFactory };
      PluginDecorator = nestApollo.Plugin;
      if (PluginDecorator) break;
    } catch {
      // Continue to next resolution path
    }
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

  constructor(@Optional() private readonly graphqlWatcher?: GraphQLWatcher) {}

  onModuleInit(): void {
    this.ensurePlugin();
  }

  /**
   * The adapter's plugin, set up by whichever hook arrives first.
   *
   * This assumed its own `onModuleInit` ran before Apollo started. Apollo
   * starts inside `GraphQLModule`'s `onModuleInit`; on NestJS 11 and 12 global
   * modules run their hooks first, on 10.4 they do not, and with GraphQLModule
   * imported ahead of NestLensModule `serverWillStart` found no plugin, marked
   * nothing, and the watcher said `waiting` while it recorded. Measured on
   * @nestjs/core 10.4.22.
   */
  private ensurePlugin(): typeof this.plugin {
    if (this.plugin || !this.graphqlWatcher) return this.plugin;

    const adapter = this.graphqlWatcher.ensureAdapter();
    if (adapter?.type !== 'apollo') return null;

    this.plugin = adapter.getPlugin() as {
      requestDidStart?: (requestContext: unknown) => Promise<unknown>;
    };
    this.initialized = true;
    return this.plugin;
  }

  /**
   * Apollo calls this when a server that holds the plugin starts, which is the
   * proof it was registered.
   *
   * It was marked registered in `onModuleInit`, whenever `@apollo/server` was
   * installed — with no `GraphQLModule` to discover the `@Plugin()`, that said
   * a server was recording when none existed, and it made a plugin handed out
   * by `getPlugin()` look like this one.
   */
  async serverWillStart(): Promise<void> {
    if (!this.ensurePlugin()) return;

    this.graphqlWatcher?.markAutoRegistered();
    this.logger.log('Apollo plugin registered: Apollo Server started with it');
  }

  /**
   * Apollo Server plugin entry point.
   * Delegates to the actual plugin's requestDidStart method.
   *
   * This method is called by Apollo Server for each GraphQL request.
   */
  async requestDidStart(requestContext: unknown): Promise<unknown> {
    const plugin = this.ensurePlugin();
    if (!plugin?.requestDidStart) {
      return undefined;
    }

    return plugin.requestDidStart(requestContext);
  }

  /**
   * Check if the plugin is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
