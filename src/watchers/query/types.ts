/**
 * Type definitions for optional ORM dependencies
 * These interfaces define the minimum contract we need from each ORM
 * without requiring the actual packages to be installed
 */

// TypeORM types
export interface TypeORMDataSource {
  isInitialized: boolean;
  options: TypeORMDataSourceOptions;
  driver: TypeORMDriver;
  initialize(): Promise<this>;
}

export interface TypeORMDataSourceOptions {
  name?: string;
  type: string;
}

export interface TypeORMDriver {
  afterQuery?: TypeORMAfterQueryFn;
}

export type TypeORMAfterQueryFn = (
  query: string,
  parameters: unknown[] | undefined,
  result: unknown,
  time: number,
) => void;

// Prisma types
export interface PrismaClient {
  $on?: PrismaOnFn;
  $use?: PrismaUseFn;
}

export type PrismaOnFn = (
  event: 'query',
  callback: (event: PrismaQueryEvent) => void,
) => void;

export type PrismaUseFn = (
  middleware: PrismaMiddleware,
) => void;

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

// Type guards
export function isTypeORMDataSource(obj: unknown): obj is TypeORMDataSource {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return (
    'isInitialized' in candidate &&
    'options' in candidate &&
    'driver' in candidate &&
    typeof candidate.isInitialized === 'boolean'
  );
}

export function isPrismaClient(obj: unknown): obj is PrismaClient {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.$on === 'function' ||
    typeof candidate.$use === 'function'
  );
}

// Module loader types
export interface TypeORMModule {
  DataSource: new (options: TypeORMDataSourceOptions) => TypeORMDataSource;
}

export interface NestJSTypeORMModule {
  getDataSourceToken: (name?: string) => string | symbol;
}

export interface PrismaModule {
  PrismaClient: new () => PrismaClient;
}

/**
 * Safe synchronous module loader for optional peer dependencies.
 * Uses require() instead of dynamic import() because:
 * 1. Synchronous loading is needed for initialization
 * 2. Optional dependencies may not exist at runtime
 * 3. This is the standard pattern for optional peer deps in Node.js
 */
export function tryRequire<T>(moduleName: string): T | null {
  try {
    // Using require for synchronous optional dependency loading
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
