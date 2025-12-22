import { Request } from 'express';
import { Entry } from './types';

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

export interface QueryWatcherConfig {
  enabled?: boolean;
  slowThreshold?: number; // ms, default: 100
  ignorePatterns?: RegExp[];
}

export interface RequestWatcherConfig {
  enabled?: boolean;
  ignorePaths?: string[];
  maxBodySize?: number; // bytes, default: 64KB
  captureHeaders?: boolean;
  captureBody?: boolean;
  captureResponse?: boolean;
  // Telescope-like features
  captureUser?: boolean; // default: true - capture request.user
  captureSession?: boolean; // default: true - capture request.session
  captureResponseHeaders?: boolean; // default: true - capture response headers
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
  maxBodySize?: number; // bytes, default: 64KB
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
  maxPayloadSize?: number; // bytes, default: 64KB
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
  maxResultSize?: number; // bytes, default: 1KB
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

export interface StorageConfig {
  type?: 'sqlite'; // default: 'sqlite' (only option for now)
  filename?: string; // default: '.cache/nestlens.db'
}

export interface PruningConfig {
  enabled?: boolean; // default: true
  maxAge?: number; // hours, default: 24
  interval?: number; // minutes, default: 60
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

  // Authorization (new unified config)
  authorization?: AuthorizationConfig;

  // Legacy security options (deprecated, use authorization instead)
  /** @deprecated Use authorization.allowedIps instead */
  allowedIps?: string[];
  /** @deprecated Use authorization.canAccess instead */
  canAccess?: (req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>;

  // Storage
  storage?: StorageConfig;

  // Pruning
  pruning?: PruningConfig;

  // Rate Limiting
  /**
   * Rate limiting configuration for API endpoints.
   * Set to false to disable rate limiting.
   * Default: 100 requests per minute per IP.
   */
  rateLimit?: RateLimitConfig | false;

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
  };
}

export const DEFAULT_CONFIG: Required<
  Omit<NestLensConfig, 'allowedIps' | 'canAccess' | 'authorization' | 'filter' | 'filterBatch' | 'rateLimit'>
> & {
  authorization: AuthorizationConfig;
  allowedIps?: string[];
  canAccess?: (req: Request) => boolean | AuthUser | Promise<boolean | AuthUser>;
  filter?: (entry: Entry) => boolean | Promise<boolean>;
  filterBatch?: (entries: Entry[]) => Entry[] | Promise<Entry[]>;
  rateLimit?: RateLimitConfig | false;
} = {
  enabled: true,
  path: '/nestlens',
  authorization: {
    allowedEnvironments: ['development', 'local', 'test'],
    environmentVariable: 'NODE_ENV',
    allowedIps: undefined,
    canAccess: undefined,
    requiredRoles: undefined,
  },
  allowedIps: undefined,
  canAccess: undefined,
  filter: undefined,
  filterBatch: undefined,
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
  storage: {
    type: 'sqlite',
    filename: '.cache/nestlens.db',
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
  },
};

export const NESTLENS_CONFIG = Symbol('NESTLENS_CONFIG');

/**
 * Internal API path prefix - used to avoid conflicts with user routes
 */
export const NESTLENS_API_PREFIX = '__nestlens__';
