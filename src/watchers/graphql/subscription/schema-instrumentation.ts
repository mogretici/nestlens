/**
 * Making subscriptions reach the tracker.
 *
 * The tracker, the connection store and the WebSocket gateway were written and
 * then never connected to anything: `subscriptions.enabled`,
 * `trackConnectionEvents`, `trackMessages`, `captureMessageData` and
 * `maxTrackedMessages` were documented, resolved into config, and read only
 * inside a class no caller reached. `package.json`'s `exports` map allows three
 * entry points, and the helpers that would have wired it are in none of them,
 * so it could not be done by hand either.
 *
 * This wires it at the schema, which is the one place both servers and both
 * WebSocket protocols pass through. A subscription field's `subscribe` returns
 * the async iterable the server pulls events from; wrapping it means every
 * start, every message, every error and every completion is seen, whether the
 * transport is graphql-ws, subscriptions-transport-ws or Mercurius's own, and
 * whether the schema was built from code or from a file.
 *
 * A connection is a transport idea and the schema does not see one, so it is
 * inferred: subscriptions arriving with the same context object belong to the
 * same client, and when the last of them ends that client is done. Keyed
 * weakly, so nothing is held open by being remembered.
 */
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { resolveClientIp, AddressableRequest } from '../../../core/client-ip';
import { SubscriptionTracker } from './subscription.tracker';

const logger = new Logger('GraphQLSubscriptions');

/** The shape of a schema, structurally, so `graphql` need not be imported. */
interface SubscriptionSchema {
  getSubscriptionType?: () => { getFields?: () => Record<string, SubscriptionField> } | null;
}

interface SubscriptionField {
  subscribe?: (...args: unknown[]) => unknown;
}

/** What graphql-js hands a `subscribe`, of which only two parts matter here. */
interface ResolveInfo {
  operation?: {
    name?: { value?: string };
    loc?: { source?: { body?: string } };
  };
  variableValues?: Record<string, unknown>;
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof (value as AsyncIterable<unknown>)?.[Symbol.asyncIterator] === 'function';

/**
 * The object that stands for the client's connection.
 *
 * graphql-ws puts the socket on `extra`; Mercurius and the older protocol put
 * a request or a socket on the context directly. Any of them is stable for the
 * life of one connection, which is all this needs — and where none is found the
 * context itself is, which at worst groups one subscription on its own.
 */
const connectionKeyOf = (context: unknown): object => {
  const ctx = (context ?? {}) as Record<string, unknown>;
  const extra = ctx.extra as Record<string, unknown> | undefined;

  const candidates = [extra?.socket, extra?.request, extra, ctx.socket, ctx.req, ctx.request, ctx];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate as object;
  }

  return {} as object;
};

/** Whatever the connection can say about who is on the other end. */
const addressOf = (
  context: unknown,
  trustProxy: boolean | undefined,
): AddressableRequest | undefined => {
  const ctx = (context ?? {}) as Record<string, unknown>;
  const extra = ctx.extra as Record<string, unknown> | undefined;

  const request = (extra?.request ?? ctx.req ?? ctx.request) as AddressableRequest | undefined;
  if (!request?.headers) return undefined;

  void trustProxy;
  return request;
};

interface Connection {
  id: string;
  open: number;
  ip?: string;
  userAgent?: string;
}

/**
 * Wraps every subscription field's `subscribe` so the tracker sees the
 * lifecycle. Returns a function that puts the schema back.
 */
