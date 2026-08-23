import type { Request } from 'express';
import { Entry, EntryType } from './types';
import { MaskingTerms } from './core/masking-terms';
import type { NestLensPreset } from './presets';

/**
 * Payload format for an alerting webhook.
 * - 'slack': Slack incoming-webhook JSON (`{ text }`)
 * - 'discord': Discord webhook JSON (`{ content }`)
 * - 'generic': raw `{ event, entry }` JSON
 */
export type AlertingWebhookType = 'slack' | 'discord' | 'generic';

/**
 * What a webhook is told about.
 *
 * A list of entry types, or `'failures'` — which is what most destinations are
 * for and takes a list plus an entry filter to say otherwise: exceptions, 5xx
 * requests, failed operations, failed jobs, schedules, mail and notifications,
 * and error logs. A 4xx is deliberately not among them: a malformed query is
 * the caller's mistake, and a webhook anyone with curl can ring is a pager
 * anyone with curl can ring.
 */
export type AlertingEvents = EntryType[] | 'failures';

/**
 * A single alerting destination.
 */
export interface AlertingWebhook {
  /** Webhook URL to POST alerts to. */
  url: string;
  /** Payload format. Default: 'generic'. */
  type?: AlertingWebhookType;
  /**
   * What triggers this webhook: entry types, or `'failures'` for everything
   * that went wrong. Default: `['exception']`.
   */
  events?: AlertingEvents;
  /** Minimum milliseconds between alerts sharing the same dedup key. Default: 60000. */
  throttleMs?: number;
}

/**
 * Proactive alerting: POST collected entries (exceptions by default) to webhooks.
 */
export interface AlertingConfig {
  enabled?: boolean;
  /** One or more webhook destinations. */
  webhooks?: AlertingWebhook[];
  /** Per-delivery timeout in milliseconds. Default: 5000. */
  timeoutMs?: number;
}

/**
 * Authenticated user information returned from authorization
 */
export interface AuthUser {
  id: string | number;
  name?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Authorization configuration for NestLens dashboard access
 */
export interface AuthorizationConfig {
  /**
   * Allowed environments where NestLens is accessible.
   * Set to null to allow all environments.
   * Default: ['development', 'local', 'test']
   */
  allowedEnvironments?: string[] | null;

  /**
   * Environment variable to check for current environment.
   * Default: 'NODE_ENV'
   */
  environmentVariable?: string;

  /**
   * IP addresses allowed to access NestLens (supports wildcards like '192.168.1.*')
   */
  allowedIps?: string[];

  /**
   * Custom authorization function.
   * Return true/false for simple auth, or AuthUser object for user context.
   */
  canAccess?: (req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>;

  /**
   * Required roles for access (checked against AuthUser.roles if canAccess returns AuthUser)
   */
  requiredRoles?: string[];
}

/**
 * A listener of NestLens's own, instead of a mount on the application's server.
 *
 * Everything under {@link AuthorizationConfig} decides who is allowed through;
 * this decides who can reach the door at all. Mounted on the host application —
 * the default, and unchanged — the dashboard shares that application's socket,
 * so whatever reaches the application reaches `/nestlens` too and only the
 * checks in front of it say otherwise. A reverse proxy that forgets to exclude
 * the path, or excludes it in a `location` block that never matches, publishes
 * every recorded Authorization header and request body to the internet, and
 * nothing inside the application can tell that it happened.
 *
 * Given a `server`, NestLens binds its own socket to the address named here and
 * registers no dashboard route on the application at all. On a private
 * interface — a VPN address, a container network, `127.0.0.1` behind an SSH
 * tunnel — the dashboard is then not merely protected from the internet but
 * absent from it, which does not depend on a second component staying correct.
 *
 * The address is not optional and there is no default. `0.0.0.0` is a fine
 * answer where the network is the boundary; it just has to be the answer
 * somebody wrote down.
 *
 * Authorization is unaffected: `allowedEnvironments`, `allowedIps`, `canAccess`
 * and `requiredRoles` are enforced on this listener exactly as they are on the
 * mounted one.
 */
export interface DashboardServerConfig {
  /**
   * Address to bind, e.g. `'127.0.0.1'`, a tailnet address, or `'0.0.0.0'`.
   *
   * The socket is bound to this address alone — this is not a filter applied
   * after listening on everything, so an address the host does not hold fails
   * at startup rather than falling back.
   */
  host: string;

