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

/**
 * JSON-serializable value type.
 * Used instead of `unknown` to avoid TypeScript 5 + React 18 JSX compatibility issues.
 * @see https://github.com/microsoft/TypeScript/issues/48796
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * JSON-serializable object type.
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Authenticated user information captured from request.user
 */
export interface RequestUser {
  id: string | number;
  name?: string;
  email?: string;
}

export interface RequestPayload {
  method: string;
  url: string;
  path: string;
  query: JsonObject;
  params: JsonObject;
  headers: Record<string, string>;
  body?: JsonValue;
  ip?: string;
  userAgent?: string;
  statusCode?: number;
  responseBody?: JsonValue;
  responseHeaders?: Record<string, string>;
  duration?: number;
  memory?: number;
  // Telescope-like features
  controllerAction?: string;
  handler?: string;
  user?: RequestUser;
  session?: JsonObject;
  tags?: string[];
}

export interface QueryPayload {
  query: string;
  parameters?: JsonValue[];
  duration: number;
  slow: boolean;
  source?: string;
  connection?: string;
  stack?: string;
}

export interface ExceptionPayload {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  context?: string;
  request?: {
    method: string;
    url: string;
    body?: JsonValue;
  };
}

export interface LogPayload {
  level: 'debug' | 'log' | 'warn' | 'error' | 'verbose';
  message: string;
  context?: string;
  stack?: string;
  metadata?: JsonObject;
}

export interface CachePayload {
  operation: 'get' | 'set' | 'del' | 'clear';
  key: string;
  hit?: boolean;
  value?: JsonValue;
  ttl?: number;
  duration: number;
}

export interface EventPayload {
  name: string;
  payload: JsonValue;
  listeners: string[];
  duration: number;
}

export interface JobPayload {
  name: string;
  queue: string;
  data: JsonValue;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attempts: number;
  duration?: number;
  error?: string;
  result?: JsonValue;
}

export interface SchedulePayload {
  name: string;
  cron?: string;
  interval?: number;
  timeout?: number;
  status: 'started' | 'completed' | 'failed';
  duration?: number;
  error?: string;
  nextRun?: string;
}

export interface MailPayload {
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
}

export interface HttpClientPayload {
  method: string;
  url: string;
  hostname?: string;
  path?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: JsonValue;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: JsonValue;
  duration: number;
  error?: string;
}

export interface RedisPayload {
  command: string;
  keyPattern?: string;
  args?: JsonValue[];
  duration: number;
  status: 'success' | 'failed';
  result?: JsonValue;
  error?: string;
}

export interface ModelPayload {
  action: string;
  entity: string;
  source?: string;
  duration: number;
  recordCount?: number;
  data?: JsonValue;
  where?: JsonValue;
  error?: string;
}

export interface NotificationPayload {
  type: string;
  recipient: string | string[];
  title?: string;
  message?: string;
  metadata?: JsonValue;
  status: 'sent' | 'failed';
  duration: number;
  error?: string;
}

export interface ViewPayload {
  template: string;
  format: 'html' | 'json' | 'xml' | 'pdf';
  duration: number;
  status: 'rendered' | 'error';
  dataSize?: number;
  outputSize?: number;
  locals?: JsonObject;
  cacheHit?: boolean;
  error?: string;
}

export interface CommandPayload {
  name: string;
  handler?: string;
  status: 'executing' | 'completed' | 'failed';
  duration?: number;
  payload?: JsonValue;
  result?: JsonValue;
  error?: string;
  metadata?: JsonObject;
}

export interface GatePayload {
  gate: string;
  action: string;
  subject?: string;
  allowed: boolean;
  userId?: string | number;
  reason?: string;
  duration: number;
  context?: JsonObject;
}

export interface BatchPayload {
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
}

export interface DumpPayload {
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
}

/**
 * GraphQL error information
 */
export interface GraphQLErrorInfo {
  message: string;
  path?: (string | number)[];
  locations?: Array<{ line: number; column: number }>;
  extensions?: JsonObject;
}

/**
 * Potential N+1 query warning
 */
export interface PotentialN1Warning {
  field: string;
  parentType: string;
  count: number;
  suggestion: string;
}

/**
 * Field-level trace information
 */
export interface GraphQLFieldTrace {
  path: string;
  parentType: string;
  fieldName: string;
  returnType: string;
  startOffset: number;
  duration: number;
}

export interface GraphQLPayload {
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription';
  query: string;
  queryHash: string;
  variables?: JsonObject;
  duration: number;
  parsingDuration?: number;
  validationDuration?: number;
  executionDuration?: number;
  statusCode: number;
  hasErrors: boolean;
  errors?: GraphQLErrorInfo[];
  responseData?: JsonValue;
  resolverCount?: number;
  fieldCount?: number;
  depthReached?: number;
  potentialN1?: PotentialN1Warning[];
  ip?: string;
  userAgent?: string;
  user?: RequestUser;
  batchIndex?: number;
  batchSize?: number;
  batchId?: string;
  subscriptionId?: string;
  subscriptionEvent?: 'start' | 'data' | 'error' | 'complete';
  messageCount?: number;
  subscriptionDuration?: number;
  fieldTraces?: GraphQLFieldTrace[];
}

// Base entry interface
interface BaseEntry {
  id: number;
  requestId?: string;
  createdAt: string;
  // Tag system fields
  familyHash?: string;
  tags?: string[];
  resolvedAt?: string;
}

