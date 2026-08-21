import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import { isNestLensRequest } from '../api/route-path';
import { CollectorService } from '../core/collector.service';
import { ExceptionWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ExceptionEntry, NestLensRequest } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { describeThrown } from './thrown-value';

@Catch()
@Injectable()
export class ExceptionWatcher implements ExceptionFilter {
  private readonly config: ExceptionWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly applicationConfig: ApplicationConfig,
  ) {
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
      this.sendException(exception, response);
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
      this.sendException(exception, response);
      return;
    }

    // Described before anything is read off it: an application may throw a
    // string, a bare object or `null`, and all three reach here as-is.
    const thrown = describeThrown(exception);

    // Skip ignored exceptions
    if (this.config.ignoreExceptions?.includes(thrown.name)) {
      this.sendException(exception, response);
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
    this.sendException(exception, response);
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

  private sendException(exception: unknown, response: unknown): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            // Described rather than read: the application may have thrown a
            // string, a bare object or `null`, and `null.message` would turn
            // its failure into ours.
            message: describeThrown(exception).message,
            error: 'Internal Server Error',
          };

    this.httpAdapterHost.httpAdapter.reply(response, errorResponse, status);
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
