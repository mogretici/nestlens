/**
 * NestLensLogger (LogWatcher) Tests
 *
 * Tests for the logger that extends ConsoleLogger and collects log entries.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { NestLensLogger } from '../../watchers/log.watcher';

describe('NestLensLogger', () => {
  let logger: NestLensLogger;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  // Suppress console output during tests
  let originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    verbose: typeof console.log;
  };

  beforeAll(() => {
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      verbose: console.log,
    };
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
  });

  const createLogger = async (config: NestLensConfig): Promise<NestLensLogger> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NestLensLogger,
        { provide: CollectorService, useValue: mockCollector },
        { provide: NESTLENS_CONFIG, useValue: config },
      ],
    }).compile();

    return module.get<NestLensLogger>(NestLensLogger);
  };

  beforeEach(() => {
    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        log: { enabled: true, minLevel: 'log' },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when log watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { log: true };
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Test message');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });

    it('should be disabled when log watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { log: false };
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Test message');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Test message');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });

    it('should use default minLevel of "log" when not specified', async () => {
      // Arrange
      mockConfig.watchers = { log: true };
      logger = await createLogger(mockConfig);

      // Act - debug should be filtered out (lower priority than log)
      logger.debug('Debug message');
      logger.log('Log message');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledTimes(1);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ level: 'log' }),
      );
    });
  });

  // ============================================================================
  // Log Levels
  // ============================================================================

  describe('Log Levels', () => {
    beforeEach(async () => {
      mockConfig.watchers = { log: { enabled: true, minLevel: 'debug' } };
      logger = await createLogger(mockConfig);
    });

    it('should filter verbose logs when minLevel is debug', async () => {
      // Arrange & Act - verbose has priority 0, debug has priority 1
      logger.verbose('Verbose message', 'TestContext');

      // Assert - verbose is below debug level, so it should be filtered
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect debug logs', async () => {
      // Arrange & Act
      logger.debug('Debug message', 'TestContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'debug',
          message: 'Debug message',
          context: 'TestContext',
        }),
      );
    });

    it('should collect log level logs', async () => {
      // Arrange & Act
      logger.log('Log message', 'TestContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'log',
          message: 'Log message',
          context: 'TestContext',
        }),
      );
    });

    it('should collect warn logs', async () => {
      // Arrange & Act
      logger.warn('Warning message', 'TestContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'warn',
          message: 'Warning message',
          context: 'TestContext',
        }),
      );
    });

    it('should collect error logs', async () => {
      // Arrange & Act
      logger.error('Error message', 'TestContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'error',
          message: 'Error message',
        }),
      );
    });
  });

  // ============================================================================
  // Minimum Level Filtering
  // ============================================================================

  describe('Minimum Level Filtering', () => {
    it('should filter logs below minimum level (log)', async () => {
      // Arrange
      mockConfig.watchers = { log: { enabled: true, minLevel: 'log' } };
      logger = await createLogger(mockConfig);

      // Act
      logger.verbose('Verbose - should be filtered');
      logger.debug('Debug - should be filtered');
      logger.log('Log - should be collected');
      logger.warn('Warn - should be collected');
      logger.error('Error - should be collected');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledTimes(3);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ level: 'log' }),
      );
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ level: 'warn' }),
      );
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ level: 'error' }),
      );
    });

    it('should filter logs below minimum level (warn)', async () => {
      // Arrange
      mockConfig.watchers = { log: { enabled: true, minLevel: 'warn' } };
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Log - should be filtered');
      logger.warn('Warn - should be collected');
      logger.error('Error - should be collected');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledTimes(2);
    });

    it('should only collect errors when minLevel is error', async () => {
      // Arrange
      mockConfig.watchers = { log: { enabled: true, minLevel: 'error' } };
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Log - should be filtered');
      logger.warn('Warn - should be filtered');
      logger.error('Error - should be collected');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledTimes(1);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ level: 'error' }),
      );
    });

    it('should collect all logs from debug and above when minLevel is debug', async () => {
      // Arrange
      mockConfig.watchers = { log: { enabled: true, minLevel: 'debug' } };
      logger = await createLogger(mockConfig);

      // Act
      logger.verbose('Verbose'); // filtered (priority 0 < 1)
      logger.debug('Debug');
      logger.log('Log');
      logger.warn('Warn');
      logger.error('Error');

      // Assert - 4 logs collected (debug, log, warn, error), verbose filtered
      expect(mockCollector.collect).toHaveBeenCalledTimes(4);
    });
  });

  // ============================================================================
  // Internal Log Filtering
  // ============================================================================

  describe('Internal Log Filtering', () => {
    beforeEach(async () => {
      logger = await createLogger(mockConfig);
    });

    it('should skip logs with NestLens context', async () => {
      // Arrange & Act
      logger.log('NestLens internal message', 'NestLens');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip logs with Collector context', async () => {
      // Arrange & Act
      logger.log('Collector message', 'Collector');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip logs with NestLensLogger context', async () => {
      // Arrange & Act
      logger.log('Logger message', 'NestLensLogger');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip logs with CollectorService context', async () => {
      // Arrange & Act
      logger.log('Service message', 'CollectorService');

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect logs with regular contexts', async () => {
      // Arrange & Act
      logger.log('Application message', 'AppController');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          context: 'AppController',
        }),
      );
    });
  });

  // ============================================================================
  // Context Extraction
  // ============================================================================

  describe('Context Extraction', () => {
    beforeEach(async () => {
      logger = await createLogger(mockConfig);
    });

    it('should extract context from last string parameter', async () => {
      // Arrange & Act
      logger.log('Test message', 'MyContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: 'Test message',
          context: 'MyContext',
        }),
      );
    });

    it('should handle logs without context', async () => {
      // Arrange & Act
      logger.log('Test message');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: 'Test message',
          context: undefined,
        }),
      );
    });

    it('should not extract non-string last parameter as context', async () => {
      // Arrange & Act
      logger.log('Test message', { data: 'object' } as any);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: 'Test message',
          context: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Error Parameters
  // ============================================================================

  describe('Error Parameters', () => {
    beforeEach(async () => {
      logger = await createLogger(mockConfig);
    });

    it('should extract stack trace from error logs', async () => {
      // Arrange
      const stack = 'Error: Test\n    at test.ts:10\n    at Object.<anonymous>';

      // Act
      logger.error('Error occurred', stack, 'TestContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'error',
          message: 'Error occurred',
          stack: stack,
          context: 'TestContext',
        }),
      );
    });

    it('should detect stack trace from single parameter', async () => {
      // Arrange
      const stack = 'Error: Test\n    at test.ts:10';

      // Act
      logger.error('Error occurred', stack);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          stack: stack,
          context: undefined,
        }),
      );
    });

    it('should treat single non-stack string as context', async () => {
      // Arrange & Act
      logger.error('Error occurred', 'ErrorContext');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          stack: undefined,
          context: 'ErrorContext',
        }),
      );
    });

    it('should handle error with no additional parameters', async () => {
      // Arrange & Act
      logger.error('Simple error');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          level: 'error',
          message: 'Simple error',
          stack: undefined,
          context: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Message Formatting
  // ============================================================================

  describe('Message Formatting', () => {
    beforeEach(async () => {
      logger = await createLogger(mockConfig);
    });

    it('should pass string messages as-is', async () => {
      // Arrange & Act
      logger.log('Simple string message');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: 'Simple string message',
        }),
      );
    });

    it('should stringify object messages', async () => {
      // Arrange & Act
      logger.log({ key: 'value', nested: { data: 123 } } as any);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: '{"key":"value","nested":{"data":123}}',
        }),
      );
    });

    it('should stringify array messages', async () => {
      // Arrange & Act
      logger.log([1, 2, 3] as any);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          message: '[1,2,3]',
        }),
      );
    });
  });

  // ============================================================================
  // ConsoleLogger Integration
  // ============================================================================

  describe('ConsoleLogger Integration', () => {
    it('should extend ConsoleLogger class', async () => {
      // Arrange & Act
      logger = await createLogger(mockConfig);

      // Assert - logger should be an instance of ConsoleLogger (the parent class)
      const { ConsoleLogger } = await import('@nestjs/common');
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    it('should work when disabled without collecting', async () => {
      // Arrange
      mockConfig.watchers = { log: false };
      logger = await createLogger(mockConfig);

      // Act
      logger.log('Test message');

      // Assert - collector should not be called when disabled
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });
});
