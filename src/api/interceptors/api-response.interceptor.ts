import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, ResponseMeta } from '../dto/api-response.dto';

/**
 * Response structure that may be returned by controllers.
 * Controllers can return data directly or with metadata.
 */
interface ControllerResponse<T> {
  data?: T;
  meta?: Partial<ResponseMeta>;
  related?: unknown;
  success?: boolean;
  message?: string;
}

/**
 * Interceptor that wraps all responses in the standard ApiResponse format.
 * Handles both direct data returns and structured responses from controllers.
 */
@Injectable()
export class NestLensApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    // Store start time for exception filter
    request._startTime = startTime;

    return next.handle().pipe(
      map((response): ApiResponse<T> => {
        const duration = Date.now() - startTime;

        // If response is already in ApiResponse format, just add timing
        if (this.isApiResponse(response)) {
          return {
            ...response,
            meta: {
              ...response.meta,
              timestamp: response.meta?.timestamp || new Date().toISOString(),
              duration,
            },
          };
        }

        // Handle structured controller responses
        if (this.isControllerResponse(response)) {
          const { data, meta, ...rest } = response;

          // Build the response with any additional properties (like 'related')
          const responseData = data !== undefined ? data : (rest as T);

          return {
            success: true,
            data: responseData,
            error: null,
            meta: {
              timestamp: new Date().toISOString(),
              duration,
              ...meta,
            },
          };
        }

        // Handle direct data returns
        return {
          success: true,
          data: response,
          error: null,
          meta: {
            timestamp: new Date().toISOString(),
            duration,
          },
        };
      }),
    );
  }

  /**
   * Check if response is already in ApiResponse format.
   */
  private isApiResponse(response: unknown): response is ApiResponse<T> {
    if (!response || typeof response !== 'object') return false;
    const resp = response as Record<string, unknown>;
    return (
      'success' in resp &&
      typeof resp.success === 'boolean' &&
      'data' in resp &&
      'error' in resp
    );
  }

  /**
   * Check if response is a structured controller response.
   */
  private isControllerResponse(
    response: unknown,
  ): response is ControllerResponse<T> {
    if (!response || typeof response !== 'object') return false;
    const resp = response as Record<string, unknown>;
    return 'data' in resp || 'meta' in resp;
  }
}
