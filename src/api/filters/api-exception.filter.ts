import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorCode, ERROR_MESSAGES } from '@/api/constants';
import { ApiResponse, ApiError } from '@/api/dto';
import { NestLensApiException } from '@/api/exceptions';

/**
 * Global exception filter for NestLens API.
 * Transforms all exceptions into standardized ApiResponse format.
 */
@Catch()
export class NestLensApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('NestLensApi');
  private readonly isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Whether this response may carry a stack trace.
   *
   * Only a fault of ours, and only outside production. A 403 from the guard
   * used to answer a refused caller with fifty frames of it — the deployment's
   * absolute paths, the framework versions, the middleware chain — which is
   * precisely what `stackTraceSanitization` exists to keep out of recorded
   * entries, handed to the one caller who has been told they may not look.
   * Nothing a caller did wrong needs a stack to explain it.
   */
  private mayIncludeStack(status: number): boolean {
    return this.isDevelopment && status >= HttpStatus.INTERNAL_SERVER_ERROR;
  }

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  /**
   * Check if an exception is HttpException-like using duck typing.
   * This handles cases where the exception comes from a different
   * @nestjs/common instance (e.g., when using npm link).
   */
  private isHttpExceptionLike(exception: unknown): exception is {
    getStatus: () => number;
    getResponse: () => unknown;
    message: string;
    stack?: string;
  } {
    return (
      exception !== null &&
      typeof exception === 'object' &&
      'getStatus' in exception &&
      'getResponse' in exception &&
      typeof (exception as { getStatus: unknown }).getStatus === 'function' &&
      typeof (exception as { getResponse: unknown }).getResponse === 'function'
    );
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<unknown>();
    const request = ctx.getRequest();

    const startTime = request._startTime ?? Date.now();
    const duration = Date.now() - startTime;

    let status: number;
    let apiError: ApiError;

    if (exception instanceof NestLensApiException) {
      // Handle NestLens-specific exceptions
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };

      apiError = {
        code: exceptionResponse.code,
        message: exceptionResponse.message,
        details: exceptionResponse.details,
      };

      if (this.mayIncludeStack(status) && exception.stack) {
        apiError.stack = exception.stack;
      }
    } else if (exception instanceof HttpException || this.isHttpExceptionLike(exception)) {
      // Handle standard NestJS HTTP exceptions (including from different module instances)
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message: string;
      let details: Record<string, unknown> | undefined;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        // ValidationPipe returns an array of messages
        if (Array.isArray(resp.message)) {
          message = resp.message.join(', ');
          details = { validationErrors: resp.message };
        }
        // What the thrower attached for the caller. The rate limit's
        // `retryAfter` was documented as part of the body and arrived in none
        // of it: everything but `message` was dropped here, so a client
        // reading the documented field found nothing and had to guess.
        if (resp.details && typeof resp.details === 'object') {
          details = { ...details, ...(resp.details as Record<string, unknown>) };
        }
      } else {
        message = exception.message;
      }

      apiError = {
        code: this.mapHttpStatusToErrorCode(status),
        message,
        details,
      };

      if (this.mayIncludeStack(status) && exception.stack) {
        apiError.stack = exception.stack;
      }
    } else if (exception instanceof Error) {
      // Handle generic errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = {
        code: ErrorCode.INTERNAL_ERROR,
        message: this.isDevelopment ? exception.message : ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
      };

      if (this.mayIncludeStack(status) && exception.stack) {
        apiError.stack = exception.stack;
      }

      // Log unexpected errors
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack);
    } else {
      // Handle unknown exception types
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = {
        code: ErrorCode.INTERNAL_ERROR,
        message: ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
      };

      this.logger.error('Unknown exception type', exception);
    }

    const apiResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: apiError,
      meta: {
        timestamp: new Date().toISOString(),
        duration,
      },
    };

    this.httpAdapterHost.httpAdapter.reply(response, apiResponse, status);
  }

  /**
   * Map HTTP status codes to error codes.
   */
  private mapHttpStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        // The guard's refusal used to arrive as `ERR_INTERNAL`, so a caller
        // reading the code could not tell "you are not allowed" from "we
        // broke" without also reading the status.
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.GATEWAY_TIMEOUT:
        return ErrorCode.STORAGE_TIMEOUT;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
