import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { ScheduleWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ScheduleEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { WrappedMethods } from './wrap-method';

/** One scheduled callback, as `@nestjs/schedule`'s orchestrator stores it. */
interface ScheduledTarget {
  target: (...args: unknown[]) => unknown;
  timeout?: number;
}

type ScheduledStore = Record<string, ScheduledTarget> | undefined;

/**
 * The part of a `cron` job this watcher touches.
 *
 * `@nestjs/schedule` is an optional peer, so its types cannot be imported —
 * this describes the runtime shape instead, and every field is probed before
 * use because it has changed across versions.
 */
interface CronJobLike {
  fireOnTick: () => unknown;
  cronTime?: { source?: unknown };
  nextDate?: () => unknown;
}

interface SchedulerRegistryLike {
  getCronJobs(): Map<string, CronJobLike>;
  getIntervals(): string[];
  getTimeouts(): string[];
  addCronJob?: (name: string, job: CronJobLike, ...rest: unknown[]) => unknown;
}

function isSchedulerRegistry(obj: unknown): obj is SchedulerRegistryLike {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Partial<SchedulerRegistryLike>;

  return (
    typeof candidate.getCronJobs === 'function' &&
    typeof candidate.getIntervals === 'function' &&
    typeof candidate.getTimeouts === 'function'
  );
}

/**
 * `nextDate()` returns a Luxon `DateTime` on cron v3 (shipped with
 * `@nestjs/schedule` v4+) and a plain `Date` on older releases.
 */
function toIsoString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return undefined;

  const candidate = value as { toISO?: () => string | null; toISOString?: () => string };

  if (typeof candidate.toISO === 'function') return candidate.toISO() ?? undefined;
  if (typeof candidate.toISOString === 'function') return candidate.toISOString();

  return undefined;
}

