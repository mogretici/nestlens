/**
 * Watcher coexistence integration test.
 *
 * Boots a single NestJS application with several watchers enabled at once —
 * including the two that rely on `DiscoveryService` (Query for TypeORM/Prisma,
 * Schedule for @nestjs/schedule) — and proves they initialize together without
 * interfering with each other. This is the cross-feature evidence for running
 * the schedule watcher alongside the query (ORM) watcher in the same process.
 */
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Cron, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { NestLensModule } from '../../nestlens.module';
import { ScheduleWatcher } from '../../watchers/schedule.watcher';
import { QueryWatcher } from '../../watchers/query/query.watcher';
import { RequestWatcher } from '../../watchers/request.watcher';

const CRON_NAME = 'coexistence-cron';

@Injectable()
class CronService {
  @Cron('0 0 1 1 *', { name: CRON_NAME })
  handle(): void {
    // no-op; never auto-fires during the test
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NestLensModule.forRoot({
      // Query (ORM) + Schedule both use DiscoveryService; enable several watchers together.
      watchers: {
        request: true,
        query: true,
        exception: true,
        schedule: true,
        event: true,
        cache: true,
      },
    }),
  ],
  providers: [CronService],
})
class CoexistenceAppModule {}

describe('Watcher coexistence (Schedule + Query/ORM + others in one app)', () => {
  it('initializes all watchers together and the Schedule watcher still finds the registry', async () => {
    const app = await NestFactory.create(CoexistenceAppModule, { logger: false });
    await app.init();

    try {
      // Both DiscoveryService-based watchers resolve and coexist.
      const scheduleWatcher = app.get(ScheduleWatcher) as unknown as {
        schedulerRegistry?: unknown;
        wrappedJobs: Set<string>;
      };
      const queryWatcher = app.get(QueryWatcher);
      const requestWatcher = app.get(RequestWatcher);

      expect(queryWatcher).toBeDefined();
      expect(requestWatcher).toBeDefined();

      // Schedule watcher discovered the registry despite the Query watcher also
      // scanning providers via DiscoveryService at bootstrap.
      expect(scheduleWatcher.schedulerRegistry).toBeDefined();
      expect(scheduleWatcher.wrappedJobs.has(CRON_NAME)).toBe(true);

      // The cron job is registered and intact.
      const registry = app.get(SchedulerRegistry);
      expect(registry.getCronJobs().has(CRON_NAME)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
