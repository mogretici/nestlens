import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { EventWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { EventEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventEmitter2 = any;

// Token for injecting event emitter
export const NESTLENS_EVENT_EMITTER = Symbol('NESTLENS_EVENT_EMITTER');

@Injectable()
export class EventWatcher implements OnModuleInit {
  private readonly logger = new Logger(EventWatcher.name);
  private readonly config: EventWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_EVENT_EMITTER)
    private readonly eventEmitter?: EventEmitter2,
  ) {
    const watcherConfig = nestlensConfig.watchers?.event;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
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

  private setupInterceptors(): void {
    if (!this.eventEmitter) return;

    // Use onAny to intercept all events
    this.eventEmitter.onAny((event: string | string[], ...values: unknown[]) => {
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
    });

    this.logger.log('Event interceptors installed');
  }

  private getListenerNames(eventName: string): string[] {
    if (!this.eventEmitter) return [];

    try {
      const listeners = this.eventEmitter.listeners(eventName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return listeners.map((listener: any) => {
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
