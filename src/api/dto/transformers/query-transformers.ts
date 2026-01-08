import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Pagination limits to prevent DoS
 */
export const MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 50;

/**
 * Transforms comma-separated string query param into array of strings
 * Handles: "a,b,c" -> ["a", "b", "c"]
 * Also handles: "a,,b," -> ["a", "b"] (filters empty values)
 */
export function TransformCommaSeparatedArray() {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value).split(',').filter(Boolean);
  });
}

/**
 * Transforms comma-separated numbers into array
 * Handles: "1,2,3" -> [1, 2, 3]
 * Special case: "ERR" remains as string for status codes
 */
export function TransformCommaSeparatedNumbersOrErr() {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parts = String(value).split(',').filter(Boolean);
    return parts.map((s) => (s.toUpperCase() === 'ERR' ? ('ERR' as const) : parseInt(s, 10)));
  });
}

/**
 * Transforms string "true"/"false" to boolean
 */
export function TransformStringToBoolean() {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true';
  });
}

/**
 * Transforms string to bounded integer with default
 */
export function TransformToInt(options?: { min?: number; max?: number; default?: number }) {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null || value === '') {
      return options?.default;
    }
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed)) return options?.default;
    let result = parsed;
    if (options?.min !== undefined) result = Math.max(result, options.min);
    if (options?.max !== undefined) result = Math.min(result, options.max);
    return result;
  });
}

/**
 * Transforms limit query parameter with bounds
 */
export function TransformLimit() {
  return TransformToInt({ min: 1, max: MAX_LIMIT, default: DEFAULT_LIMIT });
}

/**
 * Transforms offset query parameter
 */
export function TransformOffset() {
  return TransformToInt({ min: 0, default: 0 });
}

/**
 * Transforms sequence number for cursor pagination
 */
export function TransformSequence() {
  return TransformToInt({ min: 0 });
}
