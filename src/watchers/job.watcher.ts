import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { JobWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { JobEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { capturePayload } from './capture-payload';

/**
 * The Bull / BullMQ surface this watcher touches.
 *
 * Neither package is a declared dependency, so these describe the runtime
 * shape. Public methods accept `unknown` and narrow, so callers can pass a
 * real `Queue` or `QueueEvents` without a type conflict.
 */
interface BullJobLike {
  id?: string | number;
  name?: string;
  data?: unknown;
  attemptsMade?: number;
}

type EventListener = (...args: never[]) => void;

interface BullQueueLike {
  name?: string;
  client?: unknown;
  on?: (event: string, listener: EventListener) => unknown;
  getJob?: (id: string) => Promise<BullJobLike | undefined | null>;
}

/** Bull v3 emits job events on the queue itself. */
type EmittingQueue = BullQueueLike & { on: (event: string, listener: EventListener) => unknown };

/** BullMQ reports events through QueueEvents and looks jobs up on the queue. */
type JobLookupQueue = BullQueueLike & {
  getJob: (id: string) => Promise<BullJobLike | undefined | null>;
};

interface BullQueueEventsLike {
  on(event: string, listener: EventListener): unknown;
  close?: () => Promise<unknown>;
}

function emitsEvents(value: unknown): value is EmittingQueue {
  return !!value && typeof value === 'object' && typeof (value as BullQueueLike).on === 'function';
}

function looksUpJobs(value: unknown): value is JobLookupQueue {
  return (
    !!value && typeof value === 'object' && typeof (value as BullQueueLike).getJob === 'function'
  );
}

function isQueueEvents(value: unknown): value is BullQueueEventsLike {
  return (
    !!value && typeof value === 'object' && typeof (value as BullQueueEventsLike).on === 'function'
  );
}

// Token for injecting Bull queues

@Injectable()
export class JobWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWatcher.name);
  private readonly config: JobWatcherConfig;
  /**
   * Jobs seen going active, so a completion can be given a duration — and a
   * name, when the job itself is gone by the time the event arrives.
   *
   * Bounded: an entry is added when a job goes active and removed when it
   * completes or fails, and a job that does neither — stalled, removed,
   * an event lost with a connection — would otherwise stay for the life of the
   * process.
   */
  private readonly jobTracking = new Map<string, { startedAt: number; name: string }>();
  private static readonly MAX_TRACKED_JOBS = 10_000;
  private readonly managedQueueEvents: BullQueueEventsLike[] = []; // QueueEvents created by setupBullMQQueue
  /** Every listener installed, so `onModuleDestroy` can remove it. */
  private readonly listeners: {
    emitter: EmittingQueue;
    event: string;
    listener: (...args: never[]) => void;
  }[] = [];

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.job;
    this.config = resolveWatcherConfig(watcherConfig);
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
  setupQueue(queue: unknown, queueName?: string): void {
    if (!emitsEvents(queue)) {
      this.logger.warn('Invalid queue instance provided');
      return;
    }

    const name = queueName || queue.name || 'unknown';

    this.listen(queue, 'waiting', (jobId: string) => this.handleJobWaiting(name, jobId, queue));
    this.listen(queue, 'active', (job: BullJobLike) => this.handleJobActive(name, job));
    this.listen(queue, 'completed', (job: BullJobLike, result: unknown) =>
      this.handleJobCompleted(name, job, result),
    );
    this.listen(queue, 'failed', (job: BullJobLike, error: Error) =>
      this.handleJobFailed(name, job, error),
    );
    this.listen(queue, 'delayed', (jobId: string) => this.handleJobDelayed(name, jobId, queue));

    this.logger.log(`Job interceptors installed for queue: ${name}`);
  }

  /**
   * Setup interceptors on a BullMQ queue (simplified API).
   * Automatically creates QueueEvents using the queue's Redis connection.
   *
   * @param queue - The BullMQ Queue instance
   * @param queueName - Optional queue name (defaults to queue.name)
   */
  async setupBullMQQueue(queue: unknown, queueName?: string): Promise<void> {
    if (!looksUpJobs(queue)) {
      this.logger.warn('Invalid BullMQ queue instance provided');
      return;
    }

    try {
      const name = queueName || queue.name || 'unknown';

      // Get Redis connection from the queue
      const client = (await queue.client) as { options?: unknown } | undefined;
      const connection = client?.options;

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
   * Adds a listener and remembers it, so it can be taken off again.
   *
   * A queue belongs to the application and outlives this module. Listeners
   * left on it go on recording through a collector that is gone, and a process
   * that registers the same queue more than once — tests, `nest start --hmr`,
   * or simply calling `setupQueue` twice — records one entry per listener per
   * job.
   */
  private listen(
    emitter: EmittingQueue,
    event: string,
    listener: (...args: never[]) => void,
  ): void {
    this.listeners.push({ emitter, event, listener });
    emitter.on(event, listener);
  }

  /**
   * Takes every listener off and closes what `setupBullMQQueue` opened.
   *
   * `closeQueueEvents` used to be the caller's job — the documentation asked
   * for it to be called from their own `onModuleDestroy`, which is a step that
   * is easy not to know about and easy to forget. It still exists and is still
   * safe to call; it simply does not have to be.
   */
  async onModuleDestroy(): Promise<void> {
    for (const { emitter, event, listener } of this.listeners) {
      (emitter as { off?: (e: string, l: unknown) => void }).off?.(event, listener);
    }
    this.listeners.length = 0;

    await this.closeQueueEvents();
  }

  /**
   * Close all QueueEvents instances created by setupBullMQQueue.
   * Called automatically when the module closes; safe to call yourself.
   */
  async closeQueueEvents(): Promise<void> {
    for (const queueEvents of this.managedQueueEvents) {
      try {
        await queueEvents.close?.();
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
  setupQueueWithEvents(queue: unknown, queueEvents: unknown, queueName?: string): void {
    if (!looksUpJobs(queue)) {
      this.logger.warn('Invalid BullMQ queue instance provided');
      return;
    }

    if (!isQueueEvents(queueEvents)) {
      this.logger.warn('Invalid BullMQ QueueEvents instance provided');
      return;
    }

    const getJob = queue.getJob.bind(queue);

    const name = queueName || queue.name || 'unknown';

    // Track when jobs are added (BullMQ signature: { jobId: string })
    // Reuse existing handler - same signature
    this.listen(queueEvents as unknown as EmittingQueue, 'waiting', (args: { jobId: string }) => {
      this.handleJobWaiting(name, args.jobId, queue);
    });

    // Track when jobs start processing (BullMQ signature: { jobId: string })
    // Need to fetch job first, then call existing handler
    this.listen(
      queueEvents as unknown as EmittingQueue,
      'active',
      async (args: { jobId: string }) => {
        try {
          const job = await getJob(args.jobId);
          if (job) this.handleJobActive(name, job);
        } catch (error) {
          this.logger.debug(`Failed to track BullMQ active job: ${error}`);
        }
      },
    );

    // Track when jobs complete (BullMQ signature: { jobId: string, returnvalue: string })
    // Need to fetch job and parse returnvalue
    this.listen(
      queueEvents as unknown as EmittingQueue,
      'completed',
      async (args: { jobId: string; returnvalue: string }) => {
        try {
          const job = (await getJob(args.jobId)) ?? this.rememberedJob(args.jobId);
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
      },
    );

    // Track when jobs fail (BullMQ signature: { jobId: string, failedReason: string })
    // Need to fetch job and convert failedReason to Error
    this.listen(
      queueEvents as unknown as EmittingQueue,
      'failed',
      async (args: { jobId: string; failedReason: string }) => {
        try {
          const job = (await getJob(args.jobId)) ?? this.rememberedJob(args.jobId);
          if (!job) return;

          // Convert failedReason string to Error object for existing handler
          const error = new Error(args.failedReason || 'Unknown error');
          this.handleJobFailed(name, job, error);
        } catch (error) {
          this.logger.debug(`Failed to track BullMQ failed job: ${error}`);
        }
      },
    );

    // Track delayed jobs (BullMQ signature: { jobId: string, delay: number })
    // Reuse existing handler - same signature
    this.listen(queueEvents as unknown as EmittingQueue, 'delayed', (args: { jobId: string }) => {
      this.handleJobDelayed(name, args.jobId, queue);
    });

    this.logger.log(`BullMQ job interceptors installed for queue: ${name}`);
  }

  /** Remembers a job that has started, dropping the oldest if too many are open. */
  private track(jobId: string, name: string): void {
    if (this.jobTracking.size >= JobWatcher.MAX_TRACKED_JOBS) {
      const oldest = this.jobTracking.keys().next();
      if (!oldest.done) this.jobTracking.delete(oldest.value);
    }

    this.jobTracking.set(jobId, { startedAt: Date.now(), name });
  }

  /** What was remembered about a job that has just ended, and forgets it. */
  private finish(jobId: string): { startedAt: number; name: string } | undefined {
    const tracked = this.jobTracking.get(jobId);
    this.jobTracking.delete(jobId);

    return tracked;
  }

  /**
   * A job BullMQ has already removed, as far as this watcher remembers it.
   *
   * `removeOnComplete` is the ordinary production setting, and with it the job
   * is gone before the `completed` event is handled — `getJob` answers with
   * nothing. The handler returned there, so nothing was ever recorded past
   * `active`: every job on the page sat unfinished forever, and the entry
   * remembering it was never removed either.
   */
  private rememberedJob(jobId: string): BullJobLike | undefined {
    const tracked = this.jobTracking.get(jobId);

    return tracked ? { id: jobId, name: tracked.name } : undefined;
  }

  private async handleJobWaiting(
    queueName: string,
    jobId: string,
    queue: BullQueueLike,
  ): Promise<void> {
    try {
      const job = await queue.getJob?.(jobId);
      if (!job) return;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'waiting',
        attempts: job.attemptsMade ?? 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track waiting job: ${error}`);
    }
  }

  private handleJobActive(queueName: string, job: BullJobLike): void {
    try {
      const jobId = String(job.id ?? job);
      this.track(jobId, job.name || 'unknown');

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'active',
        attempts: job.attemptsMade ?? 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track active job: ${error}`);
    }
  }

  private handleJobCompleted(queueName: string, job: BullJobLike, result: unknown): void {
    try {
      const jobId = String(job.id ?? job);
      const tracked = this.finish(jobId);
      const duration = tracked ? Date.now() - tracked.startedAt : undefined;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'completed',
        attempts: job.attemptsMade ?? 0,
        duration,
        result: this.captureData(result),
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track completed job: ${error}`);
    }
  }

  private handleJobFailed(queueName: string, job: BullJobLike, error: Error): void {
    try {
      const jobId = String(job.id ?? job);
      const tracked = this.finish(jobId);
      const duration = tracked ? Date.now() - tracked.startedAt : undefined;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'failed',
        attempts: job.attemptsMade ?? 0,
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
    queue: BullQueueLike,
  ): Promise<void> {
    try {
      const job = await queue.getJob?.(jobId);
      if (!job) return;

      const payload: JobEntry['payload'] = {
        name: job.name || 'unknown',
        queue: queueName,
        data: this.captureData(job.data),
        status: 'delayed',
        attempts: job.attemptsMade ?? 0,
      };

      this.collector.collect('job', payload);
    } catch (error) {
      this.logger.debug(`Failed to track delayed job: ${error}`);
    }
  }

  private captureData(data: unknown): unknown {
    return capturePayload(data, 64 * 1024);
  }
}
