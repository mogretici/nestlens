/**
 * GraphQL Variable Sanitizer
 *
 * Masks sensitive data in GraphQL variables and responses.
 */

import { markSanitized } from '../../../core/sanitized-payload';

const MASKED_VALUE = '***';

/**
 * How many distinct key names one matcher will remember.
 *
 * A schema has a finite field set — a 20-item feed carries a couple of thousand
 * key occurrences over about fifty names — so the memo answers nearly every
 * lookup. A payload assembled by whoever is calling has no such bound, which is
 * why there is a cap. Past it the answers stay correct and are simply
 * recomputed.
 */
const MEMO_LIMIT = 1024;

/**
 * Words that name something *made from* a sensitive field rather than something
 * that merely counts or describes it.
 *
 * `passwordHash` is as sensitive as the password, `stripeSecretKey` as the
 * secret and `creditCardNumber` as the card, so a term matched in the middle of
 * a name still masks when only these follow it. `tokenCount` is a number of
 * tokens and stays readable.
 */
const DERIVATIVE_SEGMENTS = new Set([
  'hash',
  'hashed',
  'key',
  'keys',
  'value',
  'values',
  'code',
  'codes',
  'number',
  'numbers',
  'num',
  'no',
  'confirm',
  'confirmation',
  'plain',
  'raw',
  'encrypted',
  'digest',
]);

/**
 * A field name split into its words, lower case.
 *
 * `apiToken`, `api_token` and `API-TOKEN` are one field written three ways, and
 * a payload uses whichever the schema author preferred, so the pattern list
 * does not have to enumerate them.
 *
 * Splitting is also what stops the matcher lying. The list holds `pin`, and
 * `shipping`, `shoppingCart`, `spinner`, `topping` and `isPinned` all contain
 * those three letters — every one of them used to reach the dashboard as `***`,
 * which made it describe a response the API never sent.
 */
function splitSegments(name: string): string[] {
  const segments: string[] = [];

  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // `token2` is `token_2` written without the separator, and a name should
    // not mask or not mask depending on which the author preferred.
    .replace(/([a-zA-Z])(\d)/g, '$1 $2');

  for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
    if (part.length > 0) {
      segments.push(part.toLowerCase());
    }
  }

  return segments;
}

/** A pattern list compiled once, with its answers remembered. */
interface KeyMatcher {
  isSensitive(key: string): boolean;
}

/**
 * Compiled matchers, keyed by the identity of the pattern list they came from.
 *
 * The resolved watcher configuration hands the same array to every call, so the
 * compile and the memo happen once; reconfiguring produces a new array and with
 * it a new matcher, so there is no cache to invalidate by hand. The list is
 * treated as immutable, which is how the rest of the resolved config is treated
 * — mutating one in place would leave the memo describing the old list.
 *
 * `WeakMap` keeps nothing alive that the configuration does not.
 */
const matchers = new WeakMap<string[], KeyMatcher>();

function matcherFor(sensitivePatterns: string[]): KeyMatcher {
  const existing = matchers.get(sensitivePatterns);
  if (existing) {
    return existing;
  }

  const compiled = compileMatcher(sensitivePatterns);
  matchers.set(sensitivePatterns, compiled);

  return compiled;
}

function compileMatcher(sensitivePatterns: string[]): KeyMatcher {
  const terms = new Set<string>();
  const prefixes: string[] = [];

  for (const pattern of sensitivePatterns) {
    // Wildcards are an explicit opt-in to breadth, so they keep the loose
    // prefix match they have always had.
    if (pattern.endsWith('*')) {
      const prefix = splitSegments(pattern.slice(0, -1)).join('');
      if (prefix.length > 0) {
        prefixes.push(prefix);
      }
      continue;
    }

    const term = splitSegments(pattern).join('');
    if (term.length > 0) {
      for (const form of pluralForms(term)) {
        terms.add(form);
      }
    }
  }

  const memo = new Map<string, boolean>();

  return {
    isSensitive(key: string): boolean {
      const remembered = memo.get(key);
      if (remembered !== undefined) {
        return remembered;
      }

      const result = matchesTerm(key, terms, prefixes);
      if (memo.size < MEMO_LIMIT) {
        memo.set(key, result);
      }

      return result;
    },
  };
}

