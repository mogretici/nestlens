/**
 * ModelWatcher Tests
 *
 * Tests for the model watcher that monitors ORM operations.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { ModelWatcher, NESTLENS_MODEL_SUBSCRIBER } from '../../watchers/model.watcher';

describe('ModelWatcher', () => {
  let watcher: ModelWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createEntitySubscriber = (overrides: Partial<{
    afterLoad: jest.Mock;
    beforeInsert: jest.Mock;
    afterInsert: jest.Mock;
    beforeUpdate: jest.Mock;
    afterUpdate: jest.Mock;
    beforeRemove: jest.Mock;
    afterRemove: jest.Mock;
  }> = {}) => ({
    afterLoad: jest.fn(),
    beforeInsert: jest.fn(),
    afterInsert: jest.fn(),
    beforeUpdate: jest.fn(),
    afterUpdate: jest.fn(),
    beforeRemove: jest.fn(),
    afterRemove: jest.fn(),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    subscriber?: ReturnType<typeof createEntitySubscriber>,
  ): Promise<ModelWatcher> => {
    const providers: any[] = [
      ModelWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (subscriber !== undefined) {
      providers.push({ provide: NESTLENS_MODEL_SUBSCRIBER, useValue: subscriber });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<ModelWatcher>(ModelWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        model: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when model watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { model: true };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when model watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { model: false };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);

      // Assert
      expect((watcher as any).config.captureData).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing entity subscriber gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when subscriber is available', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof subscriber.afterLoad).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { model: false };
      const subscriber = createEntitySubscriber();
      const originalAfterLoad = subscriber.afterLoad;
      watcher = await createWatcher(mockConfig, subscriber);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(subscriber.afterLoad).toBe(originalAfterLoad);
    });
  });

  // ============================================================================
  // TypeORM - AfterLoad
  // ============================================================================

  describe('TypeORM - AfterLoad', () => {
    it('should collect find operation', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.afterLoad({}, { metadata: { name: 'User' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'find',
          entity: 'User',
          source: 'typeorm',
          recordCount: 1,
        }),
      );
    });

    it('should use unknown for missing entity name', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.afterLoad({}, {});

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          entity: 'unknown',
        }),
      );
    });

    it('should skip ignored entities', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, ignoreEntities: ['Session'] } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.afterLoad({}, { metadata: { name: 'Session' } });

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // TypeORM - Insert Operations
  // ============================================================================

  describe('TypeORM - Insert Operations', () => {
    it('should collect create operation', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'Post' } });
      subscriber.afterInsert({ metadata: { name: 'Post' }, entity: { id: 1, title: 'Test' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'create',
          entity: 'Post',
          source: 'typeorm',
          recordCount: 1,
        }),
      );
    });

    it('should capture data when enabled', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'Comment' } });
      subscriber.afterInsert({ metadata: { name: 'Comment' }, entity: { id: 1, text: 'Hello' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: { id: 1, text: 'Hello' },
        }),
      );
    });

    it('should calculate insert duration', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'User' } });
      // Simulate some delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      subscriber.afterInsert({ metadata: { name: 'User' }, entity: {} });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });

    it('should skip ignored entities on insert', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, ignoreEntities: ['Log'] } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'Log' } });
      subscriber.afterInsert({ metadata: { name: 'Log' }, entity: {} });

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // TypeORM - Update Operations
  // ============================================================================

  describe('TypeORM - Update Operations', () => {
    it('should collect update operation', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeUpdate({ metadata: { name: 'Article' } });
      subscriber.afterUpdate({ metadata: { name: 'Article' }, entity: { id: 1, title: 'Updated' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'update',
          entity: 'Article',
          source: 'typeorm',
        }),
      );
    });
  });

  // ============================================================================
  // TypeORM - Remove Operations
  // ============================================================================

  describe('TypeORM - Remove Operations', () => {
    it('should collect delete operation', async () => {
      // Arrange
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeRemove({ metadata: { name: 'Comment' } });
      subscriber.afterRemove({ metadata: { name: 'Comment' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'delete',
          entity: 'Comment',
          source: 'typeorm',
        }),
      );
    });
  });

  // ============================================================================
  // Prisma Client Setup
  // ============================================================================

  describe('Prisma Client Setup', () => {
    it('should setup Prisma middleware', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      const prismaClient = {
        $use: jest.fn(),
      };

      // Act
      watcher.setupPrismaClient(prismaClient);

      // Assert
      expect(prismaClient.$use).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle invalid Prisma client', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.setupPrismaClient(null)).not.toThrow();
      expect(() => watcher.setupPrismaClient({})).not.toThrow();
    });

    it('should collect Prisma find operations', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const params = { model: 'User', action: 'findMany', args: { where: { active: true } } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'find',
          entity: 'User',
          source: 'prisma',
          recordCount: 2,
        }),
      );
    });

    it('should collect Prisma create operations', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({ id: 1, name: 'New' });
      const params = { model: 'Post', action: 'create', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'create',
          entity: 'Post',
          source: 'prisma',
        }),
      );
    });

    it('should collect Prisma update operations', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({ id: 1 });
      const params = { model: 'Comment', action: 'update', args: { where: { id: 1 } } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'update',
          entity: 'Comment',
        }),
      );
    });

    it('should collect Prisma delete operations', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({ id: 1 });
      const params = { model: 'Session', action: 'delete', args: { where: { id: 1 } } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'delete',
          entity: 'Session',
        }),
      );
    });

    it('should collect Prisma upsert as save', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({ id: 1 });
      const params = { model: 'Profile', action: 'upsert', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'save',
        }),
      );
    });

    it('should skip ignored entities in Prisma', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, ignoreEntities: ['Log'] } };
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue([]);
      const params = { model: 'Log', action: 'findMany', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should return original Prisma result', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const expectedResult = { id: 1, name: 'Test' };
      const next = jest.fn().mockResolvedValue(expectedResult);
      const params = { model: 'User', action: 'findUnique', args: {} };

      // Act
      const result = await middleware!(params, next);

      // Assert
      expect(result).toEqual(expectedResult);
    });

    it('should handle Prisma errors', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockRejectedValue(new Error('Prisma error'));
      const params = { model: 'User', action: 'create', args: {} };

      // Act & Assert
      await expect(middleware!(params, next)).rejects.toThrow('Prisma error');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          error: 'Prisma error',
        }),
      );
    });
  });

  // ============================================================================
  // Sensitive Data Masking
  // ============================================================================

  describe('Sensitive Data Masking', () => {
    it('should mask password field', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'User' } });
      subscriber.afterInsert({
        metadata: { name: 'User' },
        entity: { id: 1, email: 'test@example.com', password: 'secret123' },
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            password: '***MASKED***',
          }),
        }),
      );
    });

    it('should mask token field', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'Session' } });
      subscriber.afterInsert({
        metadata: { name: 'Session' },
        entity: { id: 1, token: 'abc123', userId: 1 },
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: expect.objectContaining({
            token: '***MASKED***',
            userId: 1,
          }),
        }),
      );
    });

    it('should mask apiKey field', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'ApiCredential' } });
      subscriber.afterInsert({
        metadata: { name: 'ApiCredential' },
        entity: { id: 1, apiKey: 'key-123', name: 'My API' },
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: expect.objectContaining({
            apiKey: '***MASKED***',
            name: 'My API',
          }),
        }),
      );
    });

    it('should mask nested sensitive fields', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      const subscriber = createEntitySubscriber();
      watcher = await createWatcher(mockConfig, subscriber);
      watcher.onModuleInit();

      // Act
      subscriber.beforeInsert({ metadata: { name: 'Config' } });
      subscriber.afterInsert({
        metadata: { name: 'Config' },
        entity: { id: 1, settings: { secret: 'hidden', visible: 'shown' } },
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: expect.objectContaining({
            settings: expect.objectContaining({
              secret: '***MASKED***',
              visible: 'shown',
            }),
          }),
        }),
      );
    });

    it('should mask sensitive fields in arrays', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue([
        { id: 1, email: 'a@example.com', password: 'pass1' },
        { id: 2, email: 'b@example.com', password: 'pass2' },
      ]);
      const params = { model: 'User', action: 'findMany', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          data: [
            { id: 1, email: 'a@example.com', password: '***MASKED***' },
            { id: 2, email: 'b@example.com', password: '***MASKED***' },
          ],
        }),
      );
    });
  });

  // ============================================================================
  // Where Condition Capture
  // ============================================================================

  describe('Where Condition Capture', () => {
    it('should capture where condition', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({ id: 1 });
      const params = { model: 'User', action: 'findUnique', args: { where: { id: 1 } } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          where: { id: 1 },
        }),
      );
    });

    it('should truncate large where condition', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue([]);
      const largeWhere = { ids: Array(1000).fill(0).map((_, i) => i) };
      const params = { model: 'User', action: 'findMany', args: { where: largeWhere } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          where: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable where condition', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue([]);
      const circularWhere: any = {};
      circularWhere.self = circularWhere;
      const params = { model: 'User', action: 'findMany', args: { where: circularWhere } };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          where: { _error: 'Unable to serialize where condition' },
        }),
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle null entity', async () => {
      // Arrange
      mockConfig.watchers = { model: { enabled: true, captureData: true } };
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue(null);
      const params = { model: 'User', action: 'findUnique', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          recordCount: 0,
        }),
      );
    });

    it('should handle missing model name', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({});
      const params = { action: 'findUnique', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          entity: 'unknown',
        }),
      );
    });

    it('should handle unknown Prisma action', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      let middleware: Function;
      const prismaClient = {
        $use: jest.fn((fn) => { middleware = fn; }),
      };
      watcher.setupPrismaClient(prismaClient);

      const next = jest.fn().mockResolvedValue({});
      const params = { model: 'User', action: 'unknownAction', args: {} };

      // Act
      await middleware!(params, next);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'model',
        expect.objectContaining({
          action: 'find', // defaults to find
        }),
      );
    });

    it('should not call original callback if missing for afterInsert', async () => {
      // Arrange - use partial subscriber to test missing methods
      const subscriber = {
        afterLoad: jest.fn(),
        beforeInsert: jest.fn(),
        beforeUpdate: jest.fn(),
        afterUpdate: jest.fn(),
        beforeRemove: jest.fn(),
        afterRemove: jest.fn(),
      } as any;
      watcher = await createWatcher(mockConfig, subscriber);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });
});