  /** Port to bind. `0` asks the operating system for a free one. */
  port: number;
}

export interface QueryWatcherConfig {
  enabled?: boolean;
  slowThreshold?: number; // ms, default: 100
  ignorePatterns?: RegExp[];
}

export interface RequestWatcherConfig {
  enabled?: boolean;
  ignorePaths?: string[];
  maxBodySize?: number; // bytes, default: 64KB; 0 captures none
  captureHeaders?: boolean;
  captureBody?: boolean;
  captureResponse?: boolean;
  // Telescope-like features
  captureUser?: boolean; // default: true - capture request.user
  captureSession?: boolean; // default: true - capture request.session
  captureResponseHeaders?: boolean; // default: true - capture response headers
  /**
   * Record how much the heap grew across the handler. Default: false.
   *
   * Off by default because the figure is not what it appears to be and is not
   * free. It is `process.memoryUsage().heapUsed` read either side of the
   * handler, and the heap is shared with every other request in flight, with a
   * garbage collection free to run between the two readings. Measured on an
   * endpoint that returns `{ok: true}` and allocates nothing worth naming, it
   * ranged from -570KB to +671KB and was negative in one request out of thirty.
   *
   * Reading it twice per request cost about 2.5% of the process's CPU under
   * load. Turn it on when the application is handling one request at a time —
   * a local reproduction, a worker — where the number means something.
   */
  captureMemory?: boolean;
  captureControllerInfo?: boolean; // default: true - capture controller/handler
  tags?: (req: Request) => string[] | Promise<string[]>; // custom tags function
}

export interface ExceptionWatcherConfig {
  enabled?: boolean;
  ignoreExceptions?: string[]; // Exception class names to ignore
}

export interface LogWatcherConfig {
  enabled?: boolean;
  minLevel?: 'verbose' | 'debug' | 'log' | 'warn' | 'error';
}

export interface CacheWatcherConfig {
  enabled?: boolean;
}

export interface EventWatcherConfig {
  enabled?: boolean;
  ignoreEvents?: string[];
}

export interface JobWatcherConfig {
  enabled?: boolean;
}

export interface ScheduleWatcherConfig {
  enabled?: boolean;
}

export interface MailWatcherConfig {
  enabled?: boolean;
}

export interface HttpClientWatcherConfig {
  enabled?: boolean;
  maxBodySize?: number; // bytes, default: 64KB; 0 captures none
  captureRequestBody?: boolean; // default: true
  captureResponseBody?: boolean; // default: true
  ignoreHosts?: string[]; // hosts to ignore (e.g., ['localhost', 'internal-service'])
  // Sensitive data masking (Telescope-like feature)
  sensitiveHeaders?: string[]; // headers to mask (e.g., ['authorization', 'x-api-key'])
  sensitiveRequestParams?: string[]; // request body params to mask (e.g., ['password', 'credit_card'])
  sensitiveResponseParams?: string[]; // response body params to mask (e.g., ['access_token', 'api_key'])
}

export interface CommandWatcherConfig {
  enabled?: boolean;
  capturePayload?: boolean; // default: true
  captureResult?: boolean; // default: true
  maxPayloadSize?: number; // bytes, default: 64KB; 0 captures none
}

export interface GateWatcherConfig {
  enabled?: boolean;
  captureContext?: boolean; // default: true
  ignoreAbilities?: string[]; // gate/ability names to ignore (e.g., ['viewDashboard', 'accessAdmin'])
}

export interface BatchWatcherConfig {
  enabled?: boolean;
  trackMemory?: boolean; // default: true
}

export interface DumpWatcherConfig {
  enabled?: boolean;
}

export interface RedisWatcherConfig {
  enabled?: boolean;
  ignoreCommands?: string[]; // commands to ignore (e.g., ['ping', 'info'])
  maxResultSize?: number; // bytes, default: 1KB; 0 captures none
}

export interface ModelWatcherConfig {
  enabled?: boolean;
  ignoreEntities?: string[]; // entity names to ignore
  captureData?: boolean; // default: false - capture entity data
}

export interface NotificationWatcherConfig {
  enabled?: boolean;
  captureMessage?: boolean; // default: false - capture message content
}

export interface ViewWatcherConfig {
  enabled?: boolean;
  captureData?: boolean; // default: false - capture template locals/data
}

/**
 * GraphQL subscription tracking configuration
 */
export interface GraphQLSubscriptionConfig {
  /** Enable subscription tracking. Default: true */
  enabled?: boolean;
  /** Track individual subscription messages. Default: false (lifecycle only) */
  trackMessages?: boolean;
  /** Capture message data content. Default: false */
  captureMessageData?: boolean;
  /** Maximum messages to track per subscription. Default: 100 */
  maxTrackedMessages?: number;
  /** Track connection/disconnection events. Default: true */
  trackConnectionEvents?: boolean;
}

/**
 * GraphQL watcher configuration
 */
export interface GraphQLWatcherConfig {
  enabled?: boolean;

