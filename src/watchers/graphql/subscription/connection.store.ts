/**
 * Subscription Connection Store
 *
 * Manages active WebSocket connections and their subscriptions.
 */

import { SubscriptionConnection, ActiveSubscription } from '../../../types';

/**
 * Connection Store
 *
 * Thread-safe store for managing WebSocket connections and subscriptions.
 */
export class ConnectionStore {
  private connections: Map<string, SubscriptionConnection> = new Map();
  private maxConnections: number;
  private maxSubscriptionsPerConnection: number;

  constructor(
    maxConnections: number = 1000,
    maxSubscriptionsPerConnection: number = 100,
  ) {
    this.maxConnections = maxConnections;
    this.maxSubscriptionsPerConnection = maxSubscriptionsPerConnection;
  }

  /**
   * Add a new connection
   */
  addConnection(
    connectionId: string,
    ip?: string,
    userAgent?: string,
  ): SubscriptionConnection {
    // Evict old connections if at limit
    if (this.connections.size >= this.maxConnections) {
      this.evictOldestConnection();
    }

    const connection: SubscriptionConnection = {
      connectionId,
      ip,
      userAgent,
      connectedAt: new Date(),
      activeSubscriptions: new Map(),
    };

    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Remove a connection and all its subscriptions
   */
  removeConnection(connectionId: string): SubscriptionConnection | undefined {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
    }
    return connection;
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): SubscriptionConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Add a subscription to a connection
   */
  addSubscription(
    connectionId: string,
    subscriptionId: string,
    query: string,
    operationName?: string,
    variables?: Record<string, unknown>,
    requestId?: string,
  ): ActiveSubscription | undefined {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return undefined;
    }

    // Check subscription limit
    if (
      connection.activeSubscriptions.size >= this.maxSubscriptionsPerConnection
    ) {
      return undefined;
    }

    const subscription: ActiveSubscription = {
      subscriptionId,
      query,
      operationName,
      variables,
      startedAt: new Date(),
      messageCount: 0,
      requestId,
    };

    connection.activeSubscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Remove a subscription from a connection
   */
  removeSubscription(
    connectionId: string,
    subscriptionId: string,
  ): ActiveSubscription | undefined {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return undefined;
    }

    const subscription = connection.activeSubscriptions.get(subscriptionId);
    if (subscription) {
      connection.activeSubscriptions.delete(subscriptionId);
    }
    return subscription;
  }

  /**
   * Get a subscription by ID
   */
  getSubscription(
    connectionId: string,
    subscriptionId: string,
  ): ActiveSubscription | undefined {
    const connection = this.connections.get(connectionId);
    return connection?.activeSubscriptions.get(subscriptionId);
  }

  /**
   * Increment message count for a subscription
   */
  incrementMessageCount(
    connectionId: string,
    subscriptionId: string,
  ): number | undefined {
    const subscription = this.getSubscription(connectionId, subscriptionId);
    if (subscription) {
      subscription.messageCount++;
      return subscription.messageCount;
    }
    return undefined;
  }

  /**
   * Get all active connections
   */
  getAllConnections(): SubscriptionConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConnections: number;
    totalSubscriptions: number;
    oldestConnection: Date | null;
    newestConnection: Date | null;
  } {
    let totalSubscriptions = 0;
    let oldestConnection: Date | null = null;
    let newestConnection: Date | null = null;

    for (const connection of this.connections.values()) {
      totalSubscriptions += connection.activeSubscriptions.size;

      if (!oldestConnection || connection.connectedAt < oldestConnection) {
        oldestConnection = connection.connectedAt;
      }
      if (!newestConnection || connection.connectedAt > newestConnection) {
        newestConnection = connection.connectedAt;
      }
    }

    return {
      totalConnections: this.connections.size,
      totalSubscriptions,
      oldestConnection,
      newestConnection,
    };
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.connections.clear();
  }

  /**
   * Evict the oldest connection
   */
  private evictOldestConnection(): void {
    let oldest: { id: string; date: Date } | null = null;

    for (const [id, connection] of this.connections.entries()) {
      if (!oldest || connection.connectedAt < oldest.date) {
        oldest = { id, date: connection.connectedAt };
      }
    }

    if (oldest) {
      this.connections.delete(oldest.id);
    }
  }

  /**
   * Find subscription by request ID
   */
  findByRequestId(requestId: string): {
    connection: SubscriptionConnection;
    subscription: ActiveSubscription;
  } | undefined {
    for (const connection of this.connections.values()) {
      for (const subscription of connection.activeSubscriptions.values()) {
        if (subscription.requestId === requestId) {
          return { connection, subscription };
        }
      }
    }
    return undefined;
  }
}

/**
 * Create a new connection store
 */
export function createConnectionStore(
  maxConnections?: number,
  maxSubscriptionsPerConnection?: number,
): ConnectionStore {
  return new ConnectionStore(maxConnections, maxSubscriptionsPerConnection);
}
