import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { JobWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { JobEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BullQueue = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BullMQQueueEvents = any;

// Token for injecting Bull queues
export const NESTLENS_BULL_QUEUES = Symbol('NESTLENS_BULL_QUEUES');

@Injectable()
export class JobWatcher implements OnModuleInit {
  private readonly logger = new Logger(JobWatcher.name);
  private readonly config: JobWatcherConfig;
  private readonly jobTracking = new Map<string, number>(); // jobId -> startTime
  private readonly managedQueueEvents: BullMQQueueEvents[] = []; // QueueEvents created by setupBullMQQueue

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.job;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
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

  /**
   * Setup interceptors on a BullMQ queue (simplified API).
   * Automatically creates QueueEvents using the queue's Redis connection.
   *
   * @param queue - The BullMQ Queue instance
   * @param queueName - Optional queue name (defaults to queue.name)
   */
  async setupBullMQQueue(queue: BullQueue, queueName?: string): Promise<void> {
    if (!queue || typeof queue.getJob !== 'function') {
      this.logger.warn('Invalid BullMQ queue instance provided');
      return;
    }

    try {
      const name = queueName || queue.name || 'unknown';

      // Get Redis connection from the queue
      const client = await queue.client;
      const connection = client.options;

      // Dynamically require bullmq to create QueueEvents

      const { QueueEvents } = require('bullmq');

      // Create QueueEvents with the same connection
      const queueEvents = new QueueEvents(name, { connection });
      this.managedQueueEvents.push(queueEvents);

      // Use the existing setup method
      this.setupQueueWithEvents(queue, queueEvents, name);
    } catch (error) {
      this.logger.error(`Failed to setup BullMQ queue: ${error}`);
    }
  }

  /**
   * Close all QueueEvents instances created by setupBullMQQueue.
   * Call this in onModuleDestroy to clean up connections.
   */
  async closeQueueEvents(): Promise<void> {
    for (const queueEvents of this.managedQueueEvents) {
      try {
        await queueEvents.close();
      } catch (error) {
        this.logger.debug(`Failed to close QueueEvents: ${error}`);
      }
    }
    this.managedQueueEvents.length = 0;
  }

  /**
   * Setup interceptors on a BullMQ queue using QueueEvents.
   * Use this if you need to manage QueueEvents lifecycle yourself.
   *
   * @param queue - The BullMQ Queue instance (for fetching job data)
   * @param queueEvents - The BullMQ QueueEvents instance (for listening to events)
   * @param queueName - Optional queue name (defaults to queue.name)
   */
  setupQueueWithEvents(queue: BullQueue, queueEvents: BullMQQueueEvents, queueName?: string): void {
    if (!queue || typeof queue.getJob !== 'function') {
      this.logger.warn('Invalid BullMQ queue instance provided');
      return;
    }

    if (!queueEvents || typeof queueEvents.on !== 'function') {
      this.logger.warn('Invalid BullMQ QueueEvents instance provided');
      return;
    }

    const name = queueName || queue.name || 'unknown';

    // Track when jobs are added (BullMQ signature: { jobId: string })
    // Reuse existing handler - same signature
    queueEvents.on('waiting', (args: { jobId: string }) => {
      this.handleJobWaiting(name, args.jobId, queue);
    });

    // Track when jobs start processing (BullMQ signature: { jobId: string })
    // Need to fetch job first, then call existing handler
    queueEvents.on('active', async (args: { jobId: string }) => {
      try {
        const job = await queue.getJob(args.jobId);
        if (job) this.handleJobActive(name, job);
      } catch (error) {
        this.logger.debug(`Failed to track BullMQ active job: ${error}`);
      }
    });

    // Track when jobs complete (BullMQ signature: { jobId: string, returnvalue: string })
    // Need to fetch job and parse returnvalue
    queueEvents.on('completed', async (args: { jobId: string; returnvalue: string }) => {
      try {
        const job = await queue.getJob(args.jobId);
        if (!job) return;

        // Parse returnvalue (BullMQ sends it as JSON string)
        let result: unknown;
        try {
          result = args.returnvalue ? JSON.parse(args.returnvalue) : undefined;
        } catch {
          result = args.returnvalue;
        }

        this.handleJobCompleted(name, job, result);
      } catch (error) {
        this.logger.debug(`Failed to track BullMQ completed job: ${error}`);
      }
    });

    // Track when jobs fail (BullMQ signature: { jobId: string, failedReason: string })
    // Need to fetch job and convert failedReason to Error
    queueEvents.on('failed', async (args: { jobId: string; failedReason: string }) => {
      try {
        const job = await queue.getJob(args.jobId);
        if (!job) return;

        // Convert failedReason string to Error object for existing handler
        const error = new Error(args.failedReason || 'Unknown error');
        this.handleJobFailed(name, job, error);
      } catch (error) {
        this.logger.debug(`Failed to track BullMQ failed job: ${error}`);
      }
    });

    // Track delayed jobs (BullMQ signature: { jobId: string, delay: number })
    // Reuse existing handler - same signature
    queueEvents.on('delayed', (args: { jobId: string }) => {
      this.handleJobDelayed(name, args.jobId, queue);
    });

    this.logger.log(`BullMQ job interceptors installed for queue: ${name}`);
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

  private handleJobCompleted(queueName: string, job: BullQueue, result: unknown): void {
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

  private handleJobFailed(queueName: string, job: BullQueue, error: Error): void {
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
