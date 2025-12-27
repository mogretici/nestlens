/**
 * Subscription Tracker
 *
 * Tracks GraphQL subscription lifecycle events and messages.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';
import { CollectorService } from '../../../core/collector.service';
import { GraphQLPayload, ActiveSubscription } from '../../../types';
import { ResolvedGraphQLConfig, ResolvedSubscriptionConfig, SubscriptionTransportMode } from '../types';
import { hashQuery, truncateQuery, extractOperationName } from '../utils/query-parser';
import { sanitizeVariables, sanitizeResponse } from '../utils/variable-sanitizer';
import { ConnectionStore, createConnectionStore } from './connection.store';

/**
 * Subscription metrics for verification
 */
export interface SubscriptionMetrics {
  totalConnections: number;
  totalDisconnections: number;
  totalSubscriptions: number;
  totalMessages: number;
  totalErrors: number;
  totalCompletes: number;
  byProtocol: {
    'graphql-ws': number;
    'subscriptions-transport-ws': number;
    'mercurius': number;
    'unknown': number;
  };
  byTransportMode: {
    gateway: number;
    adapter: number;
  };
}

/**
 * Subscription event types
 */
export type SubscriptionEvent = 'start' | 'data' | 'error' | 'complete';

/**
 * Subscription lifecycle event
 */
export interface SubscriptionLifecycleEvent {
  connectionId: string;
  subscriptionId: string;
  event: SubscriptionEvent;
  query?: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  data?: unknown;
  error?: Error;
  /** Source protocol */
  protocol?: 'graphql-ws' | 'subscriptions-transport-ws' | 'mercurius';
  /** Transport mode used to capture this event */
  transportMode?: 'gateway' | 'adapter';
}

/**
 * Subscription Tracker
 *
 * Manages subscription lifecycle tracking and message collection.
 */
export class SubscriptionTracker {
  private readonly logger = new Logger('GraphQLSubscriptions');
  private connectionStore: ConnectionStore;
  private config: ResolvedSubscriptionConfig;
  private graphqlConfig: ResolvedGraphQLConfig;
  private collector: CollectorService;
  private messageBuffer: Map<string, unknown[]> = new Map();

  /** Metrics for verification and debugging */
  private metrics: SubscriptionMetrics = {
    totalConnections: 0,
    totalDisconnections: 0,
    totalSubscriptions: 0,
    totalMessages: 0,
    totalErrors: 0,
    totalCompletes: 0,
    byProtocol: {
      'graphql-ws': 0,
      'subscriptions-transport-ws': 0,
      'mercurius': 0,
      'unknown': 0,
    },
    byTransportMode: {
      gateway: 0,
      adapter: 0,
    },
  };

  constructor(
    collector: CollectorService,
    config: ResolvedGraphQLConfig,
  ) {
    this.collector = collector;
    this.graphqlConfig = config;
    this.config = config.subscriptions;
    this.connectionStore = createConnectionStore();

    if (this.config.debug) {
      this.logger.log(`Subscription tracking initialized (mode: ${this.config.transportMode})`);
    }
  }

  /**
   * Get current metrics for verification
   */
  getMetrics(): SubscriptionMetrics {
    return { ...this.metrics };
  }

  /**
   * Log debug message if debug mode is enabled
   */
  private debugLog(message: string, context?: Record<string, unknown>): void {
    if (this.config.debug) {
      this.logger.debug(message, context ? JSON.stringify(context) : undefined);
    }
  }

