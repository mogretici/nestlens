import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { ModelWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ModelEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntitySubscriber = any;

/**
 * Token for injecting TypeORM EntitySubscriber
 */
export const NESTLENS_MODEL_SUBSCRIBER = Symbol('NESTLENS_MODEL_SUBSCRIBER');

/**
 * Sensitive field names that should be masked in data capture
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'apiKey',
  'accessToken',
  'refreshToken',
  'creditCard',
  'ssn',
  'privateKey',
];

/**
 * ModelWatcher tracks ORM operations (TypeORM and Prisma) including
 * entity changes, query performance, and data modifications while
 * masking sensitive fields.
 */
@Injectable()
export class ModelWatcher implements OnModuleInit {
  private readonly logger = new Logger(ModelWatcher.name);
  private readonly config: ModelWatcherConfig;
  private operationTracking = new Map<
    string,
    { startTime: number; entity: string; action: string }
  >();

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_MODEL_SUBSCRIBER)
    private readonly entitySubscriber?: EntitySubscriber,
  ) {
    const watcherConfig = nestlensConfig.watchers?.model;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if entity subscriber was provided
    if (!this.entitySubscriber) {
      this.logger.debug(
        'ModelWatcher: No entity subscriber found. ' +
          'To enable model tracking for TypeORM, inject an EntitySubscriber with the NESTLENS_MODEL_SUBSCRIBER token. ' +
          'For Prisma, use the setupPrismaClient() method manually.',
      );
      return;
    }

    this.setupTypeOrmInterceptors();
  }

  /**
   * Setup TypeORM entity subscriber hooks
   */
  private setupTypeOrmInterceptors(): void {
    if (!this.entitySubscriber) return;

    // Track entity loading (find operations)
    if (typeof this.entitySubscriber.afterLoad === 'function') {
      const originalAfterLoad = this.entitySubscriber.afterLoad.bind(this.entitySubscriber);
      this.entitySubscriber.afterLoad = (entity: unknown, event: any) => {
        this.handleAfterLoad(entity, event);
        if (originalAfterLoad) {
          originalAfterLoad(entity, event);
        }
      };
    }

    // Track entity insertion (create operations)
    if (typeof this.entitySubscriber.beforeInsert === 'function') {
      const originalBeforeInsert = this.entitySubscriber.beforeInsert.bind(this.entitySubscriber);
      this.entitySubscriber.beforeInsert = (event: any) => {
        this.handleBeforeInsert(event);
        if (originalBeforeInsert) {
          originalBeforeInsert(event);
        }
      };
    }

    if (typeof this.entitySubscriber.afterInsert === 'function') {
      const originalAfterInsert = this.entitySubscriber.afterInsert.bind(this.entitySubscriber);
      this.entitySubscriber.afterInsert = (event: any) => {
        this.handleAfterInsert(event);
        if (originalAfterInsert) {
          originalAfterInsert(event);
        }
      };
    }

    // Track entity updates
    if (typeof this.entitySubscriber.beforeUpdate === 'function') {
      const originalBeforeUpdate = this.entitySubscriber.beforeUpdate.bind(this.entitySubscriber);
      this.entitySubscriber.beforeUpdate = (event: any) => {
        this.handleBeforeUpdate(event);
        if (originalBeforeUpdate) {
          originalBeforeUpdate(event);
        }
      };
    }

    if (typeof this.entitySubscriber.afterUpdate === 'function') {
      const originalAfterUpdate = this.entitySubscriber.afterUpdate.bind(this.entitySubscriber);
      this.entitySubscriber.afterUpdate = (event: any) => {
        this.handleAfterUpdate(event);
        if (originalAfterUpdate) {
          originalAfterUpdate(event);
        }
      };
    }

    // Track entity deletion
    if (typeof this.entitySubscriber.beforeRemove === 'function') {
      const originalBeforeRemove = this.entitySubscriber.beforeRemove.bind(this.entitySubscriber);
      this.entitySubscriber.beforeRemove = (event: any) => {
        this.handleBeforeRemove(event);
        if (originalBeforeRemove) {
          originalBeforeRemove(event);
        }
      };
    }

    if (typeof this.entitySubscriber.afterRemove === 'function') {
      const originalAfterRemove = this.entitySubscriber.afterRemove.bind(this.entitySubscriber);
      this.entitySubscriber.afterRemove = (event: any) => {
        this.handleAfterRemove(event);
        if (originalAfterRemove) {
          originalAfterRemove(event);
        }
      };
    }

    this.logger.log('Model interceptors installed for TypeORM');
  }

  /**
   * Setup Prisma client interceptors.
   * Call this manually with your Prisma client instance.
   */
  setupPrismaClient(prismaClient: any): void {
    if (!prismaClient?.$use) {
      this.logger.warn('Invalid Prisma client provided');
      return;
    }

    // Use Prisma middleware to track operations
    prismaClient.$use(async (params: any, next: any) => {
      const startTime = Date.now();
      const entity = params.model || 'unknown';
      const action = this.mapPrismaAction(params.action);

      // Skip if entity should be ignored
      if (this.config.ignoreEntities?.includes(entity)) {
        return next(params);
      }

      try {
        const result = await next(params);
        const duration = Date.now() - startTime;

        this.collectEntry(
          action,
          entity,
          'prisma',
          duration,
          Array.isArray(result) ? result.length : result ? 1 : 0,
          this.config.captureData ? this.maskSensitiveData(result) : undefined,
          params.args?.where,
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.collectEntry(
          action,
          entity,
          'prisma',
          duration,
          0,
          undefined,
          params.args?.where,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });

    this.logger.log('Model interceptors installed for Prisma');
  }

  private handleAfterLoad(entity: unknown, event: any): void {
    const entityName = event?.metadata?.name || 'unknown';

    // Skip if entity should be ignored
    if (this.config.ignoreEntities?.includes(entityName)) {
      return;
    }

    this.collectEntry(
      'find',
      entityName,
      'typeorm',
      0, // Duration not available for afterLoad
      1,
      undefined,
      undefined,
    );
  }

  private handleBeforeInsert(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `insert-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'create',
    });
  }

  private handleAfterInsert(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = Array.from(this.operationTracking.keys()).find((key) =>
      key.startsWith(`insert-${entityName}`),
    );

    if (!trackingKey) return;

    const tracking = this.operationTracking.get(trackingKey);
    if (!tracking) return;

    const duration = Date.now() - tracking.startTime;
    this.operationTracking.delete(trackingKey);

    // Skip if entity should be ignored
    if (this.config.ignoreEntities?.includes(entityName)) {
      return;
    }

    this.collectEntry(
      'create',
      entityName,
      'typeorm',
      duration,
      1,
      this.config.captureData ? this.maskSensitiveData(event.entity) : undefined,
    );
  }

  private handleBeforeUpdate(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `update-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'update',
    });
  }

  private handleAfterUpdate(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = Array.from(this.operationTracking.keys()).find((key) =>
      key.startsWith(`update-${entityName}`),
    );

    if (!trackingKey) return;

    const tracking = this.operationTracking.get(trackingKey);
    if (!tracking) return;

    const duration = Date.now() - tracking.startTime;
    this.operationTracking.delete(trackingKey);

    // Skip if entity should be ignored
    if (this.config.ignoreEntities?.includes(entityName)) {
      return;
    }

    this.collectEntry(
      'update',
      entityName,
      'typeorm',
      duration,
      1,
      this.config.captureData ? this.maskSensitiveData(event.entity) : undefined,
    );
  }

  private handleBeforeRemove(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `remove-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'delete',
    });
  }

  private handleAfterRemove(event: any): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = Array.from(this.operationTracking.keys()).find((key) =>
      key.startsWith(`remove-${entityName}`),
    );

    if (!trackingKey) return;

    const tracking = this.operationTracking.get(trackingKey);
    if (!tracking) return;

    const duration = Date.now() - tracking.startTime;
    this.operationTracking.delete(trackingKey);

    // Skip if entity should be ignored
    if (this.config.ignoreEntities?.includes(entityName)) {
      return;
    }

    this.collectEntry('delete', entityName, 'typeorm', duration, 1);
  }

  private collectEntry(
    action: 'find' | 'create' | 'update' | 'delete' | 'save',
    entity: string,
    source: 'typeorm' | 'prisma',
    duration: number,
    recordCount?: number,
    data?: unknown,
    where?: unknown,
    error?: string,
  ): void {
    const payload: ModelEntry['payload'] = {
      action,
      entity,
      source,
      duration,
      recordCount,
      data,
      where: this.captureWhere(where),
      error,
    };

    this.collector.collect('model', payload);
  }

  /**
   * Map Prisma action names to standard action names
   */
  private mapPrismaAction(action: string): 'find' | 'create' | 'update' | 'delete' | 'save' {
    const actionMap: Record<string, 'find' | 'create' | 'update' | 'delete' | 'save'> = {
      findUnique: 'find',
      findFirst: 'find',
      findMany: 'find',
      create: 'create',
      createMany: 'create',
      update: 'update',
      updateMany: 'update',
      upsert: 'save',
      delete: 'delete',
      deleteMany: 'delete',
    };

    return actionMap[action] || 'find';
  }

  /**
   * Mask sensitive fields in entity data
   */
  private maskSensitiveData(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Capture where conditions with size limits
   */
  private captureWhere(where: unknown): unknown {
    if (!where) return undefined;

    try {
      const json = JSON.stringify(where);
      const maxSize = 1024; // 1KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return where;
    } catch {
      return { _error: 'Unable to serialize where condition' };
    }
  }
}
