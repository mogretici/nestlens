import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig, NESTLENS_CONFIG, QueryWatcherConfig } from '../../nestlens.config';
import { QueryEntry } from '../../types';
import {
  isLikelyTypeORMDataSource,
  isModuleAvailable,
  isPrismaClient,
  PrismaClient,
  PrismaMiddlewareParams,
  TypeORMDataSourceLike,
  TypeORMLoggerLike,
} from './types';
import { NestLensQuerySubscriber } from './typeorm-subscriber';
import { NestLensTypeOrmLogger } from './typeorm-logger';

export interface QueryData {
  query: string;
  parameters?: unknown[];
  duration: number;
  source: string;
  connection?: string;
  requestId?: string;
  success?: boolean;
  error?: unknown;
}

const TYPEORM_ATTACHED = Symbol.for('nestlens:typeorm-query-watcher-attached');

@Injectable()
export class QueryWatcher implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueryWatcher.name);
  private readonly config: QueryWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    private readonly discoveryService: DiscoveryService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.query;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false, slowThreshold: 100 };
  }

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      return;
    }

    if (isModuleAvailable('typeorm')) {
      this.attachTypeORM();
    }

    if (isModuleAvailable('@prisma/client')) {
      this.attachPrisma();
    }
  }

  private attachTypeORM(): void {
    try {
      const dataSources = this.discoverTypeORMDataSources();
      let attached = 0;
      for (const ds of dataSources) {
        if (this.attachToDataSource(ds)) {
          attached++;
        }
      }
      if (attached > 0) {
        this.logger.log(`TypeORM query watcher attached to ${attached} DataSource(s)`);
      }
    } catch (error) {
      this.logger.debug(`TypeORM attach skipped: ${String(error)}`);
    }
  }

  private discoverTypeORMDataSources(): TypeORMDataSourceLike[] {
    const seen = new WeakSet<object>();
    const out: TypeORMDataSourceLike[] = [];
    for (const wrapper of this.discoveryService.getProviders()) {
      const instance = wrapper.instance as unknown;
      if (
        instance &&
        typeof instance === 'object' &&
        !seen.has(instance as object) &&
        isLikelyTypeORMDataSource(instance)
      ) {
        seen.add(instance as object);
        out.push(instance);
      }
    }
    return out;
  }

  private attachToDataSource(ds: TypeORMDataSourceLike): boolean {
    const marked = ds as unknown as Record<symbol, boolean | undefined>;
    if (marked[TYPEORM_ATTACHED]) return false;
    marked[TYPEORM_ATTACHED] = true;

    const connectionName = ds.options?.name ?? 'default';

    const subscriber = new NestLensQuerySubscriber(
      (data) => this.handleQuery(data),
      connectionName,
    );
    if (Array.isArray(ds.subscribers)) {
      ds.subscribers.push(subscriber as unknown);
    }

    const original = ds.logger;
    const wrapped = new NestLensTypeOrmLogger(
      (data) => this.handleQuery(data),
      connectionName,
      original,
    );
    try {
      (ds as { logger: TypeORMLoggerLike }).logger = wrapped;
    } catch {
      // Some DataSource implementations expose logger via a getter only.
      // Subscriber alone still covers the success path in that case.
    }

    return true;
  }

  private attachPrisma(): void {
    try {
      const globalPrisma = (global as Record<string, unknown>)['prisma'];
      if (isPrismaClient(globalPrisma)) {
        this.attachPrismaMiddleware(globalPrisma);
        this.logger.log('Prisma query watcher attached (global instance)');
      }
    } catch (error) {
      this.logger.debug(`Prisma attach skipped: ${String(error)}`);
    }
  }

  private attachPrismaMiddleware(client: PrismaClient): void {
    if (!client.$use) return;
    client.$use(
      async (
        params: PrismaMiddlewareParams,
        next: (params: PrismaMiddlewareParams) => Promise<unknown>,
      ) => {
        const start = Date.now();
        try {
          const result = await next(params);
          this.handleQuery({
            query: `${params.model ?? 'unknown'}.${params.action}`,
            parameters: params.args ? [params.args] : undefined,
            duration: Date.now() - start,
            source: 'prisma',
            success: true,
          });
          return result;
        } catch (error) {
          this.handleQuery({
            query: `${params.model ?? 'unknown'}.${params.action}`,
            parameters: params.args ? [params.args] : undefined,
            duration: Date.now() - start,
            source: 'prisma',
            success: false,
            error,
          });
          throw error;
        }
      },
    );
  }

  private handleQuery(data: QueryData): void {
    if (this.config.ignorePatterns?.some((p) => p.test(data.query))) {
      return;
    }
    const slowThreshold = this.config.slowThreshold ?? 100;
    const isSlow = data.duration > slowThreshold;

    const payload: QueryEntry['payload'] = {
      query: this.formatQuery(data.query),
      parameters: data.parameters,
      duration: data.duration,
      slow: isSlow,
      source: data.source,
      connection: data.connection,
    };

    this.collector.collect('query', payload, data.requestId);
  }

  private formatQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim();
  }
}
