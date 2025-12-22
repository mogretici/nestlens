import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import {
  JobWatcherConfig,
  NestLensConfig,
  NESTLENS_CONFIG,
} from '../nestlens.config';
import { JobEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BullQueue = any;

// Token for injecting Bull queues
export const NESTLENS_BULL_QUEUES = Symbol('NESTLENS_BULL_QUEUES');

@Injectable()
export class JobWatcher implements OnModuleInit {
  private readonly logger = new Logger(JobWatcher.name);
  private readonly config: JobWatcherConfig;
  private readonly jobTracking = new Map<string, number>(); // jobId -> startTime

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.job;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    this.logger.debug(
      'JobWatcher: To enable job tracking, call setupQueue() manually with your Bull/BullMQ queue instances.',
    );
  }

  /**
   * Setup interceptors on a Bull/BullMQ queue.
   * Call this manually for each queue you want to track.
   */
  setupQueue(queue: BullQueue, queueName?: string): void {
    if (!queue || typeof queue.on !== 'function') {
      this.logger.warn('Invalid queue instance provided');
      return;
    }

    const name = queueName || queue.name || 'unknown';

    // Track when jobs are added
    queue.on('waiting', (jobId: string) => {
      this.handleJobWaiting(name, jobId, queue);
    });

    // Track when jobs start processing
    queue.on('active', (job: BullQueue) => {
      this.handleJobActive(name, job);
    });

    // Track when jobs complete
    queue.on('completed', (job: BullQueue, result: unknown) => {
      this.handleJobCompleted(name, job, result);
    });

    // Track when jobs fail
    queue.on('failed', (job: BullQueue, error: Error) => {
      this.handleJobFailed(name, job, error);
    });

    // Track delayed jobs
    queue.on('delayed', (jobId: string) => {
      this.handleJobDelayed(name, jobId, queue);
    });

    this.logger.log(`Job interceptors installed for queue: ${name}`);
  }

  private async handleJobWaiting(
    queueName: string,
    jobId: string,
    queue: BullQueue,
  ): Promise<void> {
    try {
      const job = await queue.getJob(jobId);
      if (!job) return;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'waiting',
        attempts: job.attemptsMade || 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track waiting job: ${error}`);
    }
  }

  private handleJobActive(queueName: string, job: BullQueue): void {
    try {
      const jobId = job.id || String(job);
      this.jobTracking.set(jobId, Date.now());

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'active',
        attempts: job.attemptsMade || 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track active job: ${error}`);
    }
  }

  private handleJobCompleted(
    queueName: string,
    job: BullQueue,
    result: unknown,
  ): void {
    try {
      const jobId = job.id || String(job);
      const startTime = this.jobTracking.get(jobId);
      const duration = startTime ? Date.now() - startTime : undefined;
      this.jobTracking.delete(jobId);

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'completed',
        attempts: job.attemptsMade || 0,
        duration,
        result: this.captureData(result),
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track completed job: ${error}`);
    }
  }

  private handleJobFailed(
    queueName: string,
    job: BullQueue,
    error: Error,
  ): void {
    try {
      const jobId = job.id || String(job);
      const startTime = this.jobTracking.get(jobId);
      const duration = startTime ? Date.now() - startTime : undefined;
      this.jobTracking.delete(jobId);

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'failed',
        attempts: job.attemptsMade || 0,
        duration,
        error: error?.message || 'Unknown error',
      };

      this.collector.collect('job', payload);
    } catch (err) {
      this.logger.debug(`Failed to track failed job: ${err}`);
    }
  }

  private async handleJobDelayed(
    queueName: string,
    jobId: string,
    queue: BullQueue,
  ): Promise<void> {
    try {
      const job = await queue.getJob(jobId);
      if (!job) return;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'delayed',
        attempts: job.attemptsMade || 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track delayed job: ${error}`);
    }
  }

  private captureData(data: unknown): unknown {
    if (data === undefined || data === null) return undefined;

    try {
      // Limit size to prevent huge job data from bloating storage
      const json = JSON.stringify(data);
      const maxSize = 64 * 1024; // 64KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return data;
    } catch {
      return { _error: 'Unable to serialize data' };
    }
  }
}
