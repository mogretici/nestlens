/**
 * Subscriptions reaching the tracker.
 *
 * The tracker, the connection store and the WebSocket gateway were written and
 * never connected to anything. `subscriptions.enabled`, `trackMessages`,
 * `captureMessageData`, `maxTrackedMessages` and `trackConnectionEvents` were
 * documented, resolved into config, and read only inside a class no caller
 * reached — and `package.json`'s `exports` map allows three entry points, none
 * of which exposes the helpers that would have wired it, so it could not be
 * done by hand either. A subscription produced no entry of any kind.
 *
 * It is wired at the schema now, which is the one place both servers and both
 * WebSocket protocols pass through. Verified against the example application
 * over a real graphql-ws socket before these were written:
 *
 *     type           event       sub       responseData
 *     subscription   complete    19ea160c  -
 *     subscription   data        19ea160c  {"orderCreated": {"id":"4", ...
 *     subscription   start       19ea160c  -
 */
import { CollectorService } from '../../../core/collector.service';
import { instrumentSubscriptions } from '../../../watchers/graphql/subscription/schema-instrumentation';
import { createSubscriptionTracker } from '../../../watchers/graphql/subscription/subscription.tracker';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { GraphQLPayload } from '../../../types';

interface Recorded {
  type: string;
  payload: GraphQLPayload;
}

const recorder = (): { entries: Recorded[]; collector: CollectorService } => {
  const entries: Recorded[] = [];

  return {
    entries,
    collector: {
      collect: async (type: string, payload: GraphQLPayload) =>
        void entries.push({ type, payload }),
      // The tracker records an error through `collectImmediate`, so a recorder
      // watching only `collect` would report that errors are not tracked.
      collectImmediate: async (type: string, payload: GraphQLPayload) => {
        entries.push({ type, payload });
        return null;
      },
    } as unknown as CollectorService,
  };
};

/** A subscription field, typed the way graphql-js calls one. */
type Field = { subscribe: (...args: unknown[]) => unknown };

/** A schema, structurally: only the subscription fields matter here. */
const schemaWith = (fields: Record<string, { subscribe?: unknown }>) => ({
  getSubscriptionType: () => ({ getFields: () => fields }),
});

/** An async iterable that yields what it is given, then finishes. */
const yielding = async function* (values: unknown[]): AsyncGenerator<unknown> {
  for (const value of values) {
    yield value;
  }
};

const info = (query: string, name?: string, variables?: Record<string, unknown>) => ({
  operation: { name: name ? { value: name } : undefined, loc: { source: { body: query } } },
  variableValues: variables,
});

const trackerFor = (collector: CollectorService, subscriptions: Record<string, unknown> = {}) =>
  createSubscriptionTracker(collector, resolveGraphQLConfig({ subscriptions } as never));

