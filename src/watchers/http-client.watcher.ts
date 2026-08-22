import { Inject, Injectable, OnModuleInit, Optional, Logger } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { createTermMatcher } from '../core/data-masker.service';
import { HttpClientWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { HttpClientEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';

/**
 * The axios surface this watcher touches.
 *
 * axios is an optional peer, so its types cannot be imported — these describe
 * the runtime shape instead. Anything accepting an instance takes `unknown`
 * and narrows here, so callers can pass a real `AxiosInstance` or an
 * `HttpService` without a type conflict.
 */
interface RequestConfigLike {
  metadata?: { nestlensStartTime?: number };
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  data?: unknown;
}

interface ResponseLike {
  config: RequestConfigLike;
  status?: number;
  headers?: Record<string, unknown>;
  data?: unknown;
}

interface RequestErrorLike {
  config?: RequestConfigLike;
  message?: string;
  response?: { status?: number; headers?: Record<string, unknown>; data?: unknown };
}

interface InterceptorManager<T> {
  use(onFulfilled: (value: T) => T, onRejected: (error: unknown) => unknown): unknown;
}

interface AxiosLike {
  interceptors: {
    request: InterceptorManager<RequestConfigLike>;
    response: InterceptorManager<ResponseLike>;
  };
}

function hasInterceptors(value: unknown): value is AxiosLike {
  if (!value || typeof value !== 'object') return false;
  const { interceptors } = value as { interceptors?: unknown };
  if (!interceptors || typeof interceptors !== 'object') return false;

  const { request, response } = interceptors as { request?: unknown; response?: unknown };

  return (
    typeof (request as InterceptorManager<unknown> | undefined)?.use === 'function' &&
    typeof (response as InterceptorManager<unknown> | undefined)?.use === 'function'
  );
}

// Token for injecting custom axios instance
export const NESTLENS_HTTP_CLIENT = Symbol('NESTLENS_HTTP_CLIENT');

@Injectable()
export class HttpClientWatcher implements OnModuleInit {
  private readonly logger = new Logger(HttpClientWatcher.name);
  private readonly config: HttpClientWatcherConfig;
  private readonly maxBodySize: number;
  private matchesRequestParam?: (fieldName: string) => boolean;
  private matchesResponseParam?: (fieldName: string) => boolean;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_HTTP_CLIENT)
    private readonly axiosInstance?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.httpClient;
    this.config = resolveWatcherConfig(watcherConfig);
    this.maxBodySize = this.config.maxBodySize ?? 64 * 1024; // 64KB default; 0 captures nothing
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if axios instance was provided
    if (!this.axiosInstance) {
      this.logger.debug(
        'HttpClientWatcher: No axios instance provided. ' +
          'To enable HTTP client tracking, provide your axios/HttpService instance with NESTLENS_HTTP_CLIENT token.',
      );
      return;
    }

    this.setupInterceptors(this.axiosInstance);
  }

  /**
   * Setup interceptors on an axios instance.
   * Can be called manually if you want to track a specific axios instance.
   */
  setupInterceptors(axiosInstance: unknown): void {
    // @nestjs/axios wraps the real instance behind `axiosRef`.
    const candidate =
      (axiosInstance as { axiosRef?: unknown } | undefined)?.axiosRef ?? axiosInstance;

    if (!hasInterceptors(candidate)) {
      this.logger.warn('Invalid axios instance provided');
      return;
    }

    // Request interceptor - capture start time
    candidate.interceptors.request.use(
      (config) => {
        config.metadata = {
          ...config.metadata,
          nestlensStartTime: Date.now(),
        };
        return config;
      },
      (error: unknown) => Promise.reject(error),
    );

    // Response interceptor - capture response and log
    candidate.interceptors.response.use(
      (response) => {
        this.collectEntry(response.config, response.status, response.headers, response.data);
        return response;
      },
      (error: unknown) => {
        const { config, response, message } = (error ?? {}) as RequestErrorLike;

        this.collectEntry(config, response?.status, response?.headers, response?.data, message);

        return Promise.reject(error);
      },
    );

    this.logger.log('HTTP Client interceptors installed');
  }

  private collectEntry(
    config:
      | {
          metadata?: { nestlensStartTime?: number };
          method?: string;
          url?: string;
          headers?: Record<string, unknown>;
          data?: unknown;
        }
      | undefined,
    statusCode?: number,
    responseHeaders?: Record<string, unknown>,
    responseData?: unknown,
    errorMessage?: string,
  ): void {
    if (!config) return;

    const startTime = config.metadata?.nestlensStartTime ?? Date.now();
    const duration = Date.now() - startTime;

    // Parse URL
    let hostname: string | undefined;
    let path: string | undefined;
    const fullUrl = config.url || '';

    try {
      const url = new URL(fullUrl);
      hostname = url.hostname;
      path = url.pathname + url.search;
    } catch {
      // Relative URL or invalid
      path = fullUrl;
    }

    // Check if host should be ignored
    if (hostname && this.config.ignoreHosts?.some((h) => hostname?.includes(h))) {
      return;
    }

    // Built once per watcher rather than per request: the lists do not change
    // after construction and the matcher remembers the answers it has given.
    const matchesRequestParam = (this.matchesRequestParam ??= createTermMatcher([
      ...HttpClientWatcher.DEFAULT_SENSITIVE_REQUEST_PARAMS,
      ...(this.config.sensitiveRequestParams ?? []),
    ]));
    const matchesResponseParam = (this.matchesResponseParam ??= createTermMatcher([
      ...HttpClientWatcher.DEFAULT_SENSITIVE_RESPONSE_PARAMS,
      ...(this.config.sensitiveResponseParams ?? []),
    ]));

    const payload: HttpClientEntry['payload'] = {
      method: (config.method || 'GET').toUpperCase(),
      url: fullUrl,
      hostname,
      path,
      requestHeaders: this.captureHeaders(config.headers),
      requestBody:
        this.config.captureRequestBody !== false
          ? this.captureBody(config.data, matchesRequestParam)
          : undefined,
      statusCode,
      responseHeaders: this.captureHeaders(responseHeaders),
      responseBody:
        this.config.captureResponseBody !== false
          ? this.captureBody(responseData, matchesResponseParam)
          : undefined,
      duration,
      error: errorMessage,
    };

    this.collector.collect('http-client', payload);
  }

  // Default sensitive headers to mask
  private static readonly DEFAULT_SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
  ];

  // Default sensitive request params to mask
  private static readonly DEFAULT_SENSITIVE_REQUEST_PARAMS = [
    'password',
    'password_confirmation',
    'current_password',
    'new_password',
    'credit_card',
    'card_number',
    'cvv',
    'cvc',
    'pin',
    'ssn',
    'social_security',
    'secret',
  ];

  // Default sensitive response params to mask
  private static readonly DEFAULT_SENSITIVE_RESPONSE_PARAMS = [
    'access_token',
    'refresh_token',
    'api_key',
    'api_secret',
    'private_key',
    'secret',
    'token',
  ];

  private captureHeaders(headers?: Record<string, unknown>): Record<string, string> | undefined {
    if (!headers) return undefined;

    const sensitiveHeaders = [
      ...HttpClientWatcher.DEFAULT_SENSITIVE_HEADERS,
      ...(this.config.sensitiveHeaders ?? []),
    ].map((h) => h.toLowerCase());

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        result[key] = '********';
      } else if (typeof value === 'string') {
        result[key] = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = String(value);
      } else if (Array.isArray(value)) {
        result[key] = value.join(', ');
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Maximum recursion depth for masking to prevent stack overflow
  private static readonly MAX_MASK_DEPTH = 10;

  /**
   * Recursively mask sensitive data in objects
   * Includes depth limiting to prevent stack overflow on deeply nested objects
   */
  /**
   * Replaces the values of fields a term covers.
   *
   * Through the collector's matcher, so a term means here what it means there.
   * This used to compare `key.toLowerCase()` against the raw terms, which only
   * matches the spelling the term happens to be written in: a reader who set
   * `sensitiveRequestParams: ['internal_ref']` for a payload holding
   * `internalRef` got the value recorded in full, and the collector's own
   * masking could not save them because the term was theirs, not one of its
   * defaults.
   */
  private maskSensitiveData(
    data: unknown,
    matches: (fieldName: string) => boolean,
    replacement = '********',
    depth = 0,
  ): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    // Prevent stack overflow on deeply nested objects
    if (depth >= HttpClientWatcher.MAX_MASK_DEPTH) {
      return { _truncated: true, _reason: 'max_depth_exceeded' };
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item, matches, replacement, depth + 1));
    }

    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (matches(key)) {
        masked[key] = replacement;
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveData(value, matches, replacement, depth + 1);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  private captureBody(body: unknown, matches: (fieldName: string) => boolean): unknown {
    if (body === undefined || body === null) return undefined;

    try {
      // First mask sensitive data
      const maskedBody = this.maskSensitiveData(body, matches);

      // Then check size
      const json = JSON.stringify(maskedBody);
      if (json.length > this.maxBodySize) {
        return { _truncated: true, _size: json.length };
      }
      return maskedBody;
    } catch {
      return { _error: 'Unable to serialize body' };
    }
  }
}
