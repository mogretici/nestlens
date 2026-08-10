import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { ScheduleWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ScheduleEntry } from '../types';

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
export class ScheduleWatcher implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduleWatcher.name);
  private readonly config: ScheduleWatcherConfig;
  private readonly jobTracking = new Map<string, number>(); // jobName -> startTime
  private readonly wrappedJobs = new Set<string>(); // Track which jobs we've already wrapped
  private schedulerRegistry?: SchedulerRegistryLike;

  constructor(
    private readonly collector: CollectorService,
    private readonly discoveryService: DiscoveryService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.schedule;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
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

      const intervals = registry.getIntervals();
      intervals.forEach((name) => {
        this.wrapInterval(name);
      });

      const timeouts = registry.getTimeouts();
      timeouts.forEach((name) => {
        this.wrapTimeout(name);
      });

      this.logger.log(
        `Schedule interceptors installed (${cronJobs.size} cron jobs, ${intervals.length} intervals, ${timeouts.length} timeouts)`,
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
    const addCronJob = registry.addCronJob;
    if (typeof addCronJob !== 'function') return;

    const original = addCronJob.bind(registry);

    registry.addCronJob = (name: string, job: CronJobLike, ...rest: unknown[]): unknown => {
      const result = original(name, job, ...rest);
      this.wrapCronJob(name, job);
      return result;
    };
  }

  private wrapCronJob(name: string, job: CronJobLike | undefined): void {
    if (this.wrappedJobs.has(name)) return;
    this.wrappedJobs.add(name);

    if (!job || typeof job.fireOnTick !== 'function') return;

    const originalFireOnTick = job.fireOnTick.bind(job);

    job.fireOnTick = async (): Promise<void> => {
      const startTime = Date.now();
      const jobKey = `cron:${name}`;
      this.jobTracking.set(jobKey, startTime);

      // Track job started
      this.collectEntry(name, 'started', 0, undefined, this.getCronPattern(job));

      try {
        await originalFireOnTick();
        const duration = Date.now() - startTime;
        this.jobTracking.delete(jobKey);

        // Track job completed
        this.collectEntry(
          name,
          'completed',
          duration,
          undefined,
          this.getCronPattern(job),
          this.getNextRun(job),
        );
      } catch (error) {
        const duration = Date.now() - startTime;
        this.jobTracking.delete(jobKey);

        // Track job failed
        this.collectEntry(
          name,
          'failed',
          duration,
          error instanceof Error ? error.message : String(error),
          this.getCronPattern(job),
        );

        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  private wrapInterval(name: string): void {
    if (this.wrappedJobs.has(name)) return;
    this.wrappedJobs.add(name);

    // For intervals, we can't easily wrap the callback without access to the original function
    // This is a limitation of the current approach
    // We'd need to intercept at the decorator level for full tracking
    this.logger.debug(`Interval ${name} registered but cannot be wrapped`);
  }

  private wrapTimeout(name: string): void {
    if (this.wrappedJobs.has(name)) return;
    this.wrappedJobs.add(name);

    // Similar limitation as intervals
    this.logger.debug(`Timeout ${name} registered but cannot be wrapped`);
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
  ): void {
    const payload: ScheduleEntry['payload'] = {
      name,
      cron,
      status,
      duration,
      error,
      nextRun,
    };

    this.collector.collect('schedule', payload);
  }
}
