import type { TypeORMQueryEvent } from './types';
import type { QueryData } from './query.watcher';

export type QueryHandler = (data: QueryData) => void;

/**
 * TypeORM EntitySubscriber that captures every query via the `afterQuery`
 * lifecycle hook. The event carries `executionTime`, `success`, `error` and
 * `parameters` directly, so no monkey-patching of the driver is needed.
 *
 * TypeORM invokes this for every query the QueryRunner executes (including
 * raw queries, query builder, repository methods, transactions, schema
 * synchronisation). On error paths some drivers (e.g. better-sqlite3) skip
 * the broadcast — the wrapped Logger covers that gap.
 */
export class NestLensQuerySubscriber {
  constructor(
    private readonly handler: QueryHandler,
    private readonly connectionName: string,
  ) {}

  afterQuery(event: TypeORMQueryEvent): void {
    if (!event || typeof event.query !== 'string') return;
    this.handler({
      query: event.query,
      parameters: event.parameters,
      duration: event.executionTime ?? 0,
      source: 'typeorm',
      connection: this.connectionName,
      success: event.success !== false,
      error: event.error,
    });
  }
}
