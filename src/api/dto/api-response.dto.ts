import { ErrorCode } from '../constants/error-codes';

/**
 * Pagination metadata for paginated responses.
 */
export interface PaginationMeta {
  total?: number;
  limit: number;
  offset?: number;
  hasMore?: boolean;
  nextCursor?: number;
  prevCursor?: number;
}

/**
 * Standard metadata included in all API responses.
 */
export interface ResponseMeta {
  timestamp: string;
  duration?: number;
  pagination?: PaginationMeta;
}

/**
 * Standard error structure for API responses.
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  stack?: string; // Only included in development mode
}

/**
 * Standard API response wrapper.
 * All NestLens API responses follow this format.
 *
 * @example
 * // Success response
 * {
 *   success: true,
 *   data: { ... },
 *   error: null,
 *   meta: { timestamp: '2025-01-01T00:00:00.000Z', duration: 12 }
 * }
 *
 * @example
 * // Error response
 * {
 *   success: false,
 *   data: null,
 *   error: { code: 'ERR_NOT_FOUND', message: 'Entry not found' },
 *   meta: { timestamp: '2025-01-01T00:00:00.000Z' }
 * }
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: ResponseMeta;
}

/**
 * Paginated response with cursor-based navigation.
 */
export interface CursorPaginatedApiResponse<T> extends ApiResponse<T[]> {
  meta?: ResponseMeta & {
    pagination: {
      hasMore: boolean;
      nextCursor: number | null;
      prevCursor: number | null;
      count: number;
    };
  };
}

/**
 * Helper to create a success response.
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Partial<ResponseMeta>,
): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Helper to create an error response.
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}
