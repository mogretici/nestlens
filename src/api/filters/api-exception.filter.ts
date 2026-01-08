import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, ERROR_MESSAGES } from '../constants/error-codes';
import { ApiResponse, ApiError } from '../dto/api-response.dto';
import { NestLensApiException } from '../exceptions/nestlens-api.exception';

/**
 * Global exception filter for NestLens API.
 * Transforms all exceptions into standardized ApiResponse format.
 */
@Catch()
export class NestLensApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('NestLensApi');
  private readonly isDevelopment = process.env.NODE_ENV !== 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const startTime = request._startTime || Date.now();
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

      if (this.isDevelopment && exception.stack) {
        apiError.stack = exception.stack;
      }
    } else if (exception instanceof HttpException) {
      // Handle standard NestJS HTTP exceptions
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
      } else {
        message = exception.message;
      }

      apiError = {
        code: this.mapHttpStatusToErrorCode(status),
        message,
        details,
      };

      if (this.isDevelopment && exception.stack) {
        apiError.stack = exception.stack;
      }
    } else if (exception instanceof Error) {
      // Handle generic errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = {
        code: ErrorCode.INTERNAL_ERROR,
        message: this.isDevelopment ? exception.message : ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
      };

      if (this.isDevelopment && exception.stack) {
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

    response.status(status).json(apiResponse);
  }

  /**
   * Map HTTP status codes to error codes.
   */
  private mapHttpStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
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
