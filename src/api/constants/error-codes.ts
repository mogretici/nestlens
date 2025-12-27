/**
 * Standard error codes for NestLens API responses.
 * These codes provide machine-readable error identification.
 */
export enum ErrorCode {
  // General errors
  INTERNAL_ERROR = 'ERR_INTERNAL',
  VALIDATION_ERROR = 'ERR_VALIDATION',
  BAD_REQUEST = 'ERR_BAD_REQUEST',

  // Resource errors
  NOT_FOUND = 'ERR_NOT_FOUND',
  ENTRY_NOT_FOUND = 'ERR_ENTRY_NOT_FOUND',
  TAG_NOT_FOUND = 'ERR_TAG_NOT_FOUND',

  // Rate limiting
  RATE_LIMITED = 'ERR_RATE_LIMITED',

  // Storage errors
  STORAGE_ERROR = 'ERR_STORAGE',
  STORAGE_TIMEOUT = 'ERR_STORAGE_TIMEOUT',

  // Configuration errors
  CONFIG_ERROR = 'ERR_CONFIG',
  DISABLED = 'ERR_DISABLED',
}

/**
 * Human-readable messages for each error code.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred',
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.BAD_REQUEST]: 'Bad request',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.ENTRY_NOT_FOUND]: 'Entry not found',
  [ErrorCode.TAG_NOT_FOUND]: 'Tag not found',
  [ErrorCode.RATE_LIMITED]: 'Rate limit exceeded',
  [ErrorCode.STORAGE_ERROR]: 'Storage error occurred',
  [ErrorCode.STORAGE_TIMEOUT]: 'Storage operation timed out',
  [ErrorCode.CONFIG_ERROR]: 'Configuration error',
  [ErrorCode.DISABLED]: 'NestLens is disabled',
};

/**
 * HTTP status codes mapped to error codes.
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ENTRY_NOT_FOUND]: 404,
  [ErrorCode.TAG_NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.STORAGE_ERROR]: 500,
  [ErrorCode.STORAGE_TIMEOUT]: 504,
  [ErrorCode.CONFIG_ERROR]: 500,
  [ErrorCode.DISABLED]: 503,
};
