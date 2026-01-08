import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { CacheWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { CacheEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cache = any;

// Try to import CACHE_MANAGER, but make it optional
let CACHE_MANAGER: string | symbol = 'CACHE_MANAGER';
try {
  const cacheManager = require('@nestjs/cache-manager');
  CACHE_MANAGER = cacheManager.CACHE_MANAGER;
} catch {
  // Module not installed, use string fallback
}

@Injectable()
export class CacheWatcher implements OnModuleInit {
  private readonly logger = new Logger(CacheWatcher.name);
  private readonly config: CacheWatcherConfig;
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
    private readonly cacheManager?: Cache,
  ) {
    const watcherConfig = nestlensConfig.watchers?.cache;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
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

  private setupInterceptors(): void {
    if (!this.cacheManager) return;

    // Store original methods
    this.originalMethods = {
      get: this.cacheManager.get?.bind(this.cacheManager),
      set: this.cacheManager.set?.bind(this.cacheManager),
      del: this.cacheManager.del?.bind(this.cacheManager),
      reset: this.cacheManager.reset?.bind(this.cacheManager),
    };

    // Wrap get method
    if (this.originalMethods.get) {
      this.cacheManager.get = async (key: string): Promise<unknown> => {
        const startTime = Date.now();
        let hit = false;
        let value: unknown;

        try {
          value = await this.originalMethods!.get!(key);
          hit = value !== undefined && value !== null;
          return value;
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('get', key, hit, duration, value);
        }
      };
    }

    // Wrap set method
    if (this.originalMethods.set) {
      this.cacheManager.set = async (key: string, value: unknown, ttl?: number): Promise<void> => {
        const startTime = Date.now();

        try {
          return await this.originalMethods!.set!(key, value, ttl);
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('set', key, undefined, duration, value, ttl);
        }
      };
    }

    // Wrap del method
    if (this.originalMethods.del) {
      this.cacheManager.del = async (key: string): Promise<void> => {
        const startTime = Date.now();

        try {
          return await this.originalMethods!.del!(key);
        } finally {
          const duration = Date.now() - startTime;
          this.collectEntry('del', key, undefined, duration);
        }
      };
    }

    // Wrap reset method (clear all)
    if (this.originalMethods.reset) {
      this.cacheManager.reset = async (): Promise<void> => {
        const startTime = Date.now();

        try {
          return await this.originalMethods!.reset!();
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
    if (value === undefined || value === null) return undefined;

    try {
      // Limit size to prevent huge cache values from bloating storage
      const json = JSON.stringify(value);
      const maxSize = 1024; // 1KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return value;
    } catch {
      return { _error: 'Unable to serialize value' };
    }
  }
}
