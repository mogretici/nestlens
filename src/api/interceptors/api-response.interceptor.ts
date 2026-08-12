import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
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
 * Nest's own key for `@HttpCode()`. Inlined rather than imported from
 * `@nestjs/common/constants`, which is not part of the package's public API and
 * would tie NestLens to one major version of the framework — the value has been
 * stable across Nest 9, 10 and 11. `api-response.interceptor.spec.ts` asserts it
 * still matches the framework's constant, so a rename fails a test rather than
 * silently changing every status code NestLens returns.
 */
const HTTP_CODE_METADATA = '__httpCode__';

/**
 * Wraps NestLens API responses in the standard ApiResponse envelope and writes
 * them to the transport itself.
 *
 * Writing here rather than returning the value is deliberate. Global
 * interceptors registered by the host application always sit outside
 * controller-scoped ones, so anything a handler *returns* passes through them —
 * and a typical "wrap every response" interceptor would bury the envelope one
 * level deeper (`{ data: { success, data } }`), breaking the dashboard against
 * an API that looks fine when called directly.
 *
 * This pairs with the unused `@Res()` parameter on every handler, which is what
 * tells Nest the response is already handled — see `NestLensApiController`.
 * That parameter is what actually isolates NestLens: whatever the host's
 * interceptors do with the value flowing past them, Nest will not write it.
 *
 * `undefined` is emitted downstream rather than the envelope, so no NestLens
 * data enters the host's pipeline at all. It has to be *something*: completing
 * empty makes Nest 9/10 throw `EmptyError: no elements in sequence`, because
 * those versions take the last value off this stream without a fallback.
 *
 * Errors are untouched: they propagate as an error notification, which
 * `NestLensApiExceptionFilter` renders (it writes to the adapter for the same
 * reason).
 */
@Injectable()
export class NestLensApiResponseInterceptor<T> implements NestInterceptor<T, undefined> {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<undefined> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const startTime = Date.now();

    // Store start time for exception filter
    request._startTime = startTime;

    return next.handle().pipe(
      map((response: unknown) => {
        const body = this.toApiResponse(response, Date.now() - startTime);

        this.httpAdapterHost.httpAdapter.reply(
          http.getResponse<unknown>(),
          body,
          this.statusCodeFor(context),
        );

        return undefined;
      }),
    );
  }

  /**
   * The status Nest would have applied on its own: an explicit `@HttpCode()`,
   * otherwise 201 for POST and 200 for everything else. Taking over the write
   * means taking over this too — hardcoding 200 would silently downgrade every
   * POST in the API.
   */
  private statusCodeFor(context: ExecutionContext): number {
    const explicit: unknown = Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler());
    if (typeof explicit === 'number') return explicit;

    const method = context.switchToHttp().getRequest<{ method?: string }>().method;

    return method?.toUpperCase() === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
  }

  private toApiResponse(response: unknown, duration: number): ApiResponse<T> {
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

      // Deliberately not a nullish check: a controller answering `data: null`
      // — "no such entry" — has provided data, and must not be answered with
      // the surrounding object instead.
      const dataProvided = data !== undefined;
      const responseData = dataProvided ? data : (rest as T);

      return {
        success: true,
        data: responseData,
        // Anything the controller sent alongside `data` travels with it. The
        // comment here always said "any additional properties (like
        // 'related')", but they were destructured out and dropped: a request's
        // detail page asked for the queries it ran, the controller looked them
        // up, and the envelope threw them away before the dashboard saw them.
        ...(dataProvided ? rest : {}),
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
      data: response as T,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        duration,
      },
    };
  }

  /**
   * Check if response is already in ApiResponse format.
   */
  private isApiResponse(response: unknown): response is ApiResponse<T> {
    if (!response || typeof response !== 'object') return false;
    const resp = response as Record<string, unknown>;
    return (
      'success' in resp && typeof resp.success === 'boolean' && 'data' in resp && 'error' in resp
    );
  }

  /**
   * Check if response is a structured controller response.
   */
  private isControllerResponse(response: unknown): response is ControllerResponse<T> {
    if (!response || typeof response !== 'object') return false;
    const resp = response as Record<string, unknown>;
    return 'data' in resp || 'meta' in resp;
  }
}