const drain = async (iterable: AsyncIterable<unknown>): Promise<unknown[]> => {
  const seen: unknown[] = [];
  for await (const value of iterable) {
    seen.push(value);
  }
  return seen;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('instrumenting a schema', () => {
  it('records a subscription starting', async () => {
    const { entries, collector } = recorder();
    const field: Field = { subscribe: () => yielding([]) };
    instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

    await drain(field.subscribe({}, {}, {}, info('subscription { orderCreated { id } }')) as never);
    await settle();

    expect(entries.map((e) => e.payload.subscriptionEvent)).toContain('start');
  });

  it('records it completing', async () => {
    const { entries, collector } = recorder();
    const field: Field = { subscribe: () => yielding([{ a: 1 }]) };
    instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

    await drain(field.subscribe({}, {}, {}, info('subscription { orderCreated { id } }')) as never);
    await settle();

    expect(entries.map((e) => e.payload.subscriptionEvent)).toContain('complete');
  });

  it('gives every event of one subscription the same id', async () => {
    const { entries, collector } = recorder();
    const field: Field = { subscribe: () => yielding([{ a: 1 }, { a: 2 }]) };
    instrumentSubscriptions(
      schemaWith({ orderCreated: field }),
      trackerFor(collector, { trackMessages: true }),
    );

    await drain(field.subscribe({}, {}, {}, info('subscription { orderCreated { id } }')) as never);
    await settle();

    const ids = new Set(entries.map((e) => e.payload.subscriptionId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it('records the query it subscribed with', async () => {
    const { entries, collector } = recorder();
    const query = 'subscription Orders { orderCreated { id } }';
    const field: Field = { subscribe: () => yielding([]) };
    instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

    await drain(field.subscribe({}, {}, {}, info(query, 'Orders')) as never);
    await settle();

    const start = entries.find((e) => e.payload.subscriptionEvent === 'start')!;
    expect(start.payload.query).toContain('orderCreated');
    expect(start.payload.operationName).toBe('Orders');
  });

  describe('messages', () => {
    it('records none unless asked to', async () => {
      // `trackMessages` is off by default: a busy subscription is a lot of
      // entries, and the reader opts in.
      const { entries, collector } = recorder();
      const field: Field = { subscribe: () => yielding([{ a: 1 }, { a: 2 }]) };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      await drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never);
      await settle();

      expect(entries.filter((e) => e.payload.subscriptionEvent === 'data')).toHaveLength(0);
    });

    it('records one per message when asked', async () => {
      const { entries, collector } = recorder();
      const field: Field = { subscribe: () => yielding([{ a: 1 }, { a: 2 }, { a: 3 }]) };
      instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(collector, { trackMessages: true }),
      );

      await drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never);
      await settle();

      expect(entries.filter((e) => e.payload.subscriptionEvent === 'data')).toHaveLength(3);
    });

    it('leaves the message content out unless asked', async () => {
      const { entries, collector } = recorder();
      const field: Field = { subscribe: () => yielding([{ secret: 'value' }]) };
      instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(collector, { trackMessages: true }),
      );

      await drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never);
      await settle();

      const data = entries.find((e) => e.payload.subscriptionEvent === 'data')!;
      expect(data.payload.responseData).toBeUndefined();
    });

    it('masks the message content when it is captured', async () => {
      const { entries, collector } = recorder();
      const field: Field = { subscribe: () => yielding([{ user: { password: 'hunter2' } }]) };
      instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(collector, { trackMessages: true, captureMessageData: true }),
      );

      await drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never);
      await settle();

      const data = entries.find((e) => e.payload.subscriptionEvent === 'data')!;
      expect(JSON.stringify(data.payload.responseData)).not.toContain('hunter2');
    });
  });

  describe('what the subscriber still sees', () => {
    it('receives every message, unchanged', async () => {
      const { collector } = recorder();
      const messages = [{ a: 1 }, { a: 2 }];
      const field: Field = { subscribe: () => yielding(messages) };
      instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(collector, { trackMessages: true }),
      );

      const seen = await drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never);

      expect(seen).toEqual(messages);
    });

    it('still sees an error the source raises', async () => {
      const { entries, collector } = recorder();
      const field: Field = {
        subscribe: async function* (): AsyncGenerator<unknown> {
          yield { a: 1 };
          throw new Error('the stream broke');
        },
      };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      await expect(
        drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never),
      ).rejects.toThrow('the stream broke');
      await settle();

      expect(entries.map((e) => e.payload.subscriptionEvent)).toContain('error');
    });

    it('does not also report a completion after an error', async () => {
      // One terminal event per subscription: the error ends it.
      const { entries, collector } = recorder();
      const field: Field = {
        subscribe: async function* (): AsyncGenerator<unknown> {
          throw new Error('the stream broke');
        },
      };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      await expect(
        drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never),
      ).rejects.toThrow();
      await settle();

      expect(entries.filter((e) => e.payload.subscriptionEvent === 'complete')).toHaveLength(0);
    });

    it('is not disturbed by a tracker that throws', async () => {
      const exploding = {
        collect: () => Promise.reject(new Error('storage is gone')),
        collectImmediate: async () => null,
      } as unknown as CollectorService;

      const messages = [{ a: 1 }];
      const field: Field = { subscribe: () => yielding(messages) };
      instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(exploding, { trackMessages: true }),
      );

      await expect(
        drain(field.subscribe({}, {}, {}, info('subscription { x }')) as never),
      ).resolves.toEqual(messages);
    });

    /**
     * The calls into the tracker were already kept away from the stream; the
     * setup around them was not. It reads an address off whatever object the
     * transport put on the context, and a context that answers differently —
     * a getter that throws, a proxy — would have failed the client's
     * subscription rather than gone unrecorded.
     */
    it('still subscribes when the tracking cannot be set up', async () => {
      const { entries, collector } = recorder();
      const messages = [{ a: 1 }, { a: 2 }];
      const field: Field = { subscribe: () => yielding(messages) };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      const hostile = {
        extra: {
          get request(): never {
            throw new Error('this context does not answer');
          },
        },
      };

      await expect(
        drain(field.subscribe({}, {}, hostile, info('subscription { x }')) as never),
      ).resolves.toEqual(messages);
      await settle();

      // Unrecorded is the cost; the subscription is not.
      expect(entries).toHaveLength(0);
    });

    it('passes through a subscribe that returns a promise', async () => {
      const { entries, collector } = recorder();
      const field: Field = { subscribe: async () => yielding([{ a: 1 }]) };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      const source = await field.subscribe();
      await drain(source as never);
      await settle();

      expect(entries.map((e) => e.payload.subscriptionEvent)).toContain('start');
    });

    it('leaves a subscribe that returns something else alone', async () => {
      // graphql-js lets `subscribe` return an error result instead of a stream.
      const { entries, collector } = recorder();
      const result = { errors: ['nope'] };
      const field: Field = { subscribe: () => result };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      expect(field.subscribe()).toBe(result);
      await settle();
      expect(entries).toHaveLength(0);
    });
  });

  describe('grouping by connection', () => {
    it('treats subscriptions sharing a context as one client', async () => {
      const { entries, collector } = recorder();
      const context = { extra: { socket: {} } };
      const field: Field = { subscribe: () => yielding([]) };
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector));

      await drain(field.subscribe({}, {}, context, info('subscription { a }')) as never);
      await drain(field.subscribe({}, {}, context, info('subscription { b }')) as never);
      await settle();

      // Two subscriptions, two starts — and both were reachable, which is what
      // sharing a connection has to not break.
      expect(entries.filter((e) => e.payload.subscriptionEvent === 'start')).toHaveLength(2);
    });

    it('records the client address the guard would authorize with', async () => {
      const { entries, collector } = recorder();
      const context = {
        extra: {
          request: {
            headers: { 'x-forwarded-for': '10.0.0.1', 'user-agent': 'probe' },
            socket: { remoteAddress: '203.0.113.7' },
          },
        },
      };
      const field: Field = { subscribe: () => yielding([]) };
      // No trusted proxy, so the header is not believed.
      instrumentSubscriptions(schemaWith({ orderCreated: field }), trackerFor(collector), false);

      await drain(field.subscribe({}, {}, context, info('subscription { a }')) as never);
      await settle();

      const start = entries.find((e) => e.payload.subscriptionEvent === 'start')!;
      expect(start.payload.ip).toBe('203.0.113.7');
      expect(start.payload.userAgent).toBe('probe');
    });
  });

  describe('putting the schema back', () => {
    it('restores the original subscribe', () => {
      const { collector } = recorder();
      const original = () => yielding([]);
      const field: Field = { subscribe: original };

      const restore = instrumentSubscriptions(
        schemaWith({ orderCreated: field }),
        trackerFor(collector),
      );
      expect(field.subscribe).not.toBe(original);

      restore();
      expect(field.subscribe).toBe(original);
    });

    it('does nothing for a schema with no subscriptions', () => {
      const { collector } = recorder();

      expect(() =>
        instrumentSubscriptions({ getSubscriptionType: () => null }, trackerFor(collector))(),
      ).not.toThrow();
    });

    it('does nothing for something that is not a schema', () => {
      const { collector } = recorder();

      expect(() => instrumentSubscriptions(undefined, trackerFor(collector))()).not.toThrow();
    });
  });
});
