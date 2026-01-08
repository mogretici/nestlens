/**
 * GateWatcher Tests
 *
 * Tests for the gate watcher that monitors authorization checks.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { GateWatcher, NESTLENS_GATE_SERVICE } from '../../watchers/gate.watcher';

describe('GateWatcher', () => {
  let watcher: GateWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createGateService = (
    overrides: Partial<{
      check: jest.Mock;
      allows: jest.Mock;
      denies: jest.Mock;
      authorize: jest.Mock;
      can: jest.Mock;
    }> = {},
  ) => ({
    check: jest.fn().mockResolvedValue(true),
    allows: jest.fn().mockResolvedValue(true),
    denies: jest.fn().mockResolvedValue(false),
    authorize: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    gateService?: ReturnType<typeof createGateService>,
  ): Promise<GateWatcher> => {
    const providers: any[] = [
      GateWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (gateService !== undefined) {
      providers.push({ provide: NESTLENS_GATE_SERVICE, useValue: gateService });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<GateWatcher>(GateWatcher);
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
        gate: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when gate watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { gate: true };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when gate watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { gate: false };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { gate: { enabled: true, captureContext: false } };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.captureContext).toBe(false);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing gate service gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when service is available', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof service.check).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { gate: false };
      const service = createGateService();
      const originalCheck = service.check;
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(service.check).toBe(originalCheck);
    });
  });

  // ============================================================================
  // Authorization Check - Allowed
  // ============================================================================

  describe('Authorization Check - Allowed', () => {
    it('should collect allowed authorization check', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockResolvedValue(true),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('PostPolicy', 'edit', { id: 1 });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'PostPolicy',
          action: 'edit',
          allowed: true,
        }),
      );
    });

    it('should calculate check duration', async () => {
      // Arrange
      const service = createGateService({
        check: jest
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 50))),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('SlowPolicy', 'check');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockResolvedValue(true),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      const result = await service.check('Policy', 'action');

      // Assert
      expect(result).toBe(true);
    });

    it('should use default action when not provided', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('OnlyGate');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          action: 'check',
        }),
      );
    });
  });

  // ============================================================================
  // Authorization Check - Denied
  // ============================================================================

  describe('Authorization Check - Denied', () => {
    it('should collect denied authorization check', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockResolvedValue(false),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('AdminPolicy', 'delete', { type: 'Post' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'AdminPolicy',
          action: 'delete',
          allowed: false,
        }),
      );
    });
  });

  // ============================================================================
  // Authorization Check - Error
  // ============================================================================

  describe('Authorization Check - Error', () => {
    it('should collect failed check on error', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockRejectedValue(new Error('Policy evaluation failed')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.check('ErrorPolicy', 'action')).rejects.toThrow(
        'Policy evaluation failed',
      );

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          allowed: false,
          reason: 'Policy evaluation failed',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockRejectedValue(new Error('Auth error')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.check('Policy', 'action')).rejects.toThrow('Auth error');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const service = createGateService({
        check: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      try {
        await service.check('Policy', 'action');
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          reason: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Multiple Methods
  // ============================================================================

  describe('Multiple Methods', () => {
    it('should wrap allows method', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.allows('CanEdit', 'edit');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'CanEdit',
        }),
      );
    });

    it('should wrap denies method', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.denies('NoAccess', 'view');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'NoAccess',
        }),
      );
    });

    it('should wrap authorize method', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.authorize('AuthorizePolicy', 'execute');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'AuthorizePolicy',
        }),
      );
    });

    it('should wrap can method', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.can('CanPolicy', 'do');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'CanPolicy',
        }),
      );
    });

    it('should skip non-function methods', async () => {
      // Arrange
      const service = {
        ...createGateService(),
        notAMethod: 'value',
      };
      watcher = await createWatcher(mockConfig, service);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // User ID Extraction
  // ============================================================================

  describe('User ID Extraction', () => {
    it('should extract id from user object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const user = { id: 123, email: 'test@example.com' };

      // Act
      await service.check('Policy', 'action', null, user);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 123,
        }),
      );
    });

    it('should extract userId from user object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const user = { userId: 456 };

      // Act
      await service.check('Policy', 'action', null, user);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 456,
        }),
      );
    });

    it('should extract sub from JWT user object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const user = { sub: 'user-789' };

      // Act
      await service.check('Policy', 'action', null, user);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 'user-789',
        }),
      );
    });

    it('should extract _id from MongoDB user object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const user = { _id: 'mongo-id' };

      // Act
      await service.check('Policy', 'action', null, user);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 'mongo-id',
        }),
      );
    });

    it('should use string user directly', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', null, 'user-string');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 'user-string',
        }),
      );
    });

    it('should use number user directly', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', null, 42);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: 42,
        }),
      );
    });

    it('should return undefined for null user', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', null, null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          userId: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Subject Name Extraction
  // ============================================================================

  describe('Subject Name Extraction', () => {
    it('should use string subject directly', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', 'Post');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          subject: 'Post',
        }),
      );
    });

    it('should extract name from subject object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', { name: 'Article' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          subject: 'Article',
        }),
      );
    });

    it('should extract type from subject object', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', { type: 'Comment' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          subject: 'Comment',
        }),
      );
    });

    it('should use constructor name from class instance', async () => {
      // Arrange
      class Post {}
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', new Post());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          subject: 'Post',
        }),
      );
    });

    it('should return undefined for null subject', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          subject: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Context Capture
  // ============================================================================

  describe('Context Capture', () => {
    it('should capture subject id in context', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', { id: 123, type: 'Post' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          context: expect.objectContaining({
            subjectId: 123,
            subjectType: 'Post',
          }),
        }),
      );
    });

    it('should capture user details in context', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const user = { id: 1, email: 'admin@example.com', name: 'Admin', roles: ['admin'] };

      // Act
      await service.check('Policy', 'action', null, user);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          context: expect.objectContaining({
            userEmail: 'admin@example.com',
            userName: 'Admin',
            userRoles: ['admin'],
          }),
        }),
      );
    });

    it('should not capture context when disabled', async () => {
      // Arrange
      mockConfig.watchers = { gate: { enabled: true, captureContext: false } };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', { id: 1 }, { id: 2, email: 'test@example.com' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          context: undefined,
        }),
      );
    });

    it('should return undefined context when no details available', async () => {
      // Arrange
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('Policy', 'action', {}, {});

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          context: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Ignore Abilities
  // ============================================================================

  describe('Ignore Abilities', () => {
    it('should ignore gate by name', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['viewDashboard'] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('viewDashboard', 'view');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should ignore action by name', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['healthCheck'] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('SystemGate', 'healthCheck');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should ignore gate:action combination', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['AdminPolicy:viewLogs'] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('AdminPolicy', 'viewLogs');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should not ignore non-matching abilities', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['viewDashboard', 'healthCheck'] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('PostPolicy', 'edit');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'PostPolicy',
          action: 'edit',
        }),
      );
    });

    it('should ignore multiple abilities', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['viewDashboard', 'healthCheck', 'ping'] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('SystemGate', 'viewDashboard');
      await service.check('HealthGate', 'healthCheck');
      await service.check('PingGate', 'ping');
      await service.check('ImportantGate', 'action');

      // Assert - only the last one should be collected
      expect(mockCollector.collect).toHaveBeenCalledTimes(1);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'ImportantGate',
        }),
      );
    });

    it('should work with empty ignore list', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: [] },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('AnyGate', 'anyAction');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });

    it('should work without ignore list', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true },
      };
      const service = createGateService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.check('AnyGate', 'anyAction');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });

    it('should also ignore in manual trackCheck', async () => {
      // Arrange
      mockConfig.watchers = {
        gate: { enabled: true, ignoreAbilities: ['ignoredGate'] },
      };
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackCheck('ignoredGate', 'action', 'subject', true);

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Manual Tracking
  // ============================================================================

  describe('Manual Tracking (trackCheck)', () => {
    it('should track allowed check', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackCheck('ManualGate', 'view', 'Post', true, { id: 1 });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          gate: 'ManualGate',
          action: 'view',
          subject: 'Post',
          allowed: true,
        }),
      );
    });

    it('should track denied check with reason', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackCheck('ManualGate', 'delete', 'Comment', false, { id: 2 }, 'Not owner');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'gate',
        expect.objectContaining({
          allowed: false,
          reason: 'Not owner',
        }),
      );
    });
  });
});
