/**
 * Base GraphQL Adapter
 *
 * Abstract interface that all GraphQL server adapters must implement.
 */

import { CollectorService } from '@/core';
import { GraphQLPayload } from '@/types';
import { ResolvedGraphQLConfig } from '../types';

/**
 * Callback for when an operation is collected
 */
export type OnOperationCollected = (payload: GraphQLPayload, requestId: string) => void;

/**
 * Abstract base class for GraphQL adapters
 */
export abstract class BaseGraphQLAdapter {
  protected config!: ResolvedGraphQLConfig;
  protected collector!: CollectorService;
  protected onCollect?: OnOperationCollected;

  /**
   * Get the adapter type identifier
   */
  abstract readonly type: 'apollo' | 'mercurius';

  /**
   * Check if this adapter's dependencies are available
   */
  abstract isAvailable(): boolean;

  /**
   * Initialize the adapter with configuration
   */
  initialize(
    config: ResolvedGraphQLConfig,
    collector: CollectorService,
    onCollect?: OnOperationCollected,
  ): void {
    this.config = config;
    this.collector = collector;
    this.onCollect = onCollect;
  }

  /**
   * Get the plugin/hook object to register with the GraphQL server
   */
  abstract getPlugin(): unknown;

  /**
   * Cleanup resources when the adapter is destroyed
   */
  destroy(): void {
    // Override in subclasses if cleanup is needed
  }

  /**
   * Check if an operation should be sampled
   */
  protected shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  /**
   * Check if an operation should be ignored
   */
  protected shouldIgnoreOperation(operationName?: string, query?: string): boolean {
    // Check introspection
    if (this.config.ignoreIntrospection && query) {
      const lowerQuery = query.toLowerCase();
      // Check for introspection fields: __schema and __type (but NOT __typename)
      // __type is followed by ( or whitespace when used as introspection field
      // __typename is a meta-field that Apollo Client adds for caching - should NOT be ignored
      if (
        lowerQuery.includes('__schema') ||
        /\b__type\s*\(/.test(lowerQuery) ||
        /\b__type\s*\{/.test(lowerQuery) ||
        lowerQuery.includes('introspectionquery')
      ) {
        return true;
      }
    }

    // Check ignored operations
    return !!(operationName && this.config.ignoreOperations.includes(operationName));
  }

  /**
   * Collect a GraphQL entry
   */
  protected async collectEntry(payload: GraphQLPayload, requestId: string): Promise<void> {
    // Use the collector to store the entry
    await this.collector.collect('graphql', payload, requestId);

    // Call the optional callback
    if (this.onCollect) {
      this.onCollect(payload, requestId);
    }
  }

  /**
   * Collect a GraphQL entry immediately (bypasses buffering)
   */
  protected async collectEntryImmediate(payload: GraphQLPayload, requestId: string): Promise<void> {
    // Use immediate collection for important entries
    await this.collector.collectImmediate('graphql', payload, requestId);

    // Call the optional callback
    if (this.onCollect) {
      this.onCollect(payload, requestId);
    }
  }

  /**
   * Get the client IP from a request
   */
  protected getClientIp(request: unknown): string | undefined {
    if (!request || typeof request !== 'object') {
      return undefined;
    }

    const req = request as Record<string, unknown>;

    // Check x-forwarded-for header
    const headers = req.headers as Record<string, unknown> | undefined;
    if (headers) {
      const forwarded = headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      if (Array.isArray(forwarded) && forwarded.length > 0) {
        return String(forwarded[0]).trim();
      }
    }

    // Check direct IP properties
    if (typeof req.ip === 'string') {
      return req.ip;
    }

    // Check socket
    const socket = req.socket as Record<string, unknown> | undefined;
    if (socket && typeof socket.remoteAddress === 'string') {
      return socket.remoteAddress;
    }

    return undefined;
  }

  /**
   * Get the user agent from a request
   */
  protected getUserAgent(request: unknown): string | undefined {
    if (!request || typeof request !== 'object') {
      return undefined;
    }

    const req = request as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown> | undefined;

    if (headers && typeof headers['user-agent'] === 'string') {
      return headers['user-agent'];
    }

    return undefined;
  }

  /**
   * Extract user info from a request
   */
  protected extractUser(
    request: unknown,
  ): { id: string | number; name?: string; email?: string } | undefined {
    if (!request || typeof request !== 'object') {
      return undefined;
    }

    const req = request as Record<string, unknown>;
    const user = req.user as Record<string, unknown> | undefined;

    if (!user) {
      return undefined;
    }

    // Try common user ID fields
    const id = user.id ?? user._id ?? user.userId ?? user.sub;
    if (id === undefined || id === null) {
      return undefined;
    }

    return {
      id: id as string | number,
      name: (user.name ?? user.username ?? user.displayName) as string | undefined,
      email: (user.email ?? user.emailAddress) as string | undefined,
    };
  }

  /**
   * Calculate duration in milliseconds from nanoseconds
   */
  protected nsToMs(nanoseconds: bigint): number {
    return Number(nanoseconds) / 1_000_000;
  }
}

/**
 * Factory function type for creating adapters
 */
export type AdapterFactory = () => BaseGraphQLAdapter;

/**
 * Check if a package is available.
 *
 * This function handles npm link scenarios where the library runs from a
 * symlinked directory. It first tries normal resolution, then falls back
 * to resolving from the consuming application's directory (process.cwd()).
 */
export function isPackageAvailable(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    // Normal resolution failed - try from consuming application's directory
    // This handles npm link scenarios where nestlens runs from a different location
    try {
      require.resolve(packageName, { paths: [process.cwd()] });
      return true;
    } catch {
      return false;
    }
  }
}
