import { ConsoleLogger, Inject, Injectable, Logger } from '@nestjs/common';
import { inspect } from 'node:util';
import { CollectorService } from '../core/collector.service';
import { LogWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { LogEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { capturePayload } from './capture-payload';
import { ReportsWatcherStatus, WatcherStatus, switchedOff, watcherDocs } from './watcher-status';

/** The same bound an event payload has. */
const METADATA_MAX_BYTES = 64 * 1024;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const LOG_LEVEL_PRIORITY: Record<string, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
};

/**
 * Reads which logger the application's `Logger` calls reach.
 *
 * `app.useLogger()` hands its logger to `Logger.overrideLogger`, which keeps
 * exactly one, so a logger that is not that one hears nothing from Nest or
 * from any `new Logger(context)` in the application. `localInstance` is the
 * public getter that answers which one it is — the same object every `Logger`
 * method calls — and it has the same shape from NestJS 9 to 12, where the
 * static field behind it is protected.
 */
const APPLICATION_LOGGER = new Logger();

@Injectable()
export class NestLensLogger extends ConsoleLogger implements ReportsWatcherStatus {
  private readonly config: LogWatcherConfig;
  private readonly minLevelPriority: number;
  /** Set by the first call of any kind, so a logger taken by injection is seen in use. */
  private called = false;

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

  watcherStatus(): WatcherStatus {
    if (!this.config.enabled) return switchedOff(watcherDocs('watchers/log'));

    const docs = watcherDocs('watchers/log#using-nestlens-logger');

    if (APPLICATION_LOGGER.localInstance === this) {
      return { state: 'recording', reason: 'Installed as the application logger.', docs };
    }

    if (this.called) {
      return {
        state: 'recording',
        reason:
          "Recording the calls made to it directly. It is not the application logger, so Nest's own logs and every new Logger() do not reach it.",
        docs,
      };
    }

    return {
      state: 'waiting',
      reason:
        'NestLensLogger is not the application logger and nothing has called it: app.useLogger(app.get(NestLensLogger)) installs it.',
      docs,
    };
  }

  verbose(message: string, context?: string): void;
  verbose(message: string, ...optionalParams: unknown[]): void;
  verbose(message: string, ...optionalParams: unknown[]): void {
    super.verbose(message, ...optionalParams);
    this.collectLog('verbose', message, optionalParams, this.extractContext(optionalParams));
  }

  debug(message: string, context?: string): void;
  debug(message: string, ...optionalParams: unknown[]): void;
  debug(message: string, ...optionalParams: unknown[]): void {
    super.debug(message, ...optionalParams);
    this.collectLog('debug', message, optionalParams, this.extractContext(optionalParams));
  }

  log(message: string, context?: string): void;
  log(message: string, ...optionalParams: unknown[]): void;
  log(message: string, ...optionalParams: unknown[]): void {
    super.log(message, ...optionalParams);
    this.collectLog('log', message, optionalParams, this.extractContext(optionalParams));
  }

  warn(message: string, context?: string): void;
  warn(message: string, ...optionalParams: unknown[]): void;
  warn(message: string, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams);
    this.collectLog('warn', message, optionalParams, this.extractContext(optionalParams));
  }

  error(message: string, stackOrContext?: string): void;
  error(message: string, stack?: string, context?: string): void;
  error(message: string, ...optionalParams: unknown[]): void;
  error(message: string, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);

    const { context, stack } = this.extractErrorParams(optionalParams);
    this.collectLog('error', message, optionalParams, context, stack);
  }

  private collectLog(
    level: LogEntry['payload']['level'],
    message: string,
    optionalParams: unknown[],
    context?: string,
    stack?: string,
  ): void {
    this.called = true;
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
      metadata: this.extractMetadata(optionalParams),
    };

    this.collector.collect('log', payload);
  }

  /**
   * The object passed after the message, as in
   * `logger.log('Order placed', { orderId: 7 }, 'OrderService')`.
   *
   * The console logger prints it, and this one used to drop it. One plain
   * object is recorded; several, or values that are not plain objects, are
   * printed as before and not recorded, so `metadata` always has one shape.
   */
  private extractMetadata(optionalParams: unknown[]): Record<string, unknown> | undefined {
    const objects = optionalParams.filter(isPlainObject);
    if (objects.length !== 1) return undefined;

    return capturePayload(objects[0], METADATA_MAX_BYTES) as Record<string, unknown>;
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
