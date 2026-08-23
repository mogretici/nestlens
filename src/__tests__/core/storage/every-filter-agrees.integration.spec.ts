/**
 * Every filter, on every backend, answering the same.
 *
 * There are forty-five, each written twice: once as JavaScript over hydrated
 * entries, for memory and Redis, and once as SQL. Three checks already guard
 * parts of that chain — the DTO's names against the keys `toFilters` reads,
 * and a grep confirming each key is mentioned in both implementations — and
 * none of them looks at what a filter *does*.
 *
 * The failure this exists for has happened: RedisStorage carried a comment
 * saying it applied "the same filter logic as MemoryStorage" while
 * implementing nine of the forty-four. Filtering by method, path, status, IP or
 * tag on Redis did nothing at all — the badge click changed the URL and the
 * list came back untouched, with no error to notice.
 *
 * So each filter here is given an entry it should keep, an entry it should
 * drop, and one question asked of every backend.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { CursorPaginationParams, Entry, EntryType } from '../../../types';

const REDIS_URL = process.env.REDIS_URL ?? (process.env.CI ? 'redis://127.0.0.1:6379' : undefined);

/** How long a reachable Redis is allowed to take to answer the first command. */
const REDIS_DEADLINE_MS = 5_000;

const withDeadline = async <T>(work: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer within ${REDIS_DEADLINE_MS}ms`)),
          REDIS_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

type Filters = NonNullable<CursorPaginationParams['filters']>;

interface Case {
  /** The filter under test, as the dashboard would send it. */
  filters: Filters;
  type: EntryType;
  /** A payload the filter must keep. */
  keep: Record<string, unknown>;
  /** A payload the filter must drop. */
  drop: Record<string, unknown>;
  /** Tags to put on the kept entry, where the filter reads them. */
  keepTags?: string[];
  dropTags?: string[];
  /** Set when the entry has to be resolved for the filter to mean anything. */
  resolveKept?: boolean;
}

const CASES: Record<string, Case> = {
  minDuration: {
    filters: { minDuration: 500 },
    type: 'request',
    keep: { method: 'GET', path: '/slow', url: '/slow', statusCode: 200, duration: 900 },
    drop: { method: 'GET', path: '/fast', url: '/fast', statusCode: 200, duration: 5 },
  },
  maxDuration: {
    filters: { maxDuration: 50 },
    type: 'request',
    keep: { method: 'GET', path: '/fast', url: '/fast', statusCode: 200, duration: 5 },
    drop: { method: 'GET', path: '/slow', url: '/slow', statusCode: 200, duration: 900 },
  },
  levels: {
    filters: { levels: ['error'] },
    type: 'log',
    keep: { level: 'error', message: 'a' },
    drop: { level: 'info', message: 'b' },
  },
  contexts: {
    filters: { contexts: ['OrdersService'] },
    type: 'log',
    keep: { level: 'info', message: 'a', context: 'OrdersService' },
    drop: { level: 'info', message: 'b', context: 'UsersService' },
  },
  queryTypes: {
    filters: { queryTypes: ['SELECT'] },
    type: 'query',
    keep: { query: 'SELECT 1', source: 'typeorm', duration: 1 },
    drop: { query: 'UPDATE t SET a = 1', source: 'typeorm', duration: 1 },
  },
  sources: {
    filters: { sources: ['typeorm'] },
    type: 'query',
    keep: { query: 'SELECT 1', source: 'typeorm', duration: 1 },
    drop: { query: 'SELECT 1', source: 'prisma', duration: 1 },
  },
  slow: {
    filters: { slow: true },
    type: 'query',
    keep: { query: 'SELECT 1', source: 'typeorm', duration: 900, slow: true },
    drop: { query: 'SELECT 1', source: 'typeorm', duration: 1, slow: false },
  },
  methods: {
    filters: { methods: ['POST'] },
    type: 'request',
    keep: { method: 'POST', path: '/a', url: '/a', statusCode: 200 },
    drop: { method: 'GET', path: '/a', url: '/a', statusCode: 200 },
  },
  paths: {
    filters: { paths: ['/orders'] },
    type: 'request',
    keep: { method: 'GET', path: '/orders', url: '/orders', statusCode: 200 },
    drop: { method: 'GET', path: '/users', url: '/users', statusCode: 200 },
  },
  statuses: {
    filters: { statuses: [500] },
    type: 'request',
    keep: { method: 'GET', path: '/a', url: '/a', statusCode: 500 },
    drop: { method: 'GET', path: '/a', url: '/a', statusCode: 200 },
  },
  controllers: {
    filters: { controllers: ['OrdersController.list'] },
    type: 'request',
    keep: { method: 'GET', path: '/a', url: '/a', controllerAction: 'OrdersController.list' },
    drop: { method: 'GET', path: '/a', url: '/a', controllerAction: 'UsersController.list' },
  },
  hostnames: {
    filters: { hostnames: ['api.example.com'] },
    type: 'request',
    keep: { method: 'GET', path: '/a', url: '/a', headers: { host: 'api.example.com' } },
    drop: { method: 'GET', path: '/a', url: '/a', headers: { host: 'www.example.com' } },
  },
  ips: {
    filters: { ips: ['10.0.0.1'] },
    type: 'request',
    keep: { method: 'GET', path: '/a', url: '/a', ip: '10.0.0.1' },
    drop: { method: 'GET', path: '/a', url: '/a', ip: '10.0.0.2' },
  },
  names: {
    filters: { names: ['TypeError'] },
    type: 'exception',
    keep: { name: 'TypeError', message: 'a' },
    drop: { name: 'RangeError', message: 'b' },
  },
  resolved: {
    filters: { resolved: true },
    type: 'exception',
    keep: { name: 'Error', message: 'a' },
    drop: { name: 'Error', message: 'b' },
    resolveKept: true,
  },
  eventNames: {
    filters: { eventNames: ['order.created'] },
    type: 'event',
    keep: { name: 'order.created' },
    drop: { name: 'user.created' },
  },
  scheduleStatuses: {
    filters: { scheduleStatuses: ['failed'] },
    type: 'schedule',
    keep: { name: 'a', status: 'failed' },
    drop: { name: 'a', status: 'completed' },
  },
  scheduleNames: {
    filters: { scheduleNames: ['nightly'] },
    type: 'schedule',
    keep: { name: 'nightly-sync', status: 'completed' },
    drop: { name: 'hourly-sync', status: 'completed' },
  },
  jobStatuses: {
    filters: { jobStatuses: ['failed'] },
    type: 'job',
    keep: { name: 'a', status: 'failed', queue: 'q' },
    drop: { name: 'a', status: 'completed', queue: 'q' },
  },
  jobNames: {
    filters: { jobNames: ['send-mail'] },
    type: 'job',
    keep: { name: 'send-mail', status: 'completed', queue: 'q' },
    drop: { name: 'resize-image', status: 'completed', queue: 'q' },
  },
  queues: {
    filters: { queues: ['mail'] },
    type: 'job',
    keep: { name: 'a', status: 'completed', queue: 'mail' },
    drop: { name: 'a', status: 'completed', queue: 'images' },
  },
  cacheOperations: {
    filters: { cacheOperations: ['hit'] },
    type: 'cache',
    keep: { operation: 'hit', key: 'k' },
    drop: { operation: 'miss', key: 'k' },
  },
  mailStatuses: {
    filters: { mailStatuses: ['failed'] },
    type: 'mail',
    keep: { status: 'failed', to: 'a@b.c' },
    drop: { status: 'sent', to: 'a@b.c' },
  },
  redisStatuses: {
    filters: { redisStatuses: ['error'] },
    type: 'redis',
    keep: { status: 'error', command: 'GET' },
    drop: { status: 'success', command: 'GET' },
  },
  redisCommands: {
    filters: { redisCommands: ['SET'] },
    type: 'redis',
    keep: { status: 'success', command: 'SET' },
    drop: { status: 'success', command: 'GET' },
  },
  modelActions: {
    filters: { modelActions: ['insert'] },
    type: 'model',
    keep: { action: 'insert', entity: 'Order', source: 'typeorm' },
    drop: { action: 'update', entity: 'Order', source: 'typeorm' },
  },
  entities: {
    filters: { entities: ['Order'] },
    type: 'model',
    keep: { action: 'insert', entity: 'Order', source: 'typeorm' },
    drop: { action: 'insert', entity: 'User', source: 'typeorm' },
  },
  modelSources: {
    filters: { modelSources: ['typeorm'] },
    type: 'model',
    keep: { action: 'insert', entity: 'Order', source: 'typeorm' },
    drop: { action: 'insert', entity: 'Order', source: 'prisma' },
  },
  notificationTypes: {
    filters: { notificationTypes: ['push'] },
    type: 'notification',
    keep: { type: 'push', status: 'sent' },
    drop: { type: 'sms', status: 'sent' },
  },
  notificationStatuses: {
    filters: { notificationStatuses: ['failed'] },
    type: 'notification',
    keep: { type: 'push', status: 'failed' },
    drop: { type: 'push', status: 'sent' },
  },
  viewFormats: {
    filters: { viewFormats: ['hbs'] },
    type: 'view',
    keep: { format: 'hbs', status: 'rendered', name: 'v' },
    drop: { format: 'pug', status: 'rendered', name: 'v' },
  },
  viewStatuses: {
    filters: { viewStatuses: ['failed'] },
    type: 'view',
    keep: { format: 'hbs', status: 'failed', name: 'v' },
    drop: { format: 'hbs', status: 'rendered', name: 'v' },
  },
  commandStatuses: {
    filters: { commandStatuses: ['failed'] },
    type: 'command',
    keep: { name: 'c', status: 'failed' },
    drop: { name: 'c', status: 'completed' },
  },
  commandNames: {
    filters: { commandNames: ['migrate'] },
    type: 'command',
    keep: { name: 'migrate-db', status: 'completed' },
    drop: { name: 'seed-db', status: 'completed' },
  },
  gateNames: {
    filters: { gateNames: ['orders'] },
    type: 'gate',
    keep: { gate: 'orders.read', allowed: true },
    drop: { gate: 'users.read', allowed: true },
  },
  gateResults: {
    filters: { gateResults: ['denied'] },
    type: 'gate',
    keep: { gate: 'orders.read', allowed: false },
    drop: { gate: 'orders.read', allowed: true },
  },
  batchStatuses: {
    filters: { batchStatuses: ['failed'] },
    type: 'batch',
    keep: { name: 'b', operation: 'import', status: 'failed' },
    drop: { name: 'b', operation: 'import', status: 'completed' },
  },
  batchOperations: {
    filters: { batchOperations: ['import'] },
    type: 'batch',
    keep: { name: 'b', operation: 'import', status: 'completed' },
    drop: { name: 'b', operation: 'export', status: 'completed' },
  },
  dumpStatuses: {
    filters: { dumpStatuses: ['failed'] },
    type: 'dump',
    keep: { operation: 'export', status: 'failed', format: 'json' },
    drop: { operation: 'export', status: 'completed', format: 'json' },
  },
  dumpOperations: {
    filters: { dumpOperations: ['backup'] },
    type: 'dump',
    keep: { operation: 'backup', status: 'completed', format: 'json' },
    drop: { operation: 'export', status: 'completed', format: 'json' },
  },
  dumpFormats: {
    filters: { dumpFormats: ['csv'] },
    type: 'dump',
    keep: { operation: 'export', status: 'completed', format: 'csv' },
    drop: { operation: 'export', status: 'completed', format: 'json' },
  },
  operationTypes: {
    filters: { operationTypes: ['mutation'] },
    type: 'graphql',
    keep: { operationType: 'mutation', query: 'mutation { a }', duration: 1 },
    drop: { operationType: 'query', query: 'query { a }', duration: 1 },
  },
  operationNames: {
    filters: { operationNames: ['PlaceOrder'] },
    type: 'graphql',
    keep: { operationType: 'mutation', operationName: 'PlaceOrder', query: 'x', duration: 1 },
    drop: { operationType: 'mutation', operationName: 'DeleteUser', query: 'x', duration: 1 },
  },
  hasErrors: {
    filters: { hasErrors: true },
    type: 'graphql',
    keep: { operationType: 'query', query: 'x', duration: 1, hasErrors: true },
    drop: { operationType: 'query', query: 'x', duration: 1, hasErrors: false },
  },
  hasN1: {
    filters: { hasN1: true },
    type: 'graphql',
    keep: { operationType: 'query', query: 'x', duration: 1, potentialN1: [{ field: 'a' }] },
    // The shape an operation without warnings really has: the watcher writes
    // `potentialN1` only when there is something in it, so the empty array this
    // used to drop was a shape nothing produces.
    drop: { operationType: 'query', query: 'x', duration: 1 },
  },
  hasN1False: {
    filters: { hasN1: false },
    type: 'graphql',
    keep: { operationType: 'query', query: 'x', duration: 1 },
    drop: { operationType: 'query', query: 'x', duration: 1, potentialN1: [{ field: 'a' }] },
  },
  tags: {
    filters: { tags: ['SLOW'] },
    type: 'request',
    keep: { method: 'GET', path: '/a', url: '/a', statusCode: 200 },
    drop: { method: 'GET', path: '/a', url: '/a', statusCode: 200 },
    keepTags: ['SLOW'],
    dropTags: ['FAST'],
  },
  search: {
    filters: { search: 'needle' },
    type: 'log',
    keep: { level: 'info', message: 'a needle in it' },
    drop: { level: 'info', message: 'nothing here' },
  },
};

describe('every filter agrees across backends', () => {
  jest.setTimeout(120_000);

  let workspace: string;
  let backends: { name: string; storage: StorageInterface }[];

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-filters-'));

    backends = [
      { name: 'memory', storage: new MemoryStorage({ maxEntries: 100_000 }) },
      { name: 'sqlite', storage: new SqliteStorage(join(workspace, 'filters.db')) },
    ];

    if (REDIS_URL) {
      const url = new URL(REDIS_URL);
      const redis = new RedisStorage({
        host: url.hostname,
        port: Number(url.port || 6379),
        db: 13,
        keyPrefix: 'nestlens-filters-test:',
      });

      try {
        // `initialize` does not reject on an unreachable server — NestLens does
        // not get to stop an application from starting — and ioredis retries a
        // refused connection for as long as it is allowed to. So the check is a
        // command with a deadline: without one this hung instead of failing,
        // which is worse than the silence it was meant to replace.
        await withDeadline(redis.initialize().then(() => redis.clear()));
        backends.push({ name: 'redis', storage: redis });
      } catch (error) {
        // Two backends still catch a divergence locally. In CI this is a
        // failure: the count of green tests is the same either way, so a Redis
        // service that did not come up would remove a third of the coverage
        // silently.
        // Nothing left retrying: ioredis reconnects for as long as the
        // process lives, so a client that never answered still holds the
        // event loop open and the run hangs after the failure.
        await redis.close().catch(() => undefined);

        if (process.env.CI) {
          throw new Error(
            `Redis was expected at ${REDIS_URL} and could not be reached: ${String(error)}`,
          );
        }
      }
    }

    for (const { storage } of backends) {
      if (!(storage instanceof RedisStorage)) await storage.initialize();

      // Every case's pair, in one store, so each filter also has to ignore the
      // forty-four other kinds of entry sitting beside it.
      for (const [key, testCase] of Object.entries(CASES)) {
        const kept = await storage.save({
          type: testCase.type,
          payload: { ...testCase.keep, __case: key },
        } as unknown as Entry);

        const dropped = await storage.save({
          type: testCase.type,
          payload: { ...testCase.drop, __case: key },
        } as unknown as Entry);

        if (testCase.keepTags) await storage.addTags(kept.id as number, testCase.keepTags);
        if (testCase.dropTags) await storage.addTags(dropped.id as number, testCase.dropTags);
        if (testCase.resolveKept) await storage.resolveEntry(kept.id as number);
      }
    }
  });

  afterAll(async () => {
    for (const { storage } of backends) {
      if (storage instanceof RedisStorage) await storage.clear();
      await storage.close();
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  it('has backends to compare, and names them', () => {
    // Named rather than counted: the suite reports the same number of green
    // tests whether or not Redis was among them, so the only way to tell what
    // was actually compared is to say so.
    expect(backends.map(({ name }) => name)).toEqual(
      process.env.CI ? ['memory', 'sqlite', 'redis'] : expect.arrayContaining(['memory', 'sqlite']),
    );
  });

  describe.each(Object.entries(CASES))('%s', (key, testCase) => {
    /** What each backend returns for this filter, as a comparable string. */
    const answers = async (): Promise<{ name: string; ids: string }[]> => {
      const collected: { name: string; ids: string }[] = [];

      for (const { name, storage } of backends) {
        const page = await storage.findWithCursor(testCase.type, {
          limit: 200,
          filters: testCase.filters,
        });

        const cases = page.data
          .map((entry) => (entry.payload as { __case?: string }).__case)
          .filter((c) => c === key);

        collected.push({ name, ids: JSON.stringify(cases) });
      }

      return collected;
    };

    it('keeps what it should and drops what it should', async () => {
      const [first, ...rest] = await answers();

      // Exactly the one entry this filter is meant to keep.
      expect(`${first.name}: ${first.ids}`).toBe(`${first.name}: ${JSON.stringify([key])}`);

      for (const other of rest) {
        expect(`${other.name}: ${other.ids}`).toBe(`${other.name}: ${first.ids}`);
      }
    });
  });
});
