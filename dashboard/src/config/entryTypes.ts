/**
 * Entry Types Configuration - Single Source of Truth
 *
 * This file defines ALL entry types, their filters, and valid values.
 * Types are generated from this config, eliminating duplication.
 *
 * RULES:
 * 1. Filter keys in 'filters' object become the category name (e.g., 'statuses')
 * 2. 'urlKey' is what gets sent to the API (e.g., 'dumpStatuses')
 * 3. 'values' array contains all valid values for that filter
 * 4. If a value isn't in any filter's values array, it becomes a 'tag'
 */

// ============================================================================
// FILTER DEFINITION
// ============================================================================

export interface FilterConfig {
  /** API query parameter key (e.g., 'dumpStatuses') */
  urlKey: string;
  /** Display name in UI (e.g., 'Status') */
  displayName: string;
  /** All valid values for this filter. Empty array = dynamic/accepts any value */
  values: readonly string[];
}

export interface EntryTypeConfig {
  /** Singular display name */
  displayName: string;
  /** Plural display name */
  pluralName: string;
  /** Route path (e.g., 'dumps') */
  route: string;
  /** Lucide icon name */
  icon: string;
  /** Filter configurations */
  filters: Record<string, FilterConfig>;
}

// ============================================================================
// ENTRY TYPES CONFIGURATION
// ============================================================================

