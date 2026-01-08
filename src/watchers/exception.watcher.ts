import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { CollectorService } from '../core/collector.service';
import {
  DEFAULT_CONFIG,
  ExceptionWatcherConfig,
  NestLensConfig,
  NESTLENS_API_PREFIX,
  NESTLENS_CONFIG,
} from '../nestlens.config';
import { ExceptionEntry, NestLensRequest } from '../types';

@Catch()
@Injectable()
export class ExceptionWatcher implements ExceptionFilter {
  private readonly config: ExceptionWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.exception;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  catch(exception: Error, host: ArgumentsHost): void {
    const contextType = host.getType<string>();

    // Only handle HTTP context - GraphQL has its own error handling
    if (contextType !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<NestLensRequest>();
    const response = ctx.getResponse<Response>();

    // Guard against undefined request or response
    if (!request || !response) {
      throw exception;
    }

    // Skip if disabled
    if (!this.config.enabled) {
      this.throwException(exception, response);
      return;
    }

    // Skip NestLens own routes (dashboard and API)
    const nestlensPath = this.nestlensConfig.path || DEFAULT_CONFIG.path;
    const apiPrefix = `/${NESTLENS_API_PREFIX}`;
    if (request.path?.startsWith(nestlensPath) || request.path?.startsWith(apiPrefix)) {
      this.throwException(exception, response);
      return;
    }

    // Skip ignored exceptions
    if (this.config.ignoreExceptions?.includes(exception.name)) {
      this.throwException(exception, response);
      return;
    }

    const requestId = request.nestlensRequestId;

    const payload: ExceptionEntry['payload'] = {
      name: exception.name,
      message: exception.message,
      stack: exception.stack,
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

    // Re-throw the exception to let NestJS handle the response
    this.throwException(exception, response);
  }

  private throwException(exception: Error, response: Response): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: exception.message,
            error: 'Internal Server Error',
          };

    response.status(status).json(errorResponse);
  }

  private getExceptionCode(exception: Error): string | number | undefined {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    // Check for common error code properties using type guard
    if (this.hasErrorCode(exception)) {
      return exception.code;
    }

    return undefined;
  }

  private hasErrorCode(error: Error): error is Error & { code: string | number } {
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
