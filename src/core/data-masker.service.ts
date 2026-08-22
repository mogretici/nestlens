import { Injectable } from '@nestjs/common';
import { isSanitized } from './sanitized-payload';
import { assignKey } from './safe-assign';
import { MaskingTerms, resolveMaskingTerms } from './masking-terms';

/**
 * Configuration for data masking behavior.
 */
export interface DataMaskerConfig {
  /** Headers to mask, added to the built-in list. See {@link MaskingTerms}. */
  sensitiveHeaders?: MaskingTerms;
  /** Body/query parameter names to mask, added to the built-in list. */
  sensitiveParams?: MaskingTerms;
  /** User object fields to mask, added to the built-in list. */
  sensitiveUserFields?: MaskingTerms;
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
  // Masked as a header since the beginning, and as a body or query field only
  // now. It carries the same credential wherever it appears — `?authorization=`
  // on a callback URL, an `authorization` field in a JSON body — and the
  // GraphQL watcher's list has always included it.
  'authorization',
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
 * Every term this masker will redact a body or query parameter for.
 *
 * Exported because the GraphQL watcher sanitises its own payloads and marks
 * them so the collector does not walk them a second time. That mark is only
 * safe while the watcher redacts at least as much as the collector would, so
 * the watcher resolves its list from this one rather than keeping a shorter
 * list of its own — which is what let `cvv`, `passwd` and anything added
 * through `security.dataMasking.sensitiveParams` reach storage in the clear.
 */
export function resolveSensitiveParams(configured?: MaskingTerms): string[] {
  return resolveMaskingTerms(DEFAULT_SENSITIVE_PARAMS, configured);
}

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
 * Payload fields that hold a URL, and therefore may hold a query string.
 *
 * Matched by name because a URL is only recognisable by where it came from:
 * treating every string that contains a `?` as a URL would rewrite message
 * bodies and SQL.
 */
const URL_FIELDS = new Set([
  'url',
  'originalUrl',
  'uri',
  'href',
  'requestUrl',
  'fullUrl',
  // An outgoing call records the URL twice: whole in `url`, and split into
  // `path` — which keeps the query string. So the same request had its key
  // masked in one field and printed in the next:
  //
  //     url    https://api.example.com/v1/charge?api_key=***REDACTED***
  //     path   /v1/charge?api_key=SECRET123
  //
  // A request's own `path` carries no query string, so this costs it nothing.
  'path',
  // Connection strings are URLs whose password sits in the userinfo, and they
  // are recorded whenever a driver is configured or an outgoing call is made.
  'connectionString',
  'connectionUri',
  'dsn',
]);

/**
 * Payload fields that hold a command line, where the secret is positional.
 *
 * `['--password', 'hunter2']` names the credential in the element *before* the
 * one holding it, so no key ever matches and nothing else here would catch it.
 */
const ARGUMENT_FIELDS = new Set(['arguments', 'argv', 'commandArguments']);

/**
 * How deep a payload is walked, and what stands in for what is past that.
 *
 * Masking recursed without a bound, so two ordinary payloads ended the same
 * way — `RangeError: Maximum call stack size exceeded`, caught by the
 * collector, entry dropped:
 *
 *     order.items[0].order === order   ->  nothing recorded
 *     a body nested 20,000 deep        ->  nothing recorded
 *
 * The first is a bidirectional relation, which is what an ORM hands to an
 * event, a job or a cache; the second is what any client can post. Both were
 * invisible in the dashboard with only a warning line as evidence.
 */
const MAX_MASK_DEPTH = 32;
/**
 * How many values one payload may be walked through.
 *
 * Depth alone does not bound the work. Objects a payload reaches twice are not
 * a cycle and are walked twice, which is right for the ordinary case — a list
 * of orders sharing one customer — and exponential when the sharing repeats at
 * every level:
 *
 * ```text
 * 20 levels of { a: shared, b: shared }  ->  568ms and 25MB of masked output
 * ```
 *
 * Payloads are live objects here, not parsed JSON, so shared references are
 * ordinary. The budget stops the walk long before either number matters; ten
 * thousand values is far past any payload worth reading.
 */
const MAX_MASK_NODES = 10_000;
const CIRCULAR = '[Circular]';
const TOO_DEEP = '[Max depth exceeded]';
const TRUNCATED = '[Truncated]';

/** The state one `maskBody` walk carries: the path to the root, and what is left of the budget. */
interface Walk {
  readonly path: Set<object>;
  remaining: number;
}

const newWalk = (): Walk => ({ path: new Set<object>(), remaining: MAX_MASK_NODES });

/**
 * The `user:password@` in front of a host.
 *
 * `postgres://app:hunter2@db/orders` and `https://key:secret@api.example.com`
 * put a credential in a place no field name marks — it is part of the URL, so
 * masking the query string leaves it untouched.
 */
const URL_CREDENTIALS = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/?#@]*)@/;

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
/**
 * How many distinct field names one matcher will remember.
 *
 * A payload's key names come from a schema, a header set and a query string —
 * a few dozen names repeated across every entry — so the memo answers nearly
 * every lookup after the first entry. A body assembled by whoever is calling
 * has no such bound, which is why there is a cap; past it the answers stay
 * correct and are recomputed.
 */
const MEMO_LIMIT = 1024;

/**
 * One term list, with its answers remembered.
 *
 * Deciding a single field name normalises it — a `toLowerCase` and a regex
 * replace, both allocating — and then scans every configured term for a
 * substring. That is twenty-odd comparisons per key, on every key of every
 * entry, for an answer that never changes for a given name. The GraphQL
 * sanitiser memoised this in 0.10.0 and measured the difference; the collector
 * masker, which runs on *every* entry rather than on GraphQL ones, kept
 * recomputing it and was the largest single cost in the masker under load.
 *
 * The term list belongs to the masker and never changes after construction, so
 * the memo lives as long as the masker and needs nothing to invalidate it.
 *
 * Exported because the HTTP client watcher masks its own bodies before the
 * collector sees them, and had its own rule: a plain `toLowerCase().includes()`,
 * which compares a term to a field name without normalising either. So a term
 * only matched the spelling it was written in —
 *
 *     term "internal_ref"  field "internalRef"   ->  not masked
 *     term "internalRef"   field "internal_ref"  ->  not masked
 *
 * — while the same two terms here match both. A reader configuring
 * `sensitiveRequestParams` had no reason to expect a different answer from a
 * different place in the same product.
 */
export const createTermMatcher = (terms: readonly string[]): ((fieldName: string) => boolean) => {
  // Both sides, here. The field name was normalised and the terms were not, so
  // a caller had to remember to do it — and the one caller added later did
  // not, which is how `sensitiveRequestParams: ['internal_ref']` stopped
  // matching anything at all. A comparison owns both of its sides.
  const meaningful = terms.map(normalizeFieldName).filter((term) => term.length > 0);
  const memo = new Map<string, boolean>();

  return (fieldName: string): boolean => {
    const remembered = memo.get(fieldName);
    if (remembered !== undefined) {
      return remembered;
    }

    const normalized = normalizeFieldName(fieldName);
    const result = meaningful.some((term) => normalized.includes(term));

    if (memo.size < MEMO_LIMIT) {
      memo.set(fieldName, result);
    }

    return result;
  };
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

/**
 * Whether a stack-trace token is a path on this machine.
 *
 * `node:internal/...` and `node_modules/...` are left alone: they name code the
 * reader did not write, carry nothing about the host, and are most of what
 * makes a trimmed stack still readable.
 */
function isLocalPath(token: string): boolean {
  if (token.startsWith('node:')) return false;

  // POSIX absolute, or a Windows drive.
  return token.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(token);
}

/**
 * Replaces the bare paths a stack frame carries outside parentheses.
 *
 * V8 writes a frame two ways, and only one of them has brackets:
 *
 *     at Object.handler (/srv/app/dist/orders.js:42:11)
 *     at /srv/app/dist/main.js:10:5
 *
 * The second is what an anonymous function or top-level code produces, and
 * `partial` sanitisation left it untouched — so a production trace still
 * published the deployment directory and the account it runs under
 * (`/home/deploy/secret-project/...`), which is the thing `partial` exists to
 * remove.
 *
 * Scanned by splitting on spaces rather than matched with a pattern: the input
 * arrives inside exceptions NestLens did not throw, and a regex over
 * attacker-influenced text is how this file got its last two performance bugs.
 */
function replaceBarePaths(line: string): string {
  if (!line.includes('/') && !line.includes('\\')) {
    return line;
  }

  return line
    .split(' ')
    .map((token) => (isLocalPath(token) ? '...' : token))
    .join(' ');
}

@Injectable()
export class DataMaskerService {
  private readonly sensitiveHeaders: readonly string[];
  private readonly sensitiveParams: readonly string[];
  private readonly sensitiveUserFields: readonly string[];
  private readonly matchesHeader: (fieldName: string) => boolean;
  private readonly matchesParam: (fieldName: string) => boolean;
  private readonly matchesUserField: (fieldName: string) => boolean;
  private readonly maskReplacement: string;
  private readonly sanitizeStackTraces: boolean;
  private readonly stackTraceSanitization: StackTraceSanitization;
  private readonly isProduction: boolean;

  constructor(config?: DataMaskerConfig) {
    const headers = resolveMaskingTerms(DEFAULT_SENSITIVE_HEADERS, config?.sensitiveHeaders);
    const params = resolveSensitiveParams(config?.sensitiveParams);
    const userFields = resolveMaskingTerms(
      DEFAULT_SENSITIVE_USER_FIELDS,
      config?.sensitiveUserFields,
    );

    // Kept normalised for `isSensitiveKey`'s own use; the matcher normalises
    // whatever it is given either way.
    this.sensitiveHeaders = headers.map(normalizeFieldName);
    this.sensitiveParams = params.map(normalizeFieldName);
    this.sensitiveUserFields = userFields.map(normalizeFieldName);

    this.matchesHeader = createTermMatcher(this.sensitiveHeaders);
    this.matchesParam = createTermMatcher(this.sensitiveParams);
    this.matchesUserField = createTermMatcher(this.sensitiveUserFields);
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
      if (this.matchesHeader(key)) {
        assignKey(masked, key, this.maskReplacement);
      } else {
        assignKey(masked, key, String(value ?? ''));
      }
    }

    return masked;
  }

  /**
   * Mask sensitive data in request/response body.
   */
  maskBody(body: unknown): unknown {
    return this.maskValue(body, 0, newWalk(), true);
  }

  /**
   * Masks one value, wherever it sits in a payload.
   *
   * `path` holds the objects between the payload's root and this value, so a
   * reference back into that chain is a cycle; a sibling appearing twice is
   * not, which is why it is removed again on the way out.
   *
   * `parseStrings` keeps a long-standing distinction: a body that arrives as
   * a JSON string is parsed and masked, a string sitting in a field is left
   * exactly as it was. Parsing the second would rewrite text the application
   * chose — whitespace and key order included — to mask names that field
   * never had.
   */
  private maskValue(value: unknown, depth: number, walk: Walk, parseStrings: boolean): unknown {
    if (typeof value === 'string') {
      return parseStrings ? this.maskJsonString(value, depth, walk) : value;
    }

    // The one primitive `JSON.stringify` refuses rather than skips, and the
    // file and Redis drivers serialise every payload: a bigint column read
    // through Prisma, a job id, a balance — anywhere in a payload — made
    // `save` throw. The collector reads that as storage being down and puts
    // the entry back, so the same value failed every flush after it and took
    // the entries behind it down with it. Written the way it is printed.
    if (typeof value === 'bigint') {
      return `${value}n`;
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (isSanitized(value)) {
      return value;
    }

    if (walk.path.has(value)) {
      return CIRCULAR;
    }

    if (walk.remaining <= 0) {
      return TRUNCATED;
    }

    walk.remaining -= 1;

    if (depth >= MAX_MASK_DEPTH) {
      return TOO_DEEP;
    }

    const described = this.describeObject(value);
    if (described !== undefined) {
      return described;
    }

    walk.path.add(value);
    try {
      return Array.isArray(value)
        ? value.map((item) => this.maskValue(item, depth + 1, walk, parseStrings))
        : this.maskObjectAt(value as Record<string, unknown>, depth, walk);
    } finally {
      walk.path.delete(value);
    }
  }

  /**
   * A body that arrived as text.
   *
   * Only a JSON object or array is masked and written back. A string that
   * happens to parse — `123`, `true`, `"hello"` — is returned as it came:
   * walking it as an object recorded `{}` for a number and a map of character
   * positions for a string, neither of which is what the application sent.
   */
  private maskJsonString(body: string, depth: number, walk: Walk): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return body;
    }

    if (parsed === null || typeof parsed !== 'object') {
      return body;
    }

    return JSON.stringify(this.maskValue(parsed, depth, walk, true));
  }

