import { GraphQLEntry } from './graphql.types';

export type EntryType =
  | 'request'
  | 'query'
  | 'exception'
  | 'log'
  | 'cache'
  | 'event'
  | 'job'
  | 'schedule'
  | 'mail'
  | 'http-client'
  | 'redis'
  | 'model'
  | 'notification'
  | 'view'
  | 'command'
  | 'gate'
  | 'batch'
  | 'dump'
  | 'graphql';

export interface BaseEntry {
  id?: number;
  type: EntryType;
  requestId?: string;
  createdAt?: string;
  // New fields for tagging and grouping
  familyHash?: string;
  tags?: string[];
  resolvedAt?: string;
}

/**
 * Authenticated user information captured from request.user
 */
export interface RequestUser {
  id: string | number;
  name?: string;
  email?: string;
}

export interface RequestEntry extends BaseEntry {
  type: 'request';
  payload: {
    method: string;
    url: string;
    path: string;
    query: Record<string, unknown>;
    params: Record<string, unknown>;
    headers: Record<string, string>;
    body?: unknown;
    ip?: string;
    userAgent?: string;
    statusCode: number;
    responseBody?: unknown;
    responseHeaders?: Record<string, string>;
    duration: number;
    memory: number;
    // New fields for Telescope-like features
    controllerAction?: string;
    handler?: string;
    user?: RequestUser;
    session?: Record<string, unknown>;
    tags?: string[];
    /**
     * Indicates if this request is a GraphQL request.
     * Detection based on:
     * - POST method
     * - Content-Type: application/json or application/graphql
     * - Body contains 'query' field with GraphQL syntax
     *
     * GraphQL requests are excluded from the Requests watcher
     * and only shown in the GraphQL watcher.
     */
    isGraphQL?: boolean;
  };
}

export interface QueryEntry extends BaseEntry {
  type: 'query';
  payload: {
    query: string;
    parameters?: unknown[];
    duration: number;
    slow: boolean;
    source?: string; // 'typeorm' | 'prisma' | 'mongoose' | 'raw'
    connection?: string;
    stack?: string;
  };
}

export interface ExceptionEntry extends BaseEntry {
  type: 'exception';
  payload: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
    context?: string;
    request?: {
      method: string;
      url: string;
      body?: unknown;
    };
  };
}

