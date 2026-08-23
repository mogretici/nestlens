import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Pagination limits to prevent DoS
 */
export const MAX_LIMIT = 1000;
/**
 * How far into the list an offset may reach.
 *
 * Offset paging asks the storage for `offset + limit` entries and drops the
 * ones already shown, which is what an offset costs anywhere — so the work is
 * set by the offset, not by the page. Against a store keeping everything
 * (`maxEntries: 0`) nothing bounded that work: `?offset=1000000` read a
 * million rows with their payloads into memory to answer with fifty.
 *
 * Deep paging is what `entries/cursor` is for, and it stays constant-cost at
 * any depth. This is a refusal rather than a clamp because a clamped offset
 * answers a different question than the one asked, and looks like an answer.
 */
export const MAX_OFFSET = 10_000;
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
    const parts = Array.isArray(value)
      ? value.filter((v) => v !== null && v !== undefined && v !== '')
      : String(value).split(',').filter(Boolean);
    return parts.map((s) =>
      typeof s === 'number'
        ? s
        : String(s).toUpperCase() === 'ERR'
          ? ('ERR' as const)
          : parseInt(String(s), 10),
    );
  });
}

/**
 * Transforms string "true"/"false" to boolean
 */
export function TransformStringToBoolean() {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  });
}

/**
 * Transforms a string into a bounded integer.
 *
 * A value that cannot be read falls back to the default where there is one —
 * `limit` documents that, and a page of fifty is a better answer than an error
 * for a parameter the reader can only have got wrong by hand. Where there is
 * no default it is left as it arrived, so the validator beside it refuses it:
 * dropping it instead meant `?minDuration=slow` narrowed nothing and said
 * nothing, which reads as "no entry is that slow".
 */
export function TransformToInt(options?: { min?: number; max?: number; default?: number }) {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null || value === '') {
      return options?.default;
    }

    const parsed = parseInt(String(value), 10);

    if (isNaN(parsed)) {
      return options?.default ?? value;
    }

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
 * Transforms sequence number for cursor pagination
 */
export function TransformSequence() {
  return TransformToInt({ min: 0 });
}

/**
 * Transforms offset query parameter. Bounded above by {@link MAX_OFFSET} and
 * meaningless below zero.
 */
export function TransformOffset() {
  return TransformToInt({ min: 0, default: 0 });
}

/**
 * Turns a date query parameter into a Date, or into something the validator
 * will reject.
 *
 * `new Date('yesterday')` is an Invalid Date, and every backend did something
 * different with one: SQLite threw `RangeError: Invalid time value` out of
 * `toISOString`, which the reader saw as a 500, while the other two compared
 * against NaN and answered with nothing. Leaving the original string in place
 * lets `IsDate` fail it, so an unusable date is a 400 that names the parameter.
 */
export function TransformDate() {
  return Transform(({ value }: TransformFnParams) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? value : value;

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed;
  });
}