export const ENTRY_TYPES = {
  // ─────────────────────────────────────────────────────────────────────────
  // REQUEST
  // ─────────────────────────────────────────────────────────────────────────
  request: {
    displayName: 'Request',
    pluralName: 'Requests',
    route: 'requests',
    icon: 'Globe',
    filters: {
      methods: {
        urlKey: 'methods',
        displayName: 'Method',
        values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'GRAPHQL'],
      },
      statuses: {
        urlKey: 'statuses',
        displayName: 'Status',
        values: [], // Dynamic - any HTTP status code
      },
      paths: {
        urlKey: 'paths',
        displayName: 'Path',
        values: [], // Dynamic
      },
      controllers: {
        urlKey: 'controllers',
        displayName: 'Controller',
        values: [], // Dynamic
      },
      hostnames: {
        urlKey: 'hostnames',
        displayName: 'Hostname',
        values: [], // Dynamic
      },
      ips: {
        urlKey: 'ips',
        displayName: 'IP',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // QUERY
  // ─────────────────────────────────────────────────────────────────────────
  query: {
    displayName: 'Query',
    pluralName: 'Queries',
    route: 'queries',
    icon: 'Database',
    filters: {
      types: {
        urlKey: 'queryTypes',
        displayName: 'Type',
        values: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'],
      },
      sources: {
        urlKey: 'sources',
        displayName: 'Source',
        values: ['typeorm', 'prisma', 'mongoose', 'sequelize', 'knex', 'mikro-orm', 'drizzle'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXCEPTION
  // ─────────────────────────────────────────────────────────────────────────
  exception: {
    displayName: 'Exception',
    pluralName: 'Exceptions',
    route: 'exceptions',
    icon: 'AlertTriangle',
    filters: {
      names: {
        urlKey: 'names',
        displayName: 'Name',
        values: [], // Dynamic - exception names
      },
      methods: {
        urlKey: 'methods',
        displayName: 'Method',
        values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      },
      paths: {
        urlKey: 'paths',
        displayName: 'Path',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOG
  // ─────────────────────────────────────────────────────────────────────────
  log: {
    displayName: 'Log',
    pluralName: 'Logs',
    route: 'logs',
    icon: 'FileText',
    filters: {
      levels: {
        urlKey: 'levels',
        displayName: 'Level',
        values: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal', 'info'],
      },
      contexts: {
        urlKey: 'contexts',
        displayName: 'Context',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT
  // ─────────────────────────────────────────────────────────────────────────
  event: {
    displayName: 'Event',
    pluralName: 'Events',
    route: 'events',
    icon: 'Zap',
    filters: {
      names: {
        urlKey: 'names',
        displayName: 'Event',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // JOB
  // ─────────────────────────────────────────────────────────────────────────
  job: {
    displayName: 'Job',
    pluralName: 'Jobs',
    route: 'jobs',
    icon: 'Briefcase',
    filters: {
      statuses: {
        urlKey: 'jobStatuses',
        displayName: 'Status',
        values: ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'stuck'],
      },
      queues: {
        urlKey: 'queues',
        displayName: 'Queue',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEDULE
  // ─────────────────────────────────────────────────────────────────────────
  schedule: {
    displayName: 'Schedule',
    pluralName: 'Schedule',
    route: 'schedule',
    icon: 'Clock',
    filters: {
      statuses: {
        urlKey: 'scheduleStatuses',
        displayName: 'Status',
        values: ['started', 'completed', 'failed', 'skipped', 'running'],
      },
      names: {
        urlKey: 'names',
        displayName: 'Task',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CACHE
  // ─────────────────────────────────────────────────────────────────────────
  cache: {
    displayName: 'Cache',
    pluralName: 'Cache',
    route: 'cache',
    icon: 'HardDrive',
    filters: {
      operations: {
        urlKey: 'cacheOperations',
        displayName: 'Operation',
        values: ['get', 'set', 'del', 'clear', 'has', 'reset', 'mget', 'mset'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MAIL
  // ─────────────────────────────────────────────────────────────────────────
  mail: {
    displayName: 'Mail',
    pluralName: 'Mail',
    route: 'mail',
    icon: 'Mail',
    filters: {
      statuses: {
        urlKey: 'mailStatuses',
        displayName: 'Status',
        values: ['sent', 'failed', 'pending', 'queued', 'delivered', 'bounced', 'error'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP CLIENT
  // ─────────────────────────────────────────────────────────────────────────
  'http-client': {
    displayName: 'HTTP Client',
    pluralName: 'HTTP Client',
    route: 'http-client',
    icon: 'Globe',
    filters: {
      methods: {
        urlKey: 'methods',
        displayName: 'Method',
        values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      },
      statuses: {
        urlKey: 'statuses',
        displayName: 'Status',
        values: [], // Dynamic - any HTTP status
      },
      hostnames: {
        urlKey: 'hostnames',
        displayName: 'Hostname',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REDIS
  // ─────────────────────────────────────────────────────────────────────────
  redis: {
    displayName: 'Redis',
    pluralName: 'Redis',
    route: 'redis',
    icon: 'Database',
    filters: {
      commands: {
        urlKey: 'redisCommands',
        displayName: 'Command',
        values: ['GET', 'SET', 'DEL', 'HGET', 'HSET', 'HDEL', 'HGETALL', 'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LRANGE', 'SADD', 'SREM', 'SMEMBERS', 'ZADD', 'ZRANGE', 'ZREM', 'EXPIRE', 'TTL', 'KEYS', 'SCAN', 'PING', 'INFO', 'INCR', 'DECR', 'MGET', 'MSET', 'PUBLISH', 'SUBSCRIBE'],
      },
      statuses: {
        urlKey: 'redisStatuses',
        displayName: 'Status',
        values: ['success', 'failed', 'error', 'timeout'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MODEL
  // ─────────────────────────────────────────────────────────────────────────
  model: {
    displayName: 'Model',
    pluralName: 'Models',
    route: 'models',
    icon: 'Box',
    filters: {
      actions: {
        urlKey: 'modelActions',
        displayName: 'Action',
        values: ['find', 'findOne', 'findMany', 'create', 'update', 'delete', 'save', 'remove', 'count', 'aggregate', 'upsert', 'createMany', 'updateMany', 'deleteMany'],
      },
      entities: {
        urlKey: 'entities',
        displayName: 'Entity',
        values: [], // Dynamic
      },
      sources: {
        urlKey: 'modelSources',
        displayName: 'Source',
        values: ['typeorm', 'prisma', 'mongoose', 'sequelize', 'mikro-orm', 'drizzle'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  notification: {
    displayName: 'Notification',
    pluralName: 'Notifications',
    route: 'notifications',
    icon: 'Bell',
    filters: {
      types: {
        urlKey: 'notificationTypes',
        displayName: 'Type',
        values: ['email', 'sms', 'push', 'socket', 'webhook', 'slack', 'telegram', 'discord'],
      },
      statuses: {
        urlKey: 'notificationStatuses',
        displayName: 'Status',
        values: ['sent', 'failed', 'pending', 'delivered', 'read', 'error', 'queued'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW
  // ─────────────────────────────────────────────────────────────────────────
  view: {
    displayName: 'View',
    pluralName: 'Views',
    route: 'views',
    icon: 'Layout',
    filters: {
      formats: {
        urlKey: 'viewFormats',
        displayName: 'Format',
        values: ['html', 'json', 'xml', 'pdf', 'csv', 'text', 'markdown'],
      },
      statuses: {
        urlKey: 'viewStatuses',
        displayName: 'Status',
        values: ['rendered', 'error', 'failed', 'cached', 'success'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COMMAND
  // ─────────────────────────────────────────────────────────────────────────
  command: {
    displayName: 'Command',
    pluralName: 'Commands',
    route: 'commands',
    icon: 'Terminal',
    filters: {
      statuses: {
        urlKey: 'commandStatuses',
        displayName: 'Status',
        values: ['executing', 'completed', 'failed', 'cancelled', 'timeout', 'running'],
      },
      names: {
        urlKey: 'commandNames',
        displayName: 'Command',
        values: [], // Dynamic
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GATE
  // ─────────────────────────────────────────────────────────────────────────
  gate: {
    displayName: 'Gate',
    pluralName: 'Gates',
    route: 'gates',
    icon: 'Shield',
    filters: {
      names: {
        urlKey: 'gateNames',
        displayName: 'Gate',
        values: [], // Dynamic
      },
      results: {
        urlKey: 'gateResults',
        displayName: 'Result',
        values: ['allowed', 'denied'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH
  // ─────────────────────────────────────────────────────────────────────────
  batch: {
    displayName: 'Batch',
    pluralName: 'Batches',
    route: 'batches',
    icon: 'Layers',
    filters: {
      operations: {
        urlKey: 'batchOperations',
        displayName: 'Operation',
        values: ['insert', 'update', 'delete', 'upsert', 'sync'],
      },
      statuses: {
        urlKey: 'batchStatuses',
        displayName: 'Status',
        values: ['pending', 'processing', 'completed', 'failed', 'partial', 'cancelled'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DUMP
  // ─────────────────────────────────────────────────────────────────────────
  dump: {
    displayName: 'Dump',
    pluralName: 'Dumps',
    route: 'dumps',
    icon: 'HardDrive',
    filters: {
      operations: {
        urlKey: 'dumpOperations',
        displayName: 'Operation',
        values: ['export', 'import', 'backup', 'restore', 'migrate', 'sync'],
      },
      formats: {
        urlKey: 'dumpFormats',
        displayName: 'Format',
        values: ['json', 'csv', 'xml', 'sql', 'yaml', 'binary', 'xlsx'],
      },
      statuses: {
        urlKey: 'dumpStatuses',
        displayName: 'Status',
        values: ['pending', 'completed', 'failed', 'error', 'success', 'cancelled', 'running'],
      },
    },
  },
} as const;

// ============================================================================
// TYPE GENERATION
// ============================================================================

/** All entry type keys */
export type EntryTypeName = keyof typeof ENTRY_TYPES;

/** Route names (plural forms used in URLs) */
export type ListType =
  | 'requests' | 'queries' | 'exceptions' | 'logs' | 'events'
  | 'jobs' | 'cache' | 'mail' | 'schedule' | 'http-client'
  | 'redis' | 'models' | 'notifications' | 'views' | 'commands'
  | 'gates' | 'batches' | 'dumps';

/** Generate all possible URL keys from the config */
type ExtractUrlKeys<T> = T extends { filters: infer F }
  ? F extends Record<string, { urlKey: infer U }>
    ? U
    : never
  : never;

type AllUrlKeys = ExtractUrlKeys<typeof ENTRY_TYPES[keyof typeof ENTRY_TYPES]>;

/** All valid filter URL keys */
export type FilterUrlKey = AllUrlKeys | 'tags' | 'search' | 'path' | 'requestId';

/** All category names used in filters (like 'types', 'operations', 'statuses') */
export type FilterCategory =
  | 'methods' | 'statuses' | 'paths' | 'controllers' | 'hostnames' | 'ips'
  | 'types' | 'sources' | 'names' | 'levels' | 'contexts'
  | 'queues' | 'operations' | 'commands' | 'formats'
  | 'actions' | 'entities' | 'results';

/** FilterType for ClickableBadge - includes all URL keys AND category names */
export type FilterType = FilterUrlKey | FilterCategory | 'tag';

// ============================================================================
// ROUTE MAPPING
// ============================================================================

/** Map route to entry type name */
const ROUTE_TO_TYPE: Record<string, EntryTypeName> = {
  requests: 'request',
  queries: 'query',
  exceptions: 'exception',
  logs: 'log',
  events: 'event',
  jobs: 'job',
  schedule: 'schedule',
  cache: 'cache',
  mail: 'mail',
  'http-client': 'http-client',
  redis: 'redis',
  models: 'model',
  notifications: 'notification',
  views: 'view',
  commands: 'command',
  gates: 'gate',
  batches: 'batch',
  dumps: 'dump',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get entry type config by route or type name
 */
export function getEntryConfig(routeOrType: string): EntryTypeConfig | undefined {
  // Try direct match first
  if (routeOrType in ENTRY_TYPES) {
    return ENTRY_TYPES[routeOrType as EntryTypeName];
  }
  // Try route mapping
  const typeName = ROUTE_TO_TYPE[routeOrType];
  if (typeName) {
    return ENTRY_TYPES[typeName];
  }
  return undefined;
}

/**
 * Get filter config by route and category
 */
export function getFilterConfig(route: string, category: string): FilterConfig | undefined {
  const config = getEntryConfig(route);
  return config?.filters[category];
}

/**
 * Get all URL keys for a specific entry type
 */
export function getEntryUrlKeys(route: string): string[] {
  const config = getEntryConfig(route);
  if (!config) return ['tags'];

  const keys = Object.values(config.filters).map(f => f.urlKey);
  keys.push('tags', 'search');
  return keys;
}

/**
 * Validate that all required configs exist - call in dev mode
 */
export function validateConfig(): string[] {
  const errors: string[] = [];

  for (const [typeName, config] of Object.entries(ENTRY_TYPES)) {
    if (!config.displayName) errors.push(`${typeName}: missing displayName`);
    if (!config.route) errors.push(`${typeName}: missing route`);
    if (!config.filters) errors.push(`${typeName}: missing filters`);

    for (const [filterName, filter] of Object.entries(config.filters)) {
      if (!filter.urlKey) errors.push(`${typeName}.${filterName}: missing urlKey`);
      if (!filter.displayName) errors.push(`${typeName}.${filterName}: missing displayName`);
    }
  }

  return errors;
}

// ============================================================================
// ALIASES (for backwards compatibility)
// ============================================================================

/** Alias for getEntryConfig */
export const getEntryTypeConfig = getEntryConfig;

// Run validation in development (Vite provides import.meta.env)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error('[entryTypes] Configuration errors:', errors);
  }
}
