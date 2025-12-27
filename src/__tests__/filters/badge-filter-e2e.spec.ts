import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { NestLensApiController } from '../../api/api.controller';
import { STORAGE } from '../../core/storage/storage.interface';
import { SqliteStorage } from '../../core/storage/sqlite.storage';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { NESTLENS_CONFIG } from '../../nestlens.config';
import { PruningService } from '../../core/pruning.service';
import { CollectorService } from '../../core/collector.service';
import { CursorQueryDto } from '../../api/dto';
import { createTestStorage, seedStorage } from './test-utils';
import {
  createCacheEntry,
  createRequestEntry,
  createLogEntry,
  createJobEntry,
  createGateEntry,
  createHttpClientEntry,
  createQueryEntry,
} from './entry-factories';

/**
 * End-to-End Badge Filter Tests
 *
 * These tests verify the complete flow from badge click to filtered results:
 * 1. Entry is saved with tags (via storage.addTags)
 * 2. Frontend sends filter request (any case)
 * 3. Backend correctly filters and returns matching entries
 *
 * CRITICAL: All tag filtering must be CASE-INSENSITIVE
 * - Tags are stored as UPPERCASE
 * - Filters can be sent in any case (lowercase, UPPERCASE, MixedCase)
 * - Backend should normalize and match correctly
 *
 * This is the "most important test" as stated by the user:
 * "ben bi badge e tıkladığımda. doğru sorgu gidiyo mu? doğru filtreleme yapılıyo mu?
 *  listelenenler doğru mu? her badge kendi işini uçtan uca doğru şekilde yapıyo mu?"
 */

function createQuery(params: Partial<Record<string, string>> = {}): CursorQueryDto {
  return plainToInstance(CursorQueryDto, params);
}