  /**
   * GraphQL server to use. Default: 'auto' (auto-detect)
   * - 'apollo': Apollo Server (@apollo/server)
   * - 'mercurius': Mercurius (Fastify GraphQL)
   * - 'auto': Auto-detect based on installed packages
   */
  server?: 'apollo' | 'mercurius' | 'auto';

  // Query handling
  /** Maximum query size in bytes before truncation. Default: 8192 (8KB) */
  maxQuerySize?: number;
  /** Capture variables passed to operations. Default: true */
  captureVariables?: boolean;
  /**
   * Maximum size of the recorded variables in bytes. Default: 65536 (64KB).
   *
   * The query is truncated at `maxQuerySize` and the response at
   * `maxResponseSize`; the variables were bounded only in depth, so a single
   * operation carrying a 100KB argument was stored whole — 101,228 bytes for
   * one entry, repeatable on every request.
   */
  maxVariablesSize?: number;
  /**
   * Variable and response field names to mask, added to the built-in list and
   * to whatever `security.dataMasking.sensitiveParams` names.
   *
   * A name matches on whole words, ignoring case, underscores and dashes:
   * `token` covers `apiToken`, `api_token`, `TOKENS` and `resetToken`, and
   * does not cover `tokenCount`. A trailing `*` matches by prefix instead.
   *
   * Masking here is what the collector trusts — it does not walk a payload
   * this watcher has already cleaned — so this list is the whole answer for
   * GraphQL variables and responses. `{ replace: [...] }` masks exactly these
   * and drops both built-in lists; see {@link MaskingTerms}.
   */
  sensitiveVariables?: MaskingTerms;
  /** Capture request headers (sensitive headers masked). Default: true */
  captureHeaders?: boolean;
  /**
   * Additional header names to mask (case-insensitive), merged with the
   * built-in defaults ['authorization', 'cookie', 'set-cookie', 'x-api-key',
   * 'x-auth-token']. Example: ['x-csrf-token', 'x-session-id']
   *
   * `{ replace: [...] }` masks exactly these instead; see {@link MaskingTerms}.
   */
  sensitiveHeaders?: MaskingTerms;
  /** Skip introspection queries (__schema, __type). Default: true */
  ignoreIntrospection?: boolean;
  /** Operation names to ignore. Example: ['HealthCheck', 'InternalMetrics'] */
  ignoreOperations?: string[];

  // Tracing (OFF by default for performance)
  /** Enable field-level resolver tracing. Default: false */
  traceFieldResolvers?: boolean;
  /** Only trace resolvers slower than this threshold (ms). Undefined = disabled */
  traceSlowResolvers?: number;
  /** Sample rate for resolver tracing (0-1). Default: 0.1 (when enabled) */
  resolverTracingSampleRate?: number;

