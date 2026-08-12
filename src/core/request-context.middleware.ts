import { Injectable, NestMiddleware } from '@nestjs/common';
import { NestLensRequest } from '../types';
import { newRequestId, runInRequestContext } from './request-context';

/**
 * Opens a request context around everything the application does for a request.
 *
 * Runs before guards, interceptors and the handler, so an entry recorded by any
 * watcher — a query, a cache read, an outgoing HTTP call — can be attributed to
 * the request that caused it without being handed one.
 *
 * The id is also written onto the request object, which is where the request and
 * exception watchers already look for it, so both halves agree on one id per
 * request.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: NestLensRequest, _response: unknown, next: () => void): void {
    const requestId = request.nestlensRequestId ?? newRequestId();
    request.nestlensRequestId = requestId;

    runInRequestContext(requestId, next);
  }
}