/**
 * Whether a term covers this field name.
 *
 * A term has to line up with whole words: `token` matches `apiToken` and
 * `access_token`, not `tokenCount`. Multi-word terms match a run of words, so
 * `credit_card` still catches `creditCardNumber`.
 */
function matchesTerm(key: string, terms: Set<string>, prefixes: string[]): boolean {
  const segments = splitSegments(key);
  if (segments.length === 0) {
    return false;
  }

  if (prefixes.length > 0) {
    const joined = segments.join('');
    for (const prefix of prefixes) {
      if (joined.startsWith(prefix)) {
        return true;
      }
    }
  }

  for (let start = 0; start < segments.length; start += 1) {
    let run = '';

    for (let end = start; end < segments.length; end += 1) {
      run += segments[end];

      if (terms.has(run) && tailIsDerivative(segments, end + 1)) {
        return true;
      }
    }
  }

  return false;
}

function tailIsDerivative(segments: string[], from: number): boolean {
  for (let index = from; index < segments.length; index += 1) {
    const segment = segments[index];

    // A number or a version marker is an index or a revision — `token_2`,
    // `apiKeyV2` — and names the same kind of thing, not a fact about it.
    if (DIGITS.test(segment) || VERSION.test(segment) || DERIVATIVE_SEGMENTS.has(segment)) {
      continue;
    }

    return false;
  }

  return true;
}

const DIGITS = /^\d+$/;

/** A version marker: the `v` of `apiKeyV2`, which the digit split leaves alone. */
const VERSION = /^v$/;

/**
 * A term and the plural of it.
 *
 * A schema names a collection for what it holds — `tokens`, `apiKeys`,
 * `creditCards` — and the singular term is what anybody writes in the pattern
 * list. Matching whole words without this would have left every one of those
 * collections in the clear, which is worse than the over-matching that whole
 * words were introduced to stop.
 */
function pluralForms(term: string): string[] {
  if (term.endsWith('s')) {
    return [term];
  }

  if (/[^aeiou]y$/.test(term)) {
    return [term, `${term.slice(0, -1)}ies`];
  }

  return [term, `${term}s`];
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

  return markSanitized(sanitizeObject(variables, matcherFor(sensitivePatterns), 0, maxDepth));
}

/**
 * Internal recursive sanitization function
 */
