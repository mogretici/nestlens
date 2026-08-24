import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { CacheWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { CacheEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { capturePayload } from './capture-payload';
import { MethodOutcome, wrapMethodPreservingShape } from './wrap-method';

/**
 * The cache-manager surface this watcher touches. Every method is optional
 * because the store decides which ones exist, and cache-manager v5 dropped
 * `reset()`.
 */
interface CacheLike {
  get?: (key: string) => Promise<unknown>;
  set?: (key: string, value: unknown, ttl?: number) => Promise<void>;
  del?: (key: string) => Promise<void>;
  reset?: () => Promise<void>;
}

// Try to import CACHE_MANAGER, but make it optional
let CACHE_MANAGER: string | symbol = 'CACHE_MANAGER';
try {
  const cacheManager = require('@nestjs/cache-manager');
  CACHE_MANAGER = cacheManager.CACHE_MANAGER;
} catch {
  // Module not installed, use string fallback
}

@Injectable()
export class CacheWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheWatcher.name);
  private readonly config: CacheWatcherConfig;
  private methodsBeforeWrapping?: Record<string, unknown>;
  private originalMethods?: {
    get?: (key: string) => Promise<unknown>;
    set?: (key: string, value: unknown, ttl?: number) => Promise<void>;
    del?: (key: string) => Promise<void>;
    reset?: () => Promise<void>;
  };

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(CACHE_MANAGER)
    private readonly cacheManager?: CacheLike,
  ) {
    const watcherConfig = nestlensConfig.watchers?.cache;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if cache manager was provided
    if (!this.cacheManager) {
      this.logger.debug(
        'CacheWatcher: No cache manager found. ' +
          'To enable cache tracking, install and configure @nestjs/cache-manager.',
      );
      return;
    }

    this.setupInterceptors();
  }

  /**
   * Puts the cache manager back the way it was found.
   *
   * The wrappers live on an object the application owns and keeps, so closing
   * the module has to give it back. Otherwise the host goes on calling through
   * a watcher whose collector is gone — and where a process builds the module
   * more than once against the same object, as tests and `nest start --hmr` do,
   * each round wraps the last: one call, one entry per layer.
   */
  onModuleDestroy(): void {
    if (!this.cacheManager || !this.methodsBeforeWrapping) {
      return;
    }

    const manager = this.cacheManager as unknown as Record<string, unknown>;
    for (const [name, original] of Object.entries(this.methodsBeforeWrapping ?? {})) {
      if (original !== undefined) manager[name] = original;
    }

    this.methodsBeforeWrapping = undefined;
    this.originalMethods = undefined;
  }

  private setupInterceptors(): void {
    if (!this.cacheManager) return;

    // Kept exactly as found, for putting back: the bound copies below are what
    // the wrappers call, and assigning those back would hand the application
    // different function objects than the ones it had.
    const manager = this.cacheManager as unknown as Record<string, unknown>;
    this.methodsBeforeWrapping = {
      get: manager.get,
      set: manager.set,
      del: manager.del,
      reset: manager.reset,
    };

    // Store original methods
    this.originalMethods = {
      get: this.cacheManager.get?.bind(this.cacheManager),
      set: this.cacheManager.set?.bind(this.cacheManager),
      del: this.cacheManager.del?.bind(this.cacheManager),
      reset: this.cacheManager.reset?.bind(this.cacheManager),
    };

    // Wrapped so a caller gets back exactly what it did before.
    //
    // These were `async`, which turns a synchronous method into one that
    // returns a promise. `@nestjs/cache-manager` is asynchronous by contract,
    // but the object under `CACHE_MANAGER` is whatever the application
    // provided — and a store with a synchronous `get` handed every caller a
    // promise instead of a value the moment this watcher was enabled:
    // `const cached = cache.get(key); if (cached) ...` then took the cached
    // branch always, because a promise is always truthy. The same shape took
    // an authorization service down once; the helper exists for it.
    const wrap = <T extends (...args: never[]) => unknown>(
      original: T | undefined,
      record: (outcome: MethodOutcome) => void,
    ): T | undefined => (original ? wrapMethodPreservingShape(original, record) : undefined);

    const get = wrap(this.originalMethods.get, ({ args, result, durationMs }) => {
      const hit = result !== undefined && result !== null;
      this.collectEntry('get', String(args[0]), hit, durationMs, result);
    });
    if (get) manager.get = get;

    const set = wrap(this.originalMethods.set, ({ args, durationMs }) => {
      this.collectEntry(
        'set',
        String(args[0]),
        undefined,
        durationMs,
        args[1],
        args[2] as number | undefined,
      );
    });
    if (set) manager.set = set;

    const del = wrap(this.originalMethods.del, ({ args, durationMs }) => {
      this.collectEntry('del', String(args[0]), undefined, durationMs);
    });
    if (del) manager.del = del;

    const reset = wrap(this.originalMethods.reset, ({ durationMs }) => {
      this.collectEntry('clear', '*', undefined, durationMs);
    });
    if (reset) manager.reset = reset;

    this.logger.log('Cache interceptors installed');
  }

  private collectEntry(
    operation: 'get' | 'set' | 'del' | 'clear',
    key: string,
    hit?: boolean,
    duration: number = 0,
    value?: unknown,
    ttl?: number,
  ): void {
    const payload: CacheEntry['payload'] = {
      operation,
      key,
      hit,
      value: this.captureValue(value),
      ttl,
      duration,
    };

    this.collector.collect('cache', payload);
  }

  private captureValue(value: unknown): unknown {
    return capturePayload(value, 1024);
  }
}
