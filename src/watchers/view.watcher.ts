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
import { attachHosts } from './host-token';
import { ViewWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ViewEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { ReportsWatcherStatus, WatcherStatus, hostWatcherStatus } from './watcher-status';
import { WrappedMethods, wrapMethodPreservingShape } from './wrap-method';
import { capturePayload } from './capture-payload';
import { serializePayload } from '../core/storage/serialize-payload';

/**
 * The view engine surface this watcher touches — a single `render` method.
 * Its arguments vary by engine (view, options, callback), and the wrapper
 * forwards them untouched, so they stay a generic list.
 */
type RenderMethod = (...args: unknown[]) => unknown;

interface ViewEngineLike {
  render?: RenderMethod;
}

/**
 * Token for injecting view engine
 */
export const NESTLENS_VIEW_ENGINE = Symbol('NESTLENS_VIEW_ENGINE');

/**
 * ViewWatcher tracks template rendering operations including performance,
 * cache hits, and output size metrics for various template formats.
 */
@Injectable()
export class ViewWatcher implements OnModuleInit, OnModuleDestroy, ReportsWatcherStatus {
  private readonly logger = new Logger(ViewWatcher.name);
  private readonly config: ViewWatcherConfig;
  /** A watcher for each further host provided under the same token. */
  private siblings: ViewWatcher[] = [];
  /** Gives back the hosts this watcher took; nothing, if it took none. */
  private releaseHosts: () => void = () => undefined;
  private wrapped?: WrappedMethods;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_VIEW_ENGINE)
    private viewEngine?: ViewEngineLike,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {
    const watcherConfig = nestlensConfig.watchers?.view;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    const attached = attachHosts({
      injected: this.viewEngine,
      moduleRef: this.moduleRef,
      token: NESTLENS_VIEW_ENGINE,
      logger: this.logger,
      watcher: 'ViewWatcher',
      sibling: (host) => new ViewWatcher(this.collector, this.nestlensConfig, host as never),
    });
    this.viewEngine = attached.host as typeof this.viewEngine;
    this.siblings = attached.siblings;
    this.releaseHosts = attached.release;

    // Check if view engine was provided
    if (!this.viewEngine) {
      this.logger.debug(
        'ViewWatcher: No view engine found. ' +
          'To enable view tracking, inject your view engine with the NESTLENS_VIEW_ENGINE token.',
      );
      return;
    }

    this.setupInterceptors();
  }

  watcherStatus(): WatcherStatus {
    return hostWatcherStatus({
      enabled: this.config.enabled === true,
      page: 'watchers/view',
      section: 'usage-example',
      recording: this.isRecording()
        ? 'Recording the render() of the view engine provided under NESTLENS_VIEW_ENGINE.'
        : undefined,
      unusable: this.viewEngine
        ? 'The object provided under NESTLENS_VIEW_ENGINE has no render() to record.'
        : undefined,
      missing: 'No view engine is provided under NESTLENS_VIEW_ENGINE.',
    });
  }

  private isRecording(): boolean {
    return (this.wrapped?.size ?? 0) > 0 || this.siblings.some((sibling) => sibling.isRecording());
  }

  private setupInterceptors(): void {
    if (!this.viewEngine) return;

    if (typeof this.viewEngine.render !== 'function') {
      this.logger.warn('ViewWatcher: View engine does not have a render method');
      return;
    }

    this.wrapped = new WrappedMethods(this.viewEngine as unknown as Record<string, unknown>);
    this.wrapped.replace('render', (original) => this.wrapRenderMethod(original as RenderMethod));

    this.logger.log('View interceptors installed');
  }

  /**
   * Gives the engine its render method back.
   *
   * The engine belongs to the application and outlives this module, so without
   * this the host renders through a watcher whose collector is gone — and a
   * process that builds the module more than once against the same engine, as
   * tests and `nest start --hmr` do, wraps each round on top of the last:
   * measured at three lifecycles, one render recorded three entries.
   */
  onModuleDestroy(): void {
    for (const sibling of this.siblings) sibling.onModuleDestroy();
    this.siblings = [];
    this.releaseHosts();
    this.releaseHosts = () => undefined;

    this.wrapped?.restore();
    this.wrapped = undefined;
  }

  /**
   * Wrapped without changing what a caller gets back.
   *
   * This was written `async`, which turns a synchronous `render` into one that
   * returns a promise — and a template engine's render usually is synchronous:
   *
   * ```text
   * res.send(engine.render('index', data))   ->  sends [object Promise]
   * ```
   *
   * The same mistake the authorization watcher was making, in the one place
   * where what comes back is written straight into a response.
   */
  private wrapRenderMethod(originalRender: RenderMethod): RenderMethod {
    const returning = wrapMethodPreservingShape(
      originalRender,
      ({ args, result, error, durationMs }) => this.recordRender(args, result, error, durationMs),
    );

    // `render(name, locals, cb)` — Express's `app.render`, most engines'
    // `renderFile` — returns nothing and answers through the callback, so the
    // render ends when the callback is called, not when the method returns.
    return ((...args: unknown[]): unknown => {
      const callback = args[args.length - 1];
      if (typeof callback !== 'function') return returning(...args);

      const started = Date.now();
      const renderArgs = args.slice(0, -1);
      let recorded = false;
      const done = (error: unknown, output?: unknown, ...rest: unknown[]): unknown => {
        if (!recorded) {
          recorded = true;
          this.recordRenderSafely(renderArgs, output, error || undefined, Date.now() - started);
        }
        return (callback as (...a: unknown[]) => unknown)(error, output, ...rest);
      };

      try {
        return originalRender(...renderArgs, done);
      } catch (error) {
        if (!recorded) {
          recorded = true;
          this.recordRenderSafely(renderArgs, undefined, error, Date.now() - started);
        }
        throw error;
      }
    }) as RenderMethod;
  }

  private recordRender(args: unknown[], result: unknown, error: unknown, durationMs: number): void {
    const renderParams = this.extractRenderParams(args);

    this.collectEntry(
      renderParams.template,
      renderParams.format,
      renderParams.locals,
      durationMs,
      error ? 'error' : 'rendered',
      result,
      renderParams.cacheHit,
      error ? (error instanceof Error ? error.message : String(error)) : undefined,
    );
  }

  /** Recording must not reach the render it describes, nor replace its error. */
  private recordRenderSafely(
    args: unknown[],
    result: unknown,
    error: unknown,
    durationMs: number,
  ): void {
    try {
      this.recordRender(args, result, error, durationMs);
    } catch (recordError) {
      this.logger.debug(`Failed to record a render: ${recordError}`);
    }
  }

  /**
   * Extract render parameters from method arguments.
   * Common patterns:
   * - render(template, locals, callback)
   * - render({ template, locals, format })
   */
  private extractRenderParams(args: unknown[]): {
    template: string;
    format: 'html' | 'json' | 'xml' | 'pdf';
    locals?: Record<string, unknown>;
    cacheHit?: boolean;
  } {
    if (args.length === 0) {
      return { template: 'unknown', format: 'html' };
    }

    // Handle object-based API
    if (typeof args[0] === 'object' && args[0] !== null && !this.isString(args[0])) {
      const data = args[0] as Record<string, unknown>;
      return {
        template: (data.template || data.view || data.name || 'unknown') as string,
        format: this.detectFormat((data.format || data.type || 'html') as string),
        locals: (data.locals || data.data || data.context) as Record<string, unknown> | undefined,
        cacheHit: data.cacheHit as boolean | undefined,
      };
    }

    // Handle positional API: render(template, locals)
    const template = String(args[0]);
    const locals =
      typeof args[1] === 'object' && args[1] !== null
        ? (args[1] as Record<string, unknown>)
        : undefined;

    return {
      template,
      format: this.detectFormat(template),
      locals,
    };
  }

  private isString(value: unknown): boolean {
    return typeof value === 'string';
  }

  /**
   * Detect format from template name or explicit format parameter
   */
  private detectFormat(input: string): 'html' | 'json' | 'xml' | 'pdf' {
    const lower = input.toLowerCase();

    if (lower.includes('pdf') || lower.endsWith('.pdf')) {
      return 'pdf';
    }
    if (lower.includes('xml') || lower.endsWith('.xml')) {
      return 'xml';
    }
    if (lower.includes('json') || lower.endsWith('.json')) {
      return 'json';
    }

    // Default to HTML for common template extensions
    return 'html';
  }

  private collectEntry(
    template: string,
    format: 'html' | 'json' | 'xml' | 'pdf',
    locals?: Record<string, unknown>,
    duration: number = 0,
    status: 'rendered' | 'error' = 'rendered',
    result?: unknown,
    cacheHit?: boolean,
    error?: string,
  ): void {
    const dataSize = this.calculateDataSize(locals);
    const outputSize = this.calculateOutputSize(result);

    const payload: ViewEntry['payload'] = {
      template,
      format,
      duration,
      status,
      dataSize,
      outputSize,
      locals: this.captureLocals(locals),
      cacheHit,
      error,
    };

    this.collector.collect('view', payload);
  }

  /**
   * Calculate the approximate size of template data in bytes
   */
  private calculateDataSize(data?: Record<string, unknown>): number | undefined {
    if (!data) return undefined;

    return serializePayload(data).length;
  }

  /**
   * Calculate the size of rendered output
   */
  private calculateOutputSize(output: unknown): number | undefined {
    if (!output) return undefined;

    try {
      if (typeof output === 'string') {
        return output.length;
      }
      if (Buffer.isBuffer(output)) {
        return output.length;
      }
      // For objects, stringify to get approximate size
      const json = JSON.stringify(output);
      return json.length;
    } catch {
      return undefined;
    }
  }

  /**
   * Capture template locals (variables) with size limits
   */
  private captureLocals(locals?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!locals || !this.config.captureData) {
      return undefined;
    }

    // `capturePayload`, not `JSON.stringify`: an entity graph is what a
    // template is usually handed, and a cycle in it threw, so the locals were
    // recorded as `{ _error }`. Masking resolves the cycle on the way to storage.
    return capturePayload(locals, 4096) as Record<string, unknown> | undefined;
  }
}
