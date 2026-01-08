/**
 * WebSocket Gateway Integration
 *
 * Provides integration with GraphQL WebSocket protocols:
 * - graphql-ws (newer protocol)
 * - subscriptions-transport-ws (legacy protocol)
 */

import { SubscriptionTracker } from './subscription.tracker';

/**
 * WebSocket message types for graphql-ws protocol
 */
export enum GraphQLWsMessageType {
  ConnectionInit = 'connection_init',
  ConnectionAck = 'connection_ack',
  Ping = 'ping',
  Pong = 'pong',
  Subscribe = 'subscribe',
  Next = 'next',
  Error = 'error',
  Complete = 'complete',
}

/**
 * WebSocket message types for subscriptions-transport-ws (legacy)
 */
export enum LegacyWsMessageType {
  GQL_CONNECTION_INIT = 'connection_init',
  GQL_CONNECTION_ACK = 'connection_ack',
  GQL_CONNECTION_ERROR = 'connection_error',
  GQL_CONNECTION_KEEP_ALIVE = 'ka',
  GQL_CONNECTION_TERMINATE = 'connection_terminate',
  GQL_START = 'start',
  GQL_DATA = 'data',
  GQL_ERROR = 'error',
  GQL_COMPLETE = 'complete',
  GQL_STOP = 'stop',
}

/**
 * GraphQL WebSocket message structure
 */
export interface GraphQLWsMessage {
  id?: string;
  type: string;
  payload?: {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
    data?: unknown;
    errors?: unknown[];
  };
}

/**
 * WebSocket connection info
 */
export interface WsConnectionInfo {
  id: string;
  ip?: string;
  userAgent?: string;
  protocol?: 'graphql-ws' | 'subscriptions-transport-ws';
}

/**
 * Create WebSocket message handlers for graphql-ws
 *
 * These handlers can be integrated with graphql-ws server.
 */
export function createGraphQLWsHandlers(tracker: SubscriptionTracker) {
  return {
    /**
     * Handle connection (called when WebSocket connects)
     */
    onConnect: (connectionInfo: WsConnectionInfo) => {
      tracker.handleConnection(connectionInfo.id, connectionInfo.ip, connectionInfo.userAgent);
      return true; // Allow connection
    },

    /**
     * Handle disconnection
     */
    onDisconnect: async (connectionInfo: WsConnectionInfo) => {
      await tracker.handleDisconnection(connectionInfo.id);
    },

    /**
     * Handle subscribe message
     */
    onSubscribe: async (
      connectionInfo: WsConnectionInfo,
      subscriptionId: string,
      payload: {
        query: string;
        operationName?: string;
        variables?: Record<string, unknown>;
      },
    ) => {
      await tracker.handleStart({
        connectionId: connectionInfo.id,
        subscriptionId,
        event: 'start',
        query: payload.query,
        operationName: payload.operationName,
        variables: payload.variables,
      });
    },

    /**
     * Handle next (data) message
     */
    onNext: async (connectionInfo: WsConnectionInfo, subscriptionId: string, data: unknown) => {
      await tracker.handleData({
        connectionId: connectionInfo.id,
        subscriptionId,
        event: 'data',
        data,
      });
    },

    /**
     * Handle error message
     */
    onError: async (connectionInfo: WsConnectionInfo, subscriptionId: string, error: Error) => {
      await tracker.handleError({
        connectionId: connectionInfo.id,
        subscriptionId,
        event: 'error',
        error,
      });
    },

    /**
     * Handle complete message
     */
    onComplete: async (connectionInfo: WsConnectionInfo, subscriptionId: string) => {
      await tracker.handleComplete({
        connectionId: connectionInfo.id,
        subscriptionId,
        event: 'complete',
      });
    },
  };
}

/**
 * Create WebSocket message interceptor
 *
 * Can be used to intercept and track WebSocket messages.
 */
