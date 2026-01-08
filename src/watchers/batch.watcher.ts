import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { BatchWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { BatchEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BatchProcessor = any;

/**
 * Token for injecting batch processor service
 */
export const NESTLENS_BATCH_PROCESSOR = Symbol('NESTLENS_BATCH_PROCESSOR');

/**
 * BatchWatcher tracks batch/bulk operations in NestJS applications.
 * Monitors batch processing operations, capturing total/processed/failed items,
 * duration, memory usage, and status.
 */
@Injectable()
export class BatchWatcher implements OnModuleInit {
  private readonly logger = new Logger(BatchWatcher.name);
  private readonly config: BatchWatcherConfig;
  private originalProcess?: (name: string, items: unknown[], options?: unknown) => Promise<unknown>;
  private readonly batchTracking = new Map<
    string,
    {
      startTime: number;
      startMemory: number;
    }
  >();

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_BATCH_PROCESSOR)
    private readonly batchProcessor?: BatchProcessor,
  ) {
    const watcherConfig = nestlensConfig.watchers?.batch;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if batch processor was provided
    if (!this.batchProcessor) {
      this.logger.debug(
        'BatchWatcher: No batch processor found. ' +
          'To enable batch tracking, provide a batch processor service or call trackBatch() manually.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.batchProcessor) return;

    // Try to wrap common batch processing methods
    this.wrapMethod('process');
    this.wrapMethod('processBatch');
    this.wrapMethod('bulk');
    this.wrapMethod('bulkProcess');

    this.logger.log('Batch interceptors installed');
  }

  private wrapMethod(methodName: string): void {
    if (!this.batchProcessor || typeof this.batchProcessor[methodName] !== 'function') {
      return;
    }

    const originalMethod = this.batchProcessor[methodName].bind(this.batchProcessor);

    this.batchProcessor[methodName] = async (
      name: string,
      items: unknown[],
      options?: unknown,
    ): Promise<unknown> => {
      const batchId = `${name}-${Date.now()}`;
      const startTime = Date.now();
      const startMemory = this.config.trackMemory !== false ? process.memoryUsage().heapUsed : 0;

      this.batchTracking.set(batchId, { startTime, startMemory });

      try {
        const result = await originalMethod(name, items, options);
        const duration = Date.now() - startTime;
        const memoryDelta =
          this.config.trackMemory !== false
            ? process.memoryUsage().heapUsed - startMemory
            : undefined;

        this.batchTracking.delete(batchId);

        // Extract results from the result object
        const { processed, failed, errors } = this.parseResult(result, items.length);

        // Track batch completed
        this.collectEntry(
          name,
          methodName,
          items.length,
          processed,
          failed,
          duration,
          this.getBatchSize(options),
          'completed',
          errors,
          memoryDelta,
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const memoryDelta =
          this.config.trackMemory !== false
            ? process.memoryUsage().heapUsed - startMemory
            : undefined;

        this.batchTracking.delete(batchId);

        // Track batch failed
        this.collectEntry(
          name,
          methodName,
          items.length,
          0,
          items.length,
          duration,
          this.getBatchSize(options),
          'failed',
          [error instanceof Error ? error.message : String(error)],
          memoryDelta,
        );

        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  /**
   * Manual tracking method for batch operations.
   * Call this method to track batch operations that aren't automatically intercepted.
   *
   * @param name - Name of the batch operation
   * @param operation - Type of operation (e.g., 'import', 'export', 'transform')
   * @param totalItems - Total number of items to process
   * @param processedItems - Number of items successfully processed
   * @param failedItems - Number of items that failed
   * @param duration - Duration in milliseconds
   * @param options - Additional options (batchSize, errors, memory)
   */
  trackBatch(
    name: string,
    operation: string,
    totalItems: number,
    processedItems: number,
    failedItems: number,
    duration: number,
    options?: {
      batchSize?: number;
      errors?: string[];
      memory?: number;
    },
  ): void {
    const status: 'completed' | 'partial' | 'failed' =
      failedItems === 0 ? 'completed' : processedItems > 0 ? 'partial' : 'failed';

    this.collectEntry(
      name,
      operation,
      totalItems,
      processedItems,
      failedItems,
      duration,
      options?.batchSize,
      status,
      options?.errors,
      options?.memory,
    );
  }

  private collectEntry(
    name: string,
    operation: string,
    totalItems: number,
    processedItems: number,
    failedItems: number,
    duration: number,
    batchSize?: number,
    status: 'completed' | 'partial' | 'failed' = 'completed',
    errors?: string[],
    memory?: number,
  ): void {
    const payload: BatchEntry['payload'] = {
      name,
      operation,
      totalItems,
      processedItems,
      failedItems,
      duration,
      batchSize,
      status,
      errors,
      memory,
    };

    this.collector.collect('batch', payload);
  }

  private parseResult(
    result: unknown,
    totalItems: number,
  ): {
    processed: number;
    failed: number;
    errors: string[];
  } {
    try {
      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>;

        // Try to extract processed/failed counts
        const processed = r.processed || r.successful || r.success || totalItems;
        const errorsArray = Array.isArray(r.errors) ? r.errors : [];
        const failed = r.failed || errorsArray.length || 0;
        const errors = errorsArray.length > 0 ? errorsArray : r.failures || [];

        return {
          processed: typeof processed === 'number' ? processed : totalItems,
          failed: typeof failed === 'number' ? failed : 0,
          errors: Array.isArray(errors) ? errors.map(String) : [],
        };
      }

      // If result is not an object, assume all items were processed
      return {
        processed: totalItems,
        failed: 0,
        errors: [],
      };
    } catch {
      return {
        processed: totalItems,
        failed: 0,
        errors: [],
      };
    }
  }

  private getBatchSize(options: unknown): number | undefined {
    try {
      if (typeof options === 'object' && options !== null) {
        const o = options as Record<string, unknown>;
        return (o.batchSize || o.chunkSize || o.size) as number | undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
