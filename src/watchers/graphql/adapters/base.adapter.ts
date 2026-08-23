/**
 * Base GraphQL Adapter
 *
 * Abstract interface that all GraphQL server adapters must implement.
 */

import { AddressableRequest, resolveClientIp } from '@/core/client-ip';
import { CollectorService } from '@/core';
import { GraphQLPayload, MAX_RECORDED_ERRORS } from '@/types';
import { ResolvedGraphQLConfig } from '../types';
import { selectsIntrospection } from '../utils/query-parser';
import { assignKey } from '../../../core/safe-assign';

/** What an error from either server carries, of which four parts are read. */
export interface GraphQLErrorLike {
  message?: string;
  path?: readonly (string | number)[];
  originalError?: unknown;
}

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
    if (this.config.ignoreIntrospection && query && selectsIntrospection(query)) {
      return true;
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
   * Also records what a failed operation threw, as an exception.
   *
   * A failed HTTP request produces two entries — the `request` and the
   * `exception` the handler threw — and a failed GraphQL operation produced
   * only the operation. Everything downstream of "an exception happened" was
   * therefore empty on a GraphQL API by construction, whatever the application
   * did: the Exceptions page, `stats.unresolvedExceptions`, the resolve
   * workflow, `sampling.always: ['exception']` (the default) and an alerting
   * webhook on `events: ['exception']` (also the default).
   *
   * Reported by an application running this in production: 2,240 entries
   * recorded, every one a health check, `exceptions: 0` — and eight
   * deliberately broken queries produced four `graphql` entries with
   * `hasErrors: true` while the exception count stayed at zero. Nothing warned;
   * the configuration was the documented one.
   *
   * One entry per error, sharing the operation's request id so the two sit
   * together on the detail page. `originalError` is what the resolver threw,
   * so its name and stack are the useful ones; a validation error has no
   * original and is recorded as what GraphQL reported.
   */
  protected async recordErrors(
    errors: readonly GraphQLErrorLike[] | undefined,
    operation: {
      name?: string;
      type?: string;
      requestId: string;
      /**
       * What each field threw, by path, where the server does not carry it on
       * the error. Mercurius formats its errors before any hook sees them.
       */
      thrown?: Map<string, unknown>;
    },
  ): Promise<void> {
    if (!this.config.recordExceptions || !errors?.length) return;

    for (const error of errors.slice(0, MAX_RECORDED_ERRORS)) {
      const path = error.path?.length ? error.path.join('.') : undefined;
      const original = error.originalError ?? (path ? operation.thrown?.get(path) : undefined);
      const thrown = original instanceof Error ? original : undefined;

      // Only what the application threw.
      //
      // A document that does not parse, or names a field the schema does not
      // have, never reaches a resolver: nobody threw, and the caller made the
      // mistake. Recording those as exceptions would put a stranger's typo on
      // the Exceptions page — and, since an alerting webhook's default is
      // `events: ['exception']`, would let anyone with curl page whoever is on
      // call. They are on the operation entry either way, with its 400.
      if (!thrown) continue;

      await this.collector.collectImmediate(
        'exception',
        {
          name: thrown.name,
          message: error.message ?? thrown.message,
          stack: thrown.stack,
          // Where it happened, in the terms a GraphQL reader thinks in: the
          // operation, and the field path the error carries.
          context: ['GraphQL', operation.type, operation.name, path].filter(Boolean).join(' '),
        },
        operation.requestId,
      );
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
  /**
   * The client's address, by the same rule the guard authorizes with.
   *
   * This used to read `X-Forwarded-For` whatever the configuration said, so a
   * GraphQL operation was recorded against whatever address its caller typed
   * into a header. See `resolveClientIp`.
   */
  protected getClientIp(request: unknown): string | undefined {
    if (!request || typeof request !== 'object') {
      return undefined;
    }

    return resolveClientIp(request as unknown as AddressableRequest, this.config?.trustProxy);
  }

  /**
   * Capture request headers with sensitive values masked
   */
  protected captureRequestHeaders(request: unknown): Record<string, string> | undefined {
    if (!this.config.captureHeaders || !request || typeof request !== 'object') {
      return undefined;
    }

    const req = request as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown> | undefined;

    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    const result = this.maskHeaders(headers);
    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Mask sensitive header values
   */
  protected maskHeaders(headers: Record<string, unknown>): Record<string, string> {
    const sensitiveHeaders = this.config.sensitiveHeaders.map((h) => h.toLowerCase());
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        assignKey(result, key, '***');
      } else if (typeof value === 'string') {
        assignKey(result, key, value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        assignKey(result, key, String(value));
      } else if (Array.isArray(value)) {
        assignKey(result, key, value.join(', '));
      }
    }

    return result;
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