  /**
   * What to record for an object that is not a plain one.
   *
   * `Object.entries` reads own enumerable properties, and the objects an
   * application puts in a payload mostly do not keep their contents there:
   *
   * ```text
   * new Date()          ->  {}                      (an entity's createdAt)
   * Buffer.from(file)   ->  {"0":104,"1":105,...}   (a key per byte)
   * new Map([...])      ->  {}
   * an Error            ->  {}                      (a job's failure)
   * ```
   *
   * The Buffer case is the expensive one: a megabyte of upload became an
   * object of a million keys, masked key by key and then stored.
   *
   * Returns `undefined` when the value is an ordinary object to walk.
   */
  private describeObject(value: object): unknown {
    if (ArrayBuffer.isView(value)) {
      const name = value.constructor?.name ?? 'TypedArray';
      return `[${name} ${value.byteLength} bytes]`;
    }

    switch (Object.prototype.toString.call(value)) {
      case '[object Date]': {
        const time = (value as Date).getTime();
        return Number.isNaN(time) ? '[Invalid Date]' : (value as Date).toISOString();
      }
      case '[object ArrayBuffer]':
        return `[ArrayBuffer ${(value as ArrayBuffer).byteLength} bytes]`;
      case '[object Map]':
        return `[Map ${(value as Map<unknown, unknown>).size} entries]`;
      case '[object Set]':
        return `[Set ${(value as Set<unknown>).size} items]`;
      case '[object RegExp]':
        return String(value);
      case '[object Error]': {
        const error = value as Error;
        return {
          name: error.name,
          message: error.message,
          stack: this.sanitizeStackTrace(error.stack),
        };
      }
      default:
        return undefined;
    }
  }

