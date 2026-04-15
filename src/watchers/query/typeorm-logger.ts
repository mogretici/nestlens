import type { TypeORMLoggerLike } from './types';
import type { QueryHandler } from './typeorm-subscriber';

/**
 * TypeORM Logger that records query errors and slow queries while delegating
 * every method to the user's pre-existing logger. Used as a safety net for
 * driver code paths that do not broadcast `afterQuery` (notably better-sqlite3
 * prepare-time failures).
 */
export class NestLensTypeOrmLogger implements TypeORMLoggerLike {
  constructor(
    private readonly handler: QueryHandler,
    private readonly connectionName: string,
    private readonly delegate?: TypeORMLoggerLike,
  ) {}

  logQuery(query: string, parameters?: unknown[], queryRunner?: unknown): void {
    this.delegate?.logQuery?.(query, parameters, queryRunner);
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[], queryRunner?: unknown): void {
    this.handler({
      query,
      parameters,
      duration: time,
      source: 'typeorm',
      connection: this.connectionName,
      success: true,
    });
    this.delegate?.logQuerySlow?.(time, query, parameters, queryRunner);
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: unknown,
  ): void {
    this.handler({
      query,
      parameters,
      duration: 0,
      source: 'typeorm',
      connection: this.connectionName,
      success: false,
      error,
    });
    this.delegate?.logQueryError?.(error, query, parameters, queryRunner);
  }

  logSchemaBuild(message: string, queryRunner?: unknown): void {
    this.delegate?.logSchemaBuild?.(message, queryRunner);
  }

  logMigration(message: string, queryRunner?: unknown): void {
    this.delegate?.logMigration?.(message, queryRunner);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, queryRunner?: unknown): void {
    this.delegate?.log?.(level, message, queryRunner);
  }
}
