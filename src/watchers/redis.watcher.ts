import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { RedisWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { RedisEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';

type RedisCommand = (...args: unknown[]) => unknown;

/**
 * Token for injecting Redis client
 */
export const NESTLENS_REDIS_CLIENT = Symbol('NESTLENS_REDIS_CLIENT');

/**
 * Sensitive key patterns that should be masked in results
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'auth',
  'key',
  'credential',
  'session',
];

/**
 * RedisWatcher monitors Redis operations and tracks command execution,
 * performance metrics, and results while masking sensitive data.
 */
@Injectable()
export class RedisWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisWatcher.name);
  private readonly config: RedisWatcherConfig;
  private originalMethods?: Map<string, RedisCommand>;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_REDIS_CLIENT)
    private readonly redisClient?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.redis;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if Redis client was provided
    if (!this.redisClient) {
      this.logger.debug(
        'RedisWatcher: No Redis client found. ' +
          'To enable Redis tracking, inject your Redis client with the NESTLENS_REDIS_CLIENT token.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.redisClient) return;

    this.originalMethods = new Map();

    // Common Redis commands to track
    const commandsToTrack = [
      'get',
      'set',
      'del',
      'exists',
      'expire',
      'ttl',
      'incr',
      'decr',
      'lpush',
      'rpush',
      'lpop',
      'rpop',
      'lrange',
      'hget',
      'hset',
      'hdel',
      'hgetall',
      'sadd',
      'srem',
      'smembers',
      'zadd',
      'zrem',
      'zrange',
      'mget',
      'mset',
    ];

    // The client is user-supplied and its commands are looked up by name, so
    // the shape is checked at runtime rather than declared.
    const client = this.redisClient as Record<string, unknown> | undefined;
    if (!client) return;

    for (const command of commandsToTrack) {
      const existing = client[command];

      // Skip if command doesn't exist or should be ignored
      if (typeof existing !== 'function' || this.config.ignoreCommands?.includes(command)) {
        continue;
      }

      // Store original method
      const original = (existing as RedisCommand).bind(client);
      this.originalMethods.set(command, original);

      // Wrap the command
      client[command] = this.wrapCommand(command, original);
    }

    this.logger.log('Redis interceptors installed');
  }

  /**
   * Puts back what it replaced.
   *
   * The wrappers live on an object the application owns and keeps, so closing
   * the module has to give it back. Otherwise the host goes on calling through
   * a watcher whose collector is gone — and where a process builds the module
   * more than once against the same object, as tests and `nest start --hmr` do,
   * each round wraps the last: one call, one entry per layer.
   */
  onModuleDestroy(): void {
    const client = this.redisClient as Record<string, unknown> | undefined;
    if (!client || !this.originalMethods) {
      return;
    }

    for (const [command, original] of this.originalMethods) {
      client[command] = original;
    }
    this.originalMethods = undefined;
  }

  private wrapCommand(command: string, originalMethod: RedisCommand): RedisCommand {
    return async (...args: unknown[]): Promise<unknown> => {
      const startTime = Date.now();
      let status: 'success' | 'error' = 'success';
      let result: unknown;
      let error: string | undefined;

      try {
        result = await originalMethod(...args);
        return result;
      } catch (err) {
        status = 'error';
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        this.collectEntry(command, args, duration, status, result, error);
      }
    };
  }

  private collectEntry(
    command: string,
    args: unknown[],
    duration: number,
    status: 'success' | 'error',
    result?: unknown,
    error?: string,
  ): void {
    const keyPattern = this.extractKeyPattern(command, args);
    const isSensitive = this.isSensitiveKey(keyPattern);

    const payload: RedisEntry['payload'] = {
      command,
      args: this.captureArgs(args, isSensitive),
      duration,
      keyPattern,
      status,
      result: this.captureResult(result, isSensitive),
      error,
    };

    this.collector.collect('redis', payload);
  }

  /**
   * Extract the key pattern from command arguments
   */
  private extractKeyPattern(command: string, args: unknown[]): string | undefined {
    if (args.length === 0) return undefined;

    const key = args[0];
    if (typeof key !== 'string') return undefined;

    // For multi-key commands
    if (['mget', 'mset', 'del'].includes(command)) {
      return `${command}(${args.length} keys)`;
    }

    return key;
  }

  /**
   * Check if a key contains sensitive information
   */
  private isSensitiveKey(keyPattern?: string): boolean {
    if (!keyPattern) return false;

    const lowerKey = keyPattern.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));
  }

  /**
   * Capture and potentially mask command arguments
   */
  private captureArgs(args: unknown[], isSensitive: boolean): unknown[] {
    if (isSensitive) {
      return args.map((arg, index) => {
        // Keep the key visible but mask values
        if (index === 0 && typeof arg === 'string') {
          return arg; // Keep key visible
        }
        return '***MASKED***';
      });
    }

    try {
      // Limit size to prevent huge arguments from bloating storage
      const json = JSON.stringify(args);
      const maxSize = this.config.maxResultSize ?? 1024; // 1KB default; 0 captures nothing
      if (json.length > maxSize) {
        return [{ _truncated: true, _size: json.length }];
      }
      return args;
    } catch {
      return [{ _error: 'Unable to serialize arguments' }];
    }
  }

  /**
   * Capture and potentially mask result data
   */
  private captureResult(result: unknown, isSensitive: boolean): unknown {
    if (result === undefined || result === null) return undefined;

    if (isSensitive) {
      return '***MASKED***';
    }

    try {
      // Limit size to prevent huge results from bloating storage
      const json = JSON.stringify(result);
      const maxSize = this.config.maxResultSize ?? 1024; // 1KB default; 0 captures nothing
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return result;
    } catch {
      return { _error: 'Unable to serialize result' };
    }
  }
}
