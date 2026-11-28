import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
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
import { ReportsWatcherStatus, WatcherStatus, switchedOff, watcherDocs } from '../watcher-status';
import { WatcherStatusService } from '../watcher-status.service';

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

/*
 * Registry symbols, so every copy of the library sees the same marks. A copy
 * from before 0.20 marked with `true`, never cleared it, and held no listener
 * it could hand over: that mark is read as nobody's, and the object is
 * attached to again — beside an older copy that is still running, both record.
 */
const TYPEORM_ATTACHED = Symbol.for('nestlens:typeorm-query-watcher-attached');
const PRISMA_ATTACHED = Symbol.for('nestlens:prisma-query-watcher-attached');

/** A watcher of another application that found an object held, and takes it when it is let go. */
interface Waiter {
  watcher: QueryWatcher;
  takeOver: () => void;
}

/**
 * Who records a DataSource or a Prisma client, and who is waiting to, kept on
 * the object.
 *
 * One watcher records an object at a time. Another application's watcher that
 * finds it held queues; when the holder closes, the first in the queue takes
 * it over. Counting it as held at bootstrap and leaving it there went stale
 * the moment the holder closed: the status said another application recorded
 * it while nothing did.
 */
interface Holding {
  owner?: QueryWatcher;
  waiting: Waiter[];
}

/** What was put on a DataSource, so it can be taken off again. */
interface AttachedDataSource {
  dataSource: TypeORMDataSourceLike;
  holding: Holding;
  subscriber: NestLensQuerySubscriber;
  wrapped: NestLensTypeOrmLogger;
  original: TypeORMLoggerLike | undefined;
}

/**
 * A Prisma client's holding. Prisma can add a middleware or a `query` listener
 * and cannot remove either, so the one installed stays for the life of the
 * client and forwards to whichever watcher owns it.
 */
type PrismaAttachment = Holding;

type MarkedPrismaClient = PrismaClient & { [PRISMA_ATTACHED]?: PrismaAttachment | true };

type MarkedDataSource = TypeORMDataSourceLike & { [TYPEORM_ATTACHED]?: Holding | true };

/** How attaching to one object went. */
type Attached = 'attached' | 'held-elsewhere' | 'none';

@Injectable()
export class QueryWatcher implements OnApplicationBootstrap, OnModuleDestroy, ReportsWatcherStatus {
  private readonly logger = new Logger(QueryWatcher.name);
  private readonly config: QueryWatcherConfig;
  /** What `onApplicationBootstrap` attached to, which is what the status reports. */
  private readonly attached = {
    dataSources: 0,
    prismaClients: 0,
    unloggedPrismaClients: 0,
    heldElsewhere: 0,
  };
  /** It attaches during bootstrap, so the startup report waits for it. */
  private readonly releaseStartupReport: () => void;
  private readonly attachedDataSources: AttachedDataSource[] = [];
  private readonly ownedPrismaClients: PrismaAttachment[] = [];
  /** Holdings this watcher queues on, so closing first leaves the queue. */
  private readonly waitingOn: Holding[] = [];

  constructor(
    private readonly collector: CollectorService,
    private readonly discoveryService: DiscoveryService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional() statusService?: WatcherStatusService,
  ) {
    const watcherConfig = nestlensConfig.watchers?.query;
    this.config = resolveWatcherConfig(watcherConfig, { slowThreshold: 100 });
    this.releaseStartupReport = statusService?.holdStartupReport() ?? (() => undefined);
  }

  watcherStatus(): WatcherStatus {
    if (!this.config.enabled) return switchedOff(watcherDocs('watchers/query'));

    const { dataSources, prismaClients, unloggedPrismaClients, heldElsewhere } = this.attached;

    if (dataSources + prismaClients > 0) {
      const found = [
        dataSources > 0 ? `${dataSources} TypeORM DataSource${dataSources === 1 ? '' : 's'}` : '',
        prismaClients > 0 ? `${prismaClients} Prisma client${prismaClients === 1 ? '' : 's'}` : '',
      ];

      return {
        state: 'recording',
        reason: `Recording the queries of ${found.filter(Boolean).join(' and ')}.`,
        docs: watcherDocs('watchers/query#usage-example'),
      };
    }

    if (heldElsewhere > 0) {
      return {
        state: 'waiting',
        reason: `${heldElsewhere} DataSource(s) or Prisma client(s) are recorded by another application's NestLens in this process, so this one records none of them.`,
        docs: watcherDocs('watchers/query#usage-example'),
      };
    }

    if (unloggedPrismaClients > 0) {
      return {
        state: 'waiting',
        reason: `${unloggedPrismaClients} Prisma client(s) were built without query logging, so they report no queries.`,
        docs: watcherDocs('integrations/prisma#prisma-614-and-later-one-constructor-option'),
      };
    }

    return {
      state: 'waiting',
      reason: "No TypeORM DataSource or Prisma client was found among the application's providers.",
      docs: watcherDocs('watchers/query#usage-example'),
    };
  }

  onApplicationBootstrap(): void {
    try {
      this.attach();
    } finally {
      this.releaseStartupReport();
    }
  }

