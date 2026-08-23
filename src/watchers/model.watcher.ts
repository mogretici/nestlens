import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  OnModuleDestroy,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { ModelWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { ModelEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { WrappedMethods } from './wrap-method';
import { capturePayload } from './capture-payload';

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
/**
 * How much of an entity is recorded when `captureData` is on.
 *
 * The same 64KB the request watcher gives a body: an ORM result can be a page
 * of rows, and one that is too large is recorded as its size.
 */
const MAX_ENTITY_SIZE = 64 * 1024;

/**
 * ModelWatcher tracks ORM operations (TypeORM and Prisma) including
 * entity changes, query performance, and data modifications while
 * masking sensitive fields.
 */
@Injectable()
export class ModelWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModelWatcher.name);
  private readonly config: ModelWatcherConfig;
  private wrapped?: WrappedMethods;
  /**
   * When each operation in flight began, oldest first, per entity and action.
   *
   * It used to be a map keyed `insert-${entityName}-${Date.now()}`, and the
   * completion looked its partner up with
   * `Array.from(keys).find(k => k.startsWith(...))`. Two things followed, and
   * the first is not a race — it is what an ordinary batch does:
   *
   * ```text
   * ten inserts of one entity in the same millisecond
   *   tracked   1     the key collided nine times
   *   recorded  1     nine operations vanished
   * ```
   *
   * The second: an operation whose completion never fires — a transaction that
   * rolls back — left its entry behind for good, and every completion allocated
   * an array of every key to search it.
   *
   * A queue per entity and action pairs them first-in-first-out, which is the
   * right answer for operations that are interchangeable except for how long
   * they took, and cannot collide however many are in flight.
   */
  private readonly pending = new Map<string, number[]>();

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_MODEL_SUBSCRIBER)
    private readonly entitySubscriber?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.model;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  /**
   * How many un-finished operations of one kind are remembered.
   *
   * An operation that never completes — a rolled-back transaction — leaves its
   * start behind, so the queue is bounded and drops the oldest rather than
   * growing. Losing the oldest start costs one duration; not bounding it costs
   * the process.
   */
  private static readonly MAX_PENDING = 1_000;

  private beganAt(action: string, entityName: string): void {
    const key = `${action}:${entityName}`;
    const queue = this.pending.get(key) ?? [];

    if (queue.length >= ModelWatcher.MAX_PENDING) {
      queue.shift();
    }

    queue.push(Date.now());
    this.pending.set(key, queue);
  }

  /** How long the oldest operation of this kind has been running, if any. */
  private endedAfter(action: string, entityName: string): number | undefined {
    const key = `${action}:${entityName}`;
    const queue = this.pending.get(key);
    const startedAt = queue?.shift();

    if (queue?.length === 0) {
      this.pending.delete(key);
    }

    return startedAt === undefined ? undefined : Date.now() - startedAt;
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

    this.wrapped = new WrappedMethods(subscriber as unknown as Record<string, unknown>);

    // `afterLoad` is handed the entity as well; the rest take only the event.
    const record: Record<string, (event: EntityEventLike, entity?: unknown) => void> = {
      afterLoad: (event, entity) => this.handleAfterLoad(entity, event),
      beforeInsert: (event) => this.handleBeforeInsert(event),
      afterInsert: (event) => this.handleAfterInsert(event),
      beforeUpdate: (event) => this.handleBeforeUpdate(event),
      afterUpdate: (event) => this.handleAfterUpdate(event),
      beforeRemove: (event) => this.handleBeforeRemove(event),
      afterRemove: (event) => this.handleAfterRemove(event),
    };

    for (const [hook, note] of Object.entries(record)) {
      this.wrapped.replace(hook, (original) => {
        return (...args: unknown[]): unknown => {
          // Recording first used to mean recording *instead*: an entry that
          // could not be built threw out of the subscriber, and the
          // application's own hook never ran. It is the application's hook.
          try {
            const event = (hook === 'afterLoad' ? args[1] : args[0]) as EntityEventLike;
            note(event, args[0]);
          } catch (error) {
            this.logger.debug(`Failed to record a model event: ${error}`);
          }

          return (original as (...a: unknown[]) => unknown)(...args);
        };
      });
    }

    this.logger.log('Model interceptors installed for TypeORM');
  }

  /**
   * Puts the subscriber's hooks back.
   *
   * The subscriber belongs to the application and outlives this module, so
   * without this the host goes on recording through a watcher whose collector
   * is gone — and a process that builds the module more than once against the
   * same subscriber, as tests and `nest start --hmr` do, wraps each round on
   * top of the last.
   */
  onModuleDestroy(): void {
    this.wrapped?.restore();
    this.wrapped = undefined;
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
          this.config.captureData ? this.captureEntity(result) : undefined,
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
    this.beganAt('insert', event?.metadata?.name || 'unknown');
  }

  private handleAfterInsert(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const duration = this.endedAfter('insert', entityName);

    // Nothing began: the watcher attached between the two halves.
    if (duration === undefined) return;

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
      this.config.captureData ? this.captureEntity(event.entity) : undefined,
    );
  }

  private handleBeforeUpdate(event: EntityEventLike): void {
    this.beganAt('update', event?.metadata?.name || 'unknown');
  }

  private handleAfterUpdate(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const duration = this.endedAfter('update', entityName);

    // Nothing began: the watcher attached between the two halves.
    if (duration === undefined) return;

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
      this.config.captureData ? this.captureEntity(event.entity) : undefined,
    );
  }

  private handleBeforeRemove(event: EntityEventLike): void {
    this.beganAt('remove', event?.metadata?.name || 'unknown');
  }

  private handleAfterRemove(event: EntityEventLike): void {
    const entityName = event?.metadata?.name || 'unknown';
    const duration = this.endedAfter('remove', entityName);

    // Nothing began: the watcher attached between the two halves.
    if (duration === undefined) return;

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
  /**
   * An entity as it is recorded.
   *
   * This used to walk the entity itself, masking by field name, with no bound
   * on depth and no memory of where it had been — so an entity with a relation
   * pointing back at its parent, which is what a bidirectional mapping is,
   * ended in `RangeError: Maximum call stack size exceeded`. Thrown from
   * inside TypeORM's subscriber, that reached the application's own `save()`:
   * enabling `captureData` broke the query it was meant to describe.
   *
   * The collector masks every payload it is given — by the same field names,
   * and with a cycle, a depth and a walk bound behind them — so this only has
   * to decide how much of the entity is worth keeping.
   */
  private captureEntity(data: unknown): unknown {
    return capturePayload(data, MAX_ENTITY_SIZE);
  }

  /**
   * Capture where conditions with size limits
   */
  private captureWhere(where: unknown): unknown {
    return where ? capturePayload(where, 1024) : undefined;
  }
}