  // N+1 Detection
  /** Enable N+1 query detection. Default: true */
  detectN1Queries?: boolean;
  /** Threshold for N+1 warnings (number of calls to same resolver). Default: 10 */
  n1Threshold?: number;

  /**
   * Also record what a failed operation threw, as an exception. Default: true.
   *
   * A failed HTTP request produces two entries — the request and the exception
   * the handler threw — and a failed operation used to produce only the
   * operation. Everything that reads exceptions was therefore empty on a
   * GraphQL API however the application was configured: the Exceptions page,
   * `stats.unresolvedExceptions`, `sampling.always: ['exception']` and an
   * alerting webhook on `events: ['exception']`, both of which are the
   * defaults.
   *
   * Set to `false` where the operation entry is enough — the errors are on it
   * either way, up to the first five.
   */
  recordExceptions?: boolean;

  // Subscriptions
  /** Subscription tracking configuration */
  subscriptions?: GraphQLSubscriptionConfig;

  // Performance
  /** Sample rate for operation tracking (0-1). Default: 1.0 (track all) */
  samplingRate?: number;

  // Response capture
  /** Capture response data. Default: false */
  captureResponse?: boolean;
  /**
   * Maximum response size in bytes before truncation. Default: 64KB (65536)
   *
   * Read this before raising it. A captured response is serialized and walked
   * key by key on the event loop of the application being watched, so this
   * option buys detail with latency added to every operation that returns a
   * response near the limit:
   *
   * | response | cost per operation |
   * |---------:|-------------------:|
   * |    70 KB |             ~0.3ms |
   * |   280 KB |             ~1.2ms |
   * |   980 KB |             ~3.7ms |
   * |  4900 KB |              ~27ms |
   *
   * It is linear, and it is time the request is not doing its own work. 64KB
   * is enough to read a response on the dashboard; someone once set this to
   * 5MB in production because nothing here said what that meant.
   *
   * Responses over the limit are cheap — around 0.2ms, whatever their size,
   * because they are rejected without being serialized. So the table is the
   * cost of the responses you choose to keep, and raising the limit is what
   * moves a response into it.
   *
   * Measured by `npm run benchmark:sanitizer`; run it rather than trusting
   * these figures on hardware that is not the one they came from.
   */
  maxResponseSize?: number;

