import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ApplicationConfig, BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { isNestLensRequest } from '../api/route-path';
import { CollectorService } from '../core/collector.service';
import { ExceptionWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ExceptionEntry, NestLensRequest } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { FILTER_CATCH_EXCEPTIONS_KEY } from '../core/nest-metadata-keys';
import { ReportsWatcherStatus, WatcherStatus, switchedOff, watcherDocs } from './watcher-status';
import { describeThrown } from './thrown-value';

/**
 * Records an exception and then answers exactly as Nest would have.
 *
 * It used to write its own response, and the two did not agree. Nest's
 * `BaseExceptionFilter` recognises the errors the `http-errors` package creates
 * — an `Error` carrying `status`, `statusCode` and `expose`, which is what
 * body-parser, serve-static and a great many middlewares raise — and answers
 * with the status they carry. This answered 500 to all of them, and put the
 * thrown message in the body where Nest deliberately does not. Measured on one
 * application with the watcher and one without:
 *
 * ```text
 * without   413  {"statusCode":413,"message":"request entity too large"}
 * with      500  {"statusCode":500,"message":"request entity too large",
 *                 "error":"Internal Server Error"}
 * ```
 *
 * A payload-too-large became an internal error, and the internal message of
 * every other unknown failure reached the client. Installing a debugging tool
 * must not change what the application it is watching answers.
 *
 * So the response is Nest's own, by inheritance rather than by imitation: the
 * next thing Nest changes about it changes here too.
 */
/** A class named in `@Catch()`. */
type ExceptionType = abstract new (...args: never[]) => unknown;

@Catch()
@Injectable()
export class ExceptionWatcher
  extends BaseExceptionFilter
  implements ExceptionFilter, OnModuleInit, ReportsWatcherStatus
{
  private readonly config: ExceptionWatcherConfig;
  /**
   * The global filters the routes were built with. Nest hands each route its
   * filters when it registers the routes, ahead of `onModuleInit`; one added
   * with `useGlobalFilters()` after that is in the live list and handles
   * nothing — measured on Express and Fastify.
   */
  private routedFilters?: readonly ExceptionFilter[];

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
   * Which exceptions reach this filter, read from Nest's own list.
   *
   * Nest tries global filters last-registered first and gives an exception to
   * the first whose `@Catch()` matches. Measured on Express and Fastify: a
   * catch-all passed to `app.useGlobalFilters()`, or provided as `APP_FILTER`
   * in a module imported after NestLens, took every exception and nothing was
   * recorded, while this said `recording`. `@Catch(Error)` is a catch-all as
   * well: Nest matches by `instanceof`, so it takes every HttpException too,
   * and only a throw that is not an Error gets past it. Filters on a
   * controller or a method are not in the list, and are not counted here.
   */
  watcherStatus(): WatcherStatus {
    if (!this.config.enabled) return switchedOff(watcherDocs('watchers/exception'));

    const docs = watcherDocs('watchers/exception#exception-filters-integration');
    const ahead = this.filtersAhead();
    const catchAll = ahead.find(({ catches }) => catches.length === 0 || catches.includes(Error));

    if (catchAll) {
      return {
        state: 'waiting',
        reason:
          catchAll.catches.length === 0
            ? `${catchAll.name} catches every exception and is tried before NestLens's filter, so none reaches it.`
            : `${catchAll.name} catches every Error and is tried before NestLens's filter, so only a throw that is not an Error reaches it.`,
        docs,
      };
    }

    if (ahead.length > 0) {
      const taken = ahead.map(
        ({ name, catches }) => `${catches.map((type) => type.name).join(', ')} (${name})`,
      );
      return {
        state: 'recording',
        reason: `Installed as a global exception filter for HTTP handlers, except for ${taken.join('; ')}, handled first by the application's filter.`,
        docs,
      };
    }

    return {
      state: 'recording',
      reason: 'Installed as a global exception filter for HTTP handlers.',
      docs,
    };
  }

  onModuleInit(): void {
    this.routedFilters = [...this.applicationConfig.getGlobalFilters()];
  }

  /** The global filters Nest tries before this one, nearest first. */
  private filtersAhead(): { name: string; catches: ExceptionType[] }[] {
    const globals = this.routedFilters ?? this.applicationConfig.getGlobalFilters();
    const own = globals.findIndex((filter) => filter instanceof ExceptionWatcher);
    if (own < 0) return [];

    return globals
      .slice(own + 1)
      .reverse()
      .map((filter) => {
        const catches =
          (Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS_KEY, filter.constructor) as
            ExceptionType[] | undefined) ?? [];

        return { name: filter.constructor.name, catches };
      });
  }

  /**
   * `unknown`, not `Error`: an application can throw a string, a bare object or
   * `null`, and Nest hands all of them here exactly as they were thrown. The
   * old signature was a promise the runtime does not keep, and reading
   * `.name` off `null` under it took the process down.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType<string>();

    // HTTP only: the answer goes out through the HTTP adapter, which an RPC or
    // WebSocket context does not have, so those are rethrown unrecorded.
    // GraphQL errors are recorded by the GraphQL watcher.
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
      context: 'HTTP',
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
}