export const instrumentSubscriptions = (
  schema: unknown,
  tracker: SubscriptionTracker,
  trustProxy?: boolean,
): (() => void) => {
  const fields = (schema as SubscriptionSchema)?.getSubscriptionType?.()?.getFields?.();

  if (!fields) {
    return () => undefined;
  }

  const connections = new WeakMap<object, Connection>();
  const originals: { field: SubscriptionField; subscribe: SubscriptionField['subscribe'] }[] = [];

  /** The connection this context belongs to, opening one the first time. */
  const connectionFor = (context: unknown): Connection => {
    const key = connectionKeyOf(context);
    const existing = connections.get(key);
    if (existing) {
      existing.open += 1;
      return existing;
    }

    const request = addressOf(context, trustProxy);
    const connection: Connection = {
      id: uuidv4(),
      open: 1,
      ip: request ? resolveClientIp(request, trustProxy) : undefined,
      userAgent: request?.headers['user-agent'] as string | undefined,
    };

    connections.set(key, connection);
    tracker.handleConnection(connection.id, connection.ip, connection.userAgent, 'graphql-ws');

    return connection;
  };

  for (const field of Object.values(fields)) {
    const original = field.subscribe;
    if (typeof original !== 'function') continue;

    originals.push({ field, subscribe: original });

    field.subscribe = function instrumentedSubscribe(...args: unknown[]): unknown {
      const [, , context, info] = args as [unknown, unknown, unknown, ResolveInfo | undefined];

      const source = original.apply(this, args);

      // A `subscribe` may return a promise for the iterable, or the iterable,
      // or an error result the server turns into a response. Only the last of
      // those is not a subscription.
      if (source instanceof Promise) {
        return source.then((resolved) =>
          isAsyncIterable(resolved) ? track(resolved, context, info) : resolved,
        );
      }

      return isAsyncIterable(source) ? track(source, context, info) : source;
    };
  }

  /** Follows one subscription from its first event to its last. */
  function track(
    source: AsyncIterable<unknown>,
    context: unknown,
    info: ResolveInfo | undefined,
  ): AsyncIterable<unknown> {
    const connection = connectionFor(context);
    const subscriptionId = uuidv4();
    const query = info?.operation?.loc?.source?.body ?? '';
    const operationName = info?.operation?.name?.value;
    const variables = info?.variableValues;

    let ended = false;

    /** Recording must never disturb the stream it is watching. */
    const report = (work: Promise<unknown>): void => {
      void work.catch((error: unknown) => logger.debug(`Subscription tracking failed: ${error}`));
    };

    /**
     * The subscription is over, once.
     *
     * `completed` is the ordinary ending; an error is the other one, and the
     * two must not both be reported. The tracker's error handler already
     * closes the subscription out, so announcing a completion beside it
     * produced two terminal events for one stream — and, because the calls are
     * not awaited, in either order.
     */
    const end = (how: 'completed' | 'failed'): void => {
      if (ended) return;
      ended = true;

      if (how === 'completed') {
        report(
          tracker.handleComplete({
            connectionId: connection.id,
            subscriptionId,
            event: 'complete',
          }),
        );
      }

      connection.open -= 1;
      if (connection.open <= 0) {
        report(tracker.handleDisconnection(connection.id));
      }
    };

    report(
      tracker.handleStart({
        connectionId: connection.id,
        subscriptionId,
        event: 'start',
        query,
        operationName,
        variables,
        protocol: 'graphql-ws',
        transportMode: 'adapter',
      }),
    );

    return {
      [Symbol.asyncIterator](): AsyncIterator<unknown> {
        const iterator = source[Symbol.asyncIterator]();

        return {
          async next(): Promise<IteratorResult<unknown>> {
            try {
              const step = await iterator.next();

              if (step.done) {
                end('completed');
                return step;
              }

              report(
                tracker.handleData({
                  connectionId: connection.id,
                  subscriptionId,
                  event: 'data',
                  data: step.value,
                  query,
                  operationName,
                }),
              );

              return step;
            } catch (error) {
              report(
                tracker.handleError({
                  connectionId: connection.id,
                  subscriptionId,
                  event: 'error',
                  error: error instanceof Error ? error : new Error(String(error)),
                  query,
                  operationName,
                }),
              );
              end('failed');
              throw error;
            }
          },

          async return(value?: unknown): Promise<IteratorResult<unknown>> {
            end('completed');
            return iterator.return ? iterator.return(value) : { done: true, value: undefined };
          },

          async throw(error?: unknown): Promise<IteratorResult<unknown>> {
            end('failed');
            if (iterator.throw) return iterator.throw(error);
            throw error;
          },
        };
      },
    };
  }

  return () => {
    for (const { field, subscribe } of originals) {
      field.subscribe = subscribe;
    }
    originals.length = 0;
  };
};