  /**
   * Check if subscription tracking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(
    connectionId: string,
    ip?: string,
    userAgent?: string,
    protocol?: 'graphql-ws' | 'subscriptions-transport-ws' | 'mercurius',
    transportMode?: 'gateway' | 'adapter',
  ): void {
    if (!this.config.enabled || !this.config.trackConnectionEvents) {
      return;
    }

    this.metrics.totalConnections++;

    // Track by protocol
    const proto = protocol || 'unknown';
    if (proto in this.metrics.byProtocol) {
      this.metrics.byProtocol[proto as keyof typeof this.metrics.byProtocol]++;
    }

    // Track by transport mode
    if (transportMode) {
      this.metrics.byTransportMode[transportMode]++;
    }

    this.debugLog('WS connection opened', {
      connectionId,
      ip,
      protocol: proto,
      transportMode,
    });

    this.connectionStore.addConnection(connectionId, ip, userAgent);
  }

  /**
   * Handle WebSocket disconnection
   */
  async handleDisconnection(connectionId: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.metrics.totalDisconnections++;

    const connection = this.connectionStore.removeConnection(connectionId);

    if (!connection) {
      return;
    }

    this.debugLog('WS connection closed', {
      connectionId,
      activeSubscriptions: connection.activeSubscriptions.size,
    });

    // Complete all active subscriptions
    for (const subscription of connection.activeSubscriptions.values()) {
      await this.handleComplete({
        connectionId,
        subscriptionId: subscription.subscriptionId,
        event: 'complete',
      });
    }
  }

  /**
   * Handle subscription start
   */
  async handleStart(event: SubscriptionLifecycleEvent): Promise<string> {
    if (!this.config.enabled) {
      return event.subscriptionId;
    }

    this.metrics.totalSubscriptions++;

    this.debugLog('Subscription started', {
      connectionId: event.connectionId,
      subscriptionId: event.subscriptionId,
      operationName: event.operationName,
      protocol: event.protocol,
      transportMode: event.transportMode,
    });

    const requestId = uuidv4();

    // Add to connection store
    this.connectionStore.addSubscription(
      event.connectionId,
      event.subscriptionId,
      event.query || '',
      event.operationName,
      event.variables,
      requestId,
    );

    // Collect start event
    const connection = this.connectionStore.getConnection(event.connectionId);

    const payload: GraphQLPayload = {
      operationName: event.operationName,
      operationType: 'subscription',
      query: truncateQuery(event.query || '', this.graphqlConfig.maxQuerySize),
      queryHash: hashQuery(event.query || ''),
      variables: this.graphqlConfig.captureVariables
        ? sanitizeVariables(
            event.variables,
            this.graphqlConfig.sensitiveVariables,
          )
        : undefined,
      duration: 0,
      statusCode: 200,
      hasErrors: false,
      subscriptionId: event.subscriptionId,
      subscriptionEvent: 'start',
      ip: connection?.ip,
      userAgent: connection?.userAgent,
    };

    await this.collector.collect('graphql', payload, requestId);

    return requestId;
  }

  /**
   * Handle subscription data message
   */
  async handleData(
    event: SubscriptionLifecycleEvent,
  ): Promise<void> {
    if (!this.config.enabled || !this.config.trackMessages) {
      return;
    }

    this.metrics.totalMessages++;

    const subscription = this.connectionStore.getSubscription(
      event.connectionId,
      event.subscriptionId,
    );

    if (!subscription) {
      return;
    }

    this.debugLog('Subscription data received', {
      connectionId: event.connectionId,
      subscriptionId: event.subscriptionId,
      messageCount: subscription.messageCount + 1,
    });

    // Increment message count
    this.connectionStore.incrementMessageCount(
      event.connectionId,
      event.subscriptionId,
    );

    // Check message limit
    if (subscription.messageCount > this.config.maxTrackedMessages) {
      return;
    }

    // Buffer message data if capturing
    if (this.config.captureMessageData && event.data) {
      const bufferKey = `${event.connectionId}:${event.subscriptionId}`;
      if (!this.messageBuffer.has(bufferKey)) {
        this.messageBuffer.set(bufferKey, []);
      }

      const buffer = this.messageBuffer.get(bufferKey)!;
      if (buffer.length < this.config.maxTrackedMessages) {
        buffer.push(
          sanitizeResponse(
            event.data,
            this.graphqlConfig.sensitiveVariables,
            this.graphqlConfig.maxResponseSize,
          ),
        );
      }
    }

    // Collect data event
    const connection = this.connectionStore.getConnection(event.connectionId);

    const payload: GraphQLPayload = {
      operationName: subscription.operationName,
      operationType: 'subscription',
      query: truncateQuery(subscription.query, this.graphqlConfig.maxQuerySize),
      queryHash: hashQuery(subscription.query),
      duration: Date.now() - subscription.startedAt.getTime(),
      statusCode: 200,
      hasErrors: false,
      subscriptionId: event.subscriptionId,
      subscriptionEvent: 'data',
      messageCount: subscription.messageCount,
      responseData: this.config.captureMessageData
        ? sanitizeResponse(
            event.data,
            this.graphqlConfig.sensitiveVariables,
            this.graphqlConfig.maxResponseSize,
          )
        : undefined,
      ip: connection?.ip,
      userAgent: connection?.userAgent,
    };

    await this.collector.collect('graphql', payload, subscription.requestId);
  }

