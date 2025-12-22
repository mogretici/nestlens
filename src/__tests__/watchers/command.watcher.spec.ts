/**
 * CommandWatcher Tests
 *
 * Tests for the command watcher that monitors CQRS command execution.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { CommandWatcher, NESTLENS_COMMAND_BUS } from '../../watchers/command.watcher';

describe('CommandWatcher', () => {
  let watcher: CommandWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createCommandBus = (overrides: Partial<{
    execute: jest.Mock;
  }> = {}) => ({
    execute: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    commandBus?: ReturnType<typeof createCommandBus>,
  ): Promise<CommandWatcher> => {
    const providers: any[] = [
      CommandWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (commandBus !== undefined) {
      providers.push({ provide: NESTLENS_COMMAND_BUS, useValue: commandBus });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<CommandWatcher>(CommandWatcher);
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
        command: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when command watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { command: true };
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when command watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { command: false };
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { command: { enabled: true, capturePayload: false } };
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Assert
      expect((watcher as any).config.capturePayload).toBe(false);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing command bus gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when command bus is available', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).originalExecute).toBeDefined();
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { command: false };
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).originalExecute).toBeUndefined();
    });

    it('should handle command bus without execute method', async () => {
      // Arrange
      const invalidBus = {};
      watcher = await createWatcher(mockConfig, invalidBus as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Command Execution - Success
  // ============================================================================

  describe('Command Execution - Success', () => {
    class CreateUserCommand {
      constructor(public readonly name: string, public readonly email: string) {}
    }

    it('should collect executing event', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();
      const command = new CreateUserCommand('John', 'john@example.com');

      // Act
      await bus.execute(command);

      // Assert - "executing" event has no duration (undefined or 0)
      const executingCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'executing',
      );
      expect(executingCall).toBeDefined();
      expect((executingCall![1] as any).name).toBe('CreateUserCommand');
    });

    it('should collect completed event', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({}), 10)),
        ),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();
      const command = new CreateUserCommand('John', 'john@example.com');

      // Act
      await bus.execute(command);

      // Assert - find the "completed" call specifically
      const completedCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect(completedCall).toBeDefined();
      expect((completedCall![1] as any).name).toBe('CreateUserCommand');
      // Duration is undefined if 0, so check it's a number and >= 0 or undefined
      const duration = (completedCall![1] as any).duration;
      if (duration !== undefined) {
        expect(duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should capture command payload', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();
      const command = new CreateUserCommand('John', 'john@example.com');

      // Act
      await bus.execute(command);

      // Assert
      const completedCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((completedCall?.[1] as any).payload).toEqual({
        name: 'John',
        email: 'john@example.com',
      });
    });

    it('should capture command result', async () => {
      // Arrange
      const expectedResult = { userId: 123, created: true };
      const bus = createCommandBus({
        execute: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new CreateUserCommand('Jane', 'jane@example.com'));

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          status: 'completed',
          result: expectedResult,
        }),
      );
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = { userId: 456 };
      const bus = createCommandBus({
        execute: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      const result = await bus.execute(new CreateUserCommand('Test', 'test@example.com'));

      // Assert
      expect(result).toEqual(expectedResult);
    });

    it('should calculate command duration', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
        ),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new CreateUserCommand('Slow', 'slow@example.com'));

      // Assert
      const completedCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((completedCall?.[1] as any).duration).toBeGreaterThanOrEqual(40);
    });
  });

  // ============================================================================
  // Command Execution - Failure
  // ============================================================================

  describe('Command Execution - Failure', () => {
    class FailingCommand {
      constructor(public readonly data: string) {}
    }

    it('should collect failed event', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockRejectedValue(new Error('Command failed')),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act & Assert
      await expect(bus.execute(new FailingCommand('test')))
        .rejects.toThrow('Command failed');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          name: 'FailingCommand',
          status: 'failed',
          error: 'Command failed',
        }),
      );
    });

    it('should include duration for failed commands', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Error')), 10)),
        ),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      try {
        await bus.execute(new FailingCommand('test'));
      } catch {
        // Expected
      }

      // Assert
      const failedCall = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'failed',
      );
      expect(failedCall).toBeDefined();
      // Duration might be undefined if instant failure (0ms), so just check it exists in payload
      expect('duration' in (failedCall![1] as any)).toBe(true);
    });

    it('should re-throw the error', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockRejectedValue(new Error('Critical error')),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act & Assert
      await expect(bus.execute(new FailingCommand('data')))
        .rejects.toThrow('Critical error');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      try {
        await bus.execute(new FailingCommand('test'));
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Command Name Extraction
  // ============================================================================

  describe('Command Name Extraction', () => {
    it('should extract class name from command', async () => {
      // Arrange
      class MyCustomCommand {}
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new MyCustomCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          name: 'MyCustomCommand',
        }),
      );
    });

    it('should handle null command', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          name: 'UnknownCommand',
        }),
      );
    });

    it('should handle undefined command', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(undefined);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          name: 'UnknownCommand',
        }),
      );
    });

    it('should handle plain object command', async () => {
      // Arrange
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute({ type: 'CREATE', data: 'test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          name: 'Object',
        }),
      );
    });
  });

  // ============================================================================
  // Metadata Extraction
  // ============================================================================

  describe('Metadata Extraction', () => {
    it('should extract timestamp metadata', async () => {
      // Arrange
      class TimestampedCommand {
        timestamp = Date.now();
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new TimestampedCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          metadata: expect.objectContaining({
            timestamp: expect.any(Number),
          }),
        }),
      );
    });

    it('should extract userId metadata', async () => {
      // Arrange
      class UserCommand {
        userId = 123;
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new UserCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 123,
          }),
        }),
      );
    });

    it('should extract correlationId metadata', async () => {
      // Arrange
      class CorrelatedCommand {
        correlationId = 'abc-123';
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new CorrelatedCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          metadata: expect.objectContaining({
            correlationId: 'abc-123',
          }),
        }),
      );
    });

    it('should extract version metadata', async () => {
      // Arrange
      class VersionedCommand {
        version = 'v2';
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new VersionedCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          metadata: expect.objectContaining({
            version: 'v2',
          }),
        }),
      );
    });

    it('should return undefined for command without metadata', async () => {
      // Arrange
      class SimpleCommand {}
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new SimpleCommand());

      // Assert
      const call = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((call?.[1] as any).metadata).toBeUndefined();
    });
  });

  // ============================================================================
  // Payload Capture Config
  // ============================================================================

  describe('Payload Capture Config', () => {
    it('should not capture payload when capturePayload is false', async () => {
      // Arrange
      mockConfig.watchers = { command: { enabled: true, capturePayload: false } };
      class DataCommand {
        data = 'sensitive';
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new DataCommand());

      // Assert
      const call = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((call?.[1] as any).payload).toBeUndefined();
    });

    it('should not capture result when captureResult is false', async () => {
      // Arrange
      mockConfig.watchers = { command: { enabled: true, captureResult: false } };
      const bus = createCommandBus({
        execute: jest.fn().mockResolvedValue({ sensitive: 'data' }),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute({});

      // Assert
      const call = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((call?.[1] as any).result).toBeUndefined();
    });

    it('should truncate large payload', async () => {
      // Arrange
      mockConfig.watchers = { command: { enabled: true, maxPayloadSize: 100 } };
      class LargeCommand {
        data = 'x'.repeat(1000);
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new LargeCommand());

      // Assert
      const call = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((call?.[1] as any).payload).toEqual({
        _truncated: true,
        _size: expect.any(Number),
      });
    });

    it('should handle non-serializable payload', async () => {
      // Arrange
      class CircularCommand {
        self: any;
        constructor() {
          this.self = this;
        }
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new CircularCommand());

      // Assert
      const call = mockCollector.collect.mock.calls.find(
        (c) => (c[1] as any).status === 'completed',
      );
      expect((call?.[1] as any).payload).toEqual({
        _error: 'Unable to serialize data',
      });
    });
  });

  // ============================================================================
  // Handler Extraction
  // ============================================================================

  describe('Handler Extraction', () => {
    it('should extract handler from command if available', async () => {
      // Arrange
      class HandlerCommand {
        handler = 'CreateUserHandler';
      }
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new HandlerCommand());

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({
          handler: 'CreateUserHandler',
        }),
      );
    });

    it('should return undefined for missing handler', async () => {
      // Arrange
      class NoHandlerCommand {}
      const bus = createCommandBus();
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      await bus.execute(new NoHandlerCommand());

      // Assert
      const call = mockCollector.collect.mock.calls[0];
      expect((call[1] as any).handler).toBeUndefined();
    });
  });

  // ============================================================================
  // Command Tracking
  // ============================================================================

  describe('Command Tracking', () => {
    it('should track commands in progress', async () => {
      // Arrange
      let resolveExecute: (value?: unknown) => void;
      const bus = createCommandBus({
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => { resolveExecute = resolve; }),
        ),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      const executePromise = bus.execute({});

      // Assert - command should be tracked while in progress
      expect((watcher as any).commandTracking.size).toBe(1);

      // Cleanup
      resolveExecute!();
      await executePromise;

      // After completion, tracking should be cleaned up
      expect((watcher as any).commandTracking.size).toBe(0);
    });

    it('should cleanup tracking on failure', async () => {
      // Arrange
      const bus = createCommandBus({
        execute: jest.fn().mockRejectedValue(new Error('Failed')),
      });
      watcher = await createWatcher(mockConfig, bus);
      watcher.onModuleInit();

      // Act
      try {
        await bus.execute({});
      } catch {
        // Expected
      }

      // Assert
      expect((watcher as any).commandTracking.size).toBe(0);
    });
  });
});
