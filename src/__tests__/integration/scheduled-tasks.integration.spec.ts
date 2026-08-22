/**
 * What the schedule watcher actually records.
 *
 * Only `@Cron` was ever recorded. `@Interval` and `@Timeout` were reached for
 * through `SchedulerRegistry`, which holds the *timer handles* — there is no
 * callback on a `Timeout` object to wrap — so the watcher logged "registered
 * but cannot be wrapped" and moved on. The entry payload has declared
 * `interval` and `timeout` fields the whole time, documented as "reserved, not
 * currently populated", and the watcher's own page shows both decorators among
 * its examples.
 *
 * `@nestjs/schedule` keeps every scheduled method on its `SchedulerOrchestrator`
 * and turns them into timers during its `onApplicationBootstrap`, so the
 * callback does exist one layer above the registry. This boots a real
 * application with all three kinds and reads back what was stored.
 */
import { Injectable, INestApplication, Module, OnApplicationBootstrap } from '@nestjs/common';
import { CronJob } from 'cron';
import { Cron, Interval, ScheduleModule, SchedulerRegistry, Timeout } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { ScheduleEntry } from '../../types';

@Injectable()
class ScheduledWork {
  ran = { interval: 0, timeout: 0 };

  @Interval('quick-interval', 60)
  everySoOften(): void {
    this.ran.interval += 1;
  }

  @Timeout('one-off', 60)
  onceAfterAWhile(): void {
    this.ran.timeout += 1;
  }

  @Cron('0 0 1 1 *', { name: 'new-year' })
  yearly(): void {
    // Never fires during a test; it is here so the cron path stays covered.
  }
}

@Injectable()
class FailingWork {
  @Timeout('breaks', 60)
  breaks(): void {
    throw new Error('the task failed');
  }
}

/** A cron job registered by hand, whose tick is not wrapped by Nest. */
@Injectable()
class ManualCron implements OnApplicationBootstrap {
  constructor(private readonly registry: SchedulerRegistry) {}

  onApplicationBootstrap(): void {
    const job = new CronJob('0 0 1 1 *', () => {
      throw new Error('the manual job failed');
    });

    this.registry.addCronJob('manual', job as never);
  }

  async fire(): Promise<void> {
    await (this.registry.getCronJob('manual') as unknown as { fireOnTick: () => Promise<void> })
      .fireOnTick()
      .catch(() => undefined);
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NestLensModule.forRoot({ watchers: { schedule: true, request: false, exception: false } }),
  ],
  providers: [ScheduledWork, FailingWork, ManualCron],
})
class AppModule {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('recording scheduled tasks', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let entries: ScheduleEntry[];
  let work: ScheduledWork;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    work = app.get(ScheduledWork);

    // Long enough for the timeout and a few intervals.
    await sleep(400);
    await app.get(CollectorService).flush();

    entries = (await app
      .get<StorageInterface>(STORAGE)
      .find({ type: 'schedule', limit: 200 })) as unknown as ScheduleEntry[];
  });

  afterAll(async () => {
    await app?.close();
  });

  const named = (name: string): ScheduleEntry['payload'][] =>
    entries.map((e) => e.payload).filter((p) => p.name === name);

  it('runs the scheduled work at all', () => {
    // If this fails the rest means nothing.
    expect(work.ran.interval).toBeGreaterThan(0);
    expect(work.ran.timeout).toBe(1);
  });

  describe('an interval', () => {
    it('is recorded', () => {
      expect(named('quick-interval').length).toBeGreaterThan(0);
    });

    it('is recorded starting and finishing', () => {
      const statuses = named('quick-interval').map((p) => p.status);

      expect(statuses).toContain('started');
      expect(statuses).toContain('completed');
    });

    it('carries how often it runs', () => {
      // The field the payload has declared all along.
      expect(named('quick-interval')[0].interval).toBe(60);
    });

    it('is recorded once per run, not once per lifecycle', () => {
      const started = named('quick-interval').filter((p) => p.status === 'started').length;

      expect(started).toBe(work.ran.interval);
    });
  });

  describe('a timeout', () => {
    it('is recorded', () => {
      expect(named('one-off').length).toBeGreaterThan(0);
    });

    it('carries how long it waited', () => {
      expect(named('one-off')[0].timeout).toBe(60);
    });

    it('is recorded exactly once', () => {
      expect(named('one-off').filter((p) => p.status === 'started')).toHaveLength(1);
    });
  });

  describe('a decorated task that throws', () => {
    /**
     * `@nestjs/schedule` wraps every decorated method in its own try/catch and
     * logs the error itself, so what it hands the scheduler never rejects.
     * Nothing downstream of that can tell a failed run from a successful one —
     * including this watcher, whatever layer it hooks. The failure is not lost,
     * it is a log entry: the framework writes it through the Nest logger, which
     * the log watcher records.
     */
    it('is recorded as having run', () => {
      expect(named('breaks').map((p) => p.status)).toContain('started');
    });

    it('is recorded as completed, because the framework swallowed the error', () => {
      // Asserting the shape of the limitation, so a future change to
      // `@nestjs/schedule` shows up here rather than as a quiet difference.
      expect(named('breaks').map((p) => p.status)).toContain('completed');
      expect(named('breaks').every((p) => p.status !== 'failed')).toBe(true);
    });
  });

  describe('a cron job registered by hand', () => {
    it('is recorded as failed when its tick throws', async () => {
      // Nothing wrapped this one in a try/catch, so the throw is visible.
      await app.get(ManualCron).fire();
      await app.get(CollectorService).flush();

      const manual = (
        (await app
          .get<StorageInterface>(STORAGE)
          .find({ type: 'schedule', limit: 200 })) as unknown as ScheduleEntry[]
      )
        .map((e) => e.payload)
        .filter((p) => p.name === 'manual');

      expect(manual.map((p) => p.status)).toContain('failed');
      expect(manual.find((p) => p.status === 'failed')?.error).toContain('the manual job failed');
    });
  });
});
