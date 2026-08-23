import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { BatchWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { BatchEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { WrappedMethods, wrapMethodPreservingShape } from './wrap-method';

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
export class BatchWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchWatcher.name);
  private readonly config: BatchWatcherConfig;
  private wrapped?: WrappedMethods;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_BATCH_PROCESSOR)
    private readonly batchProcessor?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.batch;
    this.config = resolveWatcherConfig(watcherConfig);
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

    this.wrapped = new WrappedMethods(this.batchProcessor as Record<string, unknown>);

    // Try to wrap common batch processing methods
    for (const method of ['process', 'processBatch', 'bulk', 'bulkProcess']) {
      this.wrapped.replace(method, (original) =>
        wrapMethodPreservingShape(
          original,
          ({ args, result, error, durationMs, context }) => {
            const [name, items, options] = args as [string, unknown[], unknown?];
            const total = Array.isArray(items) ? items.length : 0;
            const memoryDelta =
              context === undefined ? undefined : process.memoryUsage().heapUsed - context;

            if (error) {
              this.collectEntry(
                name,
                method,
                total,
                0,
                total,
                durationMs,
                this.getBatchSize(options),
                'failed',
                [error instanceof Error ? error.message : String(error)],
                memoryDelta,
              );
              return;
            }

            const { processed, failed, errors } = this.parseResult(result, total);

            this.collectEntry(
              name,
              method,
              total,
              processed,
              failed,
              durationMs,
              this.getBatchSize(options),
              'completed',
              errors,
              memoryDelta,
            );
          },
          this.config.trackMemory === false ? undefined : () => process.memoryUsage().heapUsed,
        ),
      );
    }

    this.logger.log('Batch interceptors installed');
  }

  onModuleDestroy(): void {
    this.wrapped?.restore();
    this.wrapped = undefined;
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
