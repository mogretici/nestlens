import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * The request an entry belongs to, carried across async boundaries.
 *
 * A watcher that sits on the HTTP request can read the request object; the ones
 * that matter most cannot. The query watcher is handed a statement by TypeORM's
 * logger or Prisma's middleware, the cache watcher by a wrapped method — none of
 * them are given a request, and so none of their entries carried one. Of the
 * twenty-one places that record an entry, two passed a request id, which is why
 * a request's detail page could show the exceptions it raised and never the
 * queries it ran, while the documentation offered "request correlation ID" and
 * "group related entries by request".
 *
 * Threading an argument through twenty-one call sites would have fixed the ones
 * that exist. This carries the id in the ambient async context instead, so an
 * entry recorded anywhere inside a request belongs to it — including from a
 * watcher written next year.
 */
export interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `work` with a request context in scope.
 *
 * Installed as middleware rather than an interceptor on purpose: middleware
 * calls into the rest of the request synchronously, so everything downstream —
 * guards, interceptors, the handler, and whatever they await — runs inside the
 * scope. An interceptor returns an Observable that Nest subscribes to after the
 * interceptor's own frame has gone, taking the context with it.
 */
export const runInRequestContext = <T>(requestId: string, work: () => T): T =>
  storage.run({ requestId }, work);

/** The current request's id, or `undefined` outside a request. */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

/** A fresh correlation id, in the one place that decides their shape. */
export const newRequestId = (): string => randomUUID();
