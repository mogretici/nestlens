/**
 * GraphQL Variable Sanitizer
 *
 * Masks sensitive data in GraphQL variables and responses.
 */

const MASKED_VALUE = '***';

/**
 * Check if a key matches any of the sensitive patterns
 */
function isSensitiveKey(key: string, sensitivePatterns: string[]): boolean {
  const lowerKey = key.toLowerCase();

  return sensitivePatterns.some((pattern) => {
    const lowerPattern = pattern.toLowerCase();

    // Exact match
    if (lowerKey === lowerPattern) {
      return true;
    }

    // Contains match (for nested keys like "user.password")
    if (lowerKey.includes(lowerPattern)) {
      return true;
    }

    // Wildcard support (e.g., "secret*" matches "secretKey")
    if (lowerPattern.endsWith('*')) {
      const prefix = lowerPattern.slice(0, -1);
      return lowerKey.startsWith(prefix);
    }

    return false;
  });
}

/**
 * Recursively sanitize an object, masking sensitive values
 */
export function sanitizeVariables(
  variables: Record<string, unknown> | undefined,
  sensitivePatterns: string[],
  maxDepth: number = 10,
): Record<string, unknown> | undefined {
  if (!variables || typeof variables !== 'object') {
    return variables;
  }

  return sanitizeObject(variables, sensitivePatterns, 0, maxDepth);
}

/**
 * Internal recursive sanitization function
 */
function sanitizeObject(
  obj: Record<string, unknown>,
  sensitivePatterns: string[],
  depth: number,
  maxDepth: number,
): Record<string, unknown> {
  if (depth >= maxDepth) {
    return { _truncated: true, _message: 'Max depth exceeded' };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key, sensitivePatterns)) {
      result[key] = MASKED_VALUE;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = sanitizeArray(value, sensitivePatterns, depth + 1, maxDepth);
    } else if (typeof value === 'object') {
      result[key] = sanitizeObject(
        value as Record<string, unknown>,
        sensitivePatterns,
        depth + 1,
        maxDepth,
      );
    } else if (typeof value === 'string' && looksLikeSensitiveValue(value)) {
      // Mask values that look like tokens, keys, etc.
      result[key] = MASKED_VALUE;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize an array, handling nested objects
 */
function sanitizeArray(
  arr: unknown[],
  sensitivePatterns: string[],
  depth: number,
  maxDepth: number,
): unknown[] {
  if (depth >= maxDepth) {
    return [{ _truncated: true, _message: 'Max depth exceeded' }];
  }

  return arr.map((item) => {
    if (item === null || item === undefined) {
      return item;
    }

    if (Array.isArray(item)) {
      return sanitizeArray(item, sensitivePatterns, depth + 1, maxDepth);
    }

    if (typeof item === 'object') {
      return sanitizeObject(
        item as Record<string, unknown>,
        sensitivePatterns,
        depth + 1,
        maxDepth,
      );
    }

    if (typeof item === 'string' && looksLikeSensitiveValue(item)) {
      return MASKED_VALUE;
    }

    return item;
  });
}

/**
 * Check if a string value looks like sensitive data
 * (JWT tokens, API keys, etc.)
 */
function looksLikeSensitiveValue(value: string): boolean {
  // Skip short values
  if (value.length < 20) {
    return false;
  }

  // JWT token pattern
  if (/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(value)) {
    return true;
  }

  // Bearer token pattern
  if (/^Bearer\s+\S+$/i.test(value)) {
    return true;
  }

  // API key patterns (various formats)
  if (/^(sk|pk|api|key|secret|token)[-_][a-zA-Z0-9]{20,}$/i.test(value)) {
    return true;
  }

  // Base64 encoded credentials (like Basic auth)
  if (/^Basic\s+[a-zA-Z0-9+/]+=*$/i.test(value)) {
    return true;
  }

  // AWS access key pattern
  if (/^AKIA[0-9A-Z]{16}$/.test(value)) {
    return true;
  }

  // GitHub token pattern
  if (/^(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}$/.test(value)) {
    return true;
  }

  // Stripe key pattern
  if (/^(sk|pk)_(test|live)_[a-zA-Z0-9]{20,}$/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Sanitize response data
 */
export function sanitizeResponse(
  data: unknown,
  sensitivePatterns: string[],
  maxSize: number,
): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // First, check size
  let stringified: string;
  try {
    stringified = JSON.stringify(data);
  } catch {
    return { _error: 'Unable to serialize response' };
  }

  if (stringified.length > maxSize) {
    return {
      _truncated: true,
      _size: stringified.length,
      _maxSize: maxSize,
    };
  }

  // Sanitize the data
  if (Array.isArray(data)) {
    return sanitizeArray(data, sensitivePatterns, 0, 10);
  }

  if (typeof data === 'object') {
    return sanitizeObject(data as Record<string, unknown>, sensitivePatterns, 0, 10);
  }

  return data;
}

/**
 * Create a sanitizer function with pre-configured patterns
 */
export function createSanitizer(sensitivePatterns: string[]) {
  return {
    sanitizeVariables: (variables?: Record<string, unknown>) =>
      sanitizeVariables(variables, sensitivePatterns),

    sanitizeResponse: (data: unknown, maxSize: number) =>
      sanitizeResponse(data, sensitivePatterns, maxSize),
  };
}
