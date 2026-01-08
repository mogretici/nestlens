import { Injectable } from '@nestjs/common';

/**
 * Configuration for data masking behavior.
 */
export interface DataMaskerConfig {
  /** Headers to mask (case-insensitive) */
  sensitiveHeaders?: string[];
  /** Body/query parameter names to mask (case-insensitive) */
  sensitiveParams?: string[];
  /** User object fields to mask (case-insensitive) */
  sensitiveUserFields?: string[];
  /** Replacement string for masked values */
  maskReplacement?: string;
  /** Whether to sanitize stack traces in production */
  sanitizeStackTraces?: boolean;
}

/**
 * Default sensitive headers that should always be masked.
 */
const DEFAULT_SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-csrf-token',
  'proxy-authorization',
];

/**
 * Default sensitive body/query parameters that should always be masked.
 */
const DEFAULT_SENSITIVE_PARAMS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'refresh_token',
  'auth_token',
  'credit_card',
  'creditcard',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'social_security',
  'private_key',
  'privatekey',
];

/**
 * Default sensitive user fields that should always be masked.
 */
const DEFAULT_SENSITIVE_USER_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'hashedPassword',
  'token',
  'apiKey',
  'api_key',
  'secret',
];

const DEFAULT_MASK = '***REDACTED***';

/**
 * Service for masking sensitive data in entries.
 * Prevents sensitive information from being stored or displayed.
 */
@Injectable()
export class DataMaskerService {
  private readonly sensitiveHeaders: Set<string>;
  private readonly sensitiveParams: Set<string>;
  private readonly sensitiveUserFields: Set<string>;
  private readonly maskReplacement: string;
  private readonly sanitizeStackTraces: boolean;
  private readonly isProduction: boolean;

  constructor(config?: DataMaskerConfig) {
    const headers = [...DEFAULT_SENSITIVE_HEADERS, ...(config?.sensitiveHeaders || [])];
    const params = [...DEFAULT_SENSITIVE_PARAMS, ...(config?.sensitiveParams || [])];
    const userFields = [...DEFAULT_SENSITIVE_USER_FIELDS, ...(config?.sensitiveUserFields || [])];

    this.sensitiveHeaders = new Set(headers.map((h) => h.toLowerCase()));
    this.sensitiveParams = new Set(params.map((p) => p.toLowerCase()));
    this.sensitiveUserFields = new Set(userFields.map((f) => f.toLowerCase()));
    this.maskReplacement = config?.maskReplacement || DEFAULT_MASK;
    this.sanitizeStackTraces = config?.sanitizeStackTraces ?? true;
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Mask sensitive headers.
   */
  maskHeaders(headers: Record<string, unknown>): Record<string, string> {
    if (!headers || typeof headers !== 'object') {
      return {};
    }

    const masked: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveHeaders.has(lowerKey)) {
        masked[key] = this.maskReplacement;
      } else {
        masked[key] = String(value ?? '');
      }
    }

    return masked;
  }

  /**
   * Mask sensitive data in request/response body.
   */
  maskBody(body: unknown): unknown {
    if (body === null || body === undefined) {
      return body;
    }

    if (typeof body === 'string') {
      // Try to parse JSON and mask it
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(this.maskObject(parsed));
      } catch {
        return body;
      }
    }

    if (Array.isArray(body)) {
      return body.map((item) => this.maskBody(item));
    }

    if (typeof body === 'object') {
      return this.maskObject(body as Record<string, unknown>);
    }

    return body;
  }

  /**
   * Mask sensitive fields in an object recursively.
   */
  private maskObject(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      if (this.sensitiveParams.has(lowerKey)) {
        masked[key] = this.maskReplacement;
      } else if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          masked[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? this.maskObject(item as Record<string, unknown>)
              : item,
          );
        } else {
          masked[key] = this.maskObject(value as Record<string, unknown>);
        }
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Mask sensitive user information.
   */
  maskUserInfo(user: unknown): Record<string, unknown> | null {
    if (!user || typeof user !== 'object') {
      return null;
    }

    const masked: Record<string, unknown> = {};
    const userObj = user as Record<string, unknown>;

    for (const [key, value] of Object.entries(userObj)) {
      const lowerKey = key.toLowerCase();

      if (this.sensitiveUserFields.has(lowerKey)) {
        masked[key] = this.maskReplacement;
      } else if (value !== null && typeof value === 'object') {
        masked[key] = this.maskUserInfo(value);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Sanitize stack traces for security.
   * In production, removes file paths and line numbers.
   */
  sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) {
      return undefined;
    }

    if (!this.sanitizeStackTraces || !this.isProduction) {
      return stack;
    }

    // In production, simplify the stack trace
    return stack
      .split('\n')
      .map((line) => {
        // Remove absolute file paths, keep only relative paths
        return line.replace(/\(\/[^)]+\)/g, '(...)');
      })
      .slice(0, 10) // Limit to first 10 lines
      .join('\n');
  }

  /**
   * Check if a key is sensitive.
   */
  isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return (
      this.sensitiveHeaders.has(lowerKey) ||
      this.sensitiveParams.has(lowerKey) ||
      this.sensitiveUserFields.has(lowerKey)
    );
  }

  /**
   * Get the mask replacement string.
   */
  getMaskReplacement(): string {
    return this.maskReplacement;
  }
}
