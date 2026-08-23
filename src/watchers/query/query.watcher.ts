import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig, NESTLENS_CONFIG, QueryWatcherConfig } from '../../nestlens.config';
import { QueryEntry } from '../../types';
import {
  isLikelyTypeORMDataSource,
  isPrismaClient,
  PrismaClient,
  PrismaMiddlewareParams,
  TypeORMDataSourceLike,
  TypeORMLoggerLike,
} from './types';
import { NestLensQuerySubscriber } from './typeorm-subscriber';
import { NestLensTypeOrmLogger } from './typeorm-logger';
import { resolveWatcherConfig } from '../watcher-config';

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
const PRISMA_ATTACHED = Symbol.for('nestlens:prisma-query-watcher-attached');

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
    this.config = resolveWatcherConfig(watcherConfig, { slowThreshold: 100 });
  }

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      return;
    }

    /*
     * Both halves find what they attach to by its shape, in Nest's own
     * container, so neither needs the package to be resolvable from here —
     * and asking was a way to answer *no* while the client sat in the
     * container: `require.resolve` runs from NestLens's own directory, which
     * under pnpm's layout or in a monorepo is not where the application's
     * dependencies are.
     */
    this.attachTypeORM();
    this.attachPrisma();
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

  /**
   * Finds the Prisma client the way the TypeORM half finds a DataSource.
   *
   * This looked at `global.prisma` and nowhere else — the singleton pattern a
   * Next.js application uses, and not how a Nest application holds a client. A
   * `PrismaService extends PrismaClient` registered as a provider, which is
   * what the documentation for this library and Prisma's own Nest guide both
   * show, was never found: *Database queries (TypeORM/Prisma auto-detected)*
   * recorded TypeORM's and none of Prisma's.
   *
   * The container knows every provider, and a client is recognisable by the
   * methods this watcher is about to call.
   */
  private attachPrisma(): void {
    try {
      let attached = 0;

      for (const client of this.discoverPrismaClients()) {
        if (this.attachPrismaMiddleware(client)) {
          attached += 1;
        }
      }

      const globalPrisma = (global as Record<string, unknown>)['prisma'];
      if (isPrismaClient(globalPrisma) && this.attachPrismaMiddleware(globalPrisma)) {
        attached += 1;
      }

      if (attached > 0) {
        this.logger.log(`Prisma query watcher attached to ${attached} client(s)`);
      }
    } catch (error) {
      this.logger.debug(`Prisma attach skipped: ${String(error)}`);
    }
  }

  private discoverPrismaClients(): PrismaClient[] {
    const seen = new WeakSet<object>();
    const clients: PrismaClient[] = [];

    for (const wrapper of this.discoveryService.getProviders()) {
      const instance = wrapper.instance as unknown;

      if (
        instance &&
        typeof instance === 'object' &&
        !seen.has(instance as object) &&
        isPrismaClient(instance)
      ) {
        seen.add(instance as object);
        clients.push(instance);
      }
    }

    return clients;
  }

  private attachPrismaMiddleware(client: PrismaClient): boolean {
    if (!client.$use) return false;

    // One client can be injected into many providers, and the global may be
    // the same object again.
    const marked = client as unknown as Record<symbol, boolean | undefined>;
    if (marked[PRISMA_ATTACHED]) return false;
    marked[PRISMA_ATTACHED] = true;

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

    return true;
  }

  /**
   * Whether a configured pattern covers this query.
   *
   * `lastIndex` is reset first. A `RegExp` carrying `g` or `y` remembers where
   * its last match ended, and `test` resumes from there — so
   * `ignorePatterns: [/health/g]` ignored every *other* health check and
   * recorded the ones in between. The flag is one character and the failure is
   * invisible: the list is a user's, written however they write regular
   * expressions elsewhere.
   */
  private isIgnored(query: string): boolean {
    const patterns = this.config.ignorePatterns;
    if (!patterns?.length) {
      return false;
    }

    return patterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(query);
    });
  }

  private handleQuery(data: QueryData): void {
    if (this.isIgnored(data.query)) {
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
