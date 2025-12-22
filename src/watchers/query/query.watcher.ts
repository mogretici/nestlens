import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CollectorService } from '../../core/collector.service';
import {
  NestLensConfig,
  NESTLENS_CONFIG,
  QueryWatcherConfig,
} from '../../nestlens.config';
import { QueryEntry } from '../../types';
import {
  isModuleAvailable,
  tryRequire,
  TypeORMDataSource,
  TypeORMModule,
  isTypeORMDataSource,
  PrismaClient,
  PrismaMiddlewareParams,
  isPrismaClient,
} from './types';

export interface QueryData {
  query: string;
  parameters?: unknown[];
  duration: number;
  source: string;
  connection?: string;
  requestId?: string;
}

@Injectable()
export class QueryWatcher implements OnModuleInit {
  private readonly logger = new Logger(QueryWatcher.name);
  private readonly config: QueryWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.query;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false, slowThreshold: 100 };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Initialize TypeORM adapter
    if (isModuleAvailable('typeorm')) {
      await this.initializeTypeORM();
    }

    // Initialize Prisma adapter
    if (isModuleAvailable('@prisma/client')) {
      await this.initializePrisma();
    }
  }

  private async initializeTypeORM(): Promise<void> {
    try {
      const typeorm = tryRequire<TypeORMModule>('typeorm');
      if (!typeorm) return;

      // Try to get the default DataSource from TypeORM's global storage
      const dataSources = this.findTypeORMDataSources(typeorm);

      for (const dataSource of dataSources) {
        if (dataSource.isInitialized) {
          this.attachTypeORMLogger(dataSource);
        } else {
          // Wait for initialization
          const originalInitialize = dataSource.initialize.bind(dataSource);
          dataSource.initialize = async () => {
            const result = await originalInitialize();
            this.attachTypeORMLogger(dataSource);
            return result;
          };
        }
      }

      if (dataSources.length > 0) {
        this.logger.log('TypeORM query logging initialized');
      }
    } catch (error) {
      this.logger.debug(`TypeORM initialization skipped: ${error}`);
    }
  }

  private findTypeORMDataSources(typeorm: TypeORMModule): TypeORMDataSource[] {
    const dataSources: TypeORMDataSource[] = [];

    // TypeORM exports getDataSources() function to get all registered data sources
    // Use Object.getOwnPropertyDescriptor for type-safe property access
    const getDataSourcesDescriptor = Object.getOwnPropertyDescriptor(typeorm, 'getDataSources');

    if (getDataSourcesDescriptor && typeof getDataSourcesDescriptor.value === 'function') {
      try {
        const getDataSources = getDataSourcesDescriptor.value as () => unknown[];
        const sources = getDataSources();
        for (const source of sources) {
          if (isTypeORMDataSource(source)) {
            dataSources.push(source);
          }
        }
      } catch {
        // Registry not available
      }
    }

    return dataSources;
  }

  private attachTypeORMLogger(dataSource: TypeORMDataSource): void {
    const driver = dataSource.driver;
    const originalAfterQuery = driver.afterQuery;

    driver.afterQuery = (
      query: string,
      parameters: unknown[] | undefined,
      _result: unknown,
      time: number,
    ): void => {
      if (originalAfterQuery) {
        originalAfterQuery.call(driver, query, parameters, _result, time);
      }

      this.handleQuery({
        query: this.formatQuery(query),
        parameters,
        duration: time,
        source: 'typeorm',
        connection: dataSource.options.name ?? 'default',
      });
    };
  }

  private async initializePrisma(): Promise<void> {
    try {
      // Prisma clients are typically instantiated by the user
      // We can hook into the global Prisma instance if it exists
      const globalPrisma = (global as Record<string, unknown>)['prisma'];

      if (isPrismaClient(globalPrisma)) {
        this.attachPrismaMiddleware(globalPrisma);
        this.logger.log('Prisma query logging initialized (global instance)');
      }
    } catch (error) {
      this.logger.debug(`Prisma initialization skipped: ${error}`);
    }
  }

  private attachPrismaMiddleware(client: PrismaClient): void {
    if (!client.$use) return;

    client.$use(async (params: PrismaMiddlewareParams, next: (params: PrismaMiddlewareParams) => Promise<unknown>) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      this.handleQuery({
        query: `${params.model ?? 'unknown'}.${params.action}`,
        parameters: params.args ? [params.args] : undefined,
        duration,
        source: 'prisma',
      });

      return result;
    });
  }

  private handleQuery(data: QueryData): void {
    if (this.config.ignorePatterns?.some((p) => p.test(data.query))) {
      return;
    }

    const slowThreshold = this.config.slowThreshold || 100;
    const isSlow = data.duration > slowThreshold;

    const payload: QueryEntry['payload'] = {
      query: data.query,
      parameters: data.parameters,
      duration: data.duration,
      slow: isSlow,
      source: data.source,
      connection: data.connection,
    };

    this.collector.collect('query', payload, data.requestId);
  }

  private formatQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim();
  }
}
