import { Inject, Injectable, OnModuleInit, Optional, Logger } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import {
  HttpClientWatcherConfig,
  NestLensConfig,
  NESTLENS_CONFIG,
} from '../nestlens.config';
import { HttpClientEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AxiosInstance = any;

// Token for injecting custom axios instance
export const NESTLENS_HTTP_CLIENT = Symbol('NESTLENS_HTTP_CLIENT');

@Injectable()
export class HttpClientWatcher implements OnModuleInit {
  private readonly logger = new Logger(HttpClientWatcher.name);
  private readonly config: HttpClientWatcherConfig;
  private readonly maxBodySize: number;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_HTTP_CLIENT)
    private readonly axiosInstance?: AxiosInstance,
  ) {
    const watcherConfig = nestlensConfig.watchers?.httpClient;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false };
    this.maxBodySize = this.config.maxBodySize || 64 * 1024; // 64KB default
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
  setupInterceptors(axiosInstance: AxiosInstance): void {
    if (!axiosInstance || typeof axiosInstance.interceptors !== 'object') {
      this.logger.warn('Invalid axios instance provided');
      return;
    }

    const axios = axiosInstance.axiosRef || axiosInstance;

    // Request interceptor - capture start time
    axios.interceptors.request.use(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config: any) => {
        config.metadata = {
          ...config.metadata,
          nestlensStartTime: Date.now(),
        };
        return config;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error: any) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor - capture response and log
    axios.interceptors.response.use(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        this.collectEntry(response.config, response.status, response.headers, response.data);
        return response;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error: any) => {
        const config = error.config;
        const status = error.response?.status;
        const headers = error.response?.headers;
        const data = error.response?.data;

        this.collectEntry(
          config,
          status,
          headers,
          data,
          error.message,
        );

        return Promise.reject(error);
      },
    );

    this.logger.log('HTTP Client interceptors installed');
  }

  private collectEntry(
    config: {
      metadata?: { nestlensStartTime?: number };
      method?: string;
      url?: string;
      headers?: Record<string, unknown>;
      data?: unknown;
    } | undefined,
    statusCode?: number,
    responseHeaders?: Record<string, unknown>,
    responseData?: unknown,
    errorMessage?: string,
  ): void {
    if (!config) return;

    const startTime = config.metadata?.nestlensStartTime || Date.now();
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

    // Merge default and custom sensitive params
    const sensitiveRequestParams = [
      ...HttpClientWatcher.DEFAULT_SENSITIVE_REQUEST_PARAMS,
      ...(this.config.sensitiveRequestParams || []),
    ];
    const sensitiveResponseParams = [
      ...HttpClientWatcher.DEFAULT_SENSITIVE_RESPONSE_PARAMS,
      ...(this.config.sensitiveResponseParams || []),
    ];

    const payload: HttpClientEntry['payload'] = {
      method: (config.method || 'GET').toUpperCase(),
      url: fullUrl,
      hostname,
      path,
      requestHeaders: this.captureHeaders(config.headers),
      requestBody:
        this.config.captureRequestBody !== false
          ? this.captureBody(config.data, sensitiveRequestParams)
          : undefined,
      statusCode,
      responseHeaders: this.captureHeaders(responseHeaders),
      responseBody:
        this.config.captureResponseBody !== false
          ? this.captureBody(responseData, sensitiveResponseParams)
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

  private captureHeaders(
    headers?: Record<string, unknown>,
  ): Record<string, string> | undefined {
    if (!headers) return undefined;

    const sensitiveHeaders = [
      ...HttpClientWatcher.DEFAULT_SENSITIVE_HEADERS,
      ...(this.config.sensitiveHeaders || []),
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
  private maskSensitiveData(
    data: unknown,
    sensitiveKeys: string[],
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
      return data.map((item) =>
        this.maskSensitiveData(item, sensitiveKeys, replacement, depth + 1),
      );
    }

    const masked: Record<string, unknown> = {};
    const lowerSensitiveKeys = sensitiveKeys.map((k) => k.toLowerCase());

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      // Check if key contains any sensitive pattern
      const isSensitive = lowerSensitiveKeys.some((s) => lowerKey.includes(s));

      if (isSensitive) {
        masked[key] = replacement;
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveData(value, sensitiveKeys, replacement, depth + 1);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  private captureBody(
    body: unknown,
    sensitiveParams: string[],
  ): unknown {
    if (body === undefined || body === null) return undefined;

    try {
      // First mask sensitive data
      const maskedBody = this.maskSensitiveData(body, sensitiveParams);

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
