/**
 * Type definitions for optional ORM dependencies.
 * These interfaces describe the minimum contract we need from each ORM
 * without requiring the actual packages to be installed.
 */

// ---------------------------------------------------------------------------
// TypeORM types (compatible with TypeORM 0.3.x public API)
// ---------------------------------------------------------------------------

/**
 * Subset of TypeORM DataSource that the watcher needs to interact with.
 * The watcher attaches an EntitySubscriber for the success path and wraps
 * the logger for the error path; nothing else is touched.
 */
export interface TypeORMDataSourceLike {
  isInitialized?: boolean;
  options?: { name?: string; type?: string };
  subscribers?: unknown[];
  logger?: TypeORMLoggerLike;
}

/**
 * Event payload TypeORM passes to EntitySubscriberInterface.afterQuery.
 * Source: typeorm/src/subscriber/event/QueryEvent.ts
 */
export interface TypeORMQueryEvent {
  query: string;
  parameters?: unknown[];
  executionTime?: number;
  success?: boolean;
  error?: unknown;
  rawResults?: unknown;
  connection?: { name?: string };
  queryRunner?: unknown;
}

/**
 * Subset of TypeORM Logger interface used by the watcher.
 * Source: typeorm/src/logger/Logger.ts
 */
export interface TypeORMLoggerLike {
  logQuery?(query: string, parameters?: unknown[], queryRunner?: unknown): void;
  logQuerySlow?(time: number, query: string, parameters?: unknown[], queryRunner?: unknown): void;
  logQueryError?(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: unknown,
  ): void;
  logSchemaBuild?(message: string, queryRunner?: unknown): void;
  logMigration?(message: string, queryRunner?: unknown): void;
  log?(level: 'log' | 'info' | 'warn', message: unknown, queryRunner?: unknown): void;
}

/**
 * Structural check for a TypeORM DataSource instance discovered via NestJS DI.
 * We don't `instanceof DataSource` because typeorm is an optional peer dep
 * and may not be loadable at type-check time.
 */
export function isLikelyTypeORMDataSource(obj: unknown): obj is TypeORMDataSourceLike {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  // DataSource carries `subscribers: Array` and `options: { type }` at minimum.
  // Checking constructor name avoids matching unrelated objects with similar shape.
  const ctorName = (candidate.constructor as { name?: string } | undefined)?.name;
  if (ctorName !== 'DataSource' && ctorName !== 'Connection') return false;
  return Array.isArray(candidate.subscribers) && typeof candidate.options === 'object';
}

// ---------------------------------------------------------------------------
// Prisma types (unchanged)
// ---------------------------------------------------------------------------

export interface PrismaClient {
  $on?: PrismaOnFn;
  $use?: PrismaUseFn;
}

export type PrismaOnFn = (event: 'query', callback: (event: PrismaQueryEvent) => void) => void;

export type PrismaUseFn = (middleware: PrismaMiddleware) => void;

export type PrismaMiddleware = (
  params: PrismaMiddlewareParams,
  next: (params: PrismaMiddlewareParams) => Promise<unknown>,
) => Promise<unknown>;

export interface PrismaQueryEvent {
  query: string;
  params: string;
  duration: number;
  target: string;
}

export interface PrismaMiddlewareParams {
  model?: string;
  action: string;
  args: unknown;
  dataPath: string[];
  runInTransaction: boolean;
}

export function isPrismaClient(obj: unknown): obj is PrismaClient {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return typeof candidate.$on === 'function' || typeof candidate.$use === 'function';
}

// ---------------------------------------------------------------------------
// Module loader helpers
// ---------------------------------------------------------------------------

/**
 * Synchronous optional-peer-dependency loader. Returns null if the module
 * cannot be resolved.
 */
export function tryRequire<T>(moduleName: string): T | null {
  try {
    return require(moduleName) as T;
  } catch {
    return null;
  }
}

export function isModuleAvailable(moduleName: string): boolean {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}
