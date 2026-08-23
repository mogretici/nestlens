/**
 * What a connection store is allowed to hold.
 *
 * It keeps a map of live WebSocket connections, each with a map of live
 * subscriptions, and both are filled by whoever is connecting. Neither bound
 * was tested: the store sat at 57% line coverage, and the ceilings are the only
 * thing standing between a long-running process and a map that grows with every
 * client that ever connected.
 */
import { createConnectionStore } from '../../../watchers/graphql/subscription/connection.store';

describe('the connection store', () => {
  describe('its ceiling on connections', () => {
    it('holds what it is told to', () => {
      const store = createConnectionStore(3);

      for (let i = 0; i < 10; i += 1) {
        store.addConnection(`c${i}`);
      }

      expect(store.getStats().totalConnections).toBe(3);
    });

    it('drops the one that arrived first', () => {
      const store = createConnectionStore(2);

      store.addConnection('first');
      store.addConnection('second');
      store.addConnection('third');

      expect(store.getConnection('first')).toBeUndefined();
      expect(store.getConnection('second')).toBeDefined();
      expect(store.getConnection('third')).toBeDefined();
    });

    it('drops the subscriptions with it', () => {
      const store = createConnectionStore(1);

      store.addConnection('first');
      store.addSubscription('first', 's1', 'subscription { x }');
      store.addConnection('second');

      expect(store.getSubscription('first', 's1')).toBeUndefined();
      expect(store.getStats().totalSubscriptions).toBe(0);
    });

    it('stays at its ceiling under churn', () => {
      const store = createConnectionStore(50);

      for (let i = 0; i < 5_000; i += 1) {
        store.addConnection(`c${i}`);
        store.addSubscription(`c${i}`, 's', 'subscription { x }');
      }

      const stats = store.getStats();
      expect(stats.totalConnections).toBe(50);
      expect(stats.totalSubscriptions).toBe(50);
    });
  });

  describe('its ceiling on subscriptions per connection', () => {
    it('refuses one past the limit rather than growing', () => {
      const store = createConnectionStore(10, 2);
      store.addConnection('c');

      expect(store.addSubscription('c', 's1', 'subscription { x }')).toBeDefined();
      expect(store.addSubscription('c', 's2', 'subscription { x }')).toBeDefined();
      expect(store.addSubscription('c', 's3', 'subscription { x }')).toBeUndefined();
      expect(store.getStats().totalSubscriptions).toBe(2);
    });

    it('makes room again when one ends', () => {
      const store = createConnectionStore(10, 1);
      store.addConnection('c');
      store.addSubscription('c', 's1', 'subscription { x }');

      store.removeSubscription('c', 's1');

      expect(store.addSubscription('c', 's2', 'subscription { x }')).toBeDefined();
    });
  });

  describe('what it reports', () => {
    it('counts the subscriptions across every connection', () => {
      const store = createConnectionStore();
      store.addConnection('a');
      store.addConnection('b');
      store.addSubscription('a', 's1', 'subscription { x }');
      store.addSubscription('a', 's2', 'subscription { y }');
      store.addSubscription('b', 's3', 'subscription { z }');

      expect(store.getStats()).toMatchObject({ totalConnections: 2, totalSubscriptions: 3 });
    });

    it('reports nothing for an empty store', () => {
      expect(createConnectionStore().getStats()).toEqual({
        totalConnections: 0,
        totalSubscriptions: 0,
        oldestConnection: null,
        newestConnection: null,
      });
    });

    it('counts messages per subscription', () => {
      const store = createConnectionStore();
      store.addConnection('a');
      store.addSubscription('a', 's1', 'subscription { x }');

      expect(store.incrementMessageCount('a', 's1')).toBe(1);
      expect(store.incrementMessageCount('a', 's1')).toBe(2);
      expect(store.incrementMessageCount('a', 'missing')).toBeUndefined();
    });
  });

  describe('what it does with what it does not have', () => {
    it('adds no subscription to a connection that is gone', () => {
      const store = createConnectionStore();

      expect(store.addSubscription('gone', 's', 'subscription { x }')).toBeUndefined();
    });

    it('removes nothing from a connection that is gone', () => {
      const store = createConnectionStore();

      expect(store.removeSubscription('gone', 's')).toBeUndefined();
      expect(store.removeConnection('gone')).toBeUndefined();
    });
  });

  it('forgets everything when cleared', () => {
    const store = createConnectionStore();
    store.addConnection('a');
    store.addSubscription('a', 's', 'subscription { x }');

    store.clear();

    expect(store.getStats().totalConnections).toBe(0);
  });
});
