/**
 * ScheduleWatcher integration test.
 *
 * Boots a real NestJS application with `@nestjs/schedule` configured and a real
 * `@Cron` job, then verifies the watcher discovers the SchedulerRegistry through
 * DiscoveryService at bootstrap. Regression guard for issue #7
 * ("ScheduleWatcher cannot detect SchedulerRegistry").
 */
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Cron, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { NestLensModule } from '../../nestlens.module';
import { ScheduleWatcher } from '../../watchers/schedule.watcher';
import { CollectorService } from '../../core/collector.service';

const CRON_NAME = 'integration-test-cron';

@Injectable()
class CronService {
  // Runs on Jan 1st only, so it never auto-fires during the test run.
  @Cron('0 0 1 1 *', { name: CRON_NAME })
  handle(): void {
    // no-op
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NestLensModule.forRoot({ watchers: { schedule: true, request: false, exception: false } }),
  ],
  providers: [CronService],
})
class ScheduleAppModule {}

describe('ScheduleWatcher integration (@nestjs/schedule)', () => {
  it('discovers the SchedulerRegistry and wraps the registered cron job', async () => {
    const app = await NestFactory.create(ScheduleAppModule, { logger: false });
    await app.init();

    try {
      const watcher = app.get(ScheduleWatcher) as unknown as {
        schedulerRegistry?: unknown;
        wrappedJobs: Set<string>;
      };

      // The registry was found (the bug was that it stayed undefined).
      expect(watcher.schedulerRegistry).toBeDefined();
      // ...and the live cron job was wrapped for tracking.
      expect(watcher.wrappedJobs.has(CRON_NAME)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('collects a schedule entry when the wrapped cron job fires', async () => {
    const app = await NestFactory.create(ScheduleAppModule, { logger: false });
    await app.init();

    try {
      const collector = app.get(CollectorService);
      const collectSpy = jest.spyOn(collector, 'collect');

      const registry = app.get(SchedulerRegistry);
      const job = registry.getCronJobs().get(CRON_NAME);
      expect(job).toBeDefined();

      // Fire the (wrapped) job and assert the watcher recorded it.
      await job!.fireOnTick();

      expect(collectSpy).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({ name: CRON_NAME, status: 'started' }),
      );
      expect(collectSpy).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({ name: CRON_NAME, status: 'completed' }),
      );
    } finally {
      await app.close();
    }
  });

  /**
   * `@nestjs/schedule` populates the registry from its own
   * `onApplicationBootstrap`, the same phase this watcher runs in, so which
   * one goes first depends on the module graph. On NestJS 9 and 10 the watcher
   * went first, swept an empty registry and silently recorded nothing.
   *
   * The watcher hooks registration rather than relying on that ordering, which
   * this pins down: a job added after startup — as an application may legitimately
   * do — still gets tracked.
   */
  it('tracks a cron job registered after startup', async () => {
    const app = await NestFactory.create(ScheduleAppModule, { logger: false });
    await app.init();

    try {
      const collector = app.get(CollectorService);
      const collectSpy = jest.spyOn(collector, 'collect');
      const registry = app.get(SchedulerRegistry);
      const watcher = app.get(ScheduleWatcher) as unknown as { wrappedJobs: Set<string> };

      const lateName = 'registered-after-startup';
      const existing = registry.getCronJobs().get(CRON_NAME);
      expect(existing).toBeDefined();

      // Re-registering the same job object under a new name is enough: what
      // matters is that the watcher sees the registration at all.
      registry.addCronJob(lateName, existing!);

      expect(watcher.wrappedJobs.has(lateName)).toBe(true);

      await registry.getCronJobs().get(lateName)!.fireOnTick();

      expect(collectSpy).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({ name: lateName, status: 'started' }),
      );
    } finally {
      await app.close();
    }
  });
});
