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

    // Wrap get method
    const originalGet = this.originalMethods.get;
    if (originalGet) {
      this.cacheManager.get = async (key: string): Promise<unknown> => {
        const startTime = Date.now();
        let hit = false;
        let value: unknown;

        try {
          value = await originalGet(key);
          hit = value !== undefined && value !== null;
          return value;
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('get', key, hit, duration, value);
        }
      };
    }

    // Wrap set method
    const originalSet = this.originalMethods.set;
    if (originalSet) {
      this.cacheManager.set = async (key: string, value: unknown, ttl?: number): Promise<void> => {
        const startTime = Date.now();

        try {
          return await originalSet(key, value, ttl);
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('set', key, undefined, duration, value, ttl);
        }
      };
    }

    // Wrap del method
    const originalDel = this.originalMethods.del;
    if (originalDel) {
      this.cacheManager.del = async (key: string): Promise<void> => {
        const startTime = Date.now();

        try {
          return await originalDel(key);
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('del', key, undefined, duration);
        }
      };
    }

    // Wrap reset method (clear all)
    const originalReset = this.originalMethods.reset;
    if (originalReset) {
      this.cacheManager.reset = async (): Promise<void> => {
        const startTime = Date.now();

        try {
          return await originalReset();
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('clear', '*', undefined, duration);
        }
      };
    }

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
