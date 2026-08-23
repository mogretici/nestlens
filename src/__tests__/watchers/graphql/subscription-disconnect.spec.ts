/**
 * A subscription ends when its client goes away.
 *
 * `handleDisconnection` removed the connection from the store and then asked
 * `handleComplete` to finish each of its subscriptions — and that begins by
 * removing the subscription from the connection, which was no longer there. So
 * it returned before recording anything:
 *
 * ```text
 * connect, subscribe, one message, disconnect
 *   recorded:  start, data          (no end, ever)
 *   buffered:  1 subscription's messages, kept for the life of the process
 * ```
 *
 * A client closing its socket — a page refresh, a tab closing, a network
 * blip — is how a subscription ordinarily ends, so the page showed every one
 * of them still running.
 */
import { CollectorService } from '../../../core/collector.service';
import { GraphQLPayload } from '../../../types';
import { SubscriptionTracker } from '../../../watchers/graphql/subscription/subscription.tracker';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';

const build = () => {
  const recorded: GraphQLPayload[] = [];

  const collector = {
    collect: async (_type: string, payload: GraphQLPayload) => void recorded.push(payload),
    collectImmediate: async (_type: string, payload: GraphQLPayload) => {
      recorded.push(payload);
      return null;
    },
  } as unknown as CollectorService;

  const tracker = new SubscriptionTracker(
    collector,
    resolveGraphQLConfig({
      subscriptions: { enabled: true, trackMessages: true, captureMessageData: true },
    } as never),
  );

  return {
    tracker,
    recorded,
    buffer: (tracker as unknown as { messageBuffer: Map<string, unknown[]> }).messageBuffer,
  };
};

const runOne = async (): Promise<ReturnType<typeof build>> => {
  const built = build();

  built.tracker.handleConnection('c1', '127.0.0.1', 'jest', 'graphql-ws');
  await built.tracker.handleStart({
    connectionId: 'c1',
    subscriptionId: 's1',
    query: 'subscription { ticks }',
    event: 'start',
  } as never);
  await built.tracker.handleData({
    connectionId: 'c1',
    subscriptionId: 's1',
    event: 'next',
    data: { tick: 1 },
  } as never);

  return built;
};

describe('a subscription whose connection drops', () => {
  it('is recorded as complete', async () => {
    const { tracker, recorded } = await runOne();

    await tracker.handleDisconnection('c1');

    expect(recorded.map((entry) => entry.subscriptionEvent)).toContain('complete');
  });

  it('carries how many messages it delivered', async () => {
    const { tracker, recorded } = await runOne();

    await tracker.handleDisconnection('c1');

    const completed = recorded.find((entry) => entry.subscriptionEvent === 'complete');
    expect(completed?.messageCount).toBe(1);
  });

  it('carries where the client was, which the store still knew', async () => {
    const { tracker, recorded } = await runOne();

    await tracker.handleDisconnection('c1');

    const completed = recorded.find((entry) => entry.subscriptionEvent === 'complete');
    expect(completed?.ip).toBe('127.0.0.1');
  });

  it('leaves nothing buffered behind it', async () => {
    const { tracker, buffer } = await runOne();

    expect(buffer.size).toBe(1);
    await tracker.handleDisconnection('c1');

    expect(buffer.size).toBe(0);
  });

  it('completes every subscription the connection held', async () => {
    const { tracker, recorded } = await runOne();

    await tracker.handleStart({
      connectionId: 'c1',
      subscriptionId: 's2',
      query: 'subscription { others }',
      event: 'start',
    } as never);

    await tracker.handleDisconnection('c1');

    const completed = recorded.filter((entry) => entry.subscriptionEvent === 'complete');
    expect(completed.map((entry) => entry.subscriptionId).sort()).toEqual(['s1', 's2']);
  });

  /**
   * An error ends a subscription too, and the disconnection that follows must
   * not report a second ending for the same stream. The error handler used to
   * take the subscription out of the connection only after writing its entry,
   * which is an await later — long enough for the disconnection to find it.
   */
  it('is not completed a second time after it failed', async () => {
    const { tracker, recorded } = await runOne();

    await tracker.handleError({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'error',
      error: new Error('the stream broke'),
    } as never);
    await tracker.handleDisconnection('c1');

    expect(recorded.filter((entry) => entry.subscriptionEvent === 'complete')).toHaveLength(0);
    expect(recorded.filter((entry) => entry.subscriptionEvent === 'error')).toHaveLength(1);
  });

  it('leaves nothing buffered after a failure either', async () => {
    const { tracker, buffer } = await runOne();

    await tracker.handleError({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'error',
      error: new Error('the stream broke'),
    } as never);

    expect(buffer.size).toBe(0);
  });

  it('says nothing about a connection it never saw', async () => {
    const { tracker, recorded } = build();

    await tracker.handleDisconnection('unknown');

    expect(recorded).toHaveLength(0);
  });

  it('forgets the connection', async () => {
    const { tracker } = await runOne();

    await tracker.handleDisconnection('c1');

    expect(tracker.getStats().totalConnections).toBe(0);
  });
});
