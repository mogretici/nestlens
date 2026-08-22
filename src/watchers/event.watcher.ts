import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  OnModuleDestroy,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { EventWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { EventEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';

/**
 * The EventEmitter2 surface this watcher touches.
 *
 * `@nestjs/event-emitter` is an optional peer, so its types cannot be
 * imported — this describes the runtime shape.
 */
interface EventEmitterLike {
  onAny(listener: (event: string | string[], ...values: unknown[]) => void): unknown;
  /** Present on EventEmitter2; absent on a bare emitter, hence the check. */
  offAny?(listener: (event: string | string[], ...values: unknown[]) => void): unknown;
  listeners(event: string): unknown[];
}

function isEventEmitter(value: unknown): value is EventEmitterLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as EventEmitterLike).onAny === 'function' &&
    typeof (value as EventEmitterLike).listeners === 'function'
  );
}

// Token for injecting event emitter
export const NESTLENS_EVENT_EMITTER = Symbol('NESTLENS_EVENT_EMITTER');

@Injectable()
export class EventWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventWatcher.name);
  private readonly config: EventWatcherConfig;
  /** Kept so it can be taken off again. */
  private anyListener?: (event: string | string[], ...values: unknown[]) => void;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_EVENT_EMITTER)
    private readonly eventEmitter?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.event;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if event emitter was provided
    if (!this.eventEmitter) {
      this.logger.debug(
        'EventWatcher: No event emitter found. ' +
          'To enable event tracking, install and configure @nestjs/event-emitter.',
      );
      return;
    }

    this.setupInterceptors();
  }

  /**
   * Stops listening when the module closes.
   *
   * The emitter belongs to the application and outlives this module, so a
   * listener left on it goes on recording through a collector that is gone —
   * and a process that builds the module more than once against the same
   * emitter, as tests and `nest start --hmr` do, adds one listener per round
   * and records one entry per listener.
   */
  onModuleDestroy(): void {
    const emitter = this.eventEmitter;

    if (this.anyListener && isEventEmitter(emitter) && typeof emitter.offAny === 'function') {
      emitter.offAny(this.anyListener);
    }

    this.anyListener = undefined;
  }

  private setupInterceptors(): void {
    const emitter = this.eventEmitter;
    if (!isEventEmitter(emitter)) return;

    // Use onAny to intercept all events
    this.anyListener = (event: string | string[], ...values: unknown[]) => {
      const startTime = Date.now();

      // Normalize event name
      const eventName = Array.isArray(event) ? event.join('.') : event;

      // Check if event should be ignored
      if (this.config.ignoreEvents?.some((e) => eventName.includes(e))) {
        return;
      }

      // Get listener count for this event
      const listeners = this.getListenerNames(eventName);

      // Track event emission
      setImmediate(() => {
        const duration = Date.now() - startTime;
        this.collectEntry(eventName, values, listeners, duration);
      });
    };

    emitter.onAny(this.anyListener);

    this.logger.log('Event interceptors installed');
  }

  private getListenerNames(eventName: string): string[] {
    const emitter = this.eventEmitter;
    if (!isEventEmitter(emitter)) return [];

    try {
      const listeners = emitter.listeners(eventName);
      return listeners.map((listener: unknown) => {
        // Try to extract function/class name
        if (typeof listener === 'function') {
          return listener.name || 'anonymous';
        }
        return 'unknown';
      });
    } catch {
      return [];
    }
  }

  private collectEntry(
    name: string,
    values: unknown[],
    listeners: string[],
    duration: number,
  ): void {
    // Combine all values into a single payload
    const payload: EventEntry['payload'] = {
      name,
      payload: this.capturePayload(values),
      listeners,
      duration,
    };

    this.collector.collect('event', payload);
  }

  private capturePayload(values: unknown[]): unknown {
    if (!values || values.length === 0) return undefined;

    try {
      // If single value, return it directly
      const payload = values.length === 1 ? values[0] : values;

      // Limit size to prevent huge payloads from bloating storage
      const json = JSON.stringify(payload);
      const maxSize = 64 * 1024; // 64KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return payload;
    } catch {
      return { _error: 'Unable to serialize payload' };
    }
  }
}
