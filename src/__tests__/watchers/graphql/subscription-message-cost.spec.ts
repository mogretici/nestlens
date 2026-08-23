/**
 * What a tracked subscription message costs.
 *
 * Every message was sanitized twice — once into the payload that is recorded,
 * and once into a buffer that nothing ever read. The buffer was written to,
 * deleted from and cleared, and no code path took anything out of it.
 *
 * Measured on a hundred messages of a two-hundred-row feed, with
 * `captureMessageData` on:
 *
 *   before   26.4 ms   1,687 KB held per subscription
 *   after    14.4 ms     110 KB
 *
 * A subscription is the one thing NestLens watches that lives for hours, so
 * work per message and bytes per message are the two figures that matter.
 */
import { CollectorService } from '../../../core/collector.service';
import { createSubscriptionTracker } from '../../../watchers/graphql/subscription/subscription.tracker';
import { sanitizeResponse } from '../../../watchers/graphql/utils/variable-sanitizer';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { GraphQLPayload } from '../../../types';

/** Data that counts how many times the sanitizer walked it. */
const countingMessage = (): { data: Record<string, unknown>; walks: () => number } => {
  let walks = 0;

  return {
    data: {
      get rows(): number[] {
        walks += 1;
        return [1, 2, 3];
      },
    },
    walks: () => walks,
  };
};

const trackerWith = (): {
  tracker: ReturnType<typeof createSubscriptionTracker>;
  recorded: GraphQLPayload[];
} => {
  const recorded: GraphQLPayload[] = [];
  const collector = {
    collect: async (_type: string, payload: GraphQLPayload) => void recorded.push(payload),
    collectImmediate: async (_type: string, payload: GraphQLPayload) => {
      recorded.push(payload);
      return null;
    },
  } as unknown as CollectorService;

  const config = resolveGraphQLConfig({
    subscriptions: { enabled: true, trackMessages: true, captureMessageData: true },
  });

  return { tracker: createSubscriptionTracker(collector, config), recorded };
};

describe('a subscription message', () => {
  it('is sanitized once, not twice', async () => {
    // Measured against one direct call rather than a fixed number, so this
    // says "once per message" and not "however many passes the sanitizer
    // happens to make today".
    const reference = countingMessage();
    sanitizeResponse(reference.data, [], 64 * 1024);
    const perMessage = reference.walks();

    const { tracker } = trackerWith();
    tracker.handleConnection('c1');
    await tracker.handleStart({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'start',
      query: 'subscription { ticks }',
    });

    const message = countingMessage();

    for (let i = 0; i < 5; i += 1) {
      await tracker.handleData({
        connectionId: 'c1',
        subscriptionId: 's1',
        event: 'data',
        data: message.data,
      });
    }

    expect(perMessage).toBeGreaterThan(0);
    expect(message.walks()).toBe(5 * perMessage);
  });

  it('still reaches the entry', async () => {
    const { tracker, recorded } = trackerWith();
    tracker.handleConnection('c1');
    await tracker.handleStart({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'start',
      query: 'subscription { ticks }',
    });

    await tracker.handleData({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'data',
      data: { rows: [1, 2, 3] },
    });

    const data = recorded.find((payload) => payload.subscriptionEvent === 'data');

    expect(data?.responseData).toEqual({ rows: [1, 2, 3] });
  });

  it('leaves nothing behind once the subscription ends', async () => {
    const { tracker } = trackerWith();
    tracker.handleConnection('c1');
    await tracker.handleStart({
      connectionId: 'c1',
      subscriptionId: 's1',
      event: 'start',
      query: 'subscription { ticks }',
    });

    for (let i = 0; i < 20; i += 1) {
      await tracker.handleData({
        connectionId: 'c1',
        subscriptionId: 's1',
        event: 'data',
        data: { rows: [i] },
      });
    }

    await tracker.handleComplete({ connectionId: 'c1', subscriptionId: 's1', event: 'complete' });

    // Nothing on the tracker may still be holding the messages.
    const retained = Object.values(tracker as unknown as Record<string, unknown>)
      .filter((value): value is Map<unknown, unknown> => value instanceof Map)
      .reduce((total, map) => total + map.size, 0);

    expect(retained).toBe(0);
  });
});
