import type { NestLensToolDescriptor, NestLensToolManifest, ToolParameter } from '../api/tools';

/**
 * Where the API lives under the dashboard's mount point.
 *
 * The same value as `NESTLENS_API_PREFIX`, written out because importing it
 * would load the whole configuration module — and with it NestJS — into a
 * process that only talks HTTP. `mcp.spec.ts` asserts the two are equal.
 */
export const API_ROOT = '__nestlens__/api';

/** The manifest format this client reads. Bumped with `NestLensToolManifest.version`. */
export const SUPPORTED_MANIFEST_VERSION = 1;

export interface NestLensClientOptions {
  /**
   * Where NestLens is mounted: the application's address plus the dashboard
   * path, such as `http://localhost:3000/nestlens`.
   */
  baseUrl: string;
  /** Sent with every request, for an application whose guard wants a token or a cookie. */
  headers?: Record<string, string>;
  /** Milliseconds to wait for the application before giving up. Default 15000. */
  timeoutMs?: number;
  /** Replaces the global `fetch`; tests give it a fake. */
  fetch?: typeof fetch;
}

/** The application answered, and the answer was no. */
export class NestLensApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'NestLensApiError';
  }
}

/** The application could not be asked at all. */
export class NestLensUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NestLensUnreachableError';
  }
}

/** The caller's arguments do not fit the tool. Said before anything is sent. */
export class NestLensArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NestLensArgumentError';
  }
}

const METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Whether a tool changes data, read from its method.
 *
 * The manifest says `mutates` as well, and read-only mode does not take its
 * word for it: anything but a GET is a change, which is what the API itself
 * means by one, whatever a manifest from an older or a modified NestLens says.
 */
export const changesData = (tool: Pick<NestLensToolDescriptor, 'method'>): boolean =>
  String(tool.method).toUpperCase() !== 'GET';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPlain = (value: unknown): boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const PATH_TRAVERSAL = new Set(['', '.', '..']);

/**
 * Refuses a single value that is not of its parameter's declared type.
 *
 * The API reads a query string, so it would take `limit: "abc"` and fall back
 * to its default without a word: an answer to a question the agent did not
 * ask. Types are strict — a number for a number, `true` or `false` for a
 * boolean — because that is the schema the agent was shown, and a refusal it
 * can read costs one turn where a silent fallback costs a wrong conclusion.
 */
const checkType = (tool: string, parameter: ToolParameter, value: unknown): void => {
  const refuse = (expected: string): never => {
    throw new NestLensArgumentError(
      `${tool} takes ${expected} for ${parameter.name}, not ${JSON.stringify(value)}.`,
    );
  };

  if (parameter.type === 'integer' && !Number.isInteger(value)) refuse('a whole number');
  if (parameter.type === 'number' && !(typeof value === 'number' && Number.isFinite(value))) {
    refuse('a number');
  }
  if (parameter.type === 'boolean' && typeof value !== 'boolean') refuse('true or false');
  // Compared as the query string will carry it: `slow: true` is the `"true"` an enum lists.
  if (parameter.enum && !parameter.enum.includes(String(value))) {
    refuse(`one of ${parameter.enum.join(', ')}`);
  }
  if (parameter.in === 'path' && PATH_TRAVERSAL.has(String(value))) {
    throw new NestLensArgumentError(
      `${tool} needs a real value for ${parameter.name}: "", "." and ".." change the path ` +
        'instead of naming one.',
    );
  }
};

/**
 * Refuses a value whose shape is not the one its parameter declares.
 *
 * The hub's own input schema cannot say this per tool, so it is said here,
 * before serialization: a list given for a single value would otherwise be
 * flattened into a query string, and an empty one would vanish from it. For a
 * tool that deletes, a vanished filter is not "no change" but "everything" —
 * `clear_entries` with `type: []` would clear every type.
 *
 * A list may still be one plain value (`"error,warn"`), which is how the API
 * itself reads a list.
 */
const checkShape = (tool: string, parameter: ToolParameter, value: unknown): void => {
  if (parameter.type !== 'array') {
    if (!isPlain(value)) {
      throw new NestLensArgumentError(
        `${tool} takes one value for ${parameter.name}, not a list or an object.`,
      );
    }
    checkType(tool, parameter, value);
    return;
  }

  if (isPlain(value)) return;

  if (!Array.isArray(value)) {
    throw new NestLensArgumentError(`${tool} takes a list for ${parameter.name}, not an object.`);
  }
  if (value.length === 0) {
    throw new NestLensArgumentError(
      `${tool} needs at least one value in ${parameter.name}, or leave ${parameter.name} out.`,
    );
  }
  if (!value.every(isPlain)) {
    throw new NestLensArgumentError(
      `${tool} takes plain values in ${parameter.name}, not lists or objects.`,
    );
  }
};

