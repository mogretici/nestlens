/**
 * HttpClientWatcher Tests
 *
 * Tests for the HTTP client watcher that monitors outgoing HTTP requests.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { HttpClientWatcher, NESTLENS_HTTP_CLIENT } from '../../watchers/http-client.watcher';

describe('HttpClientWatcher', () => {
  let watcher: HttpClientWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;
  let requestInterceptor: { onFulfilled: Function; onRejected: Function };
  let responseInterceptor: { onFulfilled: Function; onRejected: Function };

  const createAxiosInstance = () => {
    const interceptors = {
      request: {
        use: jest.fn((onFulfilled, onRejected) => {
          requestInterceptor = { onFulfilled, onRejected };
          return 0;
        }),
      },
      response: {
        use: jest.fn((onFulfilled, onRejected) => {
          responseInterceptor = { onFulfilled, onRejected };
          return 0;
        }),
      },
    };
    return { interceptors };
  };

  const createWatcher = async (
    config: NestLensConfig,
    axiosInstance?: ReturnType<typeof createAxiosInstance>,
  ): Promise<HttpClientWatcher> => {
    const providers: any[] = [
      HttpClientWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (axiosInstance !== undefined) {
      providers.push({ provide: NESTLENS_HTTP_CLIENT, useValue: axiosInstance });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<HttpClientWatcher>(HttpClientWatcher);
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
        httpClient: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when httpClient watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { httpClient: true };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when httpClient watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { httpClient: false };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);

      // Act
      watcher.onModuleInit();

      // Assert - should not setup interceptors
      expect(axios.interceptors.request.use).not.toHaveBeenCalled();
    });

    it('should use default maxBodySize of 64KB', async () => {
      // Arrange
      mockConfig.watchers = { httpClient: true };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);

      // Assert
      expect((watcher as any).maxBodySize).toBe(64 * 1024);
    });

    it('should use custom maxBodySize from config', async () => {
      // Arrange
      mockConfig.watchers = { httpClient: { enabled: true, maxBodySize: 1024 } };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);

      // Assert
      expect((watcher as any).maxBodySize).toBe(1024);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing axios instance gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when axios is available', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);

      // Act
      watcher.onModuleInit();

      // Assert
      expect(axios.interceptors.request.use).toHaveBeenCalled();
      expect(axios.interceptors.response.use).toHaveBeenCalled();
    });

    it('should handle invalid axios instance', async () => {
      // Arrange
      const invalidAxios = {};
      watcher = await createWatcher(mockConfig, invalidAxios as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Request Interceptor
  // ============================================================================

  describe('Request Interceptor', () => {
    it('should add start time metadata to request', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const config = { url: 'https://api.example.com/users' };

      // Act
      const result = requestInterceptor.onFulfilled(config);

      // Assert
      expect(result.metadata.nestlensStartTime).toBeDefined();
      expect(typeof result.metadata.nestlensStartTime).toBe('number');
    });

    it('should preserve existing metadata', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const config = {
        url: 'https://api.example.com/users',
        metadata: { existingKey: 'existingValue' },
      };

      // Act
      const result = requestInterceptor.onFulfilled(config);

      // Assert
      expect(result.metadata.existingKey).toBe('existingValue');
      expect(result.metadata.nestlensStartTime).toBeDefined();
    });

    it('should reject errors in request interceptor', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const error = new Error('Request setup failed');

      // Act & Assert
      await expect(requestInterceptor.onRejected(error)).rejects.toThrow('Request setup failed');
    });
  });

  // ============================================================================
  // Response Interceptor - Success
  // ============================================================================

  describe('Response Interceptor - Success', () => {
    it('should collect successful response', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() - 100 },
        },
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { users: [] },
      };

      // Act
      const result = responseInterceptor.onFulfilled(response);

      // Assert
      expect(result).toBe(response);
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/users',
          statusCode: 200,
        }),
      );
    });

    it('should parse URL hostname and path', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/v1/users?page=1',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 201,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          hostname: 'api.example.com',
          path: '/v1/users?page=1',
        }),
      );
    });

    it('should calculate request duration', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() - 150 },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Response Interceptor - Error
  // ============================================================================

  describe('Response Interceptor - Error', () => {
    it('should collect failed response', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const error = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() },
        },
        response: {
          status: 500,
          headers: {},
          data: { error: 'Internal Server Error' },
        },
        message: 'Request failed with status code 500',
      };

      // Act
      try {
        await responseInterceptor.onRejected(error);
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          statusCode: 500,
          error: 'Request failed with status code 500',
        }),
      );
    });

    it('should handle network errors (no response)', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const error = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() },
        },
        message: 'Network Error',
      };

      // Act
      try {
        await responseInterceptor.onRejected(error);
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          error: 'Network Error',
          statusCode: undefined,
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const error = new Error('Connection refused');
      (error as any).config = { url: 'https://api.example.com' };

      // Act & Assert
      await expect(responseInterceptor.onRejected(error)).rejects.toThrow('Connection refused');
    });
  });

  // ============================================================================
  // Ignored Hosts
  // ============================================================================

  describe('Ignored Hosts', () => {
    it('should skip ignored hosts', async () => {
      // Arrange
      mockConfig.watchers = {
        httpClient: { enabled: true, ignoreHosts: ['localhost', 'internal.service'] },
      };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'http://localhost:3000/api/health',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should collect non-ignored hosts', async () => {
      // Arrange
      mockConfig.watchers = {
        httpClient: { enabled: true, ignoreHosts: ['localhost'] },
      };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Header Masking
  // ============================================================================

  describe('Header Masking', () => {
    it('should mask sensitive headers', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {
            Authorization: 'Bearer secret-token',
            Cookie: 'session=abc123',
            'Content-Type': 'application/json',
          },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestHeaders: expect.objectContaining({
            Authorization: '********',
            Cookie: '********',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should mask custom sensitive headers', async () => {
      // Arrange
      mockConfig.watchers = {
        httpClient: { enabled: true, sensitiveHeaders: ['X-Custom-Secret'] },
      };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {
            'X-Custom-Secret': 'my-secret',
            'X-Request-Id': '123',
          },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestHeaders: expect.objectContaining({
            'X-Custom-Secret': '********',
            'X-Request-Id': '123',
          }),
        }),
      );
    });
  });

  // ============================================================================
  // Body Masking
  // ============================================================================

  describe('Body Masking', () => {
    it('should mask sensitive request params', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/login',
          data: {
            username: 'testuser',
            password: 'secret123',
          },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            username: 'testuser',
            password: '********',
          }),
        }),
      );
    });

    it('should mask sensitive response params', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/oauth/token',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {
          access_token: 'eyJhbGc...',
          refresh_token: 'dGhpcyBpcyBhIHNlY3JldA==',
          expires_in: 3600,
        },
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          responseBody: expect.objectContaining({
            access_token: '********',
            refresh_token: '********',
            expires_in: 3600,
          }),
        }),
      );
    });

    it('should handle nested sensitive data', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/users',
          data: {
            user: {
              name: 'Test',
              credentials: {
                password: 'secret',
              },
            },
          },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            user: expect.objectContaining({
              name: 'Test',
              credentials: expect.objectContaining({
                password: '********',
              }),
            }),
          }),
        }),
      );
    });
  });

  // ============================================================================
  // Body Capture Configuration
  // ============================================================================

  describe('Body Capture Configuration', () => {
    it('should skip request body when captureRequestBody is false', async () => {
      // Arrange
      mockConfig.watchers = {
        httpClient: { enabled: true, captureRequestBody: false },
      };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/users',
          data: { name: 'Test' },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: undefined,
        }),
      );
    });

    it('should skip response body when captureResponseBody is false', async () => {
      // Arrange
      mockConfig.watchers = {
        httpClient: { enabled: true, captureResponseBody: false },
      };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: 'https://api.example.com/users',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: { users: [] },
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          responseBody: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Large Body Handling
  // ============================================================================

  describe('Large Body Handling', () => {
    it('should truncate large request bodies', async () => {
      // Arrange
      mockConfig.watchers = { httpClient: { enabled: true, maxBodySize: 100 } };
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/users',
          data: { largeField: 'x'.repeat(200) },
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle deeply nested objects with max depth', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      // Create a deeply nested object that exceeds MAX_MASK_DEPTH
      let deeplyNested: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        deeplyNested = { nested: deeplyNested };
      }

      const response = {
        config: {
          method: 'POST',
          url: 'https://api.example.com/users',
          data: deeplyNested,
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert - deeply nested object should be truncated at max depth
      expect(mockCollector.collect).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // setupInterceptors (Manual Setup)
  // ============================================================================

  describe('setupInterceptors (Manual Setup)', () => {
    it('should setup interceptors on custom axios instance', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      const customAxios = createAxiosInstance();

      // Act
      watcher.setupInterceptors(customAxios);

      // Assert
      expect(customAxios.interceptors.request.use).toHaveBeenCalled();
      expect(customAxios.interceptors.response.use).toHaveBeenCalled();
    });

    it('should handle HttpService with axiosRef', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      const innerAxios = createAxiosInstance();
      const httpService = {
        interceptors: {}, // Invalid
        axiosRef: innerAxios,
      };

      // Act
      watcher.setupInterceptors(httpService);

      // Assert
      expect(innerAxios.interceptors.request.use).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Relative URLs
  // ============================================================================

  describe('Relative URLs', () => {
    it('should handle relative URLs', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          method: 'GET',
          url: '/api/users',
          metadata: { nestlensStartTime: Date.now() },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          url: '/api/users',
          path: '/api/users',
          hostname: undefined,
        }),
      );
    });
  });

  // ============================================================================
  // Missing Config
  // ============================================================================

  describe('Missing Config', () => {
    it('should handle missing config in response', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: undefined,
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert - should not throw, should not collect
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Header Value Types
  // ============================================================================

  describe('Header Value Types', () => {
    it('should handle numeric header values', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: { url: 'https://api.example.com/test', method: 'get', headers: {} },
        status: 200,
        headers: { 'content-length': 1234 },
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          responseHeaders: expect.objectContaining({
            'content-length': '1234',
          }),
        }),
      );
    });

    it('should handle boolean header values', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: { url: 'https://api.example.com/test', method: 'get', headers: {} },
        status: 200,
        headers: { 'x-cached': true },
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          responseHeaders: expect.objectContaining({
            'x-cached': 'true',
          }),
        }),
      );
    });

    it('should handle array header values', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: { url: 'https://api.example.com/test', method: 'get', headers: {} },
        status: 200,
        headers: { 'x-custom-values': ['value1', 'value2'] },
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert - array values should be joined with comma
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          responseHeaders: expect.objectContaining({
            'x-custom-values': 'value1, value2',
          }),
        }),
      );
    });
  });

  // ============================================================================
  // Sensitive Data Masking Edge Cases
  // ============================================================================

  describe('Sensitive Data Masking', () => {
    it('should mask sensitive data in nested arrays', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const response = {
        config: {
          url: 'https://api.example.com/test',
          method: 'post',
          headers: {},
          data: {
            users: [
              { name: 'John', password: 'secret1' },
              { name: 'Jane', password: 'secret2' },
            ],
          },
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            users: expect.arrayContaining([expect.objectContaining({ password: '********' })]),
          }),
        }),
      );
    });

    it('should handle circular reference in body via max depth truncation', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      const response = {
        config: {
          url: 'https://api.example.com/test',
          method: 'post',
          headers: {},
          data: circularObj,
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert - circular reference is handled via max depth limit
      // The implementation traverses until MAX_MASK_DEPTH (10) and truncates
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: 'test',
            self: expect.any(Object),
          }),
        }),
      );
    });

    it('should return error for truly unserializable body', async () => {
      // Arrange
      const axios = createAxiosInstance();
      watcher = await createWatcher(mockConfig, axios);
      watcher.onModuleInit();

      // Create an object with BigInt which cannot be JSON.stringify'd
      const unserializableObj = { value: BigInt(123) };

      const response = {
        config: {
          url: 'https://api.example.com/test',
          method: 'post',
          headers: {},
          data: unserializableObj,
        },
        status: 200,
        headers: {},
        data: {},
      };

      // Act
      responseInterceptor.onFulfilled(response);

      // Assert - BigInt causes JSON.stringify to fail
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'http-client',
        expect.objectContaining({
          requestBody: expect.objectContaining({
            _error: 'Unable to serialize body',
          }),
        }),
      );
    });
  });
});
