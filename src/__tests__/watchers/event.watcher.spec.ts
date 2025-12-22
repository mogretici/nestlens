/**
 * EventWatcher Tests
 *
 * Tests for the event watcher that monitors event emissions.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { EventWatcher, NESTLENS_EVENT_EMITTER } from '../../watchers/event.watcher';

describe('EventWatcher', () => {
  let watcher: EventWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockEventEmitter: {
    onAny: jest.Mock;
    listeners: jest.Mock;
  };
  let mockConfig: NestLensConfig;
  let capturedOnAnyHandler: Function | undefined;

  const createWatcher = async (
    config: NestLensConfig,
    eventEmitter?: typeof mockEventEmitter,
  ): Promise<EventWatcher> => {
    const providers: any[] = [
      EventWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (eventEmitter !== undefined) {
      providers.push({ provide: NESTLENS_EVENT_EMITTER, useValue: eventEmitter });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<EventWatcher>(EventWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedOnAnyHandler = undefined;

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockEventEmitter = {
      onAny: jest.fn((handler) => {
        capturedOnAnyHandler = handler;
      }),
      listeners: jest.fn().mockReturnValue([]),
    };

    mockConfig = {
      enabled: true,
      watchers: {
        event: { enabled: true },
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when event watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { event: true };
      watcher = await createWatcher(mockConfig, mockEventEmitter);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when event watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { event: false };
      watcher = await createWatcher(mockConfig, mockEventEmitter);

      // Act
      watcher.onModuleInit();

      // Assert - should not setup interceptors
      expect(mockEventEmitter.onAny).not.toHaveBeenCalled();
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      watcher = await createWatcher(mockConfig, mockEventEmitter);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { event: false };
      watcher = await createWatcher(mockConfig, mockEventEmitter);

      // Act
      watcher.onModuleInit();

      // Assert
      expect(mockEventEmitter.onAny).not.toHaveBeenCalled();
    });

    it('should handle missing event emitter gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when event emitter is available', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, mockEventEmitter);

      // Act
      watcher.onModuleInit();

      // Assert
      expect(mockEventEmitter.onAny).toHaveBeenCalled();
      expect(capturedOnAnyHandler).toBeDefined();
    });
  });

  // ============================================================================
  // Event Collection
  // ============================================================================

  describe('Event Collection', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();
    });

    it('should collect event with name and payload', async () => {
      // Arrange
      const eventPayload = { userId: 123, action: 'login' };

      // Act
      capturedOnAnyHandler?.('user.logged_in', eventPayload);
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          name: 'user.logged_in',
          payload: eventPayload,
        }),
      );
    });

    it('should handle array event names', async () => {
      // Arrange & Act
      capturedOnAnyHandler?.(['user', 'created'], { id: 1 });
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          name: 'user.created',
        }),
      );
    });

    it('should collect event duration', async () => {
      // Arrange & Act
      capturedOnAnyHandler?.('test.event');
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });

    it('should collect listener names', async () => {
      // Arrange
      const mockListener = function onUserCreated() {};
      mockEventEmitter.listeners.mockReturnValue([mockListener]);

      // Act
      capturedOnAnyHandler?.('user.created', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          listeners: ['onUserCreated'],
        }),
      );
    });

    it('should handle anonymous listeners', async () => {
      // Arrange
      mockEventEmitter.listeners.mockReturnValue([() => {}]);

      // Act
      capturedOnAnyHandler?.('test.event', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          listeners: ['anonymous'],
        }),
      );
    });

    it('should handle non-function listeners', async () => {
      // Arrange
      mockEventEmitter.listeners.mockReturnValue([{ handler: true }]);

      // Act
      capturedOnAnyHandler?.('test.event', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          listeners: ['unknown'],
        }),
      );
    });
  });

  // ============================================================================
  // Ignored Events
  // ============================================================================

  describe('Ignored Events', () => {
    it('should skip ignored events', async () => {
      // Arrange
      mockConfig.watchers = {
        event: { enabled: true, ignoreEvents: ['internal', 'debug'] },
      };
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();

      // Act
      capturedOnAnyHandler?.('internal.heartbeat', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip events containing ignored patterns', async () => {
      // Arrange
      mockConfig.watchers = {
        event: { enabled: true, ignoreEvents: ['debug'] },
      };
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();

      // Act
      capturedOnAnyHandler?.('app.debug.logs', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect non-ignored events', async () => {
      // Arrange
      mockConfig.watchers = {
        event: { enabled: true, ignoreEvents: ['debug'] },
      };
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();

      // Act
      capturedOnAnyHandler?.('user.created', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Payload Capture
  // ============================================================================

  describe('Payload Capture', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();
    });

    it('should capture single value directly', async () => {
      // Arrange
      const singlePayload = { user: 'test' };

      // Act
      capturedOnAnyHandler?.('event', singlePayload);
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          payload: singlePayload,
        }),
      );
    });

    it('should capture multiple values as array', async () => {
      // Arrange & Act
      capturedOnAnyHandler?.('event', 'value1', 'value2', 'value3');
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          payload: ['value1', 'value2', 'value3'],
        }),
      );
    });

    it('should return undefined for no payload', async () => {
      // Arrange & Act
      capturedOnAnyHandler?.('event');
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          payload: undefined,
        }),
      );
    });

    it('should truncate large payloads', async () => {
      // Arrange
      const largePayload = { data: 'x'.repeat(100000) };

      // Act
      capturedOnAnyHandler?.('event', largePayload);
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          payload: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable payloads', async () => {
      // Arrange
      const circularPayload: any = {};
      circularPayload.self = circularPayload;

      // Act
      capturedOnAnyHandler?.('event', circularPayload);
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          payload: { _error: 'Unable to serialize payload' },
        }),
      );
    });
  });

  // ============================================================================
  // Listener Error Handling
  // ============================================================================

  describe('Listener Error Handling', () => {
    it('should handle errors when getting listeners', async () => {
      // Arrange
      mockEventEmitter.listeners.mockImplementation(() => {
        throw new Error('Cannot get listeners');
      });
      watcher = await createWatcher(mockConfig, mockEventEmitter);
      watcher.onModuleInit();

      // Act
      capturedOnAnyHandler?.('test.event', {});
      jest.runAllTimers();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({
          listeners: [],
        }),
      );
    });
  });
});
