import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import {
  RedisWatcherConfig,
  NestLensConfig,
  NESTLENS_CONFIG,
} from '../nestlens.config';
import { RedisEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

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
export class RedisWatcher implements OnModuleInit {
  private readonly logger = new Logger(RedisWatcher.name);
  private readonly config: RedisWatcherConfig;
  private originalMethods?: Map<string, Function>;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_REDIS_CLIENT)
    private readonly redisClient?: RedisClient,
  ) {
    const watcherConfig = nestlensConfig.watchers?.redis;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false };
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

    for (const command of commandsToTrack) {
      // Skip if command doesn't exist or should be ignored
      if (
        !this.redisClient[command] ||
        this.config.ignoreCommands?.includes(command)
      ) {
        continue;
      }

      // Store original method
      this.originalMethods.set(
        command,
        this.redisClient[command].bind(this.redisClient),
      );

      // Wrap the command
      this.redisClient[command] = this.wrapCommand(
        command,
        this.originalMethods.get(command)!,
      );
    }

    this.logger.log('Redis interceptors installed');
  }

  private wrapCommand(command: string, originalMethod: Function): Function {
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
    return SENSITIVE_KEY_PATTERNS.some((pattern) =>
      lowerKey.includes(pattern),
    );
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
      const maxSize = this.config.maxResultSize || 1024; // 1KB default
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
      const maxSize = this.config.maxResultSize || 1024; // 1KB default
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return result;
    } catch {
      return { _error: 'Unable to serialize result' };
    }
  }
}
