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
    this.root = `${options.baseUrl.replace(/\/+$/, '')}/${API_ROOT}`;
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

    const missing = tool.parameters.filter(
      (parameter) => parameter.required && (args[parameter.name] ?? null) === null,
    );
    if (missing.length > 0) {
      throw new NestLensArgumentError(
        `${tool.name} needs ${missing.map((parameter) => parameter.name).join(', ')}.`,
      );
    }

    const present = Object.entries(args).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    for (const parameter of tool.parameters) {
      const value = args[parameter.name];
      if (value !== undefined && value !== null) checkShape(tool.name, parameter, value);
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
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new NestLensUnreachableError(
        `Could not reach NestLens at ${this.root} (${reason}). Is the application running, ` +
          'and is the URL the one the dashboard is mounted at?',
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
