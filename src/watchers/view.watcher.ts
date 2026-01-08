import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { ViewWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ViewEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewEngine = any;

/**
 * Token for injecting view engine
 */
export const NESTLENS_VIEW_ENGINE = Symbol('NESTLENS_VIEW_ENGINE');

/**
 * ViewWatcher tracks template rendering operations including performance,
 * cache hits, and output size metrics for various template formats.
 */
@Injectable()
export class ViewWatcher implements OnModuleInit {
  private readonly logger = new Logger(ViewWatcher.name);
  private readonly config: ViewWatcherConfig;
  private originalRender?: Function;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_VIEW_ENGINE)
    private readonly viewEngine?: ViewEngine,
  ) {
    const watcherConfig = nestlensConfig.watchers?.view;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

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

  private setupInterceptors(): void {
    if (!this.viewEngine) return;

    // Wrap the render method
    if (typeof this.viewEngine.render === 'function') {
      const boundRender = this.viewEngine.render.bind(this.viewEngine);
      this.originalRender = boundRender;
      this.viewEngine.render = this.wrapRenderMethod(boundRender);
      this.logger.log('View interceptors installed');
    } else {
      this.logger.warn('ViewWatcher: View engine does not have a render method');
    }
  }

  private wrapRenderMethod(originalRender: Function): Function {
    return async (...args: unknown[]): Promise<unknown> => {
      const startTime = Date.now();
      let status: 'rendered' | 'error' = 'rendered';
      let error: string | undefined;
      let result: unknown;

      // Extract render parameters
      const renderParams = this.extractRenderParams(args);

      try {
        result = await originalRender(...args);
        return result;
      } catch (err) {
        status = 'error';
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        this.collectEntry(
          renderParams.template,
          renderParams.format,
          renderParams.locals,
          duration,
          status,
          result,
          renderParams.cacheHit,
          error,
        );
      }
    };
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

    try {
      const json = JSON.stringify(data);
      return json.length;
    } catch {
      return undefined;
    }
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

    try {
      const json = JSON.stringify(locals);
      const maxSize = 4096; // 4KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return locals;
    } catch {
      return { _error: 'Unable to serialize locals' };
    }
  }
}
