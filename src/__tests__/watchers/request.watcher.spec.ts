/**
 * RequestWatcher Tests
 *
 * Tests for HTTP request/response monitoring interceptor.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { RequestWatcher, REQUEST_ID_HEADER } from '../../watchers/request.watcher';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG } from '../../nestlens.config';

describe('RequestWatcher', () => {
  let watcher: RequestWatcher;
  let mockCollector: jest.Mocked<CollectorService>;

  const createMockContext = (overrides: any = {}): ExecutionContext => {
    const mockRequest = {
      method: 'GET',
      url: '/api/users',
      originalUrl: '/api/users',
      path: '/api/users',
      query: {},
      params: {},
      headers: { 'user-agent': 'test-agent' },
      body: undefined,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...overrides.request,
    };

    const mockResponse = {
      statusCode: 200,
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      ...overrides.response,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getClass: () => ({ name: 'TestController' }),
      getHandler: () => ({ name: 'testMethod' }),
      ...overrides.context,
    } as unknown as ExecutionContext;
  };

  const createMockHandler = (returnValue: any = {}): CallHandler => ({
    handle: () => of(returnValue),
  });

  beforeEach(async () => {
    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
      shutdown: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestWatcher,
        { provide: CollectorService, useValue: mockCollector },
        {
          provide: NESTLENS_CONFIG,
          useValue: {
            path: '/nestlens',
            watchers: {
              request: { enabled: true },
            },
          },
        },
      ],
    }).compile();

    watcher = module.get<RequestWatcher>(RequestWatcher);
  });

  // ============================================================================
  // Enabled/Disabled
  // ============================================================================

  describe('enabled/disabled', () => {
    it('should skip interception when disabled', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              watchers: { request: { enabled: false } },
            },
          },
        ],
      }).compile();

      const disabledWatcher = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext();
      const handler = createMockHandler({ result: 'test' });

      // Act
      const result = await disabledWatcher.intercept(context, handler).toPromise();

      // Assert
      expect(result).toEqual({ result: 'test' });
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should intercept when enabled', async () => {
      // Arrange
      const context = createMockContext();
      const handler = createMockHandler({ data: 'response' });

      // Act
      await watcher.intercept(context, handler).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.any(Object),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Request ID
  // ============================================================================

  describe('request ID', () => {
    it('should set request ID header on response', async () => {
      // Arrange
      const mockSetHeader = jest.fn();
      const context = createMockContext({
        response: { setHeader: mockSetHeader, statusCode: 200, getHeaders: jest.fn().mockReturnValue({}) },
      });
      const handler = createMockHandler();

      // Act
      await watcher.intercept(context, handler).toPromise();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
    });

    it('should generate unique request IDs', async () => {
      // Arrange
      const requestIds: string[] = [];
      mockCollector.collect.mockImplementation((type, payload, requestId) => {
        if (requestId) requestIds.push(requestId);
        return Promise.resolve();
      });

      // Act
      await watcher.intercept(createMockContext(), createMockHandler()).toPromise();
      await watcher.intercept(createMockContext(), createMockHandler()).toPromise();

      // Assert
      expect(requestIds[0]).not.toEqual(requestIds[1]);
    });
  });

  // ============================================================================
  // Path Skipping
  // ============================================================================

  describe('path skipping', () => {
    it('should skip NestLens dashboard routes', async () => {
      // Arrange
      const context = createMockContext({
        request: { path: '/nestlens/requests' },
      });
      const handler = createMockHandler();

      // Act
      await watcher.intercept(context, handler).toPromise();

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip NestLens API routes', async () => {
      // Arrange
      const context = createMockContext({
        request: { path: '/nestlens/api/entries' },
      });
      const handler = createMockHandler();

      // Act
      await watcher.intercept(context, handler).toPromise();

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should skip configured ignore paths', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: {
                  enabled: true,
                  ignorePaths: ['/health', '/metrics'],
                },
              },
            },
          },
        ],
      }).compile();

      const watcherWithIgnore = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { path: '/health' },
      });

      // Act
      await watcherWithIgnore.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Request Data Capture
  // ============================================================================

  describe('request data capture', () => {
    it('should capture HTTP method', async () => {
      // Arrange
      const context = createMockContext({
        request: { method: 'POST' },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({ method: 'POST' }),
        expect.any(String),
      );
    });

    it('should capture URL and path', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          url: '/api/users?page=1',
          originalUrl: '/api/users?page=1',
          path: '/api/users',
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          url: '/api/users?page=1',
          path: '/api/users',
        }),
        expect.any(String),
      );
    });

    it('should capture query parameters', async () => {
      // Arrange
      const context = createMockContext({
        request: { query: { page: '1', limit: '10' } },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          query: { page: '1', limit: '10' },
        }),
        expect.any(String),
      );
    });

    it('should capture route parameters', async () => {
      // Arrange
      const context = createMockContext({
        request: { params: { id: '123' } },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          params: { id: '123' },
        }),
        expect.any(String),
      );
    });

    it('should capture user agent', async () => {
      // Arrange
      const context = createMockContext({
        request: { headers: { 'user-agent': 'Mozilla/5.0' } },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          userAgent: 'Mozilla/5.0',
        }),
        expect.any(String),
      );
    });

    it('should capture client IP', async () => {
      // Arrange
      const context = createMockContext({
        request: { ip: '192.168.1.100' },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          ip: '192.168.1.100',
        }),
        expect.any(String),
      );
    });

    it('should get IP from x-forwarded-for header', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          ip: '127.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          ip: '203.0.113.195',
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Header Capture
  // ============================================================================

  describe('header capture', () => {
    it('should capture headers', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
          },
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'accept': 'application/json',
          }),
        }),
        expect.any(String),
      );
    });

    it('should redact sensitive headers', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          headers: {
            'authorization': 'Bearer secret-token',
            'cookie': 'session=abc123',
            'x-api-key': 'api-key-value',
            'content-type': 'application/json',
          },
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          headers: expect.objectContaining({
            'authorization': '***',
            'cookie': '***',
            'x-api-key': '***',
            'content-type': 'application/json',
          }),
        }),
        expect.any(String),
      );
    });

    it('should join array headers', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          headers: {
            'accept': ['text/html', 'application/json'],
          },
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept': 'text/html, application/json',
          }),
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Body Capture
  // ============================================================================

  describe('body capture', () => {
    it('should capture request body', async () => {
      // Arrange
      const context = createMockContext({
        request: { body: { name: 'John', email: 'john@example.com' } },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          body: { name: 'John', email: 'john@example.com' },
        }),
        expect.any(String),
      );
    });

    it('should capture response body', async () => {
      // Arrange
      const context = createMockContext();
      const handler = createMockHandler({ id: 1, name: 'Created User' });

      // Act
      await watcher.intercept(context, handler).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          responseBody: { id: 1, name: 'Created User' },
        }),
        expect.any(String),
      );
    });

    it('should handle empty body', async () => {
      // Arrange
      const context = createMockContext({
        request: { body: undefined },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          body: undefined,
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Response Status
  // ============================================================================

  describe('response status', () => {
    it('should capture success status code', async () => {
      // Arrange
      const context = createMockContext({
        response: { statusCode: 200, setHeader: jest.fn(), getHeaders: jest.fn().mockReturnValue({}) },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          statusCode: 200,
        }),
        expect.any(String),
      );
    });

    it('should capture created status code', async () => {
      // Arrange
      const context = createMockContext({
        response: { statusCode: 201, setHeader: jest.fn(), getHeaders: jest.fn().mockReturnValue({}) },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          statusCode: 201,
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('error handling', () => {
    it('should capture error response', async () => {
      // Arrange
      const context = createMockContext();
      const error = { status: 500, message: 'Internal Server Error', name: 'Error' };
      const handler = {
        handle: () => throwError(() => error),
      };

      // Act
      try {
        await watcher.intercept(context, handler).toPromise();
      } catch (e) {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          statusCode: 500,
          responseBody: expect.objectContaining({
            error: 'Internal Server Error',
            name: 'Error',
          }),
        }),
        expect.any(String),
      );
    });

    it('should default to 500 status when error has no status', async () => {
      // Arrange
      const context = createMockContext();
      const error = { message: 'Unknown error', name: 'Error' };
      const handler = {
        handle: () => throwError(() => error),
      };

      // Act
      try {
        await watcher.intercept(context, handler).toPromise();
      } catch (e) {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          statusCode: 500,
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Controller Info
  // ============================================================================

  describe('controller info', () => {
    it('should capture controller action', async () => {
      // Arrange
      const context = createMockContext({
        context: {
          getClass: () => ({ name: 'UserController' }),
          getHandler: () => ({ name: 'findAll' }),
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          controllerAction: 'UserController.findAll',
          handler: 'findAll',
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Duration and Memory
  // ============================================================================

  describe('duration and memory', () => {
    it('should capture request duration', async () => {
      // Arrange
      const context = createMockContext();

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
        expect.any(String),
      );
    });

    it('should capture memory usage', async () => {
      // Arrange
      const context = createMockContext();

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          memory: expect.any(Number),
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Body Size Limit (captureBody)
  // ============================================================================

  describe('body size limit', () => {
    it('should truncate large request body', async () => {
      // Arrange
      const largeBody = { data: 'x'.repeat(100000) }; // >64KB
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, maxBodySize: 1000 },
              },
            },
          },
        ],
      }).compile();

      const watcherWithLimit = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { body: largeBody },
      });

      // Act
      await watcherWithLimit.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          body: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
        expect.any(String),
      );
    });

    it('should handle non-serializable body', async () => {
      // Arrange - circular reference
      const circularBody: Record<string, unknown> = { name: 'test' };
      circularBody.self = circularBody;

      const context = createMockContext({
        request: { body: circularBody },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          body: expect.objectContaining({
            _error: 'Unable to serialize body',
          }),
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Controller Info Config
  // ============================================================================

  describe('controller info config', () => {
    it('should skip controller info when captureControllerInfo is false', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureControllerInfo: false },
              },
            },
          },
        ],
      }).compile();

      const watcherNoController = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext();

      // Act
      await watcherNoController.intercept(context, createMockHandler()).toPromise();

      // Assert
      const callArg = mockCollector.collect.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg.controllerAction).toBeUndefined();
      expect(callArg.handler).toBeUndefined();
    });

    it('should handle error when getting controller info', async () => {
      // Arrange
      const context = createMockContext({
        context: {
          getClass: () => { throw new Error('No controller'); },
          getHandler: () => ({ name: 'test' }),
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert - should not throw and should still collect
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // User Capture
  // ============================================================================

  describe('user capture', () => {
    it('should skip user capture when captureUser is false', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureUser: false },
              },
            },
          },
        ],
      }).compile();

      const watcherNoUser = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { user: { id: 1, name: 'John' } },
      });

      // Act
      await watcherNoUser.intercept(context, createMockHandler()).toPromise();

      // Assert
      const callArg = mockCollector.collect.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg.user).toBeUndefined();
    });

    it('should capture user with id, name, email', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureUser: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithUser = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { user: { id: 123, name: 'John Doe', email: 'john@example.com' } },
      });

      // Act
      await watcherWithUser.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          user: { id: 123, name: 'John Doe', email: 'john@example.com' },
        }),
        expect.any(String),
      );
    });

    it('should capture user with alternative field names', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureUser: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithUser = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { user: { _id: 'mongo-id', username: 'johndoe', emailAddress: 'john@test.com' } },
      });

      // Act
      await watcherWithUser.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          user: { id: 'mongo-id', name: 'johndoe', email: 'john@test.com' },
        }),
        expect.any(String),
      );
    });
  });

  // ============================================================================
  // Session Capture
  // ============================================================================

  describe('session capture', () => {
    it('should skip session capture when captureSession is false', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureSession: false },
              },
            },
          },
        ],
      }).compile();

      const watcherNoSession = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: { session: { userId: 1 } },
      });

      // Act
      await watcherNoSession.intercept(context, createMockHandler()).toPromise();

      // Assert
      const callArg = mockCollector.collect.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg.session).toBeUndefined();
    });

    it('should capture session and filter internal properties', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureSession: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithSession = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: {
          session: {
            userId: 123,
            role: 'admin',
            _internal: 'should-be-filtered',
            cookie: 'should-be-filtered',
          },
        },
      });

      // Act
      await watcherWithSession.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          session: { userId: 123, role: 'admin' },
        }),
        expect.any(String),
      );
    });

    it('should return undefined for empty session after filtering', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureSession: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithSession = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        request: {
          session: { _private: 'value', cookie: 'session-cookie' },
        },
      });

      // Act
      await watcherWithSession.intercept(context, createMockHandler()).toPromise();

      // Assert
      const callArg = mockCollector.collect.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg.session).toBeUndefined();
    });
  });

  // ============================================================================
  // Response Headers Capture
  // ============================================================================

  describe('response headers capture', () => {
    it('should skip response headers when captureResponseHeaders is false', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureResponseHeaders: false },
              },
            },
          },
        ],
      }).compile();

      const watcherNoRespHeaders = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        response: {
          statusCode: 200,
          setHeader: jest.fn(),
          getHeaders: jest.fn().mockReturnValue({ 'content-type': 'application/json' }),
        },
      });

      // Act
      await watcherNoRespHeaders.intercept(context, createMockHandler()).toPromise();

      // Assert
      const callArg = mockCollector.collect.mock.calls[0][1] as Record<string, unknown>;
      expect(callArg.responseHeaders).toBeUndefined();
    });

    it('should capture response headers with different value types', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureResponseHeaders: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithRespHeaders = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        response: {
          statusCode: 200,
          setHeader: jest.fn(),
          getHeaders: jest.fn().mockReturnValue({
            'content-type': 'application/json',
            'content-length': 1234,
            'set-cookie': ['cookie1=value1', 'cookie2=value2'],
          }),
        },
      });

      // Act
      await watcherWithRespHeaders.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          responseHeaders: {
            'content-type': 'application/json',
            'content-length': '1234',
            'set-cookie': 'cookie1=value1, cookie2=value2',
          },
        }),
        expect.any(String),
      );
    });

    it('should handle error when capturing response headers', async () => {
      // Arrange
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, captureResponseHeaders: true },
              },
            },
          },
        ],
      }).compile();

      const watcherWithRespHeaders = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext({
        response: {
          statusCode: 200,
          setHeader: jest.fn(),
          getHeaders: jest.fn().mockImplementation(() => { throw new Error('Header error'); }),
        },
      });

      // Act
      await watcherWithRespHeaders.intercept(context, createMockHandler()).toPromise();

      // Assert - should not throw and should still collect
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Custom Tags
  // ============================================================================

  describe('custom tags', () => {
    it('should call tags function when configured', async () => {
      // Arrange
      const tagsFn = jest.fn().mockResolvedValue(['important', 'api-v2']);
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, tags: tagsFn },
              },
            },
          },
        ],
      }).compile();

      const watcherWithTags = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext();

      // Act
      await watcherWithTags.intercept(context, createMockHandler()).toPromise();

      // Assert - tags function was called with request
      expect(tagsFn).toHaveBeenCalled();
    });

    it('should not throw when tags function returns empty array', async () => {
      // Arrange
      const tagsFn = jest.fn().mockResolvedValue([]);
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, tags: tagsFn },
              },
            },
          },
        ],
      }).compile();

      const watcherWithTags = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext();

      // Act & Assert - should complete without throwing
      await expect(
        watcherWithTags.intercept(context, createMockHandler()).toPromise()
      ).resolves.toBeDefined();
      expect(tagsFn).toHaveBeenCalled();
    });

    it('should not throw when tags function throws error', async () => {
      // Arrange
      const tagsFn = jest.fn().mockRejectedValue(new Error('Tags error'));
      const module = await Test.createTestingModule({
        providers: [
          RequestWatcher,
          { provide: CollectorService, useValue: mockCollector },
          {
            provide: NESTLENS_CONFIG,
            useValue: {
              path: '/nestlens',
              watchers: {
                request: { enabled: true, tags: tagsFn },
              },
            },
          },
        ],
      }).compile();

      const watcherWithTags = module.get<RequestWatcher>(RequestWatcher);
      const context = createMockContext();

      // Act & Assert - should complete without throwing
      await expect(
        watcherWithTags.intercept(context, createMockHandler()).toPromise()
      ).resolves.toBeDefined();
      expect(tagsFn).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // X-Forwarded-For Edge Cases
  // ============================================================================

  describe('x-forwarded-for edge cases', () => {
    it('should handle array x-forwarded-for header', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          ip: '127.0.0.1',
          headers: { 'x-forwarded-for': ['10.0.0.1', '192.168.1.1'] },
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          ip: '10.0.0.1',
        }),
        expect.any(String),
      );
    });

    it('should use socket remoteAddress when ip is undefined', async () => {
      // Arrange
      const context = createMockContext({
        request: {
          ip: undefined,
          socket: { remoteAddress: '172.16.0.1' },
          headers: {},
        },
      });

      // Act
      await watcher.intercept(context, createMockHandler()).toPromise();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          ip: '172.16.0.1',
        }),
        expect.any(String),
      );
    });
  });
});
