import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { DumpWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { DumpEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DumpService = any;

/**
 * Token for injecting dump/export/import service
 */
export const NESTLENS_DUMP_SERVICE = Symbol('NESTLENS_DUMP_SERVICE');

/**
 * DumpWatcher tracks database dumps, exports, imports, and migrations.
 * Monitors data transfer operations, capturing operation type, format,
 * record counts, file sizes, compression, and encryption status.
 */
@Injectable()
export class DumpWatcher implements OnModuleInit {
  private readonly logger = new Logger(DumpWatcher.name);
  private readonly config: DumpWatcherConfig;
  private readonly dumpTracking = new Map<string, number>(); // dumpId -> startTime

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_DUMP_SERVICE)
    private readonly dumpService?: DumpService,
  ) {
    const watcherConfig = nestlensConfig.watchers?.dump;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if dump service was provided
    if (!this.dumpService) {
      this.logger.debug(
        'DumpWatcher: No dump service found. ' +
          'To enable dump tracking, provide a dump/export/import service or call trackDump() manually.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.dumpService) return;

    // Try to wrap common dump/export/import methods
    this.wrapMethod('export');
    this.wrapMethod('import');
    this.wrapMethod('backup');
    this.wrapMethod('restore');
    this.wrapMethod('migrate');
    this.wrapMethod('dump');

    this.logger.log('Dump interceptors installed');
  }

  private wrapMethod(methodName: string): void {
    if (!this.dumpService || typeof this.dumpService[methodName] !== 'function') {
      return;
    }

    const originalMethod = this.dumpService[methodName].bind(this.dumpService);
    const operation = this.getOperationType(methodName);

    this.dumpService[methodName] = async (options?: unknown): Promise<unknown> => {
      const dumpId = `${methodName}-${Date.now()}`;
      const startTime = Date.now();

      this.dumpTracking.set(dumpId, startTime);

      try {
        const result = await originalMethod(options);
        const duration = Date.now() - startTime;
        this.dumpTracking.delete(dumpId);

        // Extract dump details from result
        const details = this.parseResult(result, options);

        // Track dump completed
        this.collectEntry(
          operation,
          details.format,
          details.source,
          details.destination,
          details.recordCount,
          details.fileSize,
          duration,
          'completed',
          details.compressed,
          details.encrypted,
          undefined,
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.dumpTracking.delete(dumpId);

        // Extract dump details from options
        const details = this.parseOptions(options);

        // Track dump failed
        this.collectEntry(
          operation,
          details.format,
          details.source,
          details.destination,
          undefined,
          undefined,
          duration,
          'failed',
          details.compressed,
          details.encrypted,
          error instanceof Error ? error.message : String(error),
        );

        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  /**
   * Manual tracking method for dump operations.
   * Call this method to track dump/export/import operations that aren't automatically intercepted.
   *
   * @param operation - Type of operation ('export', 'import', 'backup', 'restore', 'migrate')
   * @param format - Data format ('sql', 'json', 'csv', 'binary')
   * @param options - Operation options (source, destination, recordCount, fileSize, etc.)
   */
  trackDump(
    operation: 'export' | 'import' | 'backup' | 'restore' | 'migrate',
    format: 'sql' | 'json' | 'csv' | 'binary',
    duration: number,
    status: 'completed' | 'failed',
    options?: {
      source?: string;
      destination?: string;
      recordCount?: number;
      fileSize?: number;
      compressed?: boolean;
      encrypted?: boolean;
      error?: string;
    },
  ): void {
    this.collectEntry(
      operation,
      format,
      options?.source,
      options?.destination,
      options?.recordCount,
      options?.fileSize,
      duration,
      status,
      options?.compressed,
      options?.encrypted,
      options?.error,
    );
  }

  private collectEntry(
    operation: 'export' | 'import' | 'backup' | 'restore' | 'migrate',
    format: 'sql' | 'json' | 'csv' | 'binary',
    source?: string,
    destination?: string,
    recordCount?: number,
    fileSize?: number,
    duration: number = 0,
    status: 'completed' | 'failed' = 'completed',
    compressed?: boolean,
    encrypted?: boolean,
    error?: string,
  ): void {
    const payload: DumpEntry['payload'] = {
      operation,
      format,
      source,
      destination,
      recordCount,
      fileSize,
      duration,
      status,
      compressed,
      encrypted,
      error,
    };

    this.collector.collect('dump', payload);
  }

  private getOperationType(
    methodName: string,
  ): 'export' | 'import' | 'backup' | 'restore' | 'migrate' {
    switch (methodName.toLowerCase()) {
      case 'export':
      case 'dump':
        return 'export';
      case 'import':
        return 'import';
      case 'backup':
        return 'backup';
      case 'restore':
        return 'restore';
      case 'migrate':
        return 'migrate';
      default:
        return 'export';
    }
  }

  private parseResult(
    result: unknown,
    options?: unknown,
  ): {
    format: 'sql' | 'json' | 'csv' | 'binary';
    source?: string;
    destination?: string;
    recordCount?: number;
    fileSize?: number;
    compressed?: boolean;
    encrypted?: boolean;
  } {
    try {
      const details = {
        format: this.extractFormat(result, options),
        source: this.extractString(result, ['source', 'from', 'table']),
        destination: this.extractString(result, ['destination', 'to', 'file', 'path']),
        recordCount: this.extractNumber(result, ['recordCount', 'records', 'count', 'rows']),
        fileSize: this.extractNumber(result, ['fileSize', 'size', 'bytes']),
        compressed: this.extractBoolean(result, ['compressed', 'gzip', 'zip']),
        encrypted: this.extractBoolean(result, ['encrypted', 'secure']),
      };

      return details;
    } catch {
      return {
        format: 'json',
      };
    }
  }

  private parseOptions(options: unknown): {
    format: 'sql' | 'json' | 'csv' | 'binary';
    source?: string;
    destination?: string;
    compressed?: boolean;
    encrypted?: boolean;
  } {
    try {
      return {
        format: this.extractFormat(options),
        source: this.extractString(options, ['source', 'from', 'table']),
        destination: this.extractString(options, ['destination', 'to', 'file', 'path']),
        compressed: this.extractBoolean(options, ['compressed', 'gzip', 'zip']),
        encrypted: this.extractBoolean(options, ['encrypted', 'secure']),
      };
    } catch {
      return {
        format: 'json',
      };
    }
  }

  private extractFormat(obj: unknown, fallback?: unknown): 'sql' | 'json' | 'csv' | 'binary' {
    const format =
      this.extractString(obj, ['format', 'type']) ||
      this.extractString(fallback, ['format', 'type']);

    if (format) {
      const lower = format.toLowerCase();
      if (lower.includes('sql')) return 'sql';
      if (lower.includes('json')) return 'json';
      if (lower.includes('csv')) return 'csv';
      if (lower.includes('binary') || lower.includes('bin')) return 'binary';
    }

    return 'json'; // default
  }

  private extractString(obj: unknown, fields: string[]): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    const o = obj as Record<string, unknown>;
    for (const field of fields) {
      if (o[field] && typeof o[field] === 'string') {
        return o[field] as string;
      }
    }
    return undefined;
  }

  private extractNumber(obj: unknown, fields: string[]): number | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    const o = obj as Record<string, unknown>;
    for (const field of fields) {
      if (typeof o[field] === 'number') {
        return o[field] as number;
      }
    }
    return undefined;
  }

  private extractBoolean(obj: unknown, fields: string[]): boolean | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    const o = obj as Record<string, unknown>;
    for (const field of fields) {
      if (typeof o[field] === 'boolean') {
        return o[field] as boolean;
      }
    }
    return undefined;
  }
}