  /**
   * Masks the sensitive parameters in a URL's query string.
   *
   * A request's query string is recorded twice: parsed into `query`, which was
   * masked, and whole inside `url`, which was not. So
   * `GET /reset?token=abc123` reached storage with the token in plain text and
   * the dashboard printed it at the top of the entry — as did every OAuth
   * callback carrying a `code`, and every API that takes its key in the query.
   *
   * The `user:password@` in front of a host goes too. A connection string —
   * `postgres://app:hunter2@db/orders` — puts a credential where no field name
   * marks it, so masking the query alone would leave it in place.
   *
   * Otherwise only the query is touched. The path is what the entry is *about*,
   * and a path segment is not a named field, so there is nothing here to decide
   * about it.
   *
   * Parsed by hand rather than through `URL`, because these are usually
   * relative (`/reset?token=…`) and `URL` needs a base for those — a base this
   * would have to invent, and then remove again.
   */
  maskUrl(value: string): string {
    const url = value.replace(URL_CREDENTIALS, (_match, scheme: string, userinfo: string) => {
      const separator = userinfo.indexOf(':');
      // A bare username is not a secret; the password after the colon is.
      return separator === -1
        ? `${scheme}${userinfo}@`
        : `${scheme}${userinfo.slice(0, separator)}:${this.maskReplacement}@`;
    });

    const start = url.indexOf('?');
    if (start === -1) {
      return url;
    }

    const [query, ...fragment] = url.slice(start + 1).split('#');
    const parts = query.split('&').map((pair) => {
      const equals = pair.indexOf('=');
      if (equals === -1) {
        return pair;
      }

      const rawName = pair.slice(0, equals);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        // A malformed escape is not a reason to drop the parameter; match on
        // what is there.
      }

      return this.matchesParam(name)
        ? `${rawName}=${encodeURIComponent(this.maskReplacement)}`
        : pair;
    });