  /**
   * Gives back every DataSource and Prisma client it attached to.
   *
   * The marks that stop two watchers attaching to one object were never taken
   * off, so after an application closed — `nest start --hmr`, a test suite,
   * two applications in one process — the next found them and attached to
   * nothing, while the closed application's collector went on being called.
   */
  onModuleDestroy(): void {
    for (const holding of this.waitingOn) {
      holding.waiting = holding.waiting.filter((waiter) => waiter.watcher !== this);
    }
    this.waitingOn.length = 0;

    for (const { dataSource, holding, subscriber, wrapped, original } of this.attachedDataSources) {
      const index = dataSource.subscribers?.indexOf(subscriber) ?? -1;
      if (index >= 0) dataSource.subscribers?.splice(index, 1);

      if (dataSource.logger === wrapped) {
        try {
          (dataSource as { logger: TypeORMLoggerLike | undefined }).logger = original;
        } catch {
          // A getter-only logger was never replaced in the first place.
        }
      }

      if (holding.owner !== this) continue;
      holding.owner = undefined;

      const next = holding.waiting.shift();
      if (next) next.takeOver();
      else delete (dataSource as MarkedDataSource)[TYPEORM_ATTACHED];
    }
    this.attachedDataSources.length = 0;

    for (const attachment of this.ownedPrismaClients) {
      if (attachment.owner !== this) continue;
      attachment.owner = undefined;
      attachment.waiting.shift()?.takeOver();
    }
    this.ownedPrismaClients.length = 0;
  }

  /** Queues on a holding, to take the object over when its holder lets go. */
  private wait(holding: Holding, takeOver: () => void): void {
    this.attached.heldElsewhere += 1;
    this.waitingOn.push(holding);
    holding.waiting.push({
      watcher: this,
      takeOver: () => {
        this.attached.heldElsewhere -= 1;
        this.waitingOn.splice(this.waitingOn.indexOf(holding), 1);
        takeOver();
      },
    });
  }

  private attach(): void {
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
        if (this.attachToDataSource(ds) === 'attached') attached++;
      }
      this.attached.dataSources += attached;
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

  private attachToDataSource(ds: TypeORMDataSourceLike): Attached {
    const marked = ds as MarkedDataSource;
    const mark = marked[TYPEORM_ATTACHED];
    const holding: Holding = typeof mark === 'object' ? mark : { waiting: [] };
    if (holding.owner === this) return 'none';
    if (holding.owner) {
      this.wait(holding, () => {
        if (this.attachToDataSource(ds) === 'attached') this.attached.dataSources += 1;
      });
      return 'held-elsewhere';
    }

    holding.owner = this;
    marked[TYPEORM_ATTACHED] = holding;

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

    this.attachedDataSources.push({ dataSource: ds, holding, subscriber, wrapped, original });
    return 'attached';
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
        if (outcome === 'none' || outcome === 'held-elsewhere') continue;
        attached += 1;
        if (outcome === 'events-unlogged') unlogged += 1;
        this.countPrismaClient(outcome);
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
  ): 'middleware' | 'events' | 'events-unlogged' | 'held-elsewhere' | 'none' {
    // One client can be injected into many providers, and the global may be
    // the same object again.
    const marked = client as MarkedPrismaClient;
    if (!client.$use && !client.$on) return 'none';

    const mark = marked[PRISMA_ATTACHED];
    const existing = typeof mark === 'object' ? mark : undefined;
    if (existing?.owner === this) return 'none';
    if (existing?.owner) {
      this.wait(existing, () => this.countPrismaClient(this.attachPrismaClient(client)));
      return 'held-elsewhere';
    }

    const attachment: PrismaAttachment = existing ?? { waiting: [] };
    attachment.owner = this;
    this.ownedPrismaClients.push(attachment);

    if (!existing) {
      Object.defineProperty(marked, PRISMA_ATTACHED, {
        value: attachment,
        configurable: true,
        writable: true,
      });
      this.installPrismaRecording(client, attachment);
    }

    if (client.$use) return 'middleware';

    // A client emits `query` events only when `logQueries` is `true`, which
    // it is when it was built with a query log option. Measured on
    // @prisma/client 6.19.3 and 7.10.1: `undefined` with no `log` option,
    // `false` with other levels, no event either way. An engine configuration
    // that is not an object is not evidence of anything, so it is not reported.
    const engineConfig = (client as { _engineConfig?: unknown })._engineConfig;
    const unlogged =
      typeof engineConfig === 'object' &&
      engineConfig !== null &&
      (engineConfig as { logQueries?: unknown }).logQueries !== true;
    return unlogged ? 'events-unlogged' : 'events';
  }

  private countPrismaClient(
    outcome: 'middleware' | 'events' | 'events-unlogged' | 'held-elsewhere' | 'none',
  ): void {
    if (outcome === 'events-unlogged') this.attached.unloggedPrismaClients += 1;
    else if (outcome === 'middleware' || outcome === 'events') this.attached.prismaClients += 1;
  }

  /** Installed once per client; records through whichever watcher owns it at the time. */
  private installPrismaRecording(client: PrismaClient, attachment: PrismaAttachment): void {
    const record = (data: QueryData): void => attachment.owner?.handleQuery(data);

    if (client.$use) {
      this.attachPrismaMiddleware(client.$use.bind(client), record);
      return;
    }

    client.$on?.('query', (event: PrismaQueryEvent) => {
      record({
        query: event.query,
        parameters: parseQueryParams(event.params),
        duration: Number(event.duration) || 0,
        source: 'prisma',
        success: true,
      });
    });
  }

  private attachPrismaMiddleware(
    use: NonNullable<PrismaClient['$use']>,
    record: (data: QueryData) => void,
  ): void {
    use(
      async (
        params: PrismaMiddlewareParams,
        next: (params: PrismaMiddlewareParams) => Promise<unknown>,
      ) => {
        const start = Date.now();
        try {
          const result = await next(params);
          record({
            query: `${params.model ?? 'unknown'}.${params.action}`,
            parameters: params.args ? [params.args] : undefined,
            duration: Date.now() - start,
            source: 'prisma',
            success: true,
          });
          return result;
        } catch (error) {
          record({
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