/**
 * Adds one argument to the query string.
 *
 * A list goes as one key per element, not as a comma-joined string. The API
 * reads a comma in a single value as a separator, so `tags=ALPHA,BETA` is two
 * tags — and a tag may contain a comma (an application's own tags are built
 * from its data), so a list joined here could never say "one tag, with a comma
 * in it". Repeated keys arrive as an array, and the API keeps an array as it is.
 *
 * One element is the exception that needs care: a single `tags=ALPHA,BETA` is a
 * string again, and is split. An empty companion value makes it an array, and
 * the API drops empty values from a list.
 */
const appendQuery = (query: URLSearchParams, name: string, value: unknown): void => {
  if (!Array.isArray(value)) {
    query.append(name, String(value));
    return;
  }

  for (const element of value) query.append(name, String(element));
  if (value.length === 1 && String(value[0]).includes(',')) query.append(name, '');
};

const isAuthorityEnd = (code: number): boolean =>
  code === 0x2f || code === 0x3f || code === 0x23 || code === 0x5c;

/** `user:password@` dropped by position, for an address the URL parser refuses. */
const withoutUserinfoByPosition = (url: string): string => {
  const scheme = url.indexOf('://');
  if (scheme === -1) return url;

  const start = scheme + 3;
  let end = start;
  while (end < url.length && !isAuthorityEnd(url.charCodeAt(end))) end += 1;
  const at = url.lastIndexOf('@', end - 1);

  return at < start ? url : `${url.slice(0, start)}${url.slice(at + 1)}`;
};

/**
 * A URL as it may be shown: without the `user:password@` an address can carry.
 *
 * For addresses a server sends back, such as a redirect's location, which may
 * be relative to `base`. Read with the WHATWG parser that `fetch` itself uses,
 * so what counts as credentials here is exactly what would be sent: the
 * authority ends at `/`, `?`, `#` or, for http, a backslash. An address that
 * does not parse is read by position with the same rule.
 */
export const withoutCredentials = (url: string, base?: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return withoutUserinfoByPosition(url);
  }
  if (!parsed.username && !parsed.password) return url;
  parsed.username = '';
  parsed.password = '';
  return parsed.href;
};

/**
 * Refuses a base URL `fetch` could not use, without repeating it.
 *
 * Read with the parser `fetch` uses. An address it cannot read, or one that is
 * not http(s) — `localhost:3000` parses as the scheme `localhost:` — would fail
 * on the first request, in an error that quotes it. One with credentials in it
 * fails the same way: `fetch` refuses to build a request from it.
 */
export const assertUsableBaseUrl = (url: string): void => {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }

  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new Error(
      'The NestLens URL must be an http:// or https:// address with the dashboard path, ' +
        'such as http://localhost:3000/nestlens.',
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      'The NestLens URL contains credentials (user:password@). They cannot work: fetch refuses ' +
        'an address that carries them, so no request could be sent. Pass them as a header ' +
        'instead (--header "Authorization: ..." or NESTLENS_HEADERS).',
    );
  }
};

/** A loop rather than `/\/+$/`, which backtracks quadratically on slashes that do not end the string. */
const withoutTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return value.slice(0, end);
};

/** What the API said was wrong, in one line, from either of the shapes it uses. */
const messageOf = (status: number, body: unknown): string => {
  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error) && typeof error.message === 'string') {
      const details = isRecord(error.details) ? error.details : undefined;
      const reasons = details?.errors ?? details?.message;
      return Array.isArray(reasons) && reasons.length > 0
        ? `${error.message}: ${reasons.map(String).join('; ')}`
        : error.message;
    }
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.map(String).join('; ');
  }
  return `NestLens answered ${status}`;
};

/**
 * A thin HTTP client for NestLens's API.
 *
 * It knows no endpoint by name. It reads the manifest the API publishes and
 * turns a call — a tool and its arguments — into a request by following that
 * tool's own description, so an endpoint added to NestLens later works without
 * a change here.
 */