    const rebuilt = parts.join('&');
    const suffix = fragment.length > 0 ? `#${fragment.join('#')}` : '';

    return `${url.slice(0, start)}?${rebuilt}${suffix}`;
  }

  /**
   * Masks the values a command line passes to sensitive flags.
   *
   * Two shapes, both common:
   *
   *     ['--password', 'hunter2']   the value is the next element
   *     ['--password=hunter2']      the value is in the same one
   *
   * Only the value goes; the flag stays, because which flags were passed is
   * most of what makes a recorded command worth reading.
   *
   * Positional arguments are left alone. `seed hunter2` carries a secret in a
   * place nothing marks, and guessing would redact the arguments that are the
   * reason to look.
   */
  private maskArguments(args: unknown[]): unknown[] {
    const result: unknown[] = [];
    let maskNext = false;

    for (const arg of args) {
      if (typeof arg !== 'string') {
        result.push(arg);
        maskNext = false;
        continue;
      }

      if (maskNext) {
        result.push(this.maskReplacement);
        maskNext = false;
        continue;
      }

      const equals = arg.indexOf('=');
      if (arg.startsWith('-') && equals !== -1) {
        const flag = arg.slice(0, equals).replace(/^-+/, '');
        result.push(
          this.matchesParam(flag) ? `${arg.slice(0, equals)}=${this.maskReplacement}` : arg,
        );
        continue;
      }

      if (arg.startsWith('-') && this.matchesParam(arg.replace(/^-+/, ''))) {
        maskNext = true;
      }

      result.push(arg);
    }

    return result;
  }

  /**
   * Mask sensitive fields in an object recursively.
   */
  private maskObject(obj: Record<string, unknown>): Record<string, unknown> {
    return this.maskObjectAt(obj, 0, newWalk());
  }

  /** {@link maskObject}, keeping the depth and the path to the root. */
  private maskObjectAt(
    obj: Record<string, unknown>,
    depth: number,
    walk: Walk,
  ): Record<string, unknown> {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.matchesParam(key)) {
        assignKey(masked, key, this.maskReplacement);
      } else if (URL_FIELDS.has(key) && typeof value === 'string') {
        assignKey(masked, key, this.maskUrl(value));
      } else if (ARGUMENT_FIELDS.has(key) && Array.isArray(value)) {
        assignKey(masked, key, this.maskArguments(value));
      } else if (isSanitized(value)) {
        // A watcher that already produced a clean copy of this subtree — the
        // GraphQL response and its variables — is taken at its word rather
        // than deep-cloned a second time. Only what `markSanitized` touched
        // qualifies, so the rest of the payload is masked as it always was.
        assignKey(masked, key, value);
      } else {
        assignKey(masked, key, this.maskValue(value, depth + 1, walk, false));
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
      if (this.matchesUserField(key)) {
        assignKey(masked, key, this.maskReplacement);
      } else if (value !== null && typeof value === 'object') {
        assignKey(masked, key, this.maskUserInfo(value));
      } else {
        assignKey(masked, key, value);
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
      .map((line) => replaceBarePaths(replaceParenthesisedPaths(line)))
      .join('\n');
  }

  /**
   * Check if a key is sensitive.
   */
  isSensitiveKey(key: string): boolean {
    return this.matchesHeader(key) || this.matchesParam(key) || this.matchesUserField(key);
  }

  /**
   * Get the mask replacement string.
   */
  getMaskReplacement(): string {
    return this.maskReplacement;
  }
}
