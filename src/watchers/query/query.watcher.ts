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
  PrismaQueryEvent,
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

/** A query event's parameters arrive as JSON text: `'["x",-1,0]'`. */
const parseQueryParams = (params: string | undefined): unknown[] | undefined => {
  if (!params) return undefined;
  try {
    const parsed: unknown = JSON.parse(params);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [params];
  }
};

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

      let unlogged = 0;
      const clients = this.discoverPrismaClients();
      const globalPrisma = (global as Record<string, unknown>)['prisma'];
      if (isPrismaClient(globalPrisma)) clients.push(globalPrisma);

      for (const client of clients) {
        const outcome = this.attachPrismaClient(client);
        if (outcome === 'none') continue;
        attached += 1;
        if (outcome === 'events-unlogged') unlogged += 1;
      }

      if (attached > 0) {
        this.logger.log(`Prisma query watcher attached to ${attached} client(s)`);
      }

      if (unlogged > 0) {
        this.logger.warn(
          `${unlogged} Prisma client(s) were built without query logging, so their queries are ` +
            'not being recorded. Prisma 6.14 removed the middleware API, and from 6.14 on a client ' +
            'reports its queries only when it is constructed with query logging: new ' +
            "PrismaClient({ log: [{ emit: 'event', level: 'query' }] }), or super({ log: [...] }) " +
            "in a PrismaService. log: ['query'] works as well, and also prints every query.",
        );
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

  /**
   * Attaches to a client by whichever API its Prisma has.
   *
   * `$use`, the middleware API of Prisma 6.13 and earlier, records each operation
   * as `Model.action`. Prisma 6.14 removed it, and 6.14 and 7 offer the `query` log
   * event instead — the SQL, its parameters and how long it took — which a
   * client emits only when it was built with query logging. Whether it was is
   * read from the client's engine configuration, so a client that will never
   * emit is reported rather than left recording nothing in silence. Measured
   * against @prisma/client 6.19.3 and 7.10.1.
   */
  private attachPrismaClient(
    client: PrismaClient,
  ): 'middleware' | 'events' | 'events-unlogged' | 'none' {
    // One client can be injected into many providers, and the global may be
    // the same object again.
    const marked = client as unknown as Record<symbol, boolean | undefined>;
    if (marked[PRISMA_ATTACHED]) return 'none';

    if (client.$use) {
      marked[PRISMA_ATTACHED] = true;
      this.attachPrismaMiddleware(client.$use.bind(client));
      return 'middleware';
    }

    if (!client.$on) return 'none';

    marked[PRISMA_ATTACHED] = true;
    client.$on('query', (event: PrismaQueryEvent) => {
      this.handleQuery({
        query: event.query,
        parameters: parseQueryParams(event.params),
        duration: Number(event.duration) || 0,
        source: 'prisma',
        success: true,
      });
    });

    // An engine configuration it cannot read is not evidence of anything, so
    // only one that says query logging is off is reported.
    const engineConfig = (client as { _engineConfig?: unknown })._engineConfig;
    const unlogged =
      typeof engineConfig === 'object' &&
      engineConfig !== null &&
      (engineConfig as { logQueries?: unknown }).logQueries !== true;
    return unlogged ? 'events-unlogged' : 'events';
  }

  private attachPrismaMiddleware(use: NonNullable<PrismaClient['$use']>): void {
    use(
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
