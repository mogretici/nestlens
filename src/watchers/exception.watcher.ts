import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ApplicationConfig, BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { isNestLensRequest } from '../api/route-path';
import { CollectorService } from '../core/collector.service';
import { ExceptionWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ExceptionEntry, NestLensRequest } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { describeThrown } from './thrown-value';

/**
 * Records an exception and then answers exactly as Nest would have.
 *
 * It used to write its own response, and the two did not agree. Nest's
 * `BaseExceptionFilter` recognises the shape the `http-errors` package throws —
 * `{ statusCode, message }`, which is what body-parser, serve-static and a
 * great many middlewares raise — and answers with the status it carries. This
 * answered 500 to all of them, and put the thrown message in the body where
 * Nest deliberately does not. Measured on one application with the watcher and
 * one without:
 *
 *     without   413  {"statusCode":413,"message":"request entity too large"}
 *     with      500  {"statusCode":500,"message":"request entity too large",
 *                     "error":"Internal Server Error"}
 *
 * A payload-too-large became an internal error, and the internal message of
 * every other unknown failure reached the client. Installing a debugging tool
 * must not change what the application it is watching answers.
 *
 * So the response is Nest's own, by inheritance rather than by imitation: the
 * next thing Nest changes about it changes here too.
 */
@Catch()
@Injectable()
export class ExceptionWatcher extends BaseExceptionFilter implements ExceptionFilter {
  private readonly config: ExceptionWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    protected readonly httpAdapterHost: HttpAdapterHost,
    private readonly applicationConfig: ApplicationConfig,
  ) {
    super(httpAdapterHost.httpAdapter);
    const watcherConfig = nestlensConfig.watchers?.exception;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  /**
   * `unknown`, not `Error`: an application can throw a string, a bare object or
   * `null`, and Nest hands all of them here exactly as they were thrown. The
   * old signature was a promise the runtime does not keep, and reading
   * `.name` off `null` under it took the process down.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType<string>();

    // Only handle HTTP context - GraphQL has its own error handling
    if (contextType !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<NestLensRequest>();
    const response = ctx.getResponse<unknown>();

    // Guard against undefined request or response
    if (!request || !response) {
      throw exception;
    }

    // Skip if disabled
    if (!this.config.enabled) {
      this.sendException(exception, host);
      return;
    }

    // Skip NestLens's own traffic — dashboard, API and event stream.
    const requestPath = this.getRequestPath(request);
    if (
      isNestLensRequest(
        requestPath,
        this.nestlensConfig.path,
        this.applicationConfig.getGlobalPrefix(),
      )
    ) {
      this.sendException(exception, host);
      return;
    }

    // Described before anything is read off it: an application may throw a
    // string, a bare object or `null`, and all three reach here as-is.
    const thrown = describeThrown(exception);

    // Skip ignored exceptions
    if (this.config.ignoreExceptions?.includes(thrown.name)) {
      this.sendException(exception, host);
      return;
    }

    const requestId = request.nestlensRequestId;

    const payload: ExceptionEntry['payload'] = {
      name: thrown.name,
      message: thrown.message,
      stack: thrown.stack,
      code: this.getExceptionCode(exception),
      context: this.getExceptionContext(host),
      request: {
        method: request?.method,
        url: request?.originalUrl || request?.url,
        body: request?.body,
      },
    };

    // Use collectImmediate for exceptions (important to save immediately)
    this.collector.collectImmediate('exception', payload, requestId);

    // Send the error response (adapter-agnostic: works on Express and Fastify)
    this.sendException(exception, host);
  }

  private getRequestPath(request: NestLensRequest): string {
    // Express exposes `path`; Fastify only exposes `url` (which includes the query string).
    const expressPath = (request as { path?: string }).path;
    if (typeof expressPath === 'string') {
      return expressPath;
    }
    const url = (request as { url?: string }).url;
    return typeof url === 'string' ? url.split('?')[0] : '';
  }

  /**
   * Nest's answer, not ours. See the note on the class.
   *
   * `BaseExceptionFilter` reads its adapter from the `applicationRef` it was
   * constructed with, falling back to its own injected `httpAdapterHost` — and
   * this class supplies that host, so both roads lead to the same adapter.
   */
  private sendException(exception: unknown, host: ArgumentsHost): void {
    super.catch(exception, host);
  }

  private getExceptionCode(exception: unknown): string | number | undefined {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    // Check for common error code properties using type guard
    if (this.hasErrorCode(exception)) {
      return exception.code;
    }

    return undefined;
  }

  private hasErrorCode(error: unknown): error is { code: string | number } {
    // `in` throws on anything that is not an object — including `null`, which
    // is what a rejected promise with no reason arrives as. The type said
    // `Error`; the runtime does not.
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    if (!('code' in error)) {
      return false;
    }

    const errorWithCode = error as { code: unknown };
    return typeof errorWithCode.code === 'string' || typeof errorWithCode.code === 'number';
  }

  private getExceptionContext(host: ArgumentsHost): string {
    const type = host.getType();

    if (type === 'http') {
      return 'HTTP';
    } else if (type === 'rpc') {
      return 'RPC';
    } else if (type === 'ws') {
      return 'WebSocket';
    }

    return type;
  }
}
