import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { ModelWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ModelEntry } from '../types';

/**
 * The TypeORM subscriber surface this watcher touches.
 *
 * typeorm is an optional peer, so its types cannot be imported — these
 * describe the runtime shape. Only `entity` is ever read off an event.
 */
interface EntityEventLike {
  entity?: unknown;
  metadata?: { name?: string };
}

type LoadHook = (entity: unknown, event: EntityEventLike) => void;
type EntityHook = (event: EntityEventLike) => void;

/** The Prisma middleware surface this watcher touches. */
interface PrismaMiddlewareParams {
  model?: string;
  action?: string;
  args?: { where?: unknown };
}

type PrismaNext = (params: PrismaMiddlewareParams) => Promise<unknown>;

interface PrismaClientLike {
  $use: (
    middleware: (params: PrismaMiddlewareParams, next: PrismaNext) => Promise<unknown>,
  ) => void;
}

function isPrismaClient(value: unknown): value is PrismaClientLike {
  return (
    !!value && typeof value === 'object' && typeof (value as PrismaClientLike).$use === 'function'
  );
}

interface EntitySubscriberLike {
  afterLoad?: LoadHook;
  beforeInsert?: EntityHook;
  afterInsert?: EntityHook;
  beforeUpdate?: EntityHook;
  afterUpdate?: EntityHook;
  beforeRemove?: EntityHook;
  afterRemove?: EntityHook;
}

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
    private readonly entitySubscriber?: unknown,
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
    const subscriber = this.entitySubscriber as EntitySubscriberLike | undefined;
    if (!subscriber) return;

    // Track entity loading (find operations)
    if (typeof subscriber.afterLoad === 'function') {
      const originalAfterLoad = subscriber.afterLoad.bind(subscriber);
      subscriber.afterLoad = (entity: unknown, event: EntityEventLike) => {
        this.handleAfterLoad(entity, event);
        if (originalAfterLoad) {
          originalAfterLoad(entity, event);
        }
      };
    }

    // Track entity insertion (create operations)
    if (typeof subscriber.beforeInsert === 'function') {
      const originalBeforeInsert = subscriber.beforeInsert.bind(subscriber);
      subscriber.beforeInsert = (event: EntityEventLike) => {
        this.handleBeforeInsert(event);
        if (originalBeforeInsert) {
          originalBeforeInsert(event);
        }
      };
    }

    if (typeof subscriber.afterInsert === 'function') {
      const originalAfterInsert = subscriber.afterInsert.bind(subscriber);
      subscriber.afterInsert = (event: EntityEventLike) => {
        this.handleAfterInsert(event);
        if (originalAfterInsert) {
          originalAfterInsert(event);
        }
      };
    }

    // Track entity updates
    if (typeof subscriber.beforeUpdate === 'function') {
      const originalBeforeUpdate = subscriber.beforeUpdate.bind(subscriber);
      subscriber.beforeUpdate = (event: EntityEventLike) => {
        this.handleBeforeUpdate(event);
        if (originalBeforeUpdate) {
          originalBeforeUpdate(event);
        }
      };
    }

    if (typeof subscriber.afterUpdate === 'function') {
      const originalAfterUpdate = subscriber.afterUpdate.bind(subscriber);
      subscriber.afterUpdate = (event: EntityEventLike) => {
        this.handleAfterUpdate(event);
        if (originalAfterUpdate) {
          originalAfterUpdate(event);
        }
      };
    }

    // Track entity deletion
    if (typeof subscriber.beforeRemove === 'function') {
      const originalBeforeRemove = subscriber.beforeRemove.bind(subscriber);
      subscriber.beforeRemove = (event: EntityEventLike) => {
        this.handleBeforeRemove(event);
        if (originalBeforeRemove) {
          originalBeforeRemove(event);
        }
      };
    }

    if (typeof subscriber.afterRemove === 'function') {
      const originalAfterRemove = subscriber.afterRemove.bind(subscriber);
      subscriber.afterRemove = (event: EntityEventLike) => {
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
  setupPrismaClient(prismaClient: unknown): void {
    if (!isPrismaClient(prismaClient)) {
      this.logger.warn('Invalid Prisma client provided');
      return;
    }

    // Use Prisma middleware to track operations
    prismaClient.$use(async (params: PrismaMiddlewareParams, next: PrismaNext) => {
      const startTime = Date.now();
      const entity = params.model || 'unknown';
      const action = this.mapPrismaAction(params.action ?? '');

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

  private handleAfterLoad(entity: unknown, event: EntityEventLike): void {
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

  private handleBeforeInsert(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `insert-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'create',
    });
  }

  private handleAfterInsert(event: EntityEventLike): void {
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

  private handleBeforeUpdate(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `update-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'update',
    });
  }

  private handleAfterUpdate(event: EntityEventLike): void {
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

  private handleBeforeRemove(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const trackingKey = `remove-${entityName}-${Date.now()}`;

    this.operationTracking.set(trackingKey, {
      startTime: Date.now(),
      entity: entityName,
      action: 'delete',
    });
  }

  private handleAfterRemove(event: EntityEventLike): void {
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