export class NestLensClient {
  private readonly root: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NestLensClientOptions) {
    assertUsableBaseUrl(options.baseUrl);
    this.root = `${withoutTrailingSlashes(options.baseUrl)}/${API_ROOT}`;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** The tools the connected NestLens offers right now. */
  async manifest(): Promise<NestLensToolManifest> {
    const body = await this.request('GET', '/tools');
    const data = isRecord(body) ? body.data : undefined;

    if (!isRecord(data) || !Array.isArray(data.tools)) {
      throw new NestLensApiError(
        200,
        'NestLens did not return a tool list. It is probably older than this MCP server; ' +
          'update the nestlens package in the application.',
        body,
      );
    }

    if (data.version !== SUPPORTED_MANIFEST_VERSION) {
      throw new NestLensApiError(
        200,
        `NestLens describes its tools in format ${String(data.version)}, which this MCP server ` +
          `does not read (it reads format ${SUPPORTED_MANIFEST_VERSION}). Update whichever of the two is older.`,
        body,
      );
    }

    return data as unknown as NestLensToolManifest;
  }

  /** Runs one tool. The answer is the API's own body, envelope and all. */
  async invoke(tool: NestLensToolDescriptor, args: Record<string, unknown> = {}): Promise<unknown> {
    const method = String(tool.method).toUpperCase();
    if (!METHODS.includes(method)) {
      throw new NestLensArgumentError(
        `${tool.name} is described with method ${method}, which nestlens-mcp does not send. ` +
          'It sends GET, POST, PUT, PATCH and DELETE.',
      );
    }

    const known = new Map(tool.parameters.map((parameter) => [parameter.name, parameter]));

    const unknown = Object.keys(args).filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new NestLensArgumentError(
        `${tool.name} does not take ${unknown.join(', ')}. ` +
          `It takes: ${[...known.keys()].join(', ') || 'no arguments'}.`,
      );
    }

    // Not "left out": `clear_entries` with `type: null` would otherwise clear every type.
    const nulls = Object.keys(args).filter((name) => args[name] === null);
    if (nulls.length > 0) {
      throw new NestLensArgumentError(
        `${tool.name} does not take null for ${nulls.join(', ')}. ` +
          `Leave ${nulls.join(', ')} out instead.`,
      );
    }

    const missing = tool.parameters.filter(
      (parameter) => parameter.required && args[parameter.name] === undefined,
    );
    if (missing.length > 0) {
      throw new NestLensArgumentError(
        `${tool.name} needs ${missing.map((parameter) => parameter.name).join(', ')}.`,
      );
    }

    const present = Object.entries(args).filter(([, value]) => value !== undefined);
    for (const parameter of tool.parameters) {
      const value = args[parameter.name];
      if (value !== undefined) checkShape(tool.name, parameter, value);
    }

    let path = tool.path;
    const query = new URLSearchParams();
    const body: Record<string, unknown> = {};

    for (const [name, value] of present) {
      const parameter = known.get(name);

      if (parameter?.in === 'path') {
        path = path.replace(`:${name}`, encodeURIComponent(String(value)));
      } else if (parameter?.in === 'body') {
        body[name] = value;
      } else {
        appendQuery(query, name, value);
      }
    }

    const search = query.toString();
    const hasBody = tool.parameters.some((parameter) => parameter.in === 'body');

    return this.request(method, search ? `${path}?${search}` : path, hasBody ? body : undefined);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.root}${path}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...this.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // `fetch` follows a redirect with every header it was given, to any
        // origin — the credentials in `headers` included.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new NestLensUnreachableError(
        `Could not reach NestLens at ${this.root} (${reason}). Is the application running, ` +
          'and is the URL the one the dashboard is mounted at?',
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      throw new NestLensApiError(
        response.status,
        `NestLens at ${this.root} redirected (${response.status}` +
          `${location ? ` to ${withoutCredentials(location, url)}` : ''}). ` +
          'nestlens-mcp does not follow redirects, so ' +
          'the headers it was given go nowhere else; point --url at the final address.',
      );
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      throw new NestLensApiError(response.status, messageOf(response.status, parsed), parsed);
    }

    if (parsed === undefined) {
      throw new NestLensApiError(
        response.status,
        'NestLens answered with something that is not JSON. The URL may point at the application ' +
          'rather than at the dashboard mount (for example http://localhost:3000/nestlens).',
      );
    }

    return parsed;
  }
}
