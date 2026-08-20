import { Injectable } from '@nestjs/common';
import { isSanitized } from './sanitized-payload';

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
  /**
   * How much of a stack trace to keep, as documented under
   * `security.stackTraceSanitization`.
   *
   * `none` keeps it whole, `partial` drops absolute paths and keeps the first
   * frames, `full` removes it. Overrides `sanitizeStackTraces` when given.
   */
  stackTraceSanitization?: StackTraceSanitization;
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

export type StackTraceSanitization = 'none' | 'partial' | 'full';

const DEFAULT_MASK = '***REDACTED***';

/**
 * Service for masking sensitive data in entries.
 * Prevents sensitive information from being stored or displayed.
 */
/**
 * A field name reduced to letters and digits, lower case.
 *
 * `access_token`, `access-token` and `accessToken` are the same field written
 * three ways, and a payload uses whichever the framework or the author
 * preferred. Comparing the reduced forms means the term list does not have to
 * enumerate them.
 */
const normalizeFieldName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether a field name contains any of the terms.
 *
 * Containment rather than equality: the list held `password`, and payloads hold
 * `confirmPassword`, `currentPassword`, `passwordConfirmation`. Every one of
 * those went to storage and to the dashboard in the clear, as did
 * `accessToken`, `refreshToken`, `clientSecret` and `stripeSecretKey` — the
 * names real payloads actually use.
 *
 * It masks more than it strictly must — `tokenCount` goes too — which is the
 * right direction for something recording production traffic. A field that
 * should be readable can be kept by narrowing the configured list.
 */
const matchesSensitiveTerm = (fieldName: string, terms: readonly string[]): boolean => {
  const normalized = normalizeFieldName(fieldName);

  return terms.some((term) => term.length > 0 && normalized.includes(term));
};

/**
 * Replaces `(/absolute/path/to/file.js:1:2)` with `(...)`.
 *
 * Scanned rather than matched. The regex this replaces —
 * `/\(\/[^)]+\)/g` — backtracks from every `(/` in a line with no closing
 * parenthesis, which is quadratic in the length of a line that arrives inside
 * an exception NestLens did not throw. A stack frame is attacker-influenced
 * often enough — a thrown string, a message echoed back from a request — and
 * this runs on every entry that carries one.
 */
function replaceParenthesisedPaths(line: string): string {
  let result = '';
  let index = 0;

  while (index < line.length) {
    const open = line.indexOf('(/', index);
    if (open === -1) break;

    const close = line.indexOf(')', open + 2);
    if (close === -1) break;

    result += line.slice(index, open) + '(...)';
    index = close + 1;
  }

  return result + line.slice(index);
}

@Injectable()
export class DataMaskerService {
  private readonly sensitiveHeaders: readonly string[];
  private readonly sensitiveParams: readonly string[];
  private readonly sensitiveUserFields: readonly string[];
  private readonly maskReplacement: string;
  private readonly sanitizeStackTraces: boolean;
  private readonly stackTraceSanitization: StackTraceSanitization;
  private readonly isProduction: boolean;

  constructor(config?: DataMaskerConfig) {
    const headers = [...DEFAULT_SENSITIVE_HEADERS, ...(config?.sensitiveHeaders ?? [])];
    const params = [...DEFAULT_SENSITIVE_PARAMS, ...(config?.sensitiveParams ?? [])];
    const userFields = [...DEFAULT_SENSITIVE_USER_FIELDS, ...(config?.sensitiveUserFields ?? [])];

    this.sensitiveHeaders = headers.map(normalizeFieldName);
    this.sensitiveParams = params.map(normalizeFieldName);
    this.sensitiveUserFields = userFields.map(normalizeFieldName);
    this.maskReplacement = config?.maskReplacement ?? DEFAULT_MASK;
    this.sanitizeStackTraces = config?.sanitizeStackTraces ?? true;
    this.stackTraceSanitization =
      config?.stackTraceSanitization ?? (this.sanitizeStackTraces ? 'partial' : 'none');
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
      if (matchesSensitiveTerm(key, this.sensitiveHeaders)) {
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

    if (isSanitized(body)) {
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
      if (matchesSensitiveTerm(key, this.sensitiveParams)) {
        masked[key] = this.maskReplacement;
      } else if (isSanitized(value)) {
        // A watcher that already produced a clean copy of this subtree — the
        // GraphQL response and its variables — is taken at its word rather
        // than deep-cloned a second time. Only what `markSanitized` touched
        // qualifies, so the rest of the payload is masked as it always was.
        masked[key] = value;
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
      if (matchesSensitiveTerm(key, this.sensitiveUserFields)) {
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

    if (this.stackTraceSanitization === 'full') {
      return undefined;
    }

    // `partial` is about what leaves a production machine; in development the
    // paths are the useful part.
    if (this.stackTraceSanitization === 'none' || !this.isProduction) {
      return stack;
    }

    // In production, simplify the stack trace
    return stack
      .split('\n')
      .slice(0, 10) // Only the first ten lines are kept, so only they are scanned
      .map((line) => replaceParenthesisedPaths(line))
      .join('\n');
  }

  /**
   * Check if a key is sensitive.
   */
  isSensitiveKey(key: string): boolean {
    return (
      matchesSensitiveTerm(key, this.sensitiveHeaders) ||
      matchesSensitiveTerm(key, this.sensitiveParams) ||
      matchesSensitiveTerm(key, this.sensitiveUserFields)
    );
  }

  /**
   * Get the mask replacement string.
   */
  getMaskReplacement(): string {
    return this.maskReplacement;
  }
}