  // Custom tagging
  /** Custom tags function for GraphQL operations */
  tags?: (ctx: GraphQLOperationContext) => string[] | Promise<string[]>;
}

/**
 * GraphQL operation context for custom tags
 */
export interface GraphQLOperationContext {
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription';
  query: string;
  variables?: Record<string, unknown>;
  request?: {
    ip?: string;
    userAgent?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Available storage drivers for NestLens
 * - 'memory': In-memory storage (default, zero config, works everywhere)
 * - 'sqlite': SQLite storage (requires better-sqlite3)
 * - 'redis': Redis storage (requires ioredis)
 */
export type StorageDriver = 'memory' | 'sqlite' | 'redis';

/**
 * SQLite storage configuration
 */
export interface SqliteStorageConfig {
  /** Path to the SQLite database file. Default: '.cache/nestlens.db' */
  filename?: string;
}

/**
 * Redis storage configuration
 */
export interface RedisStorageConfig {
  /** Redis host. Default: 'localhost' */
  host?: string;
  /** Redis port. Default: 6379 */
  port?: number;
  /** Redis password */
  password?: string;
  /**
   * Redis database number. Default: 0.
   *
   * Decides the database whether or not `url` is given — it is written into the
   * URL, which is the one place ioredis reads it from. Give NestLens one of its
   * own: `keyPrefix` keeps the keys distinct from the application's, and a
   * `FLUSHDB` or an `allkeys-lru` eviction policy does not care about prefixes.
   */
  db?: number;
  /** Key prefix for all NestLens keys. Default: 'nestlens:' */
  keyPrefix?: string;
  /** Redis connection URL (overrides host, port and password if provided) */
  url?: string;
  /** Command timeout in milliseconds. Default: 5000 */
  commandTimeout?: number;
  /** Set by the factory from `storage.maxEntries`; not configured here. */
  maxEntries?: number;
}

/**
 * In-memory storage configuration
 */
export interface MemoryStorageConfig {
  /** Maximum number of entries to store. Default: 10000 */
  maxEntries?: number;
}

/**
 * Storage configuration for NestLens
 */
export interface StorageConfig {
  /**
   * The most entries to keep, whichever driver is in use. Default: 10000.
   *
   * Age was the only bound the file and Redis drivers had — `maxEntries` was
   * declared on the memory driver alone — so a busy application filled a disk
   * or a Redis instance long before anything reached `pruning.maxAge`. At a
   * thousand requests a second the default twenty-four hours is eighty-six
   * million entries.
   *
   * The oldest go first, which is the same rule the in-memory driver has
   * always followed. Set it to `0` to keep everything and rely on age alone —
   * a deliberate choice rather than the previous silence.
   */
  maxEntries?: number;

  /**
   * Storage driver to use.
   * Default: 'memory' (zero config, works everywhere including Docker)
   */
  driver?: StorageDriver;

  /** SQLite-specific configuration */
  sqlite?: SqliteStorageConfig;

  /** Redis-specific configuration */
  redis?: RedisStorageConfig;

  /** In-memory storage configuration */
  memory?: MemoryStorageConfig;
}

/**
 * When old entries are deleted, and how often that is checked.
 *
 * The two are in different units, which is worth saying out loud because they
 * sit next to each other: `pruning: { maxAge: 14 * 24, interval: 60 }` is a
 * fortnight checked hourly, and a reader who took both for hours would have
 * written an application that prunes every sixty *days*. Reported by someone
 * who found the units by reading `pruning.service.ts`.
 *
 * They are kept as they are — an age is naturally hours and a check interval
 * naturally minutes — and both are named in the line NestLens prints at
 * startup, with their units.
 */
export interface PruningConfig {
  /** Default: true. */
  enabled?: boolean;
  /** How old an entry may get, **in hours**. Default: 24. */
  maxAge?: number;
  /** How often pruning runs, **in minutes**. Default: 60. */
  interval?: number;
}

/**
 * Records a fraction of traffic instead of all of it.
 *
 * Absent by default: NestLens records everything, which is what it is for. This
 * is for an application that has outgrown paying for that on every request and
 * would rather see one request in ten completely than all of them not at all.
 *
 * Sampling is decided per *request*, from its id, so a request and everything
 * recorded under it — its queries, cache reads, logs and outgoing calls — are
 * kept together or dropped together. A detail page is therefore always whole.
 *
 * Cheaper than {@link NestLensConfig.filter} for this purpose: the decision is
 * a hash rather than a callback, and it is made before the entry is masked or
 * buffered. Use `filter` when the rule depends on what is *in* the entry.
 */
export interface SamplingConfig {
  /**
   * Fraction of requests to record, from 0 to 1. Default: 1, meaning all.
   *
   * `0.1` records a tenth of requests, whole. `0` records nothing except what
   * `always` names, which is a coherent setting: exceptions only.
   */
  rate?: number;

  /**
   * Entry types recorded whatever the rate says.
   * Default: `['exception']`.
   *
   * An exception is the thing you went looking for, and sampling it away is the
   * one outcome that makes the tool useless at the moment it matters. Set it
   * explicitly to change what is exempt — `[]` exempts nothing.
   */
  always?: EntryType[];
}

/**
 * Security configuration for data masking and input validation.
 */
export interface SecurityConfig {
  /**
   * Data masking configuration.
   */
  dataMasking?: {
    /**
     * Headers to mask (case-insensitive), added to the built-in list.
     *
     * `{ replace: [...] }` masks exactly these instead. See
     * {@link MaskingTerms}.
     */
    sensitiveHeaders?: MaskingTerms;
    /** Body/query parameters to mask, added to the built-in list. */
    sensitiveParams?: MaskingTerms;
    /** User object fields to mask, added to the built-in list. */
    sensitiveUserFields?: MaskingTerms;
    /** Replacement string for masked values. Default: '***REDACTED***' */
    maskReplacement?: string;
  };

  /**
   * Stack trace sanitization mode.
   * - 'none': Show full stack traces
   * - 'partial': Show simplified traces (default in production)
   * - 'full': Hide stack traces completely
   */
  stackTraceSanitization?: 'none' | 'partial' | 'full';
}

/**
 * Rate limiting configuration for API endpoints
 */
export interface RateLimitConfig {
  /**
   * Time window in milliseconds
   * Default: 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Maximum number of requests per window per IP
   * Default: 100
   */
  maxRequests?: number;
}

export interface NestLensConfig {
  // General
  enabled?: boolean;
  path?: string; // default: '/nestlens'

  /**
   * A configuration for a job people keep writing out themselves.
   *
   * `'failures-only'` is the production stance: record nothing ordinary, keep
   * the failures whole, and stop paying for payload capture nothing will keep.
   * It sets `sampling.rate: 0` with the failing types in `sampling.always`, a
   * filter that narrows those types to their failures, and turns off GraphQL
   * response capture and resolver tracing.
   *
   * Everything the application writes wins over it, except `filter`, which
   * composes: under a preset, a filter of your own means "the failures, and
   * this too".
   *
   * ```ts
   * NestLensModule.forRoot({
   *   preset: 'failures-only',
   *   server: { host: '0.0.0.0', port: 3001 },
   *   storage: { driver: 'redis', redis: { url: process.env.REDIS_URL, db: 1 } },
   *   alerting: { webhooks: [{ url: process.env.ALERT_WEBHOOK, type: 'slack' }] },
   * })
   * ```
   */
  preset?: NestLensPreset;

  /**
   * Trust the `X-Forwarded-Prefix` header when building the dashboard's asset
   * and API URLs. Enable this only when NestLens sits behind a reverse proxy
   * that strips a path segment (nginx `proxy_pass` with a trailing slash, a
   * Kubernetes ingress rewrite) *and* that proxy sets the header itself.
   *
   * Off by default: the header is attacker-controlled, and honouring it
   * unconditionally would let a request repoint the dashboard's URLs — which a
   * shared cache in front of the application could then serve to other users.
   *
   * @default false
   */
  trustProxy?: boolean;

  /**
   * Record a fraction of traffic instead of all of it.
   *
   * Absent by default, which records everything. See {@link SamplingConfig}.
   */
  sampling?: SamplingConfig;

  /**
   * Serve the dashboard on a listener of its own, bound to a chosen address,
   * instead of mounting it on the application's server.
   *
   * Absent by default, which is the mounted behaviour every installation has
   * today. See {@link DashboardServerConfig}.
   */
  server?: DashboardServerConfig;

  // Authorization
  authorization?: AuthorizationConfig;

  // Storage
  storage?: StorageConfig;

  // Pruning
  pruning?: PruningConfig;

  // Rate Limiting
  /**
   * Rate limiting configuration for API endpoints.
   * Set to `false` to disable rate limiting (default).
   * Set to an object to enable: `{ windowMs: 60000, maxRequests: 100 }`.
   * Default: disabled (NestLens is a development/debugging tool)
   */
  rateLimit?: RateLimitConfig | false;

  // Security
  /**
   * Security configuration for data masking and input validation.
   */
  security?: SecurityConfig;

  // Alerting
  /**
   * Proactive alerting — POST collected entries (exceptions by default) to
   * Slack/Discord/generic webhooks. Disabled by default.
   */
  alerting?: AlertingConfig;

  // Entry Filtering
  /**
   * Filter function to determine if an entry should be collected.
   * Return true to collect the entry, false to skip it.
   * Errors are logged but don't block collection (fail-open).
   */
  filter?: (entry: Entry) => boolean | Promise<boolean>;

  /**
   * Batch filter function to process multiple entries at once.
   * Return the entries that should be collected.
   * Errors are logged but don't block collection (fail-open).
   */
  filterBatch?: (entries: Entry[]) => Entry[] | Promise<Entry[]>;

  // Watchers
  watchers?: {
    request?: boolean | RequestWatcherConfig;
    query?: boolean | QueryWatcherConfig;
    exception?: boolean | ExceptionWatcherConfig;
    log?: boolean | LogWatcherConfig;
    cache?: boolean | CacheWatcherConfig;
    event?: boolean | EventWatcherConfig;
    job?: boolean | JobWatcherConfig;
    schedule?: boolean | ScheduleWatcherConfig;
    mail?: boolean | MailWatcherConfig;
    httpClient?: boolean | HttpClientWatcherConfig;
    redis?: boolean | RedisWatcherConfig;
    model?: boolean | ModelWatcherConfig;
    notification?: boolean | NotificationWatcherConfig;
    view?: boolean | ViewWatcherConfig;
    command?: boolean | CommandWatcherConfig;
    gate?: boolean | GateWatcherConfig;
    batch?: boolean | BatchWatcherConfig;
    dump?: boolean | DumpWatcherConfig;
    graphql?: boolean | GraphQLWatcherConfig;
  };
}

export const DEFAULT_CONFIG: Required<
  Omit<
    NestLensConfig,
    | 'preset'
    | 'authorization'
    | 'filter'
    | 'filterBatch'
    | 'rateLimit'
    | 'security'
    | 'alerting'
    | 'server'
    | 'sampling'
  >
> & {
  authorization: AuthorizationConfig;
  filter?: (entry: Entry) => boolean | Promise<boolean>;
  filterBatch?: (entries: Entry[]) => Entry[] | Promise<Entry[]>;
  rateLimit?: RateLimitConfig | false;
  security?: SecurityConfig;
  server?: DashboardServerConfig;
  sampling?: SamplingConfig;
  preset?: NestLensPreset;
} = {
  enabled: true,
  path: '/nestlens',
  trustProxy: false,
  // Absent, not a disabled default: the dashboard mounts on the application's
  // server unless somebody names an address for it.
  server: undefined,
  // Absent likewise: everything is recorded until somebody asks for less.
  sampling: undefined,
  authorization: {
    allowedEnvironments: ['development', 'local', 'test'],
    environmentVariable: 'NODE_ENV',
    allowedIps: undefined,
    canAccess: undefined,
    requiredRoles: undefined,
  },
  filter: undefined,
  filterBatch: undefined,
  rateLimit: false, // Rate limiting disabled by default - NestLens is a dev tool
  storage: {
    driver: 'memory' as StorageDriver,
    maxEntries: 10000,
    sqlite: {
      filename: '.cache/nestlens.db',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'nestlens:',
    },
    // No `memory` block here on purpose. The merge below is shallow, so a
    // default written here would be present for every application — and
    // `resolveMaxEntries` prefers `storage.memory.maxEntries`, the place this
    // could be set before there was a driver-wide one. The default therefore
    // won against the option it is the default for: `storage.maxEntries` was
    // silently ignored on every driver, including `0`, which is documented as
    // "keep everything".
  },
  pruning: {
    enabled: true,
    maxAge: 24,
    interval: 60,
  },
  watchers: {
    request: true,
    query: true,
    exception: true,
    log: true,
    cache: false,
    event: false,
    job: false,
    schedule: false,
    mail: false,
    httpClient: false,
    redis: false,
    model: false,
    notification: false,
    view: false,
    command: false,
    gate: false,
    batch: false,
    dump: false,
    graphql: false, // Disabled by default - requires GraphQL server integration
  },
};

export const NESTLENS_CONFIG = Symbol('NESTLENS_CONFIG');

/**
 * Internal API path prefix - used to avoid conflicts with user routes
 */
export const NESTLENS_API_PREFIX = '__nestlens__';
