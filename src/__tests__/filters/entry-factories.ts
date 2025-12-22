import {
  RequestEntry,
  QueryEntry,
  ExceptionEntry,
  LogEntry,
  CacheEntry,
  EventEntry,
  JobEntry,
  ScheduleEntry,
  MailEntry,
  HttpClientEntry,
  RedisEntry,
  ModelEntry,
  NotificationEntry,
  ViewEntry,
  CommandEntry,
  GateEntry,
  BatchEntry,
  DumpEntry,
} from '../../types';

// Counter for unique IDs in tests
let idCounter = 0;
const getNextId = () => `test-${++idCounter}-${Date.now()}`;

// ==================== REQUEST ====================
export function createRequestEntry(
  overrides: Partial<RequestEntry['payload']> = {},
): RequestEntry {
  return {
    type: 'request',
    requestId: getNextId(),
    payload: {
      method: 'GET',
      url: '/api/test',
      path: '/api/test',
      query: {},
      params: {},
      headers: { host: 'localhost:3000' },
      statusCode: 200,
      duration: 100,
      memory: 0,
      ...overrides,
    },
  };
}

// ==================== QUERY ====================
export function createQueryEntry(
  overrides: Partial<QueryEntry['payload']> = {},
): QueryEntry {
  return {
    type: 'query',
    requestId: getNextId(),
    payload: {
      query: 'SELECT * FROM users WHERE id = ?',
      parameters: [1],
      duration: 15,
      slow: false,
      source: 'typeorm',
      ...overrides,
    },
  };
}

// ==================== EXCEPTION ====================
export function createExceptionEntry(
  overrides: Partial<ExceptionEntry['payload']> = {},
): ExceptionEntry {
  return {
    type: 'exception',
    requestId: getNextId(),
    payload: {
      name: 'Error',
      message: 'Test error message',
      stack: 'Error: Test error\n    at test.ts:1:1',
      ...overrides,
    },
  };
}

// ==================== LOG ====================
export function createLogEntry(
  overrides: Partial<LogEntry['payload']> = {},
): LogEntry {
  return {
    type: 'log',
    requestId: getNextId(),
    payload: {
      level: 'log',
      message: 'Test log message',
      context: 'TestService',
      ...overrides,
    },
  };
}

// ==================== CACHE ====================
export function createCacheEntry(
  overrides: Partial<CacheEntry['payload']> = {},
): CacheEntry {
  return {
    type: 'cache',
    requestId: getNextId(),
    payload: {
      operation: 'get',
      key: 'test:key',
      hit: true,
      duration: 5,
      ...overrides,
    },
  };
}

// ==================== EVENT ====================
export function createEventEntry(
  overrides: Partial<EventEntry['payload']> = {},
): EventEntry {
  return {
    type: 'event',
    requestId: getNextId(),
    payload: {
      name: 'user.created',
      payload: { userId: 1 },
      listeners: ['UserListener', 'NotificationListener'],
      duration: 10,
      ...overrides,
    },
  };
}

// ==================== JOB ====================
export function createJobEntry(
  overrides: Partial<JobEntry['payload']> = {},
): JobEntry {
  return {
    type: 'job',
    requestId: getNextId(),
    payload: {
      name: 'send-email',
      queue: 'default',
      data: { to: 'test@example.com' },
      status: 'completed',
      attempts: 1,
      duration: 500,
      ...overrides,
    },
  };
}

// ==================== SCHEDULE ====================
export function createScheduleEntry(
  overrides: Partial<ScheduleEntry['payload']> = {},
): ScheduleEntry {
  return {
    type: 'schedule',
    requestId: getNextId(),
    payload: {
      name: 'cleanup-task',
      cron: '0 0 * * *',
      status: 'completed',
      duration: 1000,
      ...overrides,
    },
  };
}

// ==================== MAIL ====================
export function createMailEntry(
  overrides: Partial<MailEntry['payload']> = {},
): MailEntry {
  return {
    type: 'mail',
    requestId: getNextId(),
    payload: {
      to: 'user@example.com',
      subject: 'Test Email',
      status: 'sent',
      duration: 200,
      ...overrides,
    },
  };
}

// ==================== HTTP-CLIENT ====================
export function createHttpClientEntry(
  overrides: Partial<HttpClientEntry['payload']> = {},
): HttpClientEntry {
  return {
    type: 'http-client',
    requestId: getNextId(),
    payload: {
      method: 'GET',
      url: 'https://api.example.com/data',
      hostname: 'api.example.com',
      statusCode: 200,
      duration: 150,
      ...overrides,
    },
  };
}

// ==================== REDIS ====================
export function createRedisEntry(
  overrides: Partial<RedisEntry['payload']> = {},
): RedisEntry {
  return {
    type: 'redis',
    requestId: getNextId(),
    payload: {
      command: 'GET',
      args: ['user:1'],
      duration: 2,
      status: 'success',
      ...overrides,
    },
  };
}

// ==================== MODEL ====================
export function createModelEntry(
  overrides: Partial<ModelEntry['payload']> = {},
): ModelEntry {
  return {
    type: 'model',
    requestId: getNextId(),
    payload: {
      action: 'find',
      entity: 'User',
      source: 'typeorm',
      duration: 25,
      ...overrides,
    },
  };
}

// ==================== NOTIFICATION ====================
export function createNotificationEntry(
  overrides: Partial<NotificationEntry['payload']> = {},
): NotificationEntry {
  return {
    type: 'notification',
    requestId: getNextId(),
    payload: {
      type: 'email',
      recipient: 'user@example.com',
      title: 'Notification Title',
      message: 'Notification message',
      status: 'sent',
      duration: 50,
      ...overrides,
    },
  };
}

// ==================== VIEW ====================
export function createViewEntry(
  overrides: Partial<ViewEntry['payload']> = {},
): ViewEntry {
  return {
    type: 'view',
    requestId: getNextId(),
    payload: {
      template: 'users/index',
      format: 'html',
      duration: 30,
      status: 'rendered',
      ...overrides,
    },
  };
}

// ==================== COMMAND ====================
export function createCommandEntry(
  overrides: Partial<CommandEntry['payload']> = {},
): CommandEntry {
  return {
    type: 'command',
    requestId: getNextId(),
    payload: {
      name: 'cache:clear',
      handler: 'CacheCommand',
      status: 'completed',
      duration: 100,
      ...overrides,
    },
  };
}

// ==================== GATE ====================
export function createGateEntry(
  overrides: Partial<GateEntry['payload']> = {},
): GateEntry {
  return {
    type: 'gate',
    requestId: getNextId(),
    payload: {
      gate: 'admin',
      action: 'access',
      allowed: true,
      duration: 5,
      ...overrides,
    },
  };
}

// ==================== BATCH ====================
export function createBatchEntry(
  overrides: Partial<BatchEntry['payload']> = {},
): BatchEntry {
  return {
    type: 'batch',
    requestId: getNextId(),
    payload: {
      name: 'import-users',
      operation: 'insert',
      totalItems: 100,
      processedItems: 100,
      failedItems: 0,
      duration: 5000,
      status: 'completed',
      ...overrides,
    },
  };
}

// ==================== DUMP ====================
export function createDumpEntry(
  overrides: Partial<DumpEntry['payload']> = {},
): DumpEntry {
  return {
    type: 'dump',
    requestId: getNextId(),
    payload: {
      operation: 'export',
      format: 'json',
      duration: 2000,
      status: 'completed',
      ...overrides,
    },
  };
}