export interface LogEntry extends BaseEntry {
  type: 'log';
  payload: {
    level: 'debug' | 'log' | 'warn' | 'error' | 'verbose';
    message: string;
    context?: string;
    stack?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface CacheEntry extends BaseEntry {
  type: 'cache';
  payload: {
    operation: 'get' | 'set' | 'del' | 'clear';
    key: string;
    hit?: boolean;
    value?: unknown;
    ttl?: number;
    duration: number;
  };
}

export interface EventEntry extends BaseEntry {
  type: 'event';
  payload: {
    name: string;
    payload: unknown;
    listeners: string[];
    duration: number;
  };
}

export interface JobEntry extends BaseEntry {
  type: 'job';
  payload: {
    name: string;
    queue: string;
    data: unknown;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
    attempts: number;
    duration?: number;
    error?: string;
    result?: unknown;
  };
}

export interface ScheduleEntry extends BaseEntry {
  type: 'schedule';
  payload: {
    name: string;
    cron?: string;
    interval?: number;
    timeout?: number;
    status: 'started' | 'completed' | 'failed';
    duration?: number;
    error?: string;
    nextRun?: string;
  };
}

export interface MailEntry extends BaseEntry {
  type: 'mail';
  payload: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    html?: string;
    text?: string;
    from?: string;
    status: 'sent' | 'failed';
    error?: string;
    duration: number;
  };
}

export interface HttpClientEntry extends BaseEntry {
  type: 'http-client';
  payload: {
    method: string;
    url: string;
    hostname?: string;
    path?: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: unknown;
    duration: number;
    error?: string;
  };
}

export interface RedisEntry extends BaseEntry {
  type: 'redis';
  payload: {
    command: string;
    args: unknown[];
    duration: number;
    keyPattern?: string;
    status: 'success' | 'error';
    result?: unknown;
    error?: string;
  };
}

export interface ModelEntry extends BaseEntry {
  type: 'model';
  payload: {
    action: 'find' | 'create' | 'update' | 'delete' | 'save';
    entity: string;
    source: 'typeorm' | 'prisma';
    duration: number;
    recordCount?: number;
    data?: unknown;
    where?: unknown;
    error?: string;
  };
}

export interface NotificationEntry extends BaseEntry {
  type: 'notification';
  payload: {
    type: 'email' | 'sms' | 'push' | 'socket' | 'webhook';
    recipient: string | string[];
    title?: string;
    message?: string;
    metadata?: Record<string, unknown>;
    status: 'sent' | 'failed';
    duration: number;
    error?: string;
  };
}

export interface ViewEntry extends BaseEntry {
  type: 'view';
  payload: {
    template: string;
    format: 'html' | 'json' | 'xml' | 'pdf';
    duration: number;
    status: 'rendered' | 'error';
    dataSize?: number;
    outputSize?: number;
    locals?: Record<string, unknown>;
    cacheHit?: boolean;
    error?: string;
  };
}

export interface CommandEntry extends BaseEntry {
  type: 'command';
  payload: {
    name: string;
    handler?: string;
    status: 'executing' | 'completed' | 'failed';
    duration?: number;
    payload?: unknown;
    result?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface GateEntry extends BaseEntry {
  type: 'gate';
  payload: {
    gate: string;
    action: string;
    subject?: string;
    allowed: boolean;
    userId?: string | number;
    reason?: string;
    duration: number;
    context?: Record<string, unknown>;
  };
}

export interface BatchEntry extends BaseEntry {
  type: 'batch';
  payload: {
    name: string;
    operation: string;
    totalItems: number;
    processedItems: number;
    failedItems: number;
    duration: number;
    batchSize?: number;
    status: 'completed' | 'partial' | 'failed';
    errors?: string[];
    memory?: number;
  };
}

export interface DumpEntry extends BaseEntry {
  type: 'dump';
  payload: {
    operation: 'export' | 'import' | 'backup' | 'restore' | 'migrate';
    format: 'sql' | 'json' | 'csv' | 'binary';
    source?: string;
    destination?: string;
    recordCount?: number;
    fileSize?: number;
    duration: number;
    status: 'completed' | 'failed';
    compressed?: boolean;
    encrypted?: boolean;
    error?: string;
  };
}

export type Entry =
  | RequestEntry
  | QueryEntry
  | ExceptionEntry
  | LogEntry
  | CacheEntry
  | EventEntry
  | JobEntry
  | ScheduleEntry
  | MailEntry
  | HttpClientEntry
  | RedisEntry
  | ModelEntry
  | NotificationEntry
  | ViewEntry
  | CommandEntry
  | GateEntry
  | BatchEntry
  | DumpEntry
  | GraphQLEntry;

export interface EntryFilter {
  type?: EntryType;
  requestId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  // Advanced filtering
  tags?: string[];
  tagLogic?: 'AND' | 'OR';
  familyHash?: string;
  userId?: string;
  statusCodeMin?: number;
  statusCodeMax?: number;
  path?: string;
  method?: string;
  search?: string;
  hideDuplicates?: boolean;
  resolved?: boolean;
}

/**
 * Cursor-based pagination parameters with optional filters
 */
export interface CursorPaginationParams {
  limit?: number;
  beforeSequence?: number;
  afterSequence?: number;
  // Filter fields - all arrays use OR logic within, AND logic between categories
  filters?: {
    // Logs
    levels?: string[];
    contexts?: string[];
    // Queries
    queryTypes?: string[];
    sources?: string[];
    slow?: boolean;
    // Exceptions & Events
    names?: string[];
    methods?: string[];
    paths?: string[];
    resolved?: boolean;
    // Requests & HTTP Client (ERR = no status code)
    statuses?: (number | 'ERR')[];
    hostnames?: string[];
    controllers?: string[];
    ips?: string[];
    // Events
    eventNames?: string[];
    // Schedule
    scheduleStatuses?: string[];
    scheduleNames?: string[];
    // Jobs
    jobStatuses?: string[];
    jobNames?: string[];
    queues?: string[];
    // Cache
    cacheOperations?: string[];
    // Mail
    mailStatuses?: string[];
    // Redis
    redisStatuses?: string[];
    redisCommands?: string[];
    // Model
    modelActions?: string[];
    entities?: string[];
    modelSources?: string[];
    // Notification
    notificationTypes?: string[];
    notificationStatuses?: string[];
    // View
    viewFormats?: string[];
    viewStatuses?: string[];
    // Command
    commandStatuses?: string[];
    commandNames?: string[];
    // Gate
    gateNames?: string[];
    gateResults?: string[];
    // Batch
    batchStatuses?: string[];
    batchOperations?: string[];
    // Dump
    dumpStatuses?: string[];
    dumpOperations?: string[];
    dumpFormats?: string[];
    // GraphQL
    operationTypes?: string[]; // 'query' | 'mutation' | 'subscription'
    operationNames?: string[];
    hasErrors?: boolean;
    hasN1?: boolean;
    // Common
    tags?: string[];
    search?: string;
  };
}

/**
 * Pagination metadata for cursor-based pagination
 */
export interface CursorPaginationMeta {
  hasMore: boolean;
  oldestSequence: number | null;
  newestSequence: number | null;
  total: number;
}

/**
 * Response with cursor pagination
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  total: number;
  byType: Record<EntryType, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
  databaseSize?: number;
}

export interface EntryStats {
  total: number;
  byType: Record<EntryType, number>;
  avgResponseTime?: number;
  slowQueries?: number;
  exceptions?: number;
  unresolvedExceptions?: number;
}
