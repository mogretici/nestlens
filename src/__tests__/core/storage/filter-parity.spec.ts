/**
 * The same question, asked of every storage backend.
 *
 * Which backend an application runs is a configuration choice, and the
 * dashboard sends the same filters whichever one answers. They used not to
 * agree: MemoryStorage carried forty-four rules, RedisStorage carried nine
 * under a comment saying it applied "the same filter logic as MemoryStorage",
 * and SQLite expressed its own set in SQL. Filtering by method, path, status,
 * IP or tag on Redis did nothing at all — the badge click changed the URL and
 * the list came back untouched, with nothing to notice.
 *
 * Memory and Redis now share one predicate; SQLite expresses the same rules in
 * SQL, which this checks by asking all three and comparing the answers rather
 * than by reading the code.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import RedisMock from 'ioredis-mock';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { RedisStorage } from '../../../core/storage/redis.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { StorageInterface } from '../../../core/storage/storage.interface';
import { CursorPaginationParams, Entry, EntryType } from '../../../types';

type Filters = NonNullable<CursorPaginationParams['filters']>;

const entry = (type: EntryType, payload: Record<string, unknown>): Entry =>
  ({ type, payload }) as unknown as Entry;

/** Two of each kind, so a working filter always halves the result. */
const SEED: Array<[EntryType, Record<string, unknown>]> = [
  [
    'request',
    {
      method: 'GET',
      url: '/orders',
      path: '/orders',
      statusCode: 200,
      duration: 5,
      memory: 1,
      ip: '10.0.0.1',
      hostname: 'api.local',
      controllerAction: 'OrdersController#index',
    },
  ],
  [
    'request',
    {
      method: 'POST',
      url: '/payments',
      path: '/payments',
      statusCode: 500,
      duration: 900,
      memory: 1,
      ip: '10.0.0.2',
      hostname: 'billing.local',
      controllerAction: 'PaymentsController#store',
    },
  ],
  ['log', { level: 'error', context: 'AppService', message: 'boom' }],
  ['log', { level: 'debug', context: 'OtherService', message: 'meh' }],
  ['query', { query: 'SELECT 1', duration: 900, source: 'typeorm', type: 'SELECT', slow: true }],
  ['query', { query: 'INSERT x', duration: 2, source: 'prisma', type: 'INSERT', slow: false }],
  ['job', { name: 'mail', status: 'completed', queue: 'default' }],
  ['job', { name: 'sms', status: 'failed', queue: 'urgent' }],
  ['cache', { operation: 'get', key: 'orders', hit: true }],
  ['cache', { operation: 'set', key: 'payments', hit: false }],
  ['exception', { name: 'TypeError', message: 'x' }],
  ['exception', { name: 'RangeError', message: 'y' }],
];

/** Each case must match exactly one of the two entries of its type. */
const CASES: Array<[string, EntryType, Filters]> = [
  ['methods', 'request', { methods: ['GET'] }],
  ['statuses', 'request', { statuses: [200] }],
  ['paths', 'request', { paths: ['/orders'] }],
  ['ips', 'request', { ips: ['10.0.0.1'] }],
  ['hostnames', 'request', { hostnames: ['api.local'] }],
  ['controllers', 'request', { controllers: ['OrdersController#index'] }],
  ['search', 'request', { search: 'payments' }],
  ['levels', 'log', { levels: ['error'] }],
  ['contexts', 'log', { contexts: ['AppService'] }],
  ['queryTypes', 'query', { queryTypes: ['SELECT'] }],
  ['sources', 'query', { sources: ['typeorm'] }],
  ['slow', 'query', { slow: true }],
  ['jobStatuses', 'job', { jobStatuses: ['completed'] }],
  ['queues', 'job', { queues: ['default'] }],
  ['cacheOperations', 'cache', { cacheOperations: ['get'] }],
  ['names', 'exception', { names: ['TypeError'] }],
];

class RedisStorageWithFake extends RedisStorage {
  async useFakeClient(): Promise<void> {
    const client = new RedisMock();
    await client.flushall();
    (this as unknown as { client: unknown }).client = client;
  }
}

async function answersFrom(storage: StorageInterface): Promise<Record<string, number>> {
  for (const [type, payload] of SEED) {
    await storage.save(entry(type, payload));
  }

  const answers: Record<string, number> = {};
  for (const [label, type, filters] of CASES) {
    const page = await storage.findWithCursor(type, { limit: 50, filters });
    answers[label] = page.data.length;
  }

  return answers;
}

describe('filters answer the same way on every backend', () => {
  let memory: Record<string, number>;
  let sqlite: Record<string, number>;
  let redis: Record<string, number>;

  beforeAll(async () => {
    // Arrange
    const memoryStorage = new MemoryStorage({});
    memory = await answersFrom(memoryStorage as unknown as StorageInterface);

    const sqliteStorage = new SqliteStorage(':memory:');
    await (sqliteStorage as unknown as { onModuleInit: () => Promise<void> }).onModuleInit();
    sqlite = await answersFrom(sqliteStorage as unknown as StorageInterface);

    const redisStorage = new RedisStorageWithFake({ keyPrefix: 'parity-test:' });
    await redisStorage.useFakeClient();
    redis = await answersFrom(redisStorage as unknown as StorageInterface);
  }, 30_000);

  /**
   * Guards the guard: filters that match everything, or nothing, would agree
   * across backends while proving nothing about whether they ran.
   */
  it.each(CASES.map(([label]) => label))('%s narrows the list at all', (label) => {
    expect(memory[label]).toBe(1);
  });

  it.each(CASES.map(([label]) => label))('%s agrees between memory and redis', (label) => {
    expect({ [label]: redis[label] }).toEqual({ [label]: memory[label] });
  });

  it.each(CASES.map(([label]) => label))('%s agrees between memory and sqlite', (label) => {
    expect({ [label]: sqlite[label] }).toEqual({ [label]: memory[label] });
  });
});