function sanitizeObject(
  obj: Record<string, unknown>,
  matcher: KeyMatcher,
  depth: number,
  maxDepth: number,
): Record<string, unknown> {
  if (depth >= maxDepth) {
    return { _truncated: true, _message: 'Max depth exceeded' };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (matcher.isSensitive(key)) {
      result[key] = MASKED_VALUE;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = sanitizeArray(value, matcher, depth + 1, maxDepth);
    } else if (typeof value === 'object') {
      result[key] = sanitizeObject(value as Record<string, unknown>, matcher, depth + 1, maxDepth);
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
  matcher: KeyMatcher,
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
      return sanitizeArray(item, matcher, depth + 1, maxDepth);
    }

    if (typeof item === 'object') {
      return sanitizeObject(item as Record<string, unknown>, matcher, depth + 1, maxDepth);
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
 * The largest `maxResponseSize` the cheap rejection below is used for.
 *
 * The probe stops once it has counted past the limit, so its cost is the limit
 * rather than the payload — but only while the limit is the smaller of the two.
 * Configured above this, it would walk megabytes to learn what
 * `JSON.stringify` reports in one native pass, so it is skipped and the
 * behaviour is exactly what it was.
 */
const PROBE_LIMIT = 1024 * 1024;

interface SizeProbe {
  bytes: number;
  exceeded: boolean;
  undecided: boolean;
}

/**
 * A floor on the serialized size, abandoned as soon as it passes `limit`.
 *
 * Escaping only ever makes JSON longer and omitted members only ever make it
 * shorter, so every value is counted at or below what it really costs. Passing
 * the limit here therefore proves the real output passes it too, and no
 * response is ever truncated that should have been kept.
 *
 * This exists because the check it guards used to serialize the whole payload
 * and throw the string away: 7ms on the watched application's event loop to
 * decide that a 4.8MB response was too big to keep, and 107ms once someone
 * raised the limit far enough to keep it. Anything it cannot judge — a cycle,
 * a `bigint`, nesting deep enough to exhaust the stack — falls through to
 * `JSON.stringify`, which has always handled those.
 */
function probeSize(data: unknown, limit: number): SizeProbe {
  const probe: SizeProbe = { bytes: 0, exceeded: false, undecided: false };

  try {
    measureSize(data, limit, probe, new Set<object>());
  } catch {
    probe.undecided = true;
  }

  return probe;
}

function measureSize(value: unknown, limit: number, probe: SizeProbe, path: Set<object>): void {
  if (value === null) {
    countBytes(4, limit, probe);
    return;
  }

  switch (typeof value) {
    case 'boolean':
      countBytes(4, limit, probe);
      return;
    case 'number':
      countBytes(1, limit, probe);
      return;
    case 'string':
      countBytes(value.length + 2, limit, probe);
      return;
    case 'bigint':
      // JSON.stringify throws on these; let it.
      probe.undecided = true;
      return;
    case 'undefined':
    case 'function':
    case 'symbol':
      // Dropped from objects, written as `null` inside arrays. Counting
      // nothing stays a floor either way.
      return;
    default:
      break;
  }

  const object = value as object;

  if (path.has(object)) {
    probe.undecided = true;
    return;
  }

  // `toJSON` can return anything at all — including `undefined`, which removes
  // the member entirely, and a single digit, which is shorter than the braces
  // this would otherwise assume. Nothing about it is certain, so nothing about
  // it is counted and the exact pass settles it.
  if (typeof (object as { toJSON?: unknown }).toJSON === 'function') {
    return;
  }

  countBytes(2, limit, probe);
  if (probe.exceeded) {
    return;
  }

  path.add(object);

  if (Array.isArray(object)) {
    for (const item of object) {
      measureSize(item, limit, probe, path);
      if (probe.exceeded || probe.undecided) break;
    }
  } else {
    for (const [key, child] of Object.entries(object)) {
      // A member whose value cannot be written vanishes from the output, key
      // and all. Counting the key of one would put the total above what the
      // payload really costs — and a floor that is not a floor rejects
      // responses that would have fitted.
      if (!isCertainlyWritten(child)) continue;

      countBytes(key.length + 3, limit, probe);
      if (probe.exceeded) break;

      measureSize(child, limit, probe, path);
      if (probe.exceeded || probe.undecided) break;
    }
  }

  path.delete(object);
}

/**
 * Whether a member holding this value is certain to reach the output.
 *
 * `undefined`, functions and symbols are dropped from an object, and a `toJSON`
 * may return any of them. Both are counted as nothing rather than guessed at,
 * which keeps the total a floor.
 */
function isCertainlyWritten(value: unknown): boolean {
  const type = typeof value;

  if (type === 'undefined' || type === 'function' || type === 'symbol') {
    return false;
  }

  return !(
    value !== null &&
    type === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  );
}

function countBytes(bytes: number, limit: number, probe: SizeProbe): void {
  probe.bytes += bytes;

  if (probe.bytes > limit) {
    probe.exceeded = true;
  }
}

/**
 * Sanitize response data
 *
 * Oversized responses are replaced by a marker carrying `_size` and `_maxSize`.
 * When the cheap probe rejected the payload without serializing it, `_size` is
 * a floor and says so through `_sizeIsLowerBound` — the response is at least
 * that big, and the exact figure was not worth the pause it would have cost.
 */
export function sanitizeResponse(
  data: unknown,
  sensitivePatterns: string[],
  maxSize: number,
): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Reject what is plainly too large before paying to serialize it.
  if (maxSize <= PROBE_LIMIT) {
    const probe = probeSize(data, maxSize);

    if (probe.exceeded) {
      return markSanitized({
        _truncated: true,
        _size: probe.bytes,
        _sizeIsLowerBound: true,
        _maxSize: maxSize,
      });
    }
  }

  // Then, check size exactly
  let stringified: string;
  try {
    stringified = JSON.stringify(data);
  } catch {
    return markSanitized({ _error: 'Unable to serialize response' });
  }

  if (stringified.length > maxSize) {
    return markSanitized({
      _truncated: true,
      _size: stringified.length,
      _maxSize: maxSize,
    });
  }

  const matcher = matcherFor(sensitivePatterns);

  // Sanitize the data
  if (Array.isArray(data)) {
    return markSanitized(sanitizeArray(data, matcher, 0, 10));
  }

  if (typeof data === 'object') {
    return markSanitized(sanitizeObject(data as Record<string, unknown>, matcher, 0, 10));
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