@Injectable()
export class ScheduleWatcher implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleWatcher.name);
  private readonly config: ScheduleWatcherConfig;
  private readonly jobTracking = new Map<string, number>(); // jobName -> startTime
  private readonly wrappedJobs = new Set<string>(); // Track which jobs we've already wrapped
  private schedulerRegistry?: SchedulerRegistryLike;
  private wrappedRegistry?: WrappedMethods;
  private wrappedOrchestrator?: WrappedMethods;
  /** Every scheduled callback replaced, so it can be put back. */
  private readonly wrappedTargets = new Map<ScheduledTarget, ScheduledTarget['target']>();
  /** Every job whose error handler was chained, and what was there before. */
  private readonly wrappedErrorHandlers = new Map<CronJobLike, unknown>();
  /** Every cron job whose tick was replaced, so it can be put back. */
  private readonly wrappedTicks = new Map<CronJobLike, () => unknown>();

  constructor(
    private readonly collector: CollectorService,
    private readonly discoveryService: DiscoveryService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.schedule;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      return;
    }

    // @nestjs/schedule's SchedulerRegistry is provided by the global ScheduleModule.
    // Discover it at bootstrap instead of injecting it directly, which keeps
    // @nestjs/schedule an optional peer.
    this.schedulerRegistry = this.findSchedulerRegistry();

    if (!this.schedulerRegistry) {
      this.logger.debug(
        'ScheduleWatcher: SchedulerRegistry not found. ' +
          'To enable schedule tracking, install @nestjs/schedule and import ScheduleModule.forRoot().',
      );
      return;
    }

    this.setupInterceptors();
  }

  /**
   * Tracks `@Interval` and `@Timeout`, which nothing was doing.
   *
   * Only `@Cron` was ever recorded. The two others were reached for through
   * the registry, which holds the *timer handles* — there is no callback on a
   * `Timeout` object to wrap — so the watcher logged
   * "registered but cannot be wrapped" and moved on. The payload has declared
   * `interval` and `timeout` fields the whole time, documented as "reserved,
   * not currently populated", and the watcher's own page shows both decorators
   * in its examples.
   *
   * The callback does exist one layer up. `@nestjs/schedule` keeps every
   * scheduled method on its `SchedulerOrchestrator` and turns them into timers
   * in `mountIntervals` and `mountTimeouts`, which run in its
   * `onApplicationBootstrap`. Replacing those two methods puts a wrapper around
   * each target before `setInterval` ever sees it.
   *
   * This runs in `onModuleInit` on purpose: Nest completes every module's
   * `onModuleInit` before it starts any `onApplicationBootstrap`, so being
   * early enough is a guarantee rather than a question of module order — which
   * is what made the cron half of this watcher record nothing on NestJS 9 and
   * 10 until it was moved.
   */
  onModuleInit(): void {
    if (!this.config.enabled) {
      return;
    }

    const orchestrator = this.findSchedulerOrchestrator();
    if (!orchestrator) {
      return;
    }

    this.wrappedOrchestrator = new WrappedMethods(
      orchestrator as unknown as Record<string, unknown>,
    );

    const mounts: [string, 'intervals' | 'timeouts'][] = [
      ['mountIntervals', 'intervals'],
      ['mountTimeouts', 'timeouts'],
    ];

    for (const [method, store] of mounts) {
      this.wrappedOrchestrator.replace(method, (original) => {
        return (...args: unknown[]): unknown => {
          this.trackScheduled(orchestrator[store], store);
          return (original as (...a: unknown[]) => unknown)(...args);
        };
      });
    }
  }

  /**
   * Puts a wrapper around each stored callback, before it becomes a timer.
   */
  private trackScheduled(
    store: Record<string, ScheduledTarget> | undefined,
    kind: 'intervals' | 'timeouts',
  ): void {
    if (!store) return;

    for (const [name, options] of Object.entries(store)) {
      if (typeof options?.target !== 'function' || this.wrappedTargets.has(options)) {
        continue;
      }

      const original = options.target;
      this.wrappedTargets.set(options, original);

      const every =
        kind === 'intervals' ? { interval: options.timeout } : { timeout: options.timeout };

      options.target = (...args: unknown[]): unknown => {
        const started = Date.now();
        this.collectEntry(name, 'started', 0, undefined, undefined, undefined, every);

        const finish = (error?: unknown): void => {
          this.collectEntry(
            name,
            error ? 'failed' : 'completed',
            Date.now() - started,
            error ? (error instanceof Error ? error.message : String(error)) : undefined,
            undefined,
            undefined,
            every,
          );
        };

        try {
          const result = original(...args);

          if (result instanceof Promise) {
            return result.then(
              (value) => {
                finish();
                return value;
              },
              (error: unknown) => {
                finish(error);
                throw error;
              },
            );
          }

          finish();
          return result;
        } catch (error) {
          finish(error);
          throw error;
        }
      };
    }
  }

  private findSchedulerOrchestrator(): Record<string, ScheduledStore> | undefined {
    for (const wrapper of this.discoveryService.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;

      if (instance?.constructor?.name === 'SchedulerOrchestrator') {
        return instance as unknown as Record<string, ScheduledStore>;
      }
    }

    return undefined;
  }

  private findSchedulerRegistry(): SchedulerRegistryLike | undefined {
    for (const wrapper of this.discoveryService.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (isSchedulerRegistry(instance)) {
        return instance;
      }
    }
    return undefined;
  }

  private setupInterceptors(): void {
    const registry = this.schedulerRegistry;
    if (!registry) return;

    try {
      // Order matters: start intercepting before sweeping, so a job registered
      // between the two is not missed.
      this.interceptRegistrations(registry);

      const cronJobs = registry.getCronJobs();
      cronJobs.forEach((job, name) => {
        this.wrapCronJob(name, job);
      });

      this.logger.log(
        `Schedule interceptors installed (${cronJobs.size} cron jobs, ` +
          `${registry.getIntervals().length} intervals, ${registry.getTimeouts().length} timeouts)`,
      );
    } catch (error) {
      this.logger.warn(`Failed to setup schedule interceptors: ${error}`);
    }
  }

  /**
   * Wraps jobs as they are registered, rather than relying on them already
   * being there.
   *
   * `@nestjs/schedule` adds cron jobs to the registry from its own
   * `onApplicationBootstrap` — the same lifecycle phase this watcher runs in —
   * so which one goes first depends on the module graph. On NestJS 9 and 10
   * this watcher ran first and swept an empty registry, and schedule tracking
   * silently recorded nothing. Hooking the registration removes the ordering
   * question, and it also catches jobs an application adds at runtime, which a
   * bootstrap-time sweep alone would never see.
   */
  private interceptRegistrations(registry: SchedulerRegistryLike): void {
    this.wrappedRegistry = new WrappedMethods(registry as unknown as Record<string, unknown>);

    this.wrappedRegistry.replace('addCronJob', (original) => {
      return (name: string, job: CronJobLike, ...rest: unknown[]): unknown => {
        const result = (original as (...args: unknown[]) => unknown)(name, job, ...rest);
        this.wrapCronJob(name, job);
        return result;
      };
    });
  }

  /**
   * Puts the registry and every job back the way they were.
   *
   * The registry is a singleton the application owns, and the cron jobs on it
   * outlive the module: without this a closed application goes on ticking
   * through a watcher whose collector is gone, and a process that builds the
   * module more than once against the same registry — tests, `nest start
   * --hmr` — wraps each round on top of the last. Measured at three lifecycles:
   * one tick, six entries.
   */
  onModuleDestroy(): void {
    this.wrappedRegistry?.restore();
    this.wrappedRegistry = undefined;

    this.wrappedOrchestrator?.restore();
    this.wrappedOrchestrator = undefined;

    for (const [options, target] of this.wrappedTargets) {
      options.target = target;
    }
    this.wrappedTargets.clear();

    for (const [job, fireOnTick] of this.wrappedTicks) {
      job.fireOnTick = fireOnTick as CronJobLike['fireOnTick'];
    }

    for (const [job, handler] of this.wrappedErrorHandlers) {
      const holder = job as unknown as Record<string, unknown>;
      if (handler === undefined) delete holder.errorHandler;
      else holder.errorHandler = handler;
    }
    this.wrappedErrorHandlers.clear();

    this.wrappedTicks.clear();
    this.wrappedJobs.clear();
    this.jobTracking.clear();
  }

  /**
   * Follows one cron job's ticks.
   *
   * The tick's own error never escapes it. `cron` catches everything inside
   * `fireOnTick` and hands it to the job's `errorHandler`, or prints it, so a
   * watcher waiting for a rejection sees a clean return and records a failed
   * run as a completed one — which is worse than not recording it. The handler
   * is where the failure actually is, so that is chained too.
   *
   * A job registered through `@Cron` is caught a second time, by
   * `@nestjs/schedule`'s own try/catch around the decorated method, and never
   * reaches even the handler. Those failures are Nest logger output, which the
   * log watcher records.
   */
  private wrapCronJob(name: string, job: CronJobLike | undefined): void {
    if (this.wrappedJobs.has(name)) return;
    this.wrappedJobs.add(name);

    if (!job || typeof job.fireOnTick !== 'function') return;

    const originalFireOnTick = job.fireOnTick.bind(job);
    this.wrappedTicks.set(job, job.fireOnTick as () => unknown);

    /** Set by the error handler below, read by the tick that caused it. */
    let failure: unknown;

    this.chainErrorHandler(job, (error) => {
      failure = error;
    });

    job.fireOnTick = async (): Promise<void> => {
      const startTime = Date.now();
      const jobKey = `cron:${name}`;
      this.jobTracking.set(jobKey, startTime);
      failure = undefined;

      this.collectEntry(name, 'started', 0, undefined, this.getCronPattern(job));

      const finish = (error: unknown): void => {
        const duration = Date.now() - startTime;
        this.jobTracking.delete(jobKey);

        this.collectEntry(
          name,
          error ? 'failed' : 'completed',
          duration,
          error ? (error instanceof Error ? error.message : String(error)) : undefined,
          this.getCronPattern(job),
          error ? undefined : this.getNextRun(job),
        );
      };

      try {
        await originalFireOnTick();
        finish(failure);
      } catch (error) {
        // Only reachable where something else calls the tick directly, since
        // `cron` does not let one out of its own.
        finish(error);
        throw error;
      } finally {
        failure = undefined;
      }
    };
  }

  /**
   * Adds a listener to a job's error handler without replacing the caller's.
   */
  private chainErrorHandler(job: CronJobLike, observe: (error: unknown) => void): void {
    const holder = job as unknown as Record<string, unknown>;
    const existing = holder.errorHandler;

    if (this.wrappedErrorHandlers.has(job)) return;
    this.wrappedErrorHandlers.set(job, existing);

    holder.errorHandler = (error: unknown): unknown => {
      observe(error);
      return typeof existing === 'function'
        ? (existing as (e: unknown) => unknown)(error)
        : undefined;
    };
  }

  private getCronPattern(job: CronJobLike): string | undefined {
    const source = job.cronTime?.source;

    return typeof source === 'string' ? source : undefined;
  }

  private getNextRun(job: CronJobLike): string | undefined {
    if (typeof job.nextDate !== 'function') return undefined;

    try {
      return toIsoString(job.nextDate());
    } catch {
      return undefined;
    }
  }

  private collectEntry(
    name: string,
    status: 'started' | 'completed' | 'failed',
    duration?: number,
    error?: string,
    cron?: string,
    nextRun?: string,
    every?: { interval?: number; timeout?: number },
  ): void {
    const payload: ScheduleEntry['payload'] = {
      name,
      cron,
      status,
      duration,
      error,
      nextRun,
      interval: every?.interval,
      timeout: every?.timeout,
    };

    this.collector.collect('schedule', payload);
  }
}