// Discriminated union for type-safe entry handling
export interface RequestEntry extends BaseEntry {
  type: 'request';
  payload: RequestPayload;
}

export interface QueryEntry extends BaseEntry {
  type: 'query';
  payload: QueryPayload;
}

export interface ExceptionEntry extends BaseEntry {
  type: 'exception';
  payload: ExceptionPayload;
}

export interface LogEntry extends BaseEntry {
  type: 'log';
  payload: LogPayload;
}

export interface CacheEntry extends BaseEntry {
  type: 'cache';
  payload: CachePayload;
}

export interface EventEntry extends BaseEntry {
  type: 'event';
  payload: EventPayload;
}

export interface JobEntry extends BaseEntry {
  type: 'job';
  payload: JobPayload;
}

export interface ScheduleEntry extends BaseEntry {
  type: 'schedule';
  payload: SchedulePayload;
}

export interface MailEntry extends BaseEntry {
  type: 'mail';
  payload: MailPayload;
}

export interface HttpClientEntry extends BaseEntry {
  type: 'http-client';
  payload: HttpClientPayload;
}

export interface RedisEntry extends BaseEntry {
  type: 'redis';
  payload: RedisPayload;
}

export interface ModelEntry extends BaseEntry {
  type: 'model';
  payload: ModelPayload;
}

export interface NotificationEntry extends BaseEntry {
  type: 'notification';
  payload: NotificationPayload;
}

export interface ViewEntry extends BaseEntry {
  type: 'view';
  payload: ViewPayload;
}

export interface CommandEntry extends BaseEntry {
  type: 'command';
  payload: CommandPayload;
}

export interface GateEntry extends BaseEntry {
  type: 'gate';
  payload: GatePayload;
}

export interface BatchEntry extends BaseEntry {
  type: 'batch';
  payload: BatchPayload;
}

export interface DumpEntry extends BaseEntry {
  type: 'dump';
  payload: DumpPayload;
}

export interface GraphQLEntry extends BaseEntry {
  type: 'graphql';
  payload: GraphQLPayload;
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

// Type guards
export function isRequestEntry(entry: Entry): entry is RequestEntry {
  return entry.type === 'request';
}

export function isQueryEntry(entry: Entry): entry is QueryEntry {
  return entry.type === 'query';
}

export function isExceptionEntry(entry: Entry): entry is ExceptionEntry {
  return entry.type === 'exception';
}

export function isLogEntry(entry: Entry): entry is LogEntry {
  return entry.type === 'log';
}

export function isCacheEntry(entry: Entry): entry is CacheEntry {
  return entry.type === 'cache';
}

export function isEventEntry(entry: Entry): entry is EventEntry {
  return entry.type === 'event';
}

export function isJobEntry(entry: Entry): entry is JobEntry {
  return entry.type === 'job';
}

export function isScheduleEntry(entry: Entry): entry is ScheduleEntry {
  return entry.type === 'schedule';
}

export function isMailEntry(entry: Entry): entry is MailEntry {
  return entry.type === 'mail';
}

export function isHttpClientEntry(entry: Entry): entry is HttpClientEntry {
  return entry.type === 'http-client';
}

export function isRedisEntry(entry: Entry): entry is RedisEntry {
  return entry.type === 'redis';
}

export function isModelEntry(entry: Entry): entry is ModelEntry {
  return entry.type === 'model';
}

export function isNotificationEntry(entry: Entry): entry is NotificationEntry {
  return entry.type === 'notification';
}

export function isViewEntry(entry: Entry): entry is ViewEntry {
  return entry.type === 'view';
}

export function isCommandEntry(entry: Entry): entry is CommandEntry {
  return entry.type === 'command';
}

export function isGateEntry(entry: Entry): entry is GateEntry {
  return entry.type === 'gate';
}

export function isBatchEntry(entry: Entry): entry is BatchEntry {
  return entry.type === 'batch';
}

export function isDumpEntry(entry: Entry): entry is DumpEntry {
  return entry.type === 'dump';
}

export function isGraphQLEntry(entry: Entry): entry is GraphQLEntry {
  return entry.type === 'graphql';
}

export interface Stats {
  total: number;
  byType: Partial<Record<EntryType, number>>;
  avgResponseTime?: number;
  slowQueries?: number;
  exceptions?: number;
  unresolvedExceptions?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
  related?: Entry[];
  error?: string;
}

/**
 * Cursor-based pagination metadata
 */
export interface CursorPaginationMeta {
  hasMore: boolean;
  oldestSequence: number | null;
  newestSequence: number | null;
  total: number;
}

/**
 * Cursor paginated response
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
  byType: Partial<Record<EntryType, number>>;
  oldestEntry: string | null;
  newestEntry: string | null;
  databaseSize?: number;
}

/**
 * Pruning status
 */
export interface PruningStatus {
  enabled: boolean;
  maxAge: number;
  interval: number;
  lastRun: string | null;
  nextRun: string | null;
  totalEntries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  databaseSize?: number;
}

/**
 * Check new entries response
 */
export interface CheckNewResponse {
  count: number;
  hasNew: boolean;
}

/**
 * Tag with count
 */
export interface TagWithCount {
  tag: string;
  count: number;
}

/**
 * Monitored tag
 */
export interface MonitoredTag {
  id: number;
  tag: string;
  createdAt: string;
  count?: number;
}

/**
 * Grouped entry by family hash
 */
export interface GroupedEntry {
  familyHash: string;
  count: number;
  latestEntry: Entry;
}
