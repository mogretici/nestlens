/**
 * Two runs of one job at once must not swap their outcomes.
 *
 * `cron` fires on schedule whether or not the previous tick has finished, so a
 * job that takes longer than its interval overlaps itself — and a job's error
 * handler belongs to the job, not to the run. One failure was shared between
 * them:
 *
 * ```text
 * run A starts, run B starts, A fails, B finishes first
 *   B  ->  failed, with A's error
 *   A  ->  completed
 * ```
 *
 * Both records wrong, and the one that says a failing job succeeded is the
 * worse of the two.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { ScheduleWatcher } from '../../watchers/schedule.watcher';

interface Recorded {
  name: string;
  status: string;
  error?: string;
}

/** A cron job whose tick can be finished by hand, as `cron` would. */
const controllableJob = () => {
  const pending: (() => void)[] = [];

  return {
    job: {
      name: 'reports',
      cronTime: { source: '* * * * * *' },
      nextDate: () => new Date('2026-01-01T00:00:00Z'),
      fireOnTick: (): Promise<void> => new Promise<void>((resolve) => pending.push(resolve)),
    } as Record<string, unknown>,
    finishOldest: () => pending.shift()?.(),
    finishNewest: () => pending.pop()?.(),
  };
};

const build = async (job: Record<string, unknown>): Promise<Recorded[]> => {
  const recorded: Recorded[] = [];

  const collector = {
    collect: async (_type: string, payload: Recorded) => void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const registry = {
    getCronJobs: () => new Map([['reports', job]]),
    getIntervals: () => [],
    getTimeouts: () => [],
    addCronJob: () => undefined,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ScheduleWatcher,
      { provide: CollectorService, useValue: collector },
      { provide: NESTLENS_CONFIG, useValue: { watchers: { schedule: true } } as NestLensConfig },
      {
        provide: DiscoveryService,
        useValue: { getProviders: () => [{ instance: registry }] },
      },
    ],
  }).compile();

  const watcher = module.get(ScheduleWatcher);
  watcher.onModuleInit();
  watcher.onApplicationBootstrap();

  return recorded;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('two runs of one job at once', () => {
  it('does not report the failure on the run that succeeded', async () => {
    const { job, finishOldest, finishNewest } = controllableJob();
    const recorded = await build(job);

    const runA = (job.fireOnTick as () => Promise<void>)();
    const runB = (job.fireOnTick as () => Promise<void>)();

    // A fails, through the handler `cron` calls; B finishes first.
    (job as { errorHandler?: (error: unknown) => void }).errorHandler?.(new Error('A broke'));
    finishNewest();
    await runB;
    finishOldest();
    await runA;
    await settle();

    const completed = recorded.filter((entry) => entry.status === 'completed');
    expect(completed.every((entry) => entry.error === undefined)).toBe(true);
  });

  it('still records the failure', async () => {
    const { job, finishOldest, finishNewest } = controllableJob();
    const recorded = await build(job);

    const runA = (job.fireOnTick as () => Promise<void>)();
    const runB = (job.fireOnTick as () => Promise<void>)();

    (job as { errorHandler?: (error: unknown) => void }).errorHandler?.(new Error('A broke'));
    finishNewest();
    await runB;
    finishOldest();
    await runA;
    await settle();

    const failed = recorded.filter((entry) => entry.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain('A broke');
  });

  it('records both runs as started', async () => {
    const { job, finishOldest, finishNewest } = controllableJob();
    const recorded = await build(job);

    const runA = (job.fireOnTick as () => Promise<void>)();
    const runB = (job.fireOnTick as () => Promise<void>)();
    finishOldest();
    finishNewest();
    await Promise.all([runA, runB]);
    await settle();

    expect(recorded.filter((entry) => entry.status === 'started')).toHaveLength(2);
  });

  it('still attributes a failure when only one run is going', async () => {
    const { job, finishOldest } = controllableJob();
    const recorded = await build(job);

    const run = (job.fireOnTick as () => Promise<void>)();
    (job as { errorHandler?: (error: unknown) => void }).errorHandler?.(new Error('it broke'));
    finishOldest();
    await run;
    await settle();

    const failed = recorded.filter((entry) => entry.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain('it broke');
  });

  it('records a clean run as completed', async () => {
    const { job, finishOldest } = controllableJob();
    const recorded = await build(job);

    const run = (job.fireOnTick as () => Promise<void>)();
    finishOldest();
    await run;
    await settle();

    expect(recorded.map((entry) => entry.status)).toEqual(['started', 'completed']);
  });

  it('does not carry a failure into the next run', async () => {
    const { job, finishOldest } = controllableJob();
    const recorded = await build(job);

    const first = (job.fireOnTick as () => Promise<void>)();
    (job as { errorHandler?: (error: unknown) => void }).errorHandler?.(new Error('first broke'));
    finishOldest();
    await first;

    const second = (job.fireOnTick as () => Promise<void>)();
    finishOldest();
    await second;
    await settle();

    expect(recorded.filter((entry) => entry.status === 'failed')).toHaveLength(1);
    expect(recorded.filter((entry) => entry.status === 'completed')).toHaveLength(1);
  });
});
