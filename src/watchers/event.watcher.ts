import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { attachHosts, releaseHost } from './host-token';
import { EventWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { EventEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { capturePayload } from './capture-payload';
import { WrappedMethods, wrapMethodPreservingShape } from './wrap-method';

/**
 * The EventEmitter2 surface this watcher touches.
 *
 * `@nestjs/event-emitter` is an optional peer, so its types cannot be
 * imported — this describes the runtime shape.
 */
interface EventEmitterLike {
  emit(event: unknown, ...values: unknown[]): unknown;
  /** EventEmitter2's; a bare emitter has none, hence optional. */
  emitAsync?(event: unknown, ...values: unknown[]): unknown;
  listeners(event: string): unknown[];
}

function isEventEmitter(value: unknown): value is EventEmitterLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as EventEmitterLike).emit === 'function' &&
    typeof (value as EventEmitterLike).listeners === 'function'
  );
}

/** What an emission said before its listeners ran. */
interface Emission {
  name: string;
  values: unknown[];
  listeners: string[];
}

// Token for injecting event emitter
export const NESTLENS_EVENT_EMITTER = Symbol('NESTLENS_EVENT_EMITTER');

@Injectable()
export class EventWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventWatcher.name);
  private readonly config: EventWatcherConfig;
  /** A watcher for each further host provided under the same token. */
  private siblings: EventWatcher[] = [];
  private wrapped?: WrappedMethods;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_EVENT_EMITTER)
    private eventEmitter?: unknown,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {
    const watcherConfig = nestlensConfig.watchers?.event;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    const attached = attachHosts({
      injected: this.eventEmitter,
      moduleRef: this.moduleRef,
      token: NESTLENS_EVENT_EMITTER,
      logger: this.logger,
      watcher: 'EventWatcher',
      sibling: (host) => new EventWatcher(this.collector, this.nestlensConfig, host as never),
    });
    this.eventEmitter = attached.host as typeof this.eventEmitter;
    this.siblings = attached.siblings;

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
   * Gives the emitter back when the module closes.
   *
   * The emitter belongs to the application and outlives this module, so a
   * wrapper left on it goes on recording through a collector that is gone —
   * and a process that builds the module more than once against the same
   * emitter, as tests and `nest start --hmr` do, wraps each round on top of the
   * last and records one entry per layer.
   */
  onModuleDestroy(): void {
    for (const sibling of this.siblings) sibling.onModuleDestroy();
    this.siblings = [];
    releaseHost(this.eventEmitter, 'EventWatcher');

    this.wrapped?.restore();
    this.wrapped = undefined;
  }

  /**
   * Wraps `emit` and `emitAsync`, so an entry's duration is the time the
   * listeners took.
   *
   * This used to listen with `onAny`, which EventEmitter2 calls before any
   * listener, and stop the clock at the next `setImmediate` — which measured
   * whatever ran until the event loop came round, including everything the
   * emitting code did after `emit()` returned, and none of what an `emitAsync`
   * listener awaited. Around the call, `emit` is timed until its synchronous
   * listeners return and `emitAsync` until every listener's promise settles.
   */
  private setupInterceptors(): void {
    const emitter = this.eventEmitter;
    if (!isEventEmitter(emitter)) return;

    this.wrapped = new WrappedMethods(emitter as unknown as Record<string, unknown>);

    for (const method of ['emit', 'emitAsync']) {
      this.wrapped.replace(method, (original) =>
        wrapMethodPreservingShape<typeof original, Emission | undefined>(
          original,
          ({ durationMs, context }) => {
            if (context) this.collectEntry(context, durationMs);
          },
          (args) => this.readEmission(args),
        ),
      );
    }

    this.logger.log('Event interceptors installed');
  }

  /** Read before the call: a `once` listener is gone by the time it returns. */
  private readEmission(args: unknown[]): Emission | undefined {
    const [event, ...values] = args;
    const name = Array.isArray(event) ? event.map(String).join('.') : String(event);

    if (this.config.ignoreEvents?.some((ignored) => name.includes(ignored))) {
      return undefined;
    }

    return { name, values, listeners: this.getListenerNames(name) };
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

  private collectEntry({ name, values, listeners }: Emission, duration: number): void {
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

    // A single value is recorded as itself rather than as a list of one.
    return capturePayload(values.length === 1 ? values[0] : values, 64 * 1024);
  }
}
