/**
 * JobWatcher Tests
 *
 * Tests for the job watcher that monitors Bull/BullMQ queue jobs.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { JobWatcher } from '../../watchers/job.watcher';

describe('JobWatcher', () => {
  let watcher: JobWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;
  let mockQueue: {
    name: string;
    on: jest.Mock;
    getJob: jest.Mock;
  };
  let eventHandlers: Record<string, Function>;

  const createWatcher = async (config: NestLensConfig): Promise<JobWatcher> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobWatcher,
        { provide: CollectorService, useValue: mockCollector },
        { provide: NESTLENS_CONFIG, useValue: config },
      ],
    }).compile();

    return module.get<JobWatcher>(JobWatcher);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    eventHandlers = {};

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockQueue = {
      name: 'test-queue',
      on: jest.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      getJob: jest.fn(),
    };

    mockConfig = {
      enabled: true,
      watchers: {
        job: { enabled: true },
      },
    };

    watcher = await createWatcher(mockConfig);
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when job watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { job: true };
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when job watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { job: false };
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      watcher = await createWatcher(mockConfig);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Queue Setup
  // ============================================================================

  describe('Queue Setup', () => {
    it('should setup event listeners on queue', () => {
      // Act
      watcher.setupQueue(mockQueue);

      // Assert
      expect(mockQueue.on).toHaveBeenCalledWith('waiting', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('active', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('delayed', expect.any(Function));
    });

    it('should use custom queue name when provided', () => {
      // Arrange & Act
      watcher.setupQueue(mockQueue, 'custom-queue');

      // Assert - queue should be configured
      expect(mockQueue.on).toHaveBeenCalled();
    });

    it('should handle invalid queue gracefully', () => {
      // Arrange
      const invalidQueue = {};

      // Act & Assert - should not throw
      expect(() => watcher.setupQueue(invalidQueue)).not.toThrow();
    });

    it('should handle null queue gracefully', () => {
      // Act & Assert - should not throw
      expect(() => watcher.setupQueue(null as any)).not.toThrow();
    });

    it('should use queue.name when no custom name provided', () => {
      // Arrange
      mockQueue.name = 'email-queue';

      // Act
      watcher.setupQueue(mockQueue);
      eventHandlers['active']?.({ id: '1', name: 'send-email', data: {} });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          queue: 'email-queue',
        }),
      );
    });
  });

  // ============================================================================
  // Waiting Event
  // ============================================================================

  describe('Waiting Event', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should collect waiting job', async () => {
      // Arrange
      const mockJob = {
        name: 'process-order',
        data: { orderId: 123 },
        attemptsMade: 0,
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      // Act
      await eventHandlers['waiting']?.('job-1');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          name: 'process-order',
          queue: 'test-queue',
          data: { orderId: 123 },
          status: 'waiting',
          attempts: 0,
        }),
      );
    });

    it('should handle job not found', async () => {
      // Arrange
      mockQueue.getJob.mockResolvedValue(null);

      // Act
      await eventHandlers['waiting']?.('nonexistent-job');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockQueue.getJob.mockRejectedValue(new Error('Queue error'));

      // Act - should not throw, errors are caught internally
      await eventHandlers['waiting']?.('job-1');

      // Assert - collector should not be called when error occurs
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Active Event
  // ============================================================================

  describe('Active Event', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should collect active job', () => {
      // Arrange
      const mockJob = {
        id: 'job-1',
        name: 'send-email',
        data: { to: 'test@example.com' },
        attemptsMade: 1,
      };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          name: 'send-email',
          queue: 'test-queue',
          data: { to: 'test@example.com' },
          status: 'active',
          attempts: 1,
        }),
      );
    });

    it('should track job start time for duration calculation', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect((watcher as any).jobTracking.has('job-1')).toBe(true);
    });

    it('should use job id or string fallback', () => {
      // Arrange
      const mockJobWithoutId = { name: 'test', data: {} };

      // Act
      eventHandlers['active']?.(mockJobWithoutId);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Completed Event
  // ============================================================================

  describe('Completed Event', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should collect completed job with result', () => {
      // Arrange
      const mockJob = {
        id: 'job-1',
        name: 'process-data',
        data: { input: 'test' },
        attemptsMade: 0,
      };
      const result = { processed: true, count: 100 };

      // Act
      eventHandlers['active']?.(mockJob); // Start tracking
      eventHandlers['completed']?.(mockJob, result);

      // Assert
      expect(mockCollector.collect).toHaveBeenLastCalledWith(
        'job',
        expect.objectContaining({
          name: 'process-data',
          status: 'completed',
          result: { processed: true, count: 100 },
        }),
      );
    });

    it('should calculate job duration', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };

      // Simulate job active then completed
      const startTime = Date.now();
      (watcher as any).jobTracking.set('job-1', startTime - 100); // Started 100ms ago

      // Act
      eventHandlers['completed']?.(mockJob, null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });

    it('should remove job from tracking after completion', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };
      eventHandlers['active']?.(mockJob);

      // Act
      eventHandlers['completed']?.(mockJob, null);

      // Assert
      expect((watcher as any).jobTracking.has('job-1')).toBe(false);
    });
  });

  // ============================================================================
  // Failed Event
  // ============================================================================

  describe('Failed Event', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should collect failed job with error', () => {
      // Arrange
      const mockJob = {
        id: 'job-1',
        name: 'risky-operation',
        data: { dangerous: true },
        attemptsMade: 3,
      };
      const error = new Error('Operation failed');

      // Act
      eventHandlers['failed']?.(mockJob, error);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          name: 'risky-operation',
          status: 'failed',
          attempts: 3,
          error: 'Operation failed',
        }),
      );
    });

    it('should handle null error', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };

      // Act
      eventHandlers['failed']?.(mockJob, null as any);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          error: 'Unknown error',
        }),
      );
    });

    it('should calculate duration for failed jobs', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };
      (watcher as any).jobTracking.set('job-1', Date.now() - 500);

      // Act
      eventHandlers['failed']?.(mockJob, new Error('Failed'));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });

    it('should remove job from tracking after failure', () => {
      // Arrange
      const mockJob = { id: 'job-1', name: 'test', data: {} };
      eventHandlers['active']?.(mockJob);

      // Act
      eventHandlers['failed']?.(mockJob, new Error('Failed'));

      // Assert
      expect((watcher as any).jobTracking.has('job-1')).toBe(false);
    });
  });

  // ============================================================================
  // Delayed Event
  // ============================================================================

  describe('Delayed Event', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should collect delayed job', async () => {
      // Arrange
      const mockJob = {
        name: 'scheduled-task',
        data: { scheduledFor: '2024-01-01' },
        attemptsMade: 0,
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      // Act
      await eventHandlers['delayed']?.('job-1');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          name: 'scheduled-task',
          status: 'delayed',
        }),
      );
    });

    it('should handle job not found', async () => {
      // Arrange
      mockQueue.getJob.mockResolvedValue(null);

      // Act
      await eventHandlers['delayed']?.('nonexistent');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Data Capture
  // ============================================================================

  describe('Data Capture', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should capture small data as-is', () => {
      // Arrange
      const mockJob = {
        id: '1',
        name: 'test',
        data: { userId: 1, action: 'signup' },
      };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          data: { userId: 1, action: 'signup' },
        }),
      );
    });

    it('should truncate large data', () => {
      // Arrange
      const mockJob = {
        id: '1',
        name: 'test',
        data: { largeField: 'x'.repeat(100000) },
      };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          data: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable data', () => {
      // Arrange
      const circularData: any = {};
      circularData.self = circularData;
      const mockJob = {
        id: '1',
        name: 'test',
        data: circularData,
      };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          data: { _error: 'Unable to serialize data' },
        }),
      );
    });

    it('should handle undefined data', () => {
      // Arrange
      const mockJob = {
        id: '1',
        name: 'test',
        data: undefined,
      };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          data: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Default Values
  // ============================================================================

  describe('Default Values', () => {
    beforeEach(() => {
      watcher.setupQueue(mockQueue);
    });

    it('should use "unknown" for missing job name', () => {
      // Arrange
      const mockJob = { id: '1', data: {} };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          name: 'unknown',
        }),
      );
    });

    it('should use 0 for missing attemptsMade', () => {
      // Arrange
      const mockJob = { id: '1', name: 'test', data: {} };

      // Act
      eventHandlers['active']?.(mockJob);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({
          attempts: 0,
        }),
      );
    });
  });

  // ============================================================================
  // Disabled Watcher
  // ============================================================================

  describe('Disabled Watcher', () => {
    it('should not log when disabled', async () => {
      // Arrange
      mockConfig.watchers = { job: { enabled: false } };
      const disabledWatcher = await createWatcher(mockConfig);
      const loggerSpy = jest.spyOn((disabledWatcher as any).logger, 'debug');

      // Act
      disabledWatcher.onModuleInit();

      // Assert - should return early without logging
      expect(loggerSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle error in active job handler gracefully', () => {
      // Arrange
      watcher.setupQueue(mockQueue as any);
      mockCollector.collect.mockImplementationOnce(() => {
        throw new Error('Collector error');
      });
      const mockJob = { id: '1', name: 'test', data: {} };

      // Act & Assert - should not throw
      expect(() => eventHandlers['active']?.(mockJob)).not.toThrow();
    });

    it('should handle error in completed job handler gracefully', () => {
      // Arrange
      watcher.setupQueue(mockQueue as any);
      mockCollector.collect.mockImplementationOnce(() => {
        throw new Error('Collector error');
      });
      const mockJob = { id: '1', name: 'test', data: {} };

      // Act & Assert - should not throw
      expect(() => eventHandlers['completed']?.(mockJob, { success: true })).not.toThrow();
    });

    it('should handle error in failed job handler gracefully', () => {
      // Arrange
      watcher.setupQueue(mockQueue as any);
      mockCollector.collect.mockImplementationOnce(() => {
        throw new Error('Collector error');
      });
      const mockJob = { id: '1', name: 'test', data: {} };
      const jobError = new Error('Job failed');

      // Act & Assert - should not throw
      expect(() => eventHandlers['failed']?.(mockJob, jobError)).not.toThrow();
    });

    it('should handle error in delayed job handler gracefully', async () => {
      // Arrange
      watcher.setupQueue(mockQueue as any);
      mockQueue.getJob.mockRejectedValueOnce(new Error('Queue error'));
      const debugSpy = jest.spyOn((watcher as any).logger, 'debug');

      // Act - call the handler (it's synchronous but triggers async work)
      eventHandlers['delayed']?.('job-1');

      // Wait for the async handler to complete
      await new Promise(process.nextTick);

      // Assert - error should be caught and logged
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to track delayed job'));
    });

    it('should handle null job in delayed handler', async () => {
      // Arrange
      watcher.setupQueue(mockQueue as any);
      mockQueue.getJob.mockResolvedValueOnce(null);

      // Act
      await eventHandlers['delayed']?.('job-1');

      // Assert - should not call collect when job is null
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });
});
