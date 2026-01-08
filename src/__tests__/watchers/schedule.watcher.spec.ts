/**
 * ScheduleWatcher Tests
 *
 * Tests for the schedule watcher that monitors cron jobs and scheduled tasks.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { ScheduleWatcher, NESTLENS_SCHEDULER_REGISTRY } from '../../watchers/schedule.watcher';

describe('ScheduleWatcher', () => {
  let watcher: ScheduleWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createMockCronJob = (name: string, pattern = '* * * * *') => ({
    name,
    cronTime: { source: pattern },
    nextDate: jest.fn().mockReturnValue(new Date('2024-01-01T00:00:00Z')),
    fireOnTick: jest.fn().mockResolvedValue(undefined),
  });

  const createSchedulerRegistry = (
    cronJobs: Map<string, any> = new Map(),
    intervals: string[] = [],
    timeouts: string[] = [],
  ) => ({
    getCronJobs: jest.fn().mockReturnValue(cronJobs),
    getIntervals: jest.fn().mockReturnValue(intervals),
    getTimeouts: jest.fn().mockReturnValue(timeouts),
  });

  const createWatcher = async (
    config: NestLensConfig,
    schedulerRegistry?: ReturnType<typeof createSchedulerRegistry>,
  ): Promise<ScheduleWatcher> => {
    const providers: any[] = [
      ScheduleWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (schedulerRegistry !== undefined) {
      providers.push({ provide: NESTLENS_SCHEDULER_REGISTRY, useValue: schedulerRegistry });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<ScheduleWatcher>(ScheduleWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        schedule: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when schedule watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { schedule: true };
      const registry = createSchedulerRegistry();
      watcher = await createWatcher(mockConfig, registry);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when schedule watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { schedule: false };
      const registry = createSchedulerRegistry();
      watcher = await createWatcher(mockConfig, registry);

      // Act
      watcher.onModuleInit();

      // Assert - should not setup interceptors
      expect(registry.getCronJobs).not.toHaveBeenCalled();
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const registry = createSchedulerRegistry();
      watcher = await createWatcher(mockConfig, registry);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing scheduler registry gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when registry is available', async () => {
      // Arrange
      const cronJobs = new Map();
      cronJobs.set('testJob', createMockCronJob('testJob'));
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);

      // Act
      watcher.onModuleInit();

      // Assert
      expect(registry.getCronJobs).toHaveBeenCalled();
      expect(registry.getIntervals).toHaveBeenCalled();
      expect(registry.getTimeouts).toHaveBeenCalled();
    });

    it('should handle errors during setup gracefully', async () => {
      // Arrange
      const registry = {
        getCronJobs: jest.fn().mockImplementation(() => {
          throw new Error('Registry error');
        }),
        getIntervals: jest.fn().mockReturnValue([]),
        getTimeouts: jest.fn().mockReturnValue([]),
      };
      watcher = await createWatcher(mockConfig, registry);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Cron Job Execution
  // ============================================================================

  describe('Cron Job Execution', () => {
    it('should collect job started event', async () => {
      // Arrange
      const mockJob = createMockCronJob('myJob', '0 * * * *');
      const cronJobs = new Map();
      cronJobs.set('myJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          name: 'myJob',
          status: 'started',
          cron: '0 * * * *',
        }),
      );
    });

    it('should collect job completed event', async () => {
      // Arrange
      const mockJob = createMockCronJob('completedJob');
      const cronJobs = new Map();
      cronJobs.set('completedJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          name: 'completedJob',
          status: 'completed',
          duration: expect.any(Number),
        }),
      );
    });

    it('should collect job failed event', async () => {
      // Arrange
      const mockJob = createMockCronJob('failingJob');
      mockJob.fireOnTick = jest.fn().mockRejectedValue(new Error('Job failed'));
      const cronJobs = new Map();
      cronJobs.set('failingJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act & Assert
      await expect(mockJob.fireOnTick()).rejects.toThrow('Job failed');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          name: 'failingJob',
          status: 'failed',
          error: 'Job failed',
        }),
      );
    });

    it('should include next run time for completed jobs', async () => {
      // Arrange
      const nextRunDate = new Date('2024-06-01T12:00:00Z');
      const mockJob = createMockCronJob('scheduledJob');
      mockJob.nextDate = jest.fn().mockReturnValue(nextRunDate);
      const cronJobs = new Map();
      cronJobs.set('scheduledJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          status: 'completed',
          nextRun: nextRunDate.toISOString(),
        }),
      );
    });

    it('should re-throw job errors', async () => {
      // Arrange
      const mockJob = createMockCronJob('errorJob');
      mockJob.fireOnTick = jest.fn().mockRejectedValue(new Error('Critical error'));
      const cronJobs = new Map();
      cronJobs.set('errorJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act & Assert
      await expect(mockJob.fireOnTick()).rejects.toThrow('Critical error');
    });
  });

  // ============================================================================
  // Job Tracking
  // ============================================================================

  describe('Job Tracking', () => {
    it('should not wrap the same job twice', async () => {
      // Arrange
      const mockJob = createMockCronJob('uniqueJob');
      const cronJobs = new Map();
      cronJobs.set('uniqueJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);

      // Act - initialize twice
      watcher.onModuleInit();
      watcher.onModuleInit();

      // Execute job
      await mockJob.fireOnTick();

      // Assert - should only wrap once, so only one started + one completed
      const calls = mockCollector.collect.mock.calls;
      const startedCalls = calls.filter((c) => (c[1] as any).status === 'started');
      expect(startedCalls.length).toBe(1);
    });

    it('should track job duration correctly', async () => {
      // Arrange
      const mockJob = createMockCronJob('timedJob');
      mockJob.fireOnTick = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
      const cronJobs = new Map();
      cronJobs.set('timedJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      const completedCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((completedCall?.[1] as any).duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Cron Pattern Extraction
  // ============================================================================

  describe('Cron Pattern Extraction', () => {
    it('should extract cron pattern from cronTime.source', async () => {
      // Arrange
      const mockJob = {
        fireOnTick: jest.fn().mockResolvedValue(undefined),
        cronTime: { source: '*/5 * * * *' },
        nextDate: jest.fn().mockReturnValue(null),
      };
      const cronJobs = new Map();
      cronJobs.set('patternJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          cron: '*/5 * * * *',
        }),
      );
    });

    it('should handle missing cronTime', async () => {
      // Arrange
      const mockJob = {
        fireOnTick: jest.fn().mockResolvedValue(undefined),
        nextDate: jest.fn().mockReturnValue(null),
      };
      const cronJobs = new Map();
      cronJobs.set('noCronTimeJob', mockJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);
      watcher.onModuleInit();

      // Act
      await mockJob.fireOnTick();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'schedule',
        expect.objectContaining({
          cron: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Intervals and Timeouts
  // ============================================================================

  describe('Intervals and Timeouts', () => {
    it('should register intervals', async () => {
      // Arrange
      const registry = createSchedulerRegistry(new Map(), ['interval1', 'interval2'], []);
      watcher = await createWatcher(mockConfig, registry);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).wrappedJobs.has('interval1')).toBe(true);
      expect((watcher as any).wrappedJobs.has('interval2')).toBe(true);
    });

    it('should register timeouts', async () => {
      // Arrange
      const registry = createSchedulerRegistry(new Map(), [], ['timeout1', 'timeout2']);
      watcher = await createWatcher(mockConfig, registry);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).wrappedJobs.has('timeout1')).toBe(true);
      expect((watcher as any).wrappedJobs.has('timeout2')).toBe(true);
    });
  });

  // ============================================================================
  // Invalid Jobs
  // ============================================================================

  describe('Invalid Jobs', () => {
    it('should skip jobs without fireOnTick', async () => {
      // Arrange
      const invalidJob = { name: 'invalidJob' };
      const cronJobs = new Map();
      cronJobs.set('invalidJob', invalidJob);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should skip null jobs', async () => {
      // Arrange
      const cronJobs = new Map();
      cronJobs.set('nullJob', null);
      const registry = createSchedulerRegistry(cronJobs);
      watcher = await createWatcher(mockConfig, registry);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });
});
