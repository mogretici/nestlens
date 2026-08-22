/**
 * The scheduler registry belongs to the application.
 *
 * The watcher replaces `addCronJob` on it and `fireOnTick` on every job, and
 * both outlive the module. Nothing put them back, so a closed application went
 * on ticking through a watcher whose collector was gone — and a process that
 * builds the module more than once against the same registry, which is what
 * tests and `nest start --hmr` do, wrapped each round on top of the last:
 *
 *     three lifecycles, one tick  ->  6 entries, where 2 are the truth
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { ScheduleWatcher } from '../../watchers/schedule.watcher';

interface CronJobLike {
  fireOnTick: () => unknown;
  cronTime?: { source?: string };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('the schedule watcher and the registry it borrows', () => {
  let entries: unknown[];
  let collector: CollectorService;
  let jobs: Map<string, CronJobLike>;
  let registry: Record<string, unknown>;
  let discovery: { getProviders: () => { instance: unknown }[] };

  beforeEach(() => {
    entries = [];
    collector = {
      collect: async (_type: string, payload: unknown) => void entries.push(payload),
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    jobs = new Map();
    registry = {
      constructor: { name: 'SchedulerRegistry' },
      getCronJobs: () => jobs,
      getIntervals: () => [],
      getTimeouts: () => [],
      addCronJob: (name: string, job: CronJobLike) => void jobs.set(name, job),
    };
    discovery = { getProviders: () => [{ instance: registry }] };
  });

  const start = (): ScheduleWatcher => {
    const watcher = new ScheduleWatcher(
      collector,
      discovery as never,
      { watchers: { schedule: true } } as unknown as NestLensConfig,
    );
    watcher.onApplicationBootstrap();
    return watcher;
  };

  const cronJob = (): CronJobLike => ({
    fireOnTick: async () => undefined,
    cronTime: { source: '0 0 * * *' },
  });

  it('records a tick', async () => {
    const job = cronJob();
    registry.addCronJob = (registry.addCronJob as (n: string, j: CronJobLike) => void).bind(null);
    jobs.set('nightly', job);

    start();
    await jobs.get('nightly')!.fireOnTick();
    await settle();

    expect(entries).toHaveLength(2);
  });

  it('gives the registry back when the module closes', () => {
    const before = registry.addCronJob;

    start().onModuleDestroy();

    expect(registry.addCronJob).toBe(before);
  });

  it('gives every job back when the module closes', () => {
    const job = cronJob();
    const before = job.fireOnTick;
    jobs.set('nightly', job);

    start().onModuleDestroy();

    expect(job.fireOnTick).toBe(before);
  });

  it('gives back a job registered after it started watching', () => {
    // Registrations are intercepted, so a job added at runtime is wrapped too
    // — and has to be unwrapped with the rest.
    const job = cronJob();
    const before = job.fireOnTick;

    const watcher = start();
    (registry.addCronJob as (n: string, j: CronJobLike) => void)('later', job);
    expect(job.fireOnTick).not.toBe(before);

    watcher.onModuleDestroy();
    expect(job.fireOnTick).toBe(before);
  });

  it('does not stack across lifecycles', async () => {
    const job = cronJob();
    jobs.set('nightly', job);

    for (let i = 0; i < 3; i += 1) {
      start().onModuleDestroy();
    }

    start();
    entries = [];
    await jobs.get('nightly')!.fireOnTick();
    await settle();

    // One tick, one started and one completed — not one pair per layer.
    expect(entries).toHaveLength(2);
  });

  it('stops recording once it has closed', async () => {
    const job = cronJob();
    jobs.set('nightly', job);

    start().onModuleDestroy();
    entries = [];
    await job.fireOnTick();
    await settle();

    expect(entries).toHaveLength(0);
  });
});
