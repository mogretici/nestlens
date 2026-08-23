/**
 * ExceptionWatcher Tests
 *
 * Tests for the exception filter that catches and collects exceptions.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { ArgumentsHost, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { Response } from 'express';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { NestLensRequest } from '../../types';
import { ExceptionWatcher } from '../../watchers/exception.watcher';

describe('ExceptionWatcher', () => {
  let watcher: ExceptionWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockResponse: jest.Mocked<Response>;
  let mockConfig: NestLensConfig;

  const createMockRequest = (overrides: Partial<NestLensRequest> = {}): NestLensRequest =>
    ({
      method: 'POST',
      url: '/api/users',
      originalUrl: '/api/users',
      path: '/api/users',
      body: { name: 'Test User' },
      nestlensRequestId: 'req-123',
      ...overrides,
    }) as NestLensRequest;

  const createMockResponse = (): jest.Mocked<Response> => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      headersSent: false,
    };
    return res as unknown as jest.Mocked<Response>;
  };

  const createMockHost = (
    request: NestLensRequest,
    response: Response,
    type: string = 'http',
  ): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      // Nest's own filter reads the response positionally, and the watcher
      // hands the exception to it rather than writing a reply of its own. A
      // fake that answers `switchToHttp` and nothing else is not the interface
      // it claims to be.
      getArgByIndex: (index: number) => (index === 0 ? request : response),
      getArgs: () => [request, response],
      getType: () => type,
    }) as unknown as ArgumentsHost;

  const createWatcher = async (config: NestLensConfig): Promise<ExceptionWatcher> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExceptionWatcher,
        { provide: CollectorService, useValue: mockCollector },
        { provide: NESTLENS_CONFIG, useValue: config },
        {
          provide: HttpAdapterHost,
          useValue: {
            httpAdapter: {
              // Mirror ExpressAdapter: the watcher hands the exception to
              // Nest's own filter, which asks whether the response has already
              // been written before writing to it.
              reply: (res: Response, body: unknown, status: number) =>
                res.status(status).json(body),
              isHeadersSent: (res: { headersSent?: boolean }) => res.headersSent === true,
              end: (res: { end?: () => void }) => res.end?.(),
            },
          },
        },
      ],
    }).compile();

    return module.get<ExceptionWatcher>(ExceptionWatcher);
  };

  beforeEach(() => {
    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockResponse = createMockResponse();

    mockConfig = {
      enabled: true,
      path: '/__nestlens',
      watchers: {
        exception: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when exception watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { exception: true };
      watcher = await createWatcher(mockConfig);
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Test error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });

    it('should be disabled when exception watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { exception: false };
      watcher = await createWatcher(mockConfig);
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Test error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      watcher = await createWatcher(mockConfig);
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Test error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });

    it('should handle object config with enabled property', async () => {
      // Arrange
      mockConfig.watchers = {
        exception: { enabled: true, ignoreExceptions: ['NotFoundException'] },
      };
      watcher = await createWatcher(mockConfig);
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Test error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Exception Collection
  // ============================================================================

  describe('Exception Collection', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should collect exception with full payload', async () => {
      // Arrange
      const request = createMockRequest({
        method: 'POST',
        originalUrl: '/api/users/create',
        body: { email: 'test@example.com' },
        nestlensRequestId: 'req-456',
      });
      const host = createMockHost(request, mockResponse);
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at test.ts:10';

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          name: 'Error',
          message: 'Something went wrong',
          stack: error.stack,
          context: 'HTTP',
          request: {
            method: 'POST',
            url: '/api/users/create',
            body: { email: 'test@example.com' },
          },
        }),
        'req-456',
      );
    });

    it('should use collectImmediate for exceptions', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Critical error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect exception name and message', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom error occurred');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          name: 'CustomError',
          message: 'Custom error occurred',
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Path Skipping
  // ============================================================================

  describe('Path Skipping', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should skip NestLens dashboard paths', async () => {
      // Arrange
      const request = createMockRequest({ path: '/__nestlens/dashboard' });
      const host = createMockHost(request, mockResponse);
      const error = new Error('Dashboard error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });

    it('should skip NestLens API paths', async () => {
      // Arrange
      const request = createMockRequest({ path: '/__nestlens__/api/entries' });
      const host = createMockHost(request, mockResponse);
      const error = new Error('API error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });

    // This asserted `/__nestlens-api/entries` — a path NestLens has never
    // served — and passed because the mount point was compared with
    // `startsWith`. It is the application's route, and its failures are the
    // ones a reader came here to see.
    it('records a failure on a route that starts with the mount point', async () => {
      // Arrange
      const request = createMockRequest({ path: '/__nestlens-api/entries' });
      const host = createMockHost(request, mockResponse);
      const error = new Error('API error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });

    it('should collect exceptions on regular paths', async () => {
      // Arrange
      const request = createMockRequest({ path: '/api/users' });
      const host = createMockHost(request, mockResponse);
      const error = new Error('Regular error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });

    it('should use custom NestLens path from config', async () => {
      // Arrange
      mockConfig.path = '/custom-debug';
      watcher = await createWatcher(mockConfig);
      const request = createMockRequest({ path: '/custom-debug/stats' });
      const host = createMockHost(request, mockResponse);
      const error = new Error('Debug error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Ignored Exceptions
  // ============================================================================

  describe('Ignored Exceptions', () => {
    it('should skip ignored exceptions by name', async () => {
      // Arrange
      mockConfig.watchers = {
        exception: {
          enabled: true,
          ignoreExceptions: ['NotFoundException', 'UnauthorizedException'],
        },
      };
      watcher = await createWatcher(mockConfig);

      class NotFoundException extends Error {
        constructor() {
          super('Not Found');
          this.name = 'NotFoundException';
        }
      }

      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new NotFoundException();

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });

    it('should collect non-ignored exceptions', async () => {
      // Arrange
      mockConfig.watchers = {
        exception: { enabled: true, ignoreExceptions: ['NotFoundException'] },
      };
      watcher = await createWatcher(mockConfig);

      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Internal error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // HTTP Exception Handling
  // ============================================================================

  describe('HTTP Exception Handling', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should extract status code from HttpException', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new HttpException('Not Found', 404);

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          code: 404,
        }),
        expect.any(String),
      );
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should respond with HttpException response', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new HttpException({ message: 'Bad Request', errors: ['Invalid email'] }, 400);

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Bad Request',
        errors: ['Invalid email'],
      });
    });

    it('should respond with 500 for non-HttpException', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Internal error');

      // Act
      watcher.catch(error, host);

      // Assert — Nest's own wording, because the response is Nest's own. The
      // thrown message used to go out in the body, which is a message the
      // application chose not to publish.
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      });
    });

    it('keeps the status an http-errors failure carries', async () => {
      // What body-parser, serve-static and much else throw: not an
      // `HttpException`, but carrying its own status. This used to answer 500.
      const host = createMockHost(createMockRequest(), mockResponse);
      const error = Object.assign(new Error('request entity too large'), { statusCode: 413 });

      watcher.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 413,
        message: 'request entity too large',
      });
    });

    it('writes nothing to a response that has already been sent', async () => {
      const sent = { ...createMockResponse(), headersSent: true } as unknown as Response;
      const host = createMockHost(createMockRequest(), sent);

      watcher.catch(new Error('too late'), host);

      expect((sent as unknown as { json: jest.Mock }).json).not.toHaveBeenCalled();
      expect((sent as unknown as { end: jest.Mock }).end).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Error Code Extraction
  // ============================================================================

  describe('Error Code Extraction', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should extract code property from custom errors', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);

      class DatabaseError extends Error {
        code = 'ECONNREFUSED';
        constructor() {
          super('Connection refused');
          this.name = 'DatabaseError';
        }
      }
      const error = new DatabaseError();

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          code: 'ECONNREFUSED',
        }),
        expect.any(String),
      );
    });

    it('should extract numeric code from errors', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);

      class SystemError extends Error {
        code = 11;
        constructor() {
          super('Resource busy');
          this.name = 'SystemError';
        }
      }
      const error = new SystemError();

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          code: 11,
        }),
        expect.any(String),
      );
    });

    it('should return undefined for errors without code', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse);
      const error = new Error('Simple error');

      // Act
      watcher.catch(error, host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          code: undefined,
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Context Detection
  // ============================================================================

  describe('Context Detection', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should detect HTTP context', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse, 'http');

      // Act
      watcher.catch(new Error('Test'), host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          context: 'HTTP',
        }),
        expect.any(String),
      );
    });

    it('should skip RPC context and re-throw exception', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse, 'rpc');
      const error = new Error('Test');

      // Act & Assert
      expect(() => watcher.catch(error, host)).toThrow(error);
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });

    it('should skip WebSocket context and re-throw exception', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse, 'ws');
      const error = new Error('Test');

      // Act & Assert
      expect(() => watcher.catch(error, host)).toThrow(error);
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });

    it('should skip GraphQL context and re-throw exception', async () => {
      // Arrange
      const request = createMockRequest();
      const host = createMockHost(request, mockResponse, 'graphql');
      const error = new Error('Test');

      // Act & Assert
      expect(() => watcher.catch(error, host)).toThrow(error);
      expect(mockCollector.collectImmediate).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Request Info Capture
  // ============================================================================

  describe('Request Info Capture', () => {
    beforeEach(async () => {
      watcher = await createWatcher(mockConfig);
    });

    it('should capture request method and URL', async () => {
      // Arrange
      const request = createMockRequest({
        method: 'DELETE',
        originalUrl: '/api/users/123',
      });
      const host = createMockHost(request, mockResponse);

      // Act
      watcher.catch(new Error('Delete error'), host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'DELETE',
            url: '/api/users/123',
          }),
        }),
        expect.any(String),
      );
    });

    it('should capture request body', async () => {
      // Arrange
      const request = createMockRequest({
        body: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'secret123',
        },
      });
      const host = createMockHost(request, mockResponse);

      // Act
      watcher.catch(new Error('Validation error'), host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          request: expect.objectContaining({
            body: {
              username: 'testuser',
              email: 'test@example.com',
              password: 'secret123',
            },
          }),
        }),
        expect.any(String),
      );
    });

    it('should use url when originalUrl is not available', async () => {
      // Arrange
      const request = createMockRequest({
        originalUrl: undefined,
        url: '/fallback/url',
      });
      const host = createMockHost(request, mockResponse);

      // Act
      watcher.catch(new Error('Test'), host);

      // Assert
      expect(mockCollector.collectImmediate).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({
          request: expect.objectContaining({
            url: '/fallback/url',
          }),
        }),
        expect.any(String),
      );
    });
  });
});