export function createWsMessageInterceptor(tracker: SubscriptionTracker) {
  const connectionProtocols = new Map<string, 'graphql-ws' | 'subscriptions-transport-ws'>();

  return {
    /**
     * Intercept incoming WebSocket message
     */
    interceptIncoming: async (
      connectionId: string,
      message: GraphQLWsMessage,
      connectionInfo?: { ip?: string; userAgent?: string },
    ) => {
      const type = message.type;

      // Detect protocol from message type
      if (!connectionProtocols.has(connectionId)) {
        const protocol = detectProtocol(type);
        if (protocol) {
          connectionProtocols.set(connectionId, protocol);
        }
      }

      const protocol = connectionProtocols.get(connectionId);

      switch (type) {
        case GraphQLWsMessageType.ConnectionInit:
        case LegacyWsMessageType.GQL_CONNECTION_INIT:
          tracker.handleConnection(connectionId, connectionInfo?.ip, connectionInfo?.userAgent);
          break;

        case GraphQLWsMessageType.Subscribe:
        case LegacyWsMessageType.GQL_START:
          if (message.id && message.payload) {
            await tracker.handleStart({
              connectionId,
              subscriptionId: message.id,
              event: 'start',
              query: message.payload.query,
              operationName: message.payload.operationName,
              variables: message.payload.variables,
            });
          }
          break;

        case LegacyWsMessageType.GQL_STOP:
          if (message.id) {
            await tracker.handleComplete({
              connectionId,
              subscriptionId: message.id,
              event: 'complete',
            });
          }
          break;
      }
    },

    /**
     * Intercept outgoing WebSocket message
     */
    interceptOutgoing: async (connectionId: string, message: GraphQLWsMessage) => {
      const type = message.type;

      switch (type) {
        case GraphQLWsMessageType.Next:
        case LegacyWsMessageType.GQL_DATA:
          if (message.id && message.payload?.data) {
            await tracker.handleData({
              connectionId,
              subscriptionId: message.id,
              event: 'data',
              data: message.payload.data,
            });
          }
          break;

        case GraphQLWsMessageType.Error:
        case LegacyWsMessageType.GQL_ERROR:
          if (message.id && message.payload?.errors) {
            const error = new Error(
              (message.payload.errors[0] as { message?: string })?.message ||
                'GraphQL subscription error',
            );
            await tracker.handleError({
              connectionId,
              subscriptionId: message.id,
              event: 'error',
              error,
            });
          }
          break;

        case GraphQLWsMessageType.Complete:
        case LegacyWsMessageType.GQL_COMPLETE:
          if (message.id) {
            await tracker.handleComplete({
              connectionId,
              subscriptionId: message.id,
              event: 'complete',
            });
          }
          break;
      }
    },

    /**
     * Handle connection close
     */
    handleClose: async (connectionId: string) => {
      connectionProtocols.delete(connectionId);
      await tracker.handleDisconnection(connectionId);
    },
  };
}

/**
 * Detect WebSocket protocol from message type
 */
function detectProtocol(
  messageType: string,
): 'graphql-ws' | 'subscriptions-transport-ws' | undefined {
  // graphql-ws uses simple message types
  if (Object.values(GraphQLWsMessageType).includes(messageType as GraphQLWsMessageType)) {
    return 'graphql-ws';
  }

  // subscriptions-transport-ws uses GQL_ prefixed types
  if (Object.values(LegacyWsMessageType).includes(messageType as LegacyWsMessageType)) {
    return 'subscriptions-transport-ws';
  }

  return undefined;
}

/**
 * Wrap a WebSocket server to add tracking
 *
 * This is a utility for wrapping existing WebSocket servers.
 */
export function wrapWebSocketServer(tracker: SubscriptionTracker, wsServer: unknown): void {
  // This is a placeholder for actual WebSocket server wrapping
  // The implementation would depend on the specific WebSocket library being used
  // For graphql-ws:
  // const server = useServer({ ... }, wsServer);
  // For subscriptions-transport-ws:
  // SubscriptionServer.create({ ... }, wsServer);
  // In practice, users would integrate the handlers directly
  // with their WebSocket server setup
}

/**
 * Extract connection info from WebSocket request
 */
export function extractConnectionInfo(request: unknown, connectionId: string): WsConnectionInfo {
  const req = request as Record<string, unknown> | undefined;

  let ip: string | undefined;
  let userAgent: string | undefined;

  if (req) {
    // Try to get IP
    const headers = req.headers as Record<string, string> | undefined;
    if (headers) {
      const forwarded = headers['x-forwarded-for'];
      if (forwarded) {
        ip = forwarded.split(',')[0].trim();
      }
      userAgent = headers['user-agent'];
    }

    if (!ip && typeof req.ip === 'string') {
      ip = req.ip;
    }

    if (!ip) {
      const socket = req.socket as { remoteAddress?: string } | undefined;
      ip = socket?.remoteAddress;
    }
  }

  return {
    id: connectionId,
    ip,
    userAgent,
  };
}
