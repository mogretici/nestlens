import { EntryType, CursorPaginationParams } from '../../types';

/**
 * Filter test case definition for data-driven testing
 */
export interface FilterTestCase {
  filterKey: keyof NonNullable<CursorPaginationParams['filters']>;
  entryType: EntryType;
  description: string;
  payloadField: string; // JSON path in payload
  matchingValues: unknown[];
  nonMatchingValues: unknown[];
  filterValues: unknown[]; // Values to use in filter
}

/**
 * All filter test cases for the 35+ filters
 */
export const FILTER_TEST_CASES: FilterTestCase[] = [
  // ==================== LOG FILTERS ====================
  {
    filterKey: 'levels',
    entryType: 'log',
    description: 'filters logs by level',
    payloadField: '$.level',
    matchingValues: ['error', 'warn'],
    nonMatchingValues: ['debug', 'log', 'verbose'],
    filterValues: ['error', 'warn'],
  },
  {
    filterKey: 'contexts',
    entryType: 'log',
    description: 'filters logs by context',
    payloadField: '$.context',
    matchingValues: ['UserService', 'AuthController'],
    nonMatchingValues: ['CacheService', 'OtherModule'],
    filterValues: ['UserService', 'AuthController'],
  },

  // ==================== QUERY FILTERS ====================
  {
    filterKey: 'queryTypes',
    entryType: 'query',
    description: 'filters queries by SQL type prefix',
    payloadField: '$.query',
    matchingValues: ['SELECT * FROM users', 'SELECT id FROM orders'],
    nonMatchingValues: ['INSERT INTO users VALUES(1)', 'UPDATE orders SET status = 1'],
    filterValues: ['SELECT'],
  },
  {
    filterKey: 'sources',
    entryType: 'query',
    description: 'filters queries by ORM source',
    payloadField: '$.source',
    matchingValues: ['typeorm'],
    nonMatchingValues: ['prisma', 'mongoose'],
    filterValues: ['typeorm'],
  },
  {
    filterKey: 'slow',
    entryType: 'query',
    description: 'filters slow queries',
    payloadField: '$.slow',
    matchingValues: [true],
    nonMatchingValues: [false],
    filterValues: [true], // Single boolean value
  },

  // ==================== EXCEPTION FILTERS ====================
  {
    filterKey: 'names',
    entryType: 'exception',
    description: 'filters exceptions by name (LIKE pattern)',
    payloadField: '$.name',
    matchingValues: ['TypeError', 'TypeError: Cannot read property'],
    nonMatchingValues: ['ReferenceError', 'SyntaxError'],
    filterValues: ['TypeError'],
  },
  {
    filterKey: 'methods',
    entryType: 'exception',
    description: 'filters exceptions by request method',
    payloadField: '$.request.method',
    matchingValues: [{ method: 'POST', url: '/api/test', body: {} }],
    nonMatchingValues: [{ method: 'GET', url: '/api/test' }],
    filterValues: ['POST'],
  },
  {
    filterKey: 'paths',
    entryType: 'exception',
    description: 'filters exceptions by request path (LIKE pattern)',
    payloadField: '$.request.url',
    matchingValues: [{ method: 'GET', url: '/api/users/1' }],
    nonMatchingValues: [{ method: 'GET', url: '/api/orders' }],
    filterValues: ['/api/users'],
  },

  // ==================== REQUEST FILTERS ====================
  {
    filterKey: 'methods',
    entryType: 'request',
    description: 'filters requests by HTTP method',
    payloadField: '$.method',
    matchingValues: ['GET', 'POST'],
    nonMatchingValues: ['PUT', 'DELETE', 'PATCH'],
    filterValues: ['GET', 'POST'],
  },
  {
    filterKey: 'paths',
    entryType: 'request',
    description: 'filters requests by path (LIKE pattern)',
    payloadField: '$.path',
    matchingValues: ['/api/users', '/api/users/1'],
    nonMatchingValues: ['/api/orders', '/health'],
    filterValues: ['/api/users'],
  },
  {
    filterKey: 'statuses',
    entryType: 'request',
    description: 'filters requests by status code',
    payloadField: '$.statusCode',
    matchingValues: [200, 201],
    nonMatchingValues: [404, 500, 401],
    filterValues: [200, 201],
  },
  {
    filterKey: 'hostnames',
    entryType: 'request',
    description: 'filters requests by hostname',
    payloadField: '$.headers.host',
    matchingValues: [{ host: 'localhost:3000' }],
    nonMatchingValues: [{ host: 'api.example.com' }],
    filterValues: ['localhost'],
  },
  {
    filterKey: 'controllers',
    entryType: 'request',
    description: 'filters requests by controller action',
    payloadField: '$.controllerAction',
    matchingValues: ['UsersController#findAll', 'UsersController#create'],
    nonMatchingValues: ['OrdersController#list', 'HealthController#check'],
    filterValues: ['UsersController#findAll', 'UsersController#create'],
  },
  {
    filterKey: 'ips',
    entryType: 'request',
    description: 'filters requests by IP address',
    payloadField: '$.ip',
    matchingValues: ['127.0.0.1', '::1'],
    nonMatchingValues: ['192.168.1.1', '10.0.0.1'],
    filterValues: ['127.0.0.1', '::1'],
  },

  // ==================== JOB FILTERS ====================
  {
    filterKey: 'jobStatuses',
    entryType: 'job',
    description: 'filters jobs by status',
    payloadField: '$.status',
    matchingValues: ['completed', 'active'],
    nonMatchingValues: ['waiting', 'failed', 'delayed'],
    filterValues: ['completed', 'active'],
  },
  {
    filterKey: 'queues',
    entryType: 'job',
    description: 'filters jobs by queue name',
    payloadField: '$.queue',
    matchingValues: ['default', 'emails'],
    nonMatchingValues: ['notifications', 'high-priority'],
    filterValues: ['default', 'emails'],
  },

  // ==================== SCHEDULE FILTERS ====================
  {
    filterKey: 'scheduleStatuses',
    entryType: 'schedule',
    description: 'filters scheduled tasks by status',
    payloadField: '$.status',
    matchingValues: ['completed'],
    nonMatchingValues: ['started', 'failed'],
    filterValues: ['completed'],
  },

  // ==================== CACHE FILTERS ====================
  {
    filterKey: 'cacheOperations',
    entryType: 'cache',
    description: 'filters cache entries by operation',
    payloadField: '$.operation',
    matchingValues: ['get', 'set'],
    nonMatchingValues: ['del', 'clear'],
    filterValues: ['get', 'set'],
  },

  // ==================== MAIL FILTERS ====================
  {
    filterKey: 'mailStatuses',
    entryType: 'mail',
    description: 'filters mail entries by status',
    payloadField: '$.status',
    matchingValues: ['sent'],
    nonMatchingValues: ['failed'],
    filterValues: ['sent'],
  },

  // ==================== REDIS FILTERS ====================
  {
    filterKey: 'redisStatuses',
    entryType: 'redis',
    description: 'filters redis entries by status',
    payloadField: '$.status',
    matchingValues: ['success'],
    nonMatchingValues: ['error'],
    filterValues: ['success'],
  },
  {
    filterKey: 'redisCommands',
    entryType: 'redis',
    description: 'filters redis entries by command',
    payloadField: '$.command',
    matchingValues: ['GET', 'SET'],
    nonMatchingValues: ['HGET', 'LPUSH', 'DEL'],
    filterValues: ['GET', 'SET'],
  },

  // ==================== MODEL FILTERS ====================
  {
    filterKey: 'modelActions',
    entryType: 'model',
    description: 'filters model entries by action',
    payloadField: '$.action',
    matchingValues: ['create', 'update'],
    nonMatchingValues: ['find', 'delete', 'save'],
    filterValues: ['create', 'update'],
  },
  {
    filterKey: 'entities',
    entryType: 'model',
    description: 'filters model entries by entity name',
    payloadField: '$.entity',
    matchingValues: ['User', 'Post'],
    nonMatchingValues: ['Comment', 'Order'],
    filterValues: ['User', 'Post'],
  },
  {
    filterKey: 'modelSources',
    entryType: 'model',
    description: 'filters model entries by ORM source',
    payloadField: '$.source',
    matchingValues: ['typeorm'],
    nonMatchingValues: ['prisma'],
    filterValues: ['typeorm'],
  },

  // ==================== NOTIFICATION FILTERS ====================
  {
    filterKey: 'notificationTypes',
    entryType: 'notification',
    description: 'filters notifications by type',
    payloadField: '$.type',
    matchingValues: ['email', 'sms'],
    nonMatchingValues: ['push', 'socket', 'webhook'],
    filterValues: ['email', 'sms'],
  },
  {
    filterKey: 'notificationStatuses',
    entryType: 'notification',
    description: 'filters notifications by status',
    payloadField: '$.status',
    matchingValues: ['sent'],
    nonMatchingValues: ['failed'],
    filterValues: ['sent'],
  },

  // ==================== VIEW FILTERS ====================
  {
    filterKey: 'viewFormats',
    entryType: 'view',
    description: 'filters views by format',
    payloadField: '$.format',
    matchingValues: ['html', 'json'],
    nonMatchingValues: ['xml', 'pdf'],
    filterValues: ['html', 'json'],
  },
  {
    filterKey: 'viewStatuses',
    entryType: 'view',
    description: 'filters views by status',
    payloadField: '$.status',
    matchingValues: ['rendered'],
    nonMatchingValues: ['error'],
    filterValues: ['rendered'],
  },

  // ==================== COMMAND FILTERS ====================
  {
    filterKey: 'commandStatuses',
    entryType: 'command',
    description: 'filters commands by status',
    payloadField: '$.status',
    matchingValues: ['completed'],
    nonMatchingValues: ['executing', 'failed'],
    filterValues: ['completed'],
  },
  {
    filterKey: 'commandNames',
    entryType: 'command',
    description: 'filters commands by name (LIKE pattern)',
    payloadField: '$.name',
    matchingValues: ['cache:clear', 'cache:warmup'],
    nonMatchingValues: ['db:migrate', 'queue:work'],
    filterValues: ['cache'],
  },

  // ==================== GATE FILTERS ====================
  {
    filterKey: 'gateNames',
    entryType: 'gate',
    description: 'filters gates by name (LIKE pattern)',
    payloadField: '$.gate',
    matchingValues: ['admin', 'admin-panel'],
    nonMatchingValues: ['premium', 'moderator'],
    filterValues: ['admin'],
  },
  {
    filterKey: 'gateResults',
    entryType: 'gate',
    description: 'filters gates by result (allowed/denied mapped to boolean)',
    payloadField: '$.allowed',
    matchingValues: [true], // allowed
    nonMatchingValues: [false], // denied
    filterValues: ['allowed'],
  },

  // ==================== BATCH FILTERS ====================
  {
    filterKey: 'batchStatuses',
    entryType: 'batch',
    description: 'filters batches by status',
    payloadField: '$.status',
    matchingValues: ['completed'],
    nonMatchingValues: ['partial', 'failed'],
    filterValues: ['completed'],
  },
  {
    filterKey: 'batchOperations',
    entryType: 'batch',
    description: 'filters batches by operation',
    payloadField: '$.operation',
    matchingValues: ['insert', 'update'],
    nonMatchingValues: ['delete', 'upsert'],
    filterValues: ['insert', 'update'],
  },

  // ==================== DUMP FILTERS ====================
  {
    filterKey: 'dumpStatuses',
    entryType: 'dump',
    description: 'filters dumps by status',
    payloadField: '$.status',
    matchingValues: ['completed'],
    nonMatchingValues: ['failed'],
    filterValues: ['completed'],
  },
  {
    filterKey: 'dumpOperations',
    entryType: 'dump',
    description: 'filters dumps by operation',
    payloadField: '$.operation',
    matchingValues: ['export', 'backup'],
    nonMatchingValues: ['import', 'restore', 'migrate'],
    filterValues: ['export', 'backup'],
  },
  {
    filterKey: 'dumpFormats',
    entryType: 'dump',
    description: 'filters dumps by format',
    payloadField: '$.format',
    matchingValues: ['json', 'sql'],
    nonMatchingValues: ['csv', 'binary'],
    filterValues: ['json', 'sql'],
  },
];

/**
 * Group test cases by entry type for organized output
 */
export const TEST_CASES_BY_TYPE = FILTER_TEST_CASES.reduce(
  (acc, tc) => {
    if (!acc[tc.entryType]) acc[tc.entryType] = [];
    acc[tc.entryType].push(tc);
    return acc;
  },
  {} as Record<EntryType, FilterTestCase[]>,
);

/**
 * Get test case by filter key
 */
export function getTestCaseByFilterKey(
  filterKey: string,
): FilterTestCase | undefined {
  return FILTER_TEST_CASES.find((tc) => tc.filterKey === filterKey);
}