  /**
   * Handle subscription error
   */
  async handleError(event: SubscriptionLifecycleEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.metrics.totalErrors++;

    const subscription = this.connectionStore.getSubscription(
      event.connectionId,
      event.subscriptionId,
    );

    if (!subscription) {
      return;
    }

    this.debugLog('Subscription error', {
      connectionId: event.connectionId,
      subscriptionId: event.subscriptionId,
      error: event.error?.message,
    });

    const connection = this.connectionStore.getConnection(event.connectionId);
    const duration = Date.now() - subscription.startedAt.getTime();

    const payload: GraphQLPayload = {
      operationName: subscription.operationName,
      operationType: 'subscription',
      query: truncateQuery(subscription.query, this.graphqlConfig.maxQuerySize),
      queryHash: hashQuery(subscription.query),
      duration,
      statusCode: 500,
      hasErrors: true,
      errors: event.error
        ? [
            {
              message: event.error.message,
            },
          ]
        : undefined,
      subscriptionId: event.subscriptionId,
      subscriptionEvent: 'error',
      messageCount: subscription.messageCount,
      subscriptionDuration: duration,
      ip: connection?.ip,
      userAgent: connection?.userAgent,
    };

    // Use immediate collection for errors
    await this.collector.collectImmediate(
      'graphql',
      payload,
      subscription.requestId,
    );

    // Remove subscription
    this.connectionStore.removeSubscription(
      event.connectionId,
      event.subscriptionId,
    );

    // Clear message buffer
    const bufferKey = `${event.connectionId}:${event.subscriptionId}`;
    this.messageBuffer.delete(bufferKey);
  }

  /**
   * Handle subscription complete
   */
  async handleComplete(event: SubscriptionLifecycleEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.metrics.totalCompletes++;

    const subscription = this.connectionStore.removeSubscription(
      event.connectionId,
      event.subscriptionId,
    );

    if (!subscription) {
      return;
    }

    this.debugLog('Subscription completed', {
      connectionId: event.connectionId,
      subscriptionId: event.subscriptionId,
      messageCount: subscription.messageCount,
      duration: Date.now() - subscription.startedAt.getTime(),
    });

    const connection = this.connectionStore.getConnection(event.connectionId);
    const duration = Date.now() - subscription.startedAt.getTime();

    const payload: GraphQLPayload = {
      operationName: subscription.operationName,
      operationType: 'subscription',
      query: truncateQuery(subscription.query, this.graphqlConfig.maxQuerySize),
      queryHash: hashQuery(subscription.query),
      duration,
      statusCode: 200,
      hasErrors: false,
      subscriptionId: event.subscriptionId,
      subscriptionEvent: 'complete',
      messageCount: subscription.messageCount,
      subscriptionDuration: duration,
      ip: connection?.ip,
      userAgent: connection?.userAgent,
    };

    await this.collector.collect('graphql', payload, subscription.requestId);

    // Clear message buffer
    const bufferKey = `${event.connectionId}:${event.subscriptionId}`;
    this.messageBuffer.delete(bufferKey);
  }

  /**
   * Get connection store statistics
   */
  getStats(): {
    totalConnections: number;
    totalSubscriptions: number;
    oldestConnection: Date | null;
    newestConnection: Date | null;
  } {
    return this.connectionStore.getStats();
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.connectionStore.clear();
    this.messageBuffer.clear();
  }

  /**
   * Get the connection store (for testing)
   */
  getConnectionStore(): ConnectionStore {
    return this.connectionStore;
  }
}

/**
 * Create a subscription tracker
 */
export function createSubscriptionTracker(
  collector: CollectorService,
  config: ResolvedGraphQLConfig,
): SubscriptionTracker {
  return new SubscriptionTracker(collector, config);
}
