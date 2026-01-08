import { HttpException } from '@nestjs/common';
import { ErrorCode, ERROR_MESSAGES, ERROR_HTTP_STATUS } from '../constants/error-codes';

/**
 * Custom exception for NestLens API.
 * Provides structured error responses with error codes.
 */
export class NestLensApiException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    const errorMessage = message || ERROR_MESSAGES[code];
    const httpStatus = ERROR_HTTP_STATUS[code];

    super(
      {
        code,
        message: errorMessage,
        details,
      },
      httpStatus,
    );

    this.errorCode = code;
    this.details = details;
  }

  /**
   * Create a NOT_FOUND exception for entries.
   */
  static entryNotFound(id: number): NestLensApiException {
    return new NestLensApiException(ErrorCode.ENTRY_NOT_FOUND, `Entry with ID ${id} not found`, {
      entryId: id,
    });
  }

  /**
   * Create a NOT_FOUND exception for tags.
   */
  static tagNotFound(name: string): NestLensApiException {
    return new NestLensApiException(ErrorCode.TAG_NOT_FOUND, `Tag '${name}' not found`, {
      tagName: name,
    });
  }

  /**
   * Create a validation error exception.
   */
  static validationError(message: string, details?: Record<string, unknown>): NestLensApiException {
    return new NestLensApiException(ErrorCode.VALIDATION_ERROR, message, details);
  }

  /**
   * Create a storage error exception.
   */
  static storageError(message?: string): NestLensApiException {
    return new NestLensApiException(ErrorCode.STORAGE_ERROR, message || 'A storage error occurred');
  }
}
