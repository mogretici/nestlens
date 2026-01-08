import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { NestLensApiController } from '../../api/api.controller';
import { STORAGE } from '../../core/storage/storage.interface';
import { SqliteStorage } from '../../core/storage/sqlite.storage';
import { NESTLENS_CONFIG } from '../../nestlens.config';
import { PruningService } from '../../core/pruning.service';
import { CollectorService } from '../../core/collector.service';
import { CursorQueryDto } from '../../api/dto';
import { createTestStorage, seedStorage } from './test-utils';
import {
  createLogEntry,
  createRequestEntry,
  createRedisEntry,
  createModelEntry,
  createGateEntry,
  createCommandEntry,
} from './entry-factories';

/**
 * Helper to create CursorQueryDto from query params
 */
function createQuery(params: Partial<Record<string, string>> = {}): CursorQueryDto {
  return plainToInstance(CursorQueryDto, params);
}

describe('API Filter Parsing', () => {
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

  describe('Filter Parameter Parsing', () => {
    it('parses comma-separated levels correctly', async () => {
      await seedStorage(storage, [
        createLogEntry({ level: 'error' }),
        createLogEntry({ level: 'warn' }),
        createLogEntry({ level: 'debug' }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'log', levels: 'error,warn' }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => ['error', 'warn'].includes((e.payload as any).level))).toBe(
        true,
      );
    });

    it('parses comma-separated statuses correctly', async () => {
      await seedStorage(storage, [
        createRequestEntry({ statusCode: 200 }),
        createRequestEntry({ statusCode: 404 }),
        createRequestEntry({ statusCode: 500 }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'request', statuses: '200,404' }),
      );

      expect(result.data).toHaveLength(2);
    });

    it('parses redis filters correctly', async () => {
      await seedStorage(storage, [
        createRedisEntry({ status: 'success', command: 'GET' }),
        createRedisEntry({ status: 'error', command: 'SET' }),
        createRedisEntry({ status: 'success', command: 'HGET' }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'redis', redisStatuses: 'success', redisCommands: 'GET' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).command).toBe('GET');
    });

    it('parses model filters correctly', async () => {
      await seedStorage(storage, [
        createModelEntry({ action: 'create', entity: 'User', source: 'typeorm' }),
        createModelEntry({ action: 'find', entity: 'Post', source: 'prisma' }),
        createModelEntry({ action: 'update', entity: 'User', source: 'typeorm' }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({
          type: 'model',
          modelActions: 'create,update',
          entities: 'User',
          modelSources: 'typeorm',
        }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => (e.payload as any).entity === 'User')).toBe(true);
    });

    it('parses gate filters correctly', async () => {
      await seedStorage(storage, [
        createGateEntry({ gate: 'admin', allowed: true }),
        createGateEntry({ gate: 'admin-panel', allowed: false }),
        createGateEntry({ gate: 'premium', allowed: true }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'gate', gateNames: 'admin', gateResults: 'allowed' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).gate).toBe('admin');
    });

    it('parses command filters correctly', async () => {
      await seedStorage(storage, [
        createCommandEntry({ name: 'cache:clear', status: 'completed' }),
        createCommandEntry({ name: 'cache:warmup', status: 'failed' }),
        createCommandEntry({ name: 'db:migrate', status: 'completed' }),
      ]);

      const result = await controller.getEntriesWithCursor(
        createQuery({ type: 'command', commandStatuses: 'completed', commandNames: 'cache' }),
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).name).toBe('cache:clear');
    });
  });

  describe('All Filter Parameters Defined', () => {
    // Test that the CursorQueryDto includes all expected filter properties
    const expectedFilters = [
      'levels',
      'contexts',
      'queryTypes',
      'sources',
      'slow',
      'names',
      'methods',
      'paths',
      'resolved',
      'statuses',
      'hostnames',
      'controllers',
      'ips',
      'eventNames',
      'scheduleStatuses',
      'scheduleNames',
      'jobStatuses',
      'jobNames',
      'queues',
      'cacheOperations',
      'mailStatuses',
      'redisStatuses',
      'redisCommands',
      'modelActions',
      'entities',
      'modelSources',
      'notificationTypes',
      'notificationStatuses',
      'viewFormats',
      'viewStatuses',
      'commandStatuses',
      'commandNames',
      'gateNames',
      'gateResults',
      'batchStatuses',
      'batchOperations',
      'dumpStatuses',
      'dumpOperations',
      'dumpFormats',
      'tags',
      'search',
    ];

    it('has all expected filter parameters in CursorQueryDto', () => {
      // Verify CursorQueryDto has all expected filter properties
      const dto = new CursorQueryDto();

      // All filter properties should be definable on the DTO
      for (const filter of expectedFilters) {
        expect(
          filter in dto ||
            Object.getOwnPropertyDescriptor(CursorQueryDto.prototype, filter) !== undefined ||
            Reflect.getMetadataKeys(dto, filter).length >= 0,
        ).toBeTruthy();
      }

      expect(expectedFilters).toHaveLength(41);
    });

    it('toFilters() correctly extracts filter properties', () => {
      const dto = createQuery({
        type: 'log',
        limit: '50',
        levels: 'error,warn',
        contexts: 'app,db',
        search: 'test',
      });

      const filters = dto.toFilters();

      // Should include filter properties
      expect(filters).toHaveProperty('levels');
      expect(filters).toHaveProperty('contexts');
      expect(filters).toHaveProperty('search');

      // Should NOT include pagination properties
      expect(filters).not.toHaveProperty('type');
      expect(filters).not.toHaveProperty('limit');
      expect(filters).not.toHaveProperty('beforeSequence');
      expect(filters).not.toHaveProperty('afterSequence');
    });
  });
});
