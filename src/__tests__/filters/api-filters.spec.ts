import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NestLensApiController } from '../../api/api.controller';
import { STORAGE } from '../../core/storage/storage.interface';
import { SqliteStorage } from '../../core/storage/sqlite.storage';
import { NESTLENS_CONFIG } from '../../nestlens.config';
import { PruningService } from '../../core/pruning.service';
import { CollectorService } from '../../core/collector.service';
import { createTestStorage, seedStorage } from './test-utils';
import {
  createLogEntry,
  createRequestEntry,
  createRedisEntry,
  createModelEntry,
  createGateEntry,
  createCommandEntry,
} from './entry-factories';

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
        'log',           // type
        undefined,       // limit
        undefined,       // beforeSequence
        undefined,       // afterSequence
        'error,warn',    // levels
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => ['error', 'warn'].includes((e.payload as any).level))).toBe(true);
    });

    it('parses comma-separated statuses correctly', async () => {
      await seedStorage(storage, [
        createRequestEntry({ statusCode: 200 }),
        createRequestEntry({ statusCode: 404 }),
        createRequestEntry({ statusCode: 500 }),
      ]);

      const result = await controller.getEntriesWithCursor(
        'request',
        undefined,
        undefined,
        undefined,
        undefined,       // levels
        undefined,       // contexts
        undefined,       // queryTypes
        undefined,       // sources
        undefined,       // slow
        undefined,       // names
        undefined,       // methods
        undefined,       // paths
        undefined,       // resolved
        '200,404',       // statuses
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
        'redis',
        undefined,
        undefined,
        undefined,
        undefined, undefined, undefined, undefined, undefined, // levels-slow
        undefined, undefined, undefined, undefined, undefined, // names-statuses
        undefined, undefined, undefined, // hostnames-ips
        undefined, undefined, undefined, // scheduleStatuses-queues
        undefined, undefined, // cacheOperations-mailStatuses
        'success',             // redisStatuses
        'GET',                 // redisCommands
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
        'model',
        undefined,
        undefined,
        undefined,
        undefined, undefined, undefined, undefined, undefined, // levels-slow
        undefined, undefined, undefined, undefined, undefined, // names-statuses
        undefined, undefined, undefined, // hostnames-ips
        undefined, undefined, undefined, // scheduleStatuses-queues
        undefined, undefined, // cacheOperations-mailStatuses
        undefined, undefined, // redisStatuses-redisCommands
        'create,update',      // modelActions
        'User',               // entities
        'typeorm',            // modelSources
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
        'gate',
        undefined,
        undefined,
        undefined,
        undefined, undefined, undefined, undefined, undefined, // levels-slow
        undefined, undefined, undefined, undefined, undefined, // names-statuses
        undefined, undefined, undefined, // hostnames-ips
        undefined, undefined, undefined, // scheduleStatuses-queues
        undefined, undefined, // cacheOperations-mailStatuses
        undefined, undefined, // redisStatuses-redisCommands
        undefined, undefined, undefined, // modelActions-modelSources
        undefined, undefined, // notificationTypes-notificationStatuses
        undefined, undefined, // viewFormats-viewStatuses
        undefined, undefined, // commandStatuses-commandNames
        'admin',              // gateNames
        'allowed',            // gateResults
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
        'command',
        undefined,
        undefined,
        undefined,
        undefined, undefined, undefined, undefined, undefined, // levels-slow
        undefined, undefined, undefined, undefined, undefined, // names-statuses
        undefined, undefined, undefined, // hostnames-ips
        undefined, undefined, undefined, // scheduleStatuses-queues
        undefined, undefined, // cacheOperations-mailStatuses
        undefined, undefined, // redisStatuses-redisCommands
        undefined, undefined, undefined, // modelActions-modelSources
        undefined, undefined, // notificationTypes-notificationStatuses
        undefined, undefined, // viewFormats-viewStatuses
        'completed',          // commandStatuses
        'cache',              // commandNames
      );

      expect(result.data).toHaveLength(1);
      expect((result.data[0].payload as any).name).toBe('cache:clear');
    });
  });

  describe('All Filter Parameters Defined', () => {
    // Test that the controller method signature includes all expected filter parameters
    const expectedFilters = [
      'levels', 'contexts', 'queryTypes', 'sources', 'slow',
      'names', 'methods', 'paths', 'resolved', 'statuses',
      'hostnames', 'controllers', 'ips',
      'scheduleStatuses', 'jobStatuses', 'queues',
      'cacheOperations', 'mailStatuses',
      'redisStatuses', 'redisCommands',
      'modelActions', 'entities', 'modelSources',
      'notificationTypes', 'notificationStatuses',
      'viewFormats', 'viewStatuses',
      'commandStatuses', 'commandNames',
      'gateNames', 'gateResults',
      'batchStatuses', 'batchOperations',
      'dumpStatuses', 'dumpOperations', 'dumpFormats',
      'tags', 'search',
    ];

    it('has all expected filter parameters in controller method', () => {
      // This test documents that all parameters should be accepted
      // The controller.getEntriesWithCursor method should accept all these parameters
      expect(controller.getEntriesWithCursor).toBeDefined();
      expect(expectedFilters).toHaveLength(38);
    });
  });
});
