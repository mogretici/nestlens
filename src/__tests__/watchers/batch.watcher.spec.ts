/**
 * BatchWatcher Tests
 *
 * Tests for the batch watcher that monitors batch/bulk operations.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { BatchWatcher, NESTLENS_BATCH_PROCESSOR } from '../../watchers/batch.watcher';

describe('BatchWatcher', () => {
  let watcher: BatchWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createBatchProcessor = (overrides: Partial<{
    process: jest.Mock;
    processBatch: jest.Mock;
    bulk: jest.Mock;
    bulkProcess: jest.Mock;
  }> = {}) => ({
    process: jest.fn().mockResolvedValue({ processed: 10, failed: 0 }),
    processBatch: jest.fn().mockResolvedValue({ processed: 5, failed: 1 }),
    bulk: jest.fn().mockResolvedValue({ successful: 100 }),
    bulkProcess: jest.fn().mockResolvedValue({}),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    batchProcessor?: ReturnType<typeof createBatchProcessor>,
  ): Promise<BatchWatcher> => {
    const providers: any[] = [
      BatchWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (batchProcessor !== undefined) {
      providers.push({ provide: NESTLENS_BATCH_PROCESSOR, useValue: batchProcessor });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<BatchWatcher>(BatchWatcher);
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
        batch: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when batch watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { batch: true };
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when batch watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { batch: false };
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);

      // Act
      watcher.onModuleInit();

      // Assert - should not wrap methods
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { batch: { enabled: true, trackMemory: false } };
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
      expect((watcher as any).config.trackMemory).toBe(false);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing batch processor gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when processor is available', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof processor.process).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { batch: false };
      const processor = createBatchProcessor();
      const originalProcess = processor.process;
      watcher = await createWatcher(mockConfig, processor);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(processor.process).toBe(originalProcess);
    });
  });

  // ============================================================================
  // Batch Processing - Success
  // ============================================================================

  describe('Batch Processing - Success', () => {
    it('should collect batch completed event', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue({ processed: 10, failed: 0 }),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('importUsers', [1, 2, 3, 4, 5]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          name: 'importUsers',
          operation: 'process',
          totalItems: 5,
          processedItems: 10,
          failedItems: 0,
          status: 'completed',
        }),
      );
    });

    it('should calculate batch duration', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ processed: 3 }), 50)),
        ),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('slowBatch', [1, 2, 3]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = { processed: 100, failed: 5, data: 'result' };
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      const result = await processor.process('test', [1, 2, 3]);

      // Assert
      expect(result).toEqual(expectedResult);
    });

    it('should track memory usage when enabled', async () => {
      // Arrange
      mockConfig.watchers = { batch: { enabled: true, trackMemory: true } };
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('memoryTest', [1, 2, 3]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          memory: expect.any(Number),
        }),
      );
    });

    it('should extract batch size from options', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('batchWithSize', [1, 2, 3, 4, 5], { batchSize: 2 });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          batchSize: 2,
        }),
      );
    });

    it('should extract chunkSize from options', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('batchWithChunk', [1, 2, 3], { chunkSize: 50 });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          batchSize: 50,
        }),
      );
    });
  });

  // ============================================================================
  // Batch Processing - Failure
  // ============================================================================

  describe('Batch Processing - Failure', () => {
    it('should collect batch failed event', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockRejectedValue(new Error('Batch processing failed')),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act & Assert
      await expect(processor.process('failingBatch', [1, 2, 3]))
        .rejects.toThrow('Batch processing failed');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          name: 'failingBatch',
          status: 'failed',
          totalItems: 3,
          failedItems: 3,
          processedItems: 0,
          errors: ['Batch processing failed'],
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockRejectedValue(new Error('Critical error')),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act & Assert
      await expect(processor.process('errorBatch', [1]))
        .rejects.toThrow('Critical error');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      try {
        await processor.process('stringError', [1, 2]);
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          errors: ['String error'],
        }),
      );
    });
  });

  // ============================================================================
  // Result Parsing
  // ============================================================================

  describe('Result Parsing', () => {
    it('should parse processed count from result', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue({ processed: 42 }),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('test', Array(50).fill(1));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          processedItems: 42,
        }),
      );
    });

    it('should parse successful count from result', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue({ successful: 25 }),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('test', Array(30).fill(1));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          processedItems: 25,
        }),
      );
    });

    it('should parse failed count from result', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue({ processed: 8, failed: 2 }),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('test', Array(10).fill(1));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          processedItems: 8,
          failedItems: 2,
        }),
      );
    });

    it('should parse errors array from result', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue({
          processed: 7,
          failed: 3,
          errors: ['Error 1', 'Error 2', 'Error 3'],
        }),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('test', Array(10).fill(1));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          errors: ['Error 1', 'Error 2', 'Error 3'],
        }),
      );
    });

    it('should use total items as processed when result is not object', async () => {
      // Arrange
      const processor = createBatchProcessor({
        process: jest.fn().mockResolvedValue('success'),
      });
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('test', [1, 2, 3, 4, 5]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          totalItems: 5,
          processedItems: 5,
          failedItems: 0,
        }),
      );
    });
  });

  // ============================================================================
  // Multiple Methods
  // ============================================================================

  describe('Multiple Methods', () => {
    it('should wrap processBatch method', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.processBatch('batchName', [1, 2, 3]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          operation: 'processBatch',
        }),
      );
    });

    it('should wrap bulk method', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.bulk('bulkOp', [1, 2]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          operation: 'bulk',
        }),
      );
    });

    it('should wrap bulkProcess method', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.bulkProcess('bulkProcessOp', [1]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          operation: 'bulkProcess',
        }),
      );
    });

    it('should skip non-function methods', async () => {
      // Arrange
      const processor = {
        ...createBatchProcessor(),
        nonFunction: 'value',
      };
      watcher = await createWatcher(mockConfig, processor);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Manual Tracking
  // ============================================================================

  describe('Manual Tracking (trackBatch)', () => {
    it('should track completed batch', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackBatch('manualBatch', 'import', 100, 100, 0, 500);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          name: 'manualBatch',
          operation: 'import',
          totalItems: 100,
          processedItems: 100,
          failedItems: 0,
          duration: 500,
          status: 'completed',
        }),
      );
    });

    it('should track partial batch', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackBatch('partialBatch', 'export', 100, 80, 20, 1000);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          status: 'partial',
          processedItems: 80,
          failedItems: 20,
        }),
      );
    });

    it('should track failed batch', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackBatch('failedBatch', 'transform', 50, 0, 50, 100);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          status: 'failed',
          processedItems: 0,
          failedItems: 50,
        }),
      );
    });

    it('should include optional parameters', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackBatch('optionsBatch', 'import', 100, 95, 5, 2000, {
        batchSize: 10,
        errors: ['Error 1', 'Error 2'],
        memory: 1024 * 1024,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          batchSize: 10,
          errors: ['Error 1', 'Error 2'],
          memory: 1024 * 1024,
        }),
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty items array', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('emptyBatch', []);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          totalItems: 0,
        }),
      );
    });

    it('should handle null options', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('nullOptions', [1, 2, 3], null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          batchSize: undefined,
        }),
      );
    });

    it('should handle undefined options', async () => {
      // Arrange
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('noOptions', [1, 2, 3]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          batchSize: undefined,
        }),
      );
    });

    it('should not track memory when disabled', async () => {
      // Arrange
      mockConfig.watchers = { batch: { enabled: true, trackMemory: false } };
      const processor = createBatchProcessor();
      watcher = await createWatcher(mockConfig, processor);
      watcher.onModuleInit();

      // Act
      await processor.process('noMemory', [1, 2, 3]);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'batch',
        expect.objectContaining({
          memory: undefined,
        }),
      );
    });
  });
});
