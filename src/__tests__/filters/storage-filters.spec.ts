import 'reflect-metadata';
import { SqliteStorage } from '../../core/storage/sqlite.storage';
import { createTestStorage, seedStorage } from './test-utils';
import {
  createLogEntry,
  createQueryEntry,
  createExceptionEntry,
  createRequestEntry,
  createJobEntry,
  createScheduleEntry,
  createCacheEntry,
  createMailEntry,
  createRedisEntry,
  createModelEntry,
  createNotificationEntry,
  createViewEntry,
  createCommandEntry,
  createGateEntry,
  createBatchEntry,
  createDumpEntry,
  createHttpClientEntry,
  createEventEntry,
} from './entry-factories';

describe('Storage Filters', () => {
  let storage: SqliteStorage;

  beforeEach(() => {
    storage = createTestStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  // ==================== LOG FILTERS ====================
  describe('Log Filters', () => {
    describe('levels', () => {
      it('returns only entries matching specified log levels', async () => {
        const entries = [
          createLogEntry({ level: 'error', message: 'Error 1' }),
          createLogEntry({ level: 'warn', message: 'Warning 1' }),
          createLogEntry({ level: 'debug', message: 'Debug 1' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('log', {
          filters: { levels: ['error', 'warn'] },
        });

        expect(result.data).toHaveLength(2);
        expect(result.data.every((e) => ['error', 'warn'].includes((e.payload as any).level))).toBe(true);
      });

      it('excludes non-matching entries', async () => {
        await seedStorage(storage, [
          createLogEntry({ level: 'debug' }),
          createLogEntry({ level: 'verbose' }),
        ]);

        const result = await storage.findWithCursor('log', {
          filters: { levels: ['error'] },
        });

        expect(result.data).toHaveLength(0);
      });
    });

    describe('contexts', () => {
      it('returns only entries matching specified contexts', async () => {
        const entries = [
          createLogEntry({ context: 'UserService' }),
          createLogEntry({ context: 'AuthController' }),
          createLogEntry({ context: 'CacheModule' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('log', {
          filters: { contexts: ['UserService', 'AuthController'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== QUERY FILTERS ====================
  describe('Query Filters', () => {
    describe('queryTypes', () => {
      it('filters queries by SQL type prefix', async () => {
        const entries = [
          createQueryEntry({ query: 'SELECT * FROM users' }),
          createQueryEntry({ query: 'SELECT id FROM orders' }),
          createQueryEntry({ query: 'INSERT INTO users VALUES(1)' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('query', {
          filters: { queryTypes: ['SELECT'] },
        });

        expect(result.data).toHaveLength(2);
        expect(result.data.every((e) => (e.payload as any).query.startsWith('SELECT'))).toBe(true);
      });
    });

    describe('sources', () => {
      it('filters queries by ORM source', async () => {
        const entries = [
          createQueryEntry({ source: 'typeorm' }),
          createQueryEntry({ source: 'prisma' }),
          createQueryEntry({ source: 'typeorm' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('query', {
          filters: { sources: ['typeorm'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('slow', () => {
      it('filters slow queries', async () => {
        const entries = [
          createQueryEntry({ slow: true }),
          createQueryEntry({ slow: false }),
          createQueryEntry({ slow: true }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('query', {
          filters: { slow: true },
        });

        expect(result.data).toHaveLength(2);
        expect(result.data.every((e) => (e.payload as any).slow === true)).toBe(true);
      });
    });
  });

  // ==================== EXCEPTION FILTERS ====================
  describe('Exception Filters', () => {
    describe('names', () => {
      it('filters exceptions by name with LIKE pattern', async () => {
        const entries = [
          createExceptionEntry({ name: 'TypeError' }),
          createExceptionEntry({ name: 'TypeError: Cannot read property' }),
          createExceptionEntry({ name: 'ReferenceError' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('exception', {
          filters: { names: ['TypeError'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== REQUEST FILTERS ====================
  describe('Request Filters', () => {
    describe('methods', () => {
      it('filters requests by HTTP method', async () => {
        const entries = [
          createRequestEntry({ method: 'GET' }),
          createRequestEntry({ method: 'POST' }),
          createRequestEntry({ method: 'DELETE' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { methods: ['GET', 'POST'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('paths', () => {
      it('filters requests by path with LIKE pattern', async () => {
        const entries = [
          createRequestEntry({ path: '/api/users' }),
          createRequestEntry({ path: '/api/users/1' }),
          createRequestEntry({ path: '/api/orders' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { paths: ['/api/users'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('statuses', () => {
      it('filters requests by status code', async () => {
        const entries = [
          createRequestEntry({ statusCode: 200 }),
          createRequestEntry({ statusCode: 201 }),
          createRequestEntry({ statusCode: 404 }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { statuses: [200, 201] },
        });

        expect(result.data).toHaveLength(2);
      });

      it('handles ERR status for entries without status code', async () => {
        const entries = [
          createRequestEntry({ statusCode: 200 }),
          createRequestEntry({ statusCode: undefined }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { statuses: ['ERR'] },
        });

        expect(result.data).toHaveLength(1);
      });
    });

    describe('hostnames', () => {
      it('filters requests by hostname', async () => {
        const entries = [
          createRequestEntry({ headers: { host: 'localhost:3000' } }),
          createRequestEntry({ headers: { host: 'api.example.com' } }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { hostnames: ['localhost'] },
        });

        expect(result.data).toHaveLength(1);
      });
    });

    describe('controllers', () => {
      it('filters requests by controller action', async () => {
        const entries = [
          createRequestEntry({ controllerAction: 'UsersController#findAll' }),
          createRequestEntry({ controllerAction: 'UsersController#create' }),
          createRequestEntry({ controllerAction: 'OrdersController#list' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { controllers: ['UsersController#findAll', 'UsersController#create'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('ips', () => {
      it('filters requests by IP address', async () => {
        const entries = [
          createRequestEntry({ ip: '127.0.0.1' }),
          createRequestEntry({ ip: '::1' }),
          createRequestEntry({ ip: '192.168.1.1' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('request', {
          filters: { ips: ['127.0.0.1', '::1'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== HTTP CLIENT FILTERS ====================
  describe('HTTP Client Filters', () => {
    describe('methods', () => {
      it('filters http client entries by method', async () => {
        const entries = [
          createHttpClientEntry({ method: 'GET' }),
          createHttpClientEntry({ method: 'POST' }),
          createHttpClientEntry({ method: 'DELETE' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('http-client', {
          filters: { methods: ['GET', 'POST'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('statuses', () => {
      it('filters http client entries by status code', async () => {
        const entries = [
          createHttpClientEntry({ statusCode: 200 }),
          createHttpClientEntry({ statusCode: 404 }),
          createHttpClientEntry({ statusCode: 500 }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('http-client', {
          filters: { statuses: [200, 404] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('hostnames', () => {
      it('filters http client entries by hostname', async () => {
        const entries = [
          createHttpClientEntry({ hostname: 'api.example.com' }),
          createHttpClientEntry({ hostname: 'cdn.example.com' }),
          createHttpClientEntry({ hostname: 'auth.different.com' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('http-client', {
          filters: { hostnames: ['example'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== EVENT FILTERS ====================
  describe('Event Filters', () => {
    describe('names', () => {
      it('filters events by name with LIKE pattern', async () => {
        const entries = [
          createEventEntry({ name: 'user.created' }),
          createEventEntry({ name: 'user.updated' }),
          createEventEntry({ name: 'order.placed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('event', {
          filters: { names: ['user'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== JOB FILTERS ====================
  describe('Job Filters', () => {
    describe('jobStatuses', () => {
      it('filters jobs by status', async () => {
        const entries = [
          createJobEntry({ status: 'completed' }),
          createJobEntry({ status: 'active' }),
          createJobEntry({ status: 'failed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('job', {
          filters: { jobStatuses: ['completed', 'active'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('queues', () => {
      it('filters jobs by queue name', async () => {
        const entries = [
          createJobEntry({ queue: 'default' }),
          createJobEntry({ queue: 'emails' }),
          createJobEntry({ queue: 'notifications' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('job', {
          filters: { queues: ['default', 'emails'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('names', () => {
      it('filters jobs by name with LIKE pattern', async () => {
        const entries = [
          createJobEntry({ name: 'send-email' }),
          createJobEntry({ name: 'send-notification' }),
          createJobEntry({ name: 'process-order' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('job', {
          filters: { names: ['send'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== SCHEDULE FILTERS ====================
  describe('Schedule Filters', () => {
    describe('scheduleStatuses', () => {
      it('filters scheduled tasks by status', async () => {
        const entries = [
          createScheduleEntry({ status: 'completed' }),
          createScheduleEntry({ status: 'started' }),
          createScheduleEntry({ status: 'failed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('schedule', {
          filters: { scheduleStatuses: ['completed'] },
        });

        expect(result.data).toHaveLength(1);
      });
    });

    describe('names', () => {
      it('filters scheduled tasks by name with LIKE pattern', async () => {
        const entries = [
          createScheduleEntry({ name: 'cleanup-task' }),
          createScheduleEntry({ name: 'cleanup-logs' }),
          createScheduleEntry({ name: 'send-reports' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('schedule', {
          filters: { names: ['cleanup'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== CACHE FILTERS ====================
  describe('Cache Filters', () => {
    describe('cacheOperations', () => {
      it('filters cache entries by operation', async () => {
        const entries = [
          createCacheEntry({ operation: 'get' }),
          createCacheEntry({ operation: 'set' }),
          createCacheEntry({ operation: 'del' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('cache', {
          filters: { cacheOperations: ['get', 'set'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== MAIL FILTERS ====================
  describe('Mail Filters', () => {
    describe('mailStatuses', () => {
      it('filters mail entries by status', async () => {
        const entries = [
          createMailEntry({ status: 'sent' }),
          createMailEntry({ status: 'failed' }),
          createMailEntry({ status: 'sent' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('mail', {
          filters: { mailStatuses: ['sent'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== REDIS FILTERS ====================
  describe('Redis Filters', () => {
    describe('redisStatuses', () => {
      it('filters redis entries by status', async () => {
        const entries = [
          createRedisEntry({ status: 'success' }),
          createRedisEntry({ status: 'error' }),
          createRedisEntry({ status: 'success' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('redis', {
          filters: { redisStatuses: ['success'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('redisCommands', () => {
      it('filters redis entries by command', async () => {
        const entries = [
          createRedisEntry({ command: 'GET' }),
          createRedisEntry({ command: 'SET' }),
          createRedisEntry({ command: 'HGET' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('redis', {
          filters: { redisCommands: ['GET', 'SET'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== MODEL FILTERS ====================
  describe('Model Filters', () => {
    describe('modelActions', () => {
      it('filters model entries by action', async () => {
        const entries = [
          createModelEntry({ action: 'create' }),
          createModelEntry({ action: 'update' }),
          createModelEntry({ action: 'find' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('model', {
          filters: { modelActions: ['create', 'update'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('entities', () => {
      it('filters model entries by entity name', async () => {
        const entries = [
          createModelEntry({ entity: 'User' }),
          createModelEntry({ entity: 'Post' }),
          createModelEntry({ entity: 'Comment' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('model', {
          filters: { entities: ['User', 'Post'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('modelSources', () => {
      it('filters model entries by ORM source', async () => {
        const entries = [
          createModelEntry({ source: 'typeorm' }),
          createModelEntry({ source: 'prisma' }),
          createModelEntry({ source: 'typeorm' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('model', {
          filters: { modelSources: ['typeorm'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== NOTIFICATION FILTERS ====================
  describe('Notification Filters', () => {
    describe('notificationTypes', () => {
      it('filters notifications by type', async () => {
        const entries = [
          createNotificationEntry({ type: 'email' }),
          createNotificationEntry({ type: 'sms' }),
          createNotificationEntry({ type: 'push' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('notification', {
          filters: { notificationTypes: ['email', 'sms'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('notificationStatuses', () => {
      it('filters notifications by status', async () => {
        const entries = [
          createNotificationEntry({ status: 'sent' }),
          createNotificationEntry({ status: 'failed' }),
          createNotificationEntry({ status: 'sent' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('notification', {
          filters: { notificationStatuses: ['sent'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== VIEW FILTERS ====================
  describe('View Filters', () => {
    describe('viewFormats', () => {
      it('filters views by format', async () => {
        const entries = [
          createViewEntry({ format: 'html' }),
          createViewEntry({ format: 'json' }),
          createViewEntry({ format: 'xml' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('view', {
          filters: { viewFormats: ['html', 'json'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('viewStatuses', () => {
      it('filters views by status', async () => {
        const entries = [
          createViewEntry({ status: 'rendered' }),
          createViewEntry({ status: 'error' }),
          createViewEntry({ status: 'rendered' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('view', {
          filters: { viewStatuses: ['rendered'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== COMMAND FILTERS ====================
  describe('Command Filters', () => {
    describe('commandStatuses', () => {
      it('filters commands by status', async () => {
        const entries = [
          createCommandEntry({ status: 'completed' }),
          createCommandEntry({ status: 'executing' }),
          createCommandEntry({ status: 'failed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('command', {
          filters: { commandStatuses: ['completed'] },
        });

        expect(result.data).toHaveLength(1);
      });
    });

    describe('commandNames', () => {
      it('filters commands by name with LIKE pattern', async () => {
        const entries = [
          createCommandEntry({ name: 'cache:clear' }),
          createCommandEntry({ name: 'cache:warmup' }),
          createCommandEntry({ name: 'db:migrate' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('command', {
          filters: { commandNames: ['cache'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== GATE FILTERS ====================
  describe('Gate Filters', () => {
    describe('gateNames', () => {
      it('filters gates by name with LIKE pattern', async () => {
        const entries = [
          createGateEntry({ gate: 'admin' }),
          createGateEntry({ gate: 'admin-panel' }),
          createGateEntry({ gate: 'premium' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('gate', {
          filters: { gateNames: ['admin'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('gateResults', () => {
      it('filters gates by result (allowed)', async () => {
        const entries = [
          createGateEntry({ allowed: true }),
          createGateEntry({ allowed: false }),
          createGateEntry({ allowed: true }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('gate', {
          filters: { gateResults: ['allowed'] },
        });

        expect(result.data).toHaveLength(2);
      });

      it('filters gates by result (denied)', async () => {
        const entries = [
          createGateEntry({ allowed: true }),
          createGateEntry({ allowed: false }),
          createGateEntry({ allowed: false }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('gate', {
          filters: { gateResults: ['denied'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== BATCH FILTERS ====================
  describe('Batch Filters', () => {
    describe('batchStatuses', () => {
      it('filters batches by status', async () => {
        const entries = [
          createBatchEntry({ status: 'completed' }),
          createBatchEntry({ status: 'partial' }),
          createBatchEntry({ status: 'failed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('batch', {
          filters: { batchStatuses: ['completed'] },
        });

        expect(result.data).toHaveLength(1);
      });
    });

    describe('batchOperations', () => {
      it('filters batches by operation', async () => {
        const entries = [
          createBatchEntry({ operation: 'insert' }),
          createBatchEntry({ operation: 'update' }),
          createBatchEntry({ operation: 'delete' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('batch', {
          filters: { batchOperations: ['insert', 'update'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== DUMP FILTERS ====================
  describe('Dump Filters', () => {
    describe('dumpStatuses', () => {
      it('filters dumps by status', async () => {
        const entries = [
          createDumpEntry({ status: 'completed' }),
          createDumpEntry({ status: 'failed' }),
          createDumpEntry({ status: 'completed' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('dump', {
          filters: { dumpStatuses: ['completed'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('dumpOperations', () => {
      it('filters dumps by operation', async () => {
        const entries = [
          createDumpEntry({ operation: 'export' }),
          createDumpEntry({ operation: 'backup' }),
          createDumpEntry({ operation: 'import' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('dump', {
          filters: { dumpOperations: ['export', 'backup'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });

    describe('dumpFormats', () => {
      it('filters dumps by format', async () => {
        const entries = [
          createDumpEntry({ format: 'json' }),
          createDumpEntry({ format: 'sql' }),
          createDumpEntry({ format: 'csv' }),
        ];
        await seedStorage(storage, entries);

        const result = await storage.findWithCursor('dump', {
          filters: { dumpFormats: ['json', 'sql'] },
        });

        expect(result.data).toHaveLength(2);
      });
    });
  });

  // ==================== COMBINED FILTER TESTS ====================
  describe('Combined Filters (AND logic)', () => {
    it('applies AND logic between multiple filters', async () => {
      const entries = [
        createLogEntry({ level: 'error', context: 'UserService' }),
        createLogEntry({ level: 'error', context: 'AuthController' }),
        createLogEntry({ level: 'warn', context: 'UserService' }),
        createLogEntry({ level: 'debug', context: 'CacheModule' }),
      ];
      await seedStorage(storage, entries);

      const result = await storage.findWithCursor('log', {
        filters: {
          levels: ['error'],
          contexts: ['UserService'],
        },
      });

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).level).toBe('error');
      expect((result.data[0].payload as any).context).toBe('UserService');
    });
  });
});