describe('Badge Filter End-to-End Tests', () => {
  let controller: NestLensApiController;
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = createTestStorage();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NestLensApiController],
      providers: [
        { provide: STORAGE, useValue: storage },
        { provide: NESTLENS_CONFIG, useValue: { enabled: true, pruning: { interval: 60 } } },
        {
          provide: PruningService,
          useValue: { stop: jest.fn(), getStatus: jest.fn().mockReturnValue({ lastRun: null }) },
        },
        {
          provide: CollectorService,
          useValue: { getRecordingStatus: jest.fn().mockReturnValue({ isPaused: false }) },
        },
      ],
    }).compile();

    controller = module.get<NestLensApiController>(NestLensApiController);
  });

  afterEach(async () => {
    await storage.close();
  });

  // ==========================================================================
  // CACHE BADGE FILTERS (The original failing case)
  // ==========================================================================

  describe('Cache HIT/MISS Badge Filtering', () => {
    beforeEach(async () => {
      // Seed cache entries
      const entries = await seedStorage(storage, [
        createCacheEntry({ operation: 'get', key: 'user:1', hit: true, duration: 5 }),
        createCacheEntry({ operation: 'get', key: 'user:2', hit: false, duration: 10 }),
        createCacheEntry({ operation: 'get', key: 'user:3', hit: true, duration: 3 }),
        createCacheEntry({ operation: 'set', key: 'user:4', duration: 15 }),
      ]);

      // Add HIT/MISS tags like TagService.addCacheTags would
      await storage.addTags(entries[0].id!, ['GET', 'HIT']);
      await storage.addTags(entries[1].id!, ['GET', 'MISS']);
      await storage.addTags(entries[2].id!, ['GET', 'HIT']);
      await storage.addTags(entries[3].id!, ['SET']);
    });

    it('filters by HIT tag with lowercase "hit"', async () => {
      // This is what the frontend sends when clicking the HIT badge
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'hit' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).hit === true)).toBe(true);
    });

    it('filters by HIT tag with UPPERCASE "HIT"', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'HIT' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).hit === true)).toBe(true);
    });

    it('filters by MISS tag with lowercase "miss"', async () => {
      // This is what the frontend sends when clicking the MISS badge
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'miss' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).hit).toBe(false);
    });

    it('filters by MISS tag with UPPERCASE "MISS"', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'MISS' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).hit).toBe(false);
    });

    it('filters by GET operation tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'get' }),
      );

      expect(result.data).toHaveLength(3);
      expect(result.data.every((e) => (e.payload as any).operation === 'get')).toBe(true);
    });

    it('filters by SET operation tag with mixed case', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'Set' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).operation).toBe('set');
    });
  });

  // ==========================================================================
  // REQUEST BADGE FILTERS
  // ==========================================================================

  describe('Request Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createRequestEntry({ method: 'GET', statusCode: 200, duration: 100 }),
        createRequestEntry({ method: 'POST', statusCode: 201, duration: 150 }),
        createRequestEntry({ method: 'GET', statusCode: 404, duration: 50 }),
        createRequestEntry({ method: 'DELETE', statusCode: 500, duration: 200 }),
        createRequestEntry({ method: 'GET', statusCode: 200, duration: 1500 }), // slow
      ]);

      // Add tags like TagService.addRequestTags would
      await storage.addTags(entries[0].id!, ['GET', 'SUCCESS']);
      await storage.addTags(entries[1].id!, ['POST', 'SUCCESS']);
      await storage.addTags(entries[2].id!, ['GET', 'CLIENT-ERROR', '4XX']);
      await storage.addTags(entries[3].id!, ['DELETE', 'ERROR', '5XX']);
      await storage.addTags(entries[4].id!, ['GET', 'SUCCESS', 'SLOW']);
    });

    it('filters by SUCCESS tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', tags: 'success' }),
      );

      expect(result.data).toHaveLength(3);
      expect(result.data.every((e) => (e.payload as any).statusCode >= 200 && (e.payload as any).statusCode < 300)).toBe(true);
    });

    it('filters by ERROR tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', tags: 'error' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).statusCode).toBe(500);
    });

    it('filters by 5XX tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', tags: '5xx' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).statusCode).toBeGreaterThanOrEqual(500);
    });

    it('filters by SLOW tag with mixed case', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', tags: 'Slow' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).duration).toBeGreaterThan(1000);
    });

    it('filters by HTTP method tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', tags: 'get' }),
      );

      expect(result.data).toHaveLength(3);
      expect(result.data.every((e) => (e.payload as any).method === 'GET')).toBe(true);
    });
  });

  // ==========================================================================
  // LOG LEVEL BADGE FILTERS
  // ==========================================================================

  describe('Log Level Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createLogEntry({ level: 'error', message: 'Error 1', context: 'AuthService' }),
        createLogEntry({ level: 'warn', message: 'Warning 1', context: 'AuthService' }),
        createLogEntry({ level: 'log', message: 'Info 1', context: 'UserService' }),
        createLogEntry({ level: 'debug', message: 'Debug 1', context: 'UserService' }),
      ]);

      // Add tags like TagService.addLogTags would
      await storage.addTags(entries[0].id!, ['ERROR', 'AUTHSERVICE']);
      await storage.addTags(entries[1].id!, ['WARN', 'WARNING', 'AUTHSERVICE']);
      await storage.addTags(entries[2].id!, ['LOG', 'USERSERVICE']);
      await storage.addTags(entries[3].id!, ['DEBUG', 'USERSERVICE']);
    });

    it('filters by ERROR tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'log', tags: 'error' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).level).toBe('error');
    });

    it('filters by WARNING tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'log', tags: 'warning' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).level).toBe('warn');
    });

    it('filters by context tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'log', tags: 'authservice' }),
      );

      expect(result.data).toHaveLength(2);
    });
  });

  // ==========================================================================
  // JOB STATUS BADGE FILTERS
  // ==========================================================================

  describe('Job Status Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createJobEntry({ name: 'send-email', status: 'completed', queue: 'default' }),
        createJobEntry({ name: 'process-payment', status: 'failed', queue: 'payments' }),
        createJobEntry({ name: 'notify-user', status: 'active', queue: 'notifications' }),
      ]);

      // Add tags like TagService.addJobTags would
      await storage.addTags(entries[0].id!, ['COMPLETED', 'DEFAULT']);
      await storage.addTags(entries[1].id!, ['FAILED', 'ERROR', 'PAYMENTS']);
      await storage.addTags(entries[2].id!, ['ACTIVE', 'NOTIFICATIONS']);
    });

    it('filters by COMPLETED tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'job', tags: 'completed' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).status).toBe('completed');
    });

    it('filters by FAILED tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'job', tags: 'failed' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).status).toBe('failed');
    });

    it('filters by queue tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'job', tags: 'payments' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).queue).toBe('payments');
    });
  });

  // ==========================================================================
  // GATE BADGE FILTERS
  // ==========================================================================

  describe('Gate Result Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createGateEntry({ gate: 'admin', allowed: true }),
        createGateEntry({ gate: 'admin-panel', allowed: false }),
        createGateEntry({ gate: 'premium', allowed: true }),
      ]);

      // Add tags like TagService.addGateTags would
      await storage.addTags(entries[0].id!, ['ALLOWED', 'ADMIN']);
      await storage.addTags(entries[1].id!, ['DENIED', 'ADMIN-PANEL']);
      await storage.addTags(entries[2].id!, ['ALLOWED', 'PREMIUM']);
    });

    it('filters by ALLOWED tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'gate', tags: 'allowed' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).allowed === true)).toBe(true);
    });

    it('filters by DENIED tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'gate', tags: 'denied' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).allowed).toBe(false);
    });
  });

  // ==========================================================================
  // HTTP CLIENT BADGE FILTERS
  // ==========================================================================

  describe('HTTP Client Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createHttpClientEntry({ method: 'GET', statusCode: 200, hostname: 'api.example.com' }),
        createHttpClientEntry({ method: 'POST', statusCode: 500, hostname: 'api.stripe.com' }),
        createHttpClientEntry({ method: 'GET', statusCode: 404, hostname: 'api.example.com' }),
      ]);

      // Add tags like TagService.addHttpClientTags would
      await storage.addTags(entries[0].id!, ['GET', 'SUCCESS', 'API.EXAMPLE.COM']);
      await storage.addTags(entries[1].id!, ['POST', 'ERROR', '5XX', 'API.STRIPE.COM']);
      await storage.addTags(entries[2].id!, ['GET', 'CLIENT-ERROR', '4XX', 'API.EXAMPLE.COM']);
    });

    it('filters by SUCCESS tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'http-client', tags: 'success' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).statusCode).toBe(200);
    });

    it('filters by hostname tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'http-client', tags: 'api.example.com' }),
      );

      expect(result.data).toHaveLength(2);
    });
  });

  // ==========================================================================
  // QUERY BADGE FILTERS
  // ==========================================================================

  describe('Query Badge Filtering', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createQueryEntry({ query: 'SELECT * FROM users', slow: false, source: 'typeorm' }),
        createQueryEntry({ query: 'INSERT INTO orders VALUES (...)', slow: false, source: 'prisma' }),
        createQueryEntry({ query: 'SELECT * FROM products', slow: true, source: 'typeorm' }),
      ]);

      // Add tags like TagService.addQueryTags would
      await storage.addTags(entries[0].id!, ['SELECT', 'TYPEORM']);
      await storage.addTags(entries[1].id!, ['INSERT', 'PRISMA']);
      await storage.addTags(entries[2].id!, ['SELECT', 'TYPEORM', 'SLOW']);
    });

    it('filters by SELECT tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'query', tags: 'select' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).query.toLowerCase().startsWith('select'))).toBe(true);
    });

    it('filters by SLOW tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'query', tags: 'slow' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).slow).toBe(true);
    });

    it('filters by ORM source tag with lowercase', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'query', tags: 'typeorm' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).source === 'typeorm')).toBe(true);
    });
  });

  // ==========================================================================
  // MULTIPLE TAGS FILTER (OR LOGIC)
  // ==========================================================================

  describe('Multiple Tags Filter (OR logic)', () => {
    beforeEach(async () => {
      const entries = await seedStorage(storage, [
        createCacheEntry({ operation: 'get', hit: true }),
        createCacheEntry({ operation: 'get', hit: false }),
        createCacheEntry({ operation: 'set' }),
      ]);

      await storage.addTags(entries[0].id!, ['GET', 'HIT']);
      await storage.addTags(entries[1].id!, ['GET', 'MISS']);
      await storage.addTags(entries[2].id!, ['SET']);
    });

    it('filters by multiple tags with lowercase (OR logic)', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'hit,miss' }),
      );

      expect(result.data).toHaveLength(2);
    });

    it('filters by mixed case tags (OR logic)', async () => {
      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'cache', tags: 'Hit,MISS,set' }),
      );

      expect(result.data).toHaveLength(3);
    });
  });

  // ==========================================================================
  // MEMORY STORAGE TAG CASE-INSENSITIVITY
  // ==========================================================================

  describe('Memory Storage Tag Case-Insensitivity', () => {
    let memoryStorage: MemoryStorage;

    beforeEach(async () => {
      memoryStorage = new MemoryStorage({ maxEntries: 100 });
      await memoryStorage.initialize();
    });

    afterEach(async () => {
      await memoryStorage.close();
    });

    it('normalizes tags to uppercase on save', async () => {
      const entry = await memoryStorage.save(createCacheEntry({ operation: 'get', hit: true }));
      await memoryStorage.addTags(entry.id!, ['hit', 'get']); // lowercase input

      const tags = await memoryStorage.getEntryTags(entry.id!);
      expect(tags).toContain('HIT'); // stored as uppercase
      expect(tags).toContain('GET');
    });

    it('matches tags case-insensitively in findByTags', async () => {
      const entry = await memoryStorage.save(createCacheEntry({ operation: 'get', hit: true }));
      await memoryStorage.addTags(entry.id!, ['HIT']); // uppercase

      const found = await memoryStorage.findByTags(['hit'], 'OR'); // lowercase search
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(entry.id);
    });

    it('matches tags case-insensitively in findWithCursor', async () => {
      const entry = await memoryStorage.save(createCacheEntry({ operation: 'get', hit: true }));
      await memoryStorage.addTags(entry.id!, ['HIT']); // uppercase

      const result = await memoryStorage.findWithCursor('cache', {
        filters: { tags: ['hit'] }, // lowercase search
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(entry.id);
    });

    it('removes tags case-insensitively', async () => {
      const entry = await memoryStorage.save(createCacheEntry({ operation: 'get', hit: true }));
      await memoryStorage.addTags(entry.id!, ['HIT', 'GET']); // uppercase

      await memoryStorage.removeTags(entry.id!, ['hit']); // lowercase remove

      const tags = await memoryStorage.getEntryTags(entry.id!);
      expect(tags).not.toContain('HIT');
      expect(tags).toContain('GET');
    });
  });

  // ==========================================================================
  // SQLITE STORAGE TAG CASE-INSENSITIVITY
  // ==========================================================================

  describe('SQLite Storage Tag Case-Insensitivity', () => {
    it('normalizes tags to uppercase on save', async () => {
      const entry = await storage.save(createCacheEntry({ operation: 'get', hit: true }));
      await storage.addTags(entry.id!, ['hit', 'get']); // lowercase input

      const tags = await storage.getEntryTags(entry.id!);
      expect(tags).toContain('HIT'); // stored as uppercase
      expect(tags).toContain('GET');
    });

    it('matches tags case-insensitively in findByTags', async () => {
      const entry = await storage.save(createCacheEntry({ operation: 'get', hit: true }));
      await storage.addTags(entry.id!, ['HIT']); // uppercase

      const found = await storage.findByTags(['hit'], 'OR'); // lowercase search
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(entry.id);
    });

    it('matches tags case-insensitively in findWithCursor', async () => {
      const entry = await storage.save(createCacheEntry({ operation: 'get', hit: true }));
      await storage.addTags(entry.id!, ['HIT']); // uppercase

      const result = await storage.findWithCursor('cache', {
        filters: { tags: ['hit'] }, // lowercase search
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(entry.id);
    });

    it('removes tags case-insensitively', async () => {
      const entry = await storage.save(createCacheEntry({ operation: 'get', hit: true }));
      await storage.addTags(entry.id!, ['HIT', 'GET']); // uppercase

      await storage.removeTags(entry.id!, ['hit']); // lowercase remove

      const tags = await storage.getEntryTags(entry.id!);
      expect(tags).not.toContain('HIT');
      expect(tags).toContain('GET');
    });

    it('handles mixed case tags in AND logic', async () => {
      const entry1 = await storage.save(createCacheEntry({ operation: 'get', hit: true }));
      const entry2 = await storage.save(createCacheEntry({ operation: 'get', hit: false }));

      await storage.addTags(entry1.id!, ['GET', 'HIT']);
      await storage.addTags(entry2.id!, ['GET', 'MISS']);

      const found = await storage.findByTags(['get', 'hit'], 'AND'); // lowercase search
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(entry1.id);
    });
  });
});
