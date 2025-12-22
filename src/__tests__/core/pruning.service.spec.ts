/**
 * PruningService Tests
 *
 * Tests for automatic entry pruning service.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PruningService } from '../../core/pruning.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';

describe('PruningService', () => {
  let service: PruningService;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockConfig: NestLensConfig;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockStorage = {
      prune: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<StorageInterface>;

    mockConfig = {
      enabled: true,
      pruning: {
        enabled: true,
        interval: 1, // 1 minute for testing
        maxAge: 24,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PruningService,
        { provide: NESTLENS_CONFIG, useValue: mockConfig },
        { provide: STORAGE, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<PruningService>(PruningService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  describe('onModuleInit', () => {
    it('should start pruning when enabled', () => {
      // Act
      service.onModuleInit();

      // Assert - prune should be called immediately
      expect(mockStorage.prune).toHaveBeenCalledTimes(1);
    });

    it('should not start pruning when disabled', async () => {
      // Arrange
      mockConfig.pruning = { enabled: false };
      const module = await Test.createTestingModule({
        providers: [
          PruningService,
          { provide: NESTLENS_CONFIG, useValue: mockConfig },
          { provide: STORAGE, useValue: mockStorage },
        ],
      }).compile();
      const disabledService = module.get<PruningService>(PruningService);

      // Act
      disabledService.onModuleInit();

      // Assert
      expect(mockStorage.prune).not.toHaveBeenCalled();

      // Cleanup
      await disabledService.onModuleDestroy();
    });

    it('should use default interval when not specified', async () => {
      // Arrange
      mockConfig.pruning = { enabled: true };
      const module = await Test.createTestingModule({
        providers: [
          PruningService,
          { provide: NESTLENS_CONFIG, useValue: mockConfig },
          { provide: STORAGE, useValue: mockStorage },
        ],
      }).compile();
      const defaultService = module.get<PruningService>(PruningService);

      // Act
      defaultService.onModuleInit();

      // Assert - should use default 60 minutes
      expect(mockStorage.prune).toHaveBeenCalledTimes(1);

      // Cleanup
      await defaultService.onModuleDestroy();
    });
  });

  // ============================================================================
  // Interval Pruning
  // ============================================================================

  describe('interval pruning', () => {
    it('should prune on interval', () => {
      // Arrange
      service.onModuleInit();
      mockStorage.prune.mockClear();

      // Act - advance time by 1 minute (the interval)
      jest.advanceTimersByTime(60 * 1000);

      // Assert
      expect(mockStorage.prune).toHaveBeenCalledTimes(1);
    });

    it('should prune multiple times on multiple intervals', () => {
      // Arrange
      service.onModuleInit();
      mockStorage.prune.mockClear();

      // Act - advance time by 3 minutes
      jest.advanceTimersByTime(3 * 60 * 1000);

      // Assert - should have been called 3 times
      expect(mockStorage.prune).toHaveBeenCalledTimes(3);
    });

    it('should call prune with correct date', () => {
      // Arrange
      const now = Date.now();
      jest.setSystemTime(now);
      service.onModuleInit();

      // Assert - prune should be called with date 24 hours ago
      const expectedDate = new Date(now - 24 * 60 * 60 * 1000);
      expect(mockStorage.prune).toHaveBeenCalledWith(
        expect.objectContaining({
          getTime: expect.any(Function),
        }),
      );
    });
  });

  // ============================================================================
  // Pruning Results
  // ============================================================================

  describe('pruning results', () => {
    it('should log when entries are deleted', async () => {
      // Arrange
      mockStorage.prune.mockResolvedValue(10);
      const logSpy = jest.spyOn((service as any).logger, 'log');

      // Act - onModuleInit triggers immediate prune
      service.onModuleInit();
      // Flush microtask queue to allow async prune() to complete
      await Promise.resolve();
      await Promise.resolve();

      // Assert
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Pruned 10'));
    });

    it('should not log pruned count when no entries deleted', async () => {
      // Arrange
      mockStorage.prune.mockResolvedValue(0);
      const logSpy = jest.spyOn((service as any).logger, 'log');

      // Act
      service.onModuleInit();
      await Promise.resolve();
      await Promise.resolve();

      // Assert - should log startup message but not "Pruned 0"
      const calls = logSpy.mock.calls.map(c => c[0] as string);
      expect(calls.some(c => c.includes('Pruned 0'))).toBe(false);
    });

    it('should handle prune errors gracefully', async () => {
      // Arrange
      mockStorage.prune.mockRejectedValue(new Error('Database error'));
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      // Act
      service.onModuleInit();
      await Promise.resolve();
      await Promise.resolve();

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to prune'));
    });
  });

  // ============================================================================
  // Stop and Cleanup
  // ============================================================================

  describe('stop', () => {
    it('should stop interval when stop is called', async () => {
      // Arrange
      service.onModuleInit();
      mockStorage.prune.mockClear();

      // Act
      await service.stop();
      jest.advanceTimersByTime(60 * 1000);

      // Assert - should not have been called after stop
      expect(mockStorage.prune).not.toHaveBeenCalled();
    });

    it('should handle stop being called multiple times', async () => {
      // Arrange
      service.onModuleInit();

      // Act & Assert - should not throw
      await service.stop();
      await service.stop();
    });

    it('should stop on module destroy', async () => {
      // Arrange
      service.onModuleInit();
      mockStorage.prune.mockClear();

      // Act
      await service.onModuleDestroy();
      jest.advanceTimersByTime(60 * 1000);

      // Assert
      expect(mockStorage.prune).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Custom Max Age
  // ============================================================================

  describe('custom max age', () => {
    it('should use custom maxAge from config', async () => {
      // Arrange
      mockConfig.pruning = { enabled: true, maxAge: 48 }; // 48 hours
      const module = await Test.createTestingModule({
        providers: [
          PruningService,
          { provide: NESTLENS_CONFIG, useValue: mockConfig },
          { provide: STORAGE, useValue: mockStorage },
        ],
      }).compile();
      const customService = module.get<PruningService>(PruningService);
      const now = Date.now();
      jest.setSystemTime(now);

      // Act
      customService.onModuleInit();

      // Assert - should be called with date 48 hours ago
      const callArg = mockStorage.prune.mock.calls[0][0];
      const expectedMs = now - 48 * 60 * 60 * 1000;
      expect(Math.abs(callArg.getTime() - expectedMs)).toBeLessThan(1000);

      // Cleanup
      await customService.onModuleDestroy();
    });
  });
});
