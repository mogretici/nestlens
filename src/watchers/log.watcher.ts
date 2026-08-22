import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';
import { inspect } from 'node:util';
import { CollectorService } from '../core/collector.service';
import { LogWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { LogEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';

const LOG_LEVEL_PRIORITY: Record<string, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
};

@Injectable()
export class NestLensLogger extends ConsoleLogger {
  private readonly config: LogWatcherConfig;
  private readonly minLevelPriority: number;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    super();
    const watcherConfig = nestlensConfig.watchers?.log;
    this.config = resolveWatcherConfig(watcherConfig, { minLevel: 'log' });

    this.minLevelPriority = LOG_LEVEL_PRIORITY[this.config.minLevel ?? 'log'];
  }

  verbose(message: string, context?: string): void;
  verbose(message: string, ...optionalParams: unknown[]): void;
  verbose(message: string, ...optionalParams: unknown[]): void {
    super.verbose(message, ...optionalParams);
    this.collectLog('verbose', message, this.extractContext(optionalParams));
  }

  debug(message: string, context?: string): void;
  debug(message: string, ...optionalParams: unknown[]): void;
  debug(message: string, ...optionalParams: unknown[]): void {
    super.debug(message, ...optionalParams);
    this.collectLog('debug', message, this.extractContext(optionalParams));
  }

  log(message: string, context?: string): void;
  log(message: string, ...optionalParams: unknown[]): void;
  log(message: string, ...optionalParams: unknown[]): void {
    super.log(message, ...optionalParams);
    this.collectLog('log', message, this.extractContext(optionalParams));
  }

  warn(message: string, context?: string): void;
  warn(message: string, ...optionalParams: unknown[]): void;
  warn(message: string, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams);
    this.collectLog('warn', message, this.extractContext(optionalParams));
  }

  error(message: string, stackOrContext?: string): void;
  error(message: string, stack?: string, context?: string): void;
  error(message: string, ...optionalParams: unknown[]): void;
  error(message: string, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);

    const { context, stack } = this.extractErrorParams(optionalParams);
    this.collectLog('error', message, context, stack);
  }

  private collectLog(
    level: LogEntry['payload']['level'],
    message: string,
    context?: string,
    stack?: string,
  ): void {
    if (!this.config.enabled) return;

    // Check minimum level
    const levelPriority = LOG_LEVEL_PRIORITY[level];
    if (levelPriority < this.minLevelPriority) return;

    // Skip NestLens internal logs
    if (context?.includes('NestLens') || context?.includes('Collector')) {
      return;
    }

    const payload: LogEntry['payload'] = {
      level,
      message: this.toMessageString(message),
      context,
      stack,
    };

    this.collector.collect('log', payload);
  }

  private extractContext(optionalParams: unknown[]): string | undefined {
    if (optionalParams.length === 0) return undefined;

    const lastParam = optionalParams[optionalParams.length - 1];
    if (typeof lastParam === 'string') {
      return lastParam;
    }

    return undefined;
  }

  private extractErrorParams(optionalParams: unknown[]): {
    context?: string;
    stack?: string;
  } {
    if (optionalParams.length === 0) {
      return {};
    }

    if (optionalParams.length === 1) {
      const param = optionalParams[0];
      if (typeof param === 'string') {
        // Could be stack or context
        if (param.includes('\n') || param.includes('at ')) {
          return { stack: param };
        }
        return { context: param };
      }
    }

    if (optionalParams.length >= 2) {
      return {
        stack: typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined,
        context: typeof optionalParams[1] === 'string' ? optionalParams[1] : undefined,
      };
    }

    return {};
  }

  /**
   * What an object logged as a message is recorded as.
   *
   * This ran `JSON.stringify` on it, inside the application's own logging
   * call, and threw straight back out of it:
   *
   * ```text
   * logger.log(order)          TypeError: Converting circular structure to JSON
   * logger.log({ total: 9n })  TypeError: Do not know how to serialize a BigInt
   * ```
   *
   * An entity with a relation pointing back at its parent, and a bigint column
   * — both ordinary, both printed without complaint by the logger NestLens
   * replaces. A watcher must not be able to throw where the thing it watches
   * would not have.
   *
   * `inspect` is what the console logger itself uses, so the recorded text is
   * the text that was printed, and it is bounded on every axis a payload can
   * grow along.
   */
  private toMessageString(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    try {
      return inspect(message, {
        depth: 3,
        breakLength: Infinity,
        maxArrayLength: 100,
        maxStringLength: 1_000,
      });
    } catch {
      // A custom inspector of the application's own that throws.
      return '[unrecordable]';
    }
  }
}
