import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { ScheduleWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ScheduleEntry } from '../types';

interface SchedulerRegistryLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCronJobs(): Map<string, any>;
  getIntervals(): string[];
  getTimeouts(): string[];
}

function isSchedulerRegistry(obj: unknown): obj is SchedulerRegistryLike {
  return (
    !!obj &&
    typeof obj === 'object' &&
    typeof (obj as SchedulerRegistryLike).getCronJobs === 'function' &&
    typeof (obj as SchedulerRegistryLike).getIntervals === 'function' &&
    typeof (obj as SchedulerRegistryLike).getTimeouts === 'function'
  );
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
    // Discover it at bootstrap (after every module's onModuleInit has registered its jobs)
    // instead of injecting it directly, which keeps @nestjs/schedule an optional peer.
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
      const instance = wrapper.instance as unknown;
      if (isSchedulerRegistry(instance)) {
        return instance;
      }
    }
    return undefined;
  }

  private setupInterceptors(): void {
    if (!this.schedulerRegistry) return;

    try {
      // Wrap cron jobs
      const cronJobs = this.schedulerRegistry.getCronJobs();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cronJobs.forEach((job: any, name: any) => {
        this.wrapCronJob(name, job);
      });

      // Wrap intervals
      const intervals = this.schedulerRegistry.getIntervals();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      intervals.forEach((interval: any) => {
        this.wrapInterval(interval);
      });

      // Wrap timeouts
      const timeouts = this.schedulerRegistry.getTimeouts();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timeouts.forEach((timeout: any) => {
        this.wrapTimeout(timeout);
      });

      this.logger.log(
        `Schedule interceptors installed (${cronJobs.size} cron jobs, ${intervals.length} intervals, ${timeouts.length} timeouts)`,
      );
    } catch (error) {
      this.logger.warn(`Failed to setup schedule interceptors: ${error}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wrapCronJob(name: string, job: any): void {
    if (this.wrappedJobs.has(name)) return;
    this.wrappedJobs.add(name);

    if (!job || typeof job.fireOnTick !== 'function') return;

    const originalFireOnTick = job.fireOnTick.bind(job);

    job.fireOnTick = async () => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getCronPattern(job: any): string | undefined {
    try {
      // Try to get cron pattern from the job
      if (job.cronTime?.source) {
        return job.cronTime.source;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNextRun(job: any): string | undefined {
    try {
      if (job.nextDate && typeof job.nextDate === 'function') {
        const next = job.nextDate();
        return next?.toISOString();
      }
      return undefined;
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
