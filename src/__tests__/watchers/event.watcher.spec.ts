/**
 * EventWatcher Tests
 *
 * Tests for the event watcher that monitors event emissions.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { EventWatcher, NESTLENS_EVENT_EMITTER } from '../../watchers/event.watcher';

describe('EventWatcher', () => {
  let watcher: EventWatcher;
  let mockCollector: Mocked<CollectorService>;
  let mockEventEmitter: {
    emit: Mock;
    listeners: Mock;
  };
  let originalEmit: Mock;
  let mockConfig: NestLensConfig;

  /** Emits through whatever `emit` is on the emitter now — the watcher's, once installed. */
  const emit = (...args: unknown[]): unknown =>
    (mockEventEmitter.emit as unknown as (...values: unknown[]) => unknown)(...args);

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
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockCollector = {
      collect: vi.fn(),
      collectImmediate: vi.fn(),
    } as unknown as Mocked<CollectorService>;

    originalEmit = vi.fn().mockReturnValue(true);
    mockEventEmitter = {
      emit: originalEmit,
      listeners: vi.fn().mockReturnValue([]),
    };

    mockConfig = {
      enabled: true,
      watchers: {
        event: { enabled: true },
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(mockEventEmitter.emit).toBe(originalEmit);
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
      expect(mockEventEmitter.emit).toBe(originalEmit);
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
      expect(mockEventEmitter.emit).not.toBe(originalEmit);
      emit('test.event', 1);
      expect(originalEmit).toHaveBeenCalledWith('test.event', 1);
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
      emit('user.logged_in', eventPayload);
      vi.runAllTimers();

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
      emit(['user', 'created'], { id: 1 });
      vi.runAllTimers();

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
      emit('test.event');
      vi.runAllTimers();

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
      emit('user.created', {});
      vi.runAllTimers();

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
      emit('test.event', {});
      vi.runAllTimers();

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
      emit('test.event', {});
      vi.runAllTimers();

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
      emit('internal.heartbeat', {});
      vi.runAllTimers();

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
      emit('app.debug.logs', {});
      vi.runAllTimers();

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
      emit('user.created', {});
      vi.runAllTimers();

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
      emit('event', singlePayload);
      vi.runAllTimers();

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
      emit('event', 'value1', 'value2', 'value3');
      vi.runAllTimers();

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
      emit('event');
      vi.runAllTimers();

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
      emit('event', largePayload);
      vi.runAllTimers();

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

    /**
     * An event carrying an entity that points back at its parent — which is
     * what an ORM emits — was recorded as `{_error: 'Unable to serialize
     * payload'}` and lost. The watcher passes it on now; masking resolves the
     * reference on the way to storage.
     */
    it('keeps a payload that points back at itself', async () => {
      // Arrange
      const circularPayload: any = { id: 1 };
      circularPayload.self = circularPayload;

      // Act
      emit('event', circularPayload);
      vi.runAllTimers();

      // Assert
      const collected = mockCollector.collect.mock.calls[0][1] as unknown as { payload: any };
      expect(collected.payload.id).toBe(1);
      expect(collected.payload.self).toBe(collected.payload);
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
      emit('test.event', {});
      vi.runAllTimers();

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
