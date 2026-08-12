import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { CommandWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { CommandEntry } from '../types';

/** The @nestjs/cqrs CommandBus surface this watcher touches. */
interface CommandBusLike {
  execute?: (command: unknown) => Promise<unknown>;
}

/**
 * Token for injecting NestJS CQRS CommandBus
 */
export const NESTLENS_COMMAND_BUS = Symbol('NESTLENS_COMMAND_BUS');

/**
 * CommandWatcher tracks CQRS command execution in NestJS applications.
 * Integrates with @nestjs/cqrs CommandBus to monitor command execution,
 * capturing name, handler, status, duration, and results.
 */
@Injectable()
export class CommandWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandWatcher.name);
  private readonly config: CommandWatcherConfig;
  private originalExecute?: (command: unknown) => Promise<unknown>;
  /**
   * The property exactly as it was found, for putting back.
   *
   * `originalExecute` is bound to the bus so the wrapper can call it; assigning
   * that back would hand the application a different function object than the
   * one it had.
   */
  private executeBeforeWrapping?: unknown;
  private readonly commandTracking = new Map<string, number>(); // commandId -> startTime

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_COMMAND_BUS)
    private readonly commandBus?: CommandBusLike,
  ) {
    const watcherConfig = nestlensConfig.watchers?.command;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if command bus was provided
    if (!this.commandBus) {
      this.logger.debug(
        'CommandWatcher: No command bus found. ' +
          'To enable command tracking, install and configure @nestjs/cqrs and provide CommandBus.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.commandBus) return;

    // Store original execute method
    this.executeBeforeWrapping = this.commandBus.execute;
    const originalExecute = this.commandBus.execute?.bind(this.commandBus);
    this.originalExecute = originalExecute;

    if (!originalExecute) {
      this.logger.warn('CommandBus does not have execute method');
      return;
    }

    // Wrap execute method
    this.commandBus.execute = async (command: unknown): Promise<unknown> => {
      const startTime = Date.now();
      const commandName = this.getCommandName(command);
      const commandId = `${commandName}-${startTime}`;

      this.commandTracking.set(commandId, startTime);

      // Track command started
      this.collectEntry(commandName, 'executing', 0, command, undefined, undefined);

      try {
        const result = await originalExecute(command);
        const duration = Date.now() - startTime;
        this.commandTracking.delete(commandId);

        // Track command completed
        this.collectEntry(commandName, 'completed', duration, command, result, undefined);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.commandTracking.delete(commandId);

        // Track command failed
        this.collectEntry(
          commandName,
          'failed',
          duration,
          command,
          undefined,
          error instanceof Error ? error.message : String(error),
        );

        throw error; // Re-throw to maintain original behavior
      }
    };

    this.logger.log('Command interceptors installed');
  }

  /**
   * Puts back what it replaced.
   *
   * The wrappers live on an object the application owns and keeps, so closing
   * the module has to give it back. Otherwise the host goes on calling through
   * a watcher whose collector is gone — and where a process builds the module
   * more than once against the same object, as tests and `nest start --hmr` do,
   * each round wraps the last: one call, one entry per layer.
   */
  onModuleDestroy(): void {
    if (this.commandBus && this.executeBeforeWrapping !== undefined) {
      (this.commandBus as Record<string, unknown>).execute = this.executeBeforeWrapping;
      this.executeBeforeWrapping = undefined;
      this.originalExecute = undefined;
    }
  }

  private getCommandName(command: unknown): string {
    if (!command) return 'UnknownCommand';

    // Try to get the constructor name
    if (typeof command === 'object' && command.constructor) {
      return command.constructor.name;
    }

    return 'UnknownCommand';
  }

  private getHandlerName(command: unknown): string | undefined {
    try {
      if (typeof command === 'object' && command !== null) {
        // Try to extract handler information if available
        // This is a best-effort approach as handler info might not be directly accessible
        const handler = (command as Record<string, unknown>).handler;
        if (handler && typeof handler === 'string') {
          return handler;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private collectEntry(
    name: string,
    status: 'executing' | 'completed' | 'failed',
    duration: number,
    command?: unknown,
    result?: unknown,
    error?: string,
  ): void {
    const payload: CommandEntry['payload'] = {
      name,
      handler: this.getHandlerName(command),
      status,
      duration: duration > 0 ? duration : undefined,
      payload: this.config.capturePayload !== false ? this.captureData(command) : undefined,
      result: this.config.captureResult !== false ? this.captureData(result) : undefined,
      error,
      metadata: this.extractMetadata(command),
    };

    this.collector.collect('command', payload);
  }

  private captureData(data: unknown): unknown {
    if (data === undefined || data === null) return undefined;

    try {
      // Limit size to prevent huge payloads from bloating storage
      const json = JSON.stringify(data);
      const maxSize = this.config.maxPayloadSize ?? 64 * 1024; // 64KB default; 0 captures nothing
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return data;
    } catch {
      return { _error: 'Unable to serialize data' };
    }
  }

  private extractMetadata(command: unknown): Record<string, unknown> | undefined {
    try {
      if (typeof command === 'object' && command !== null) {
        const metadata: Record<string, unknown> = {};

        // Extract common metadata fields if they exist
        const cmd = command as Record<string, unknown>;
        if (cmd.timestamp) metadata.timestamp = cmd.timestamp;
        if (cmd.userId) metadata.userId = cmd.userId;
        if (cmd.correlationId) metadata.correlationId = cmd.correlationId;
        if (cmd.version) metadata.version = cmd.version;

        return Object.keys(metadata).length > 0 ? metadata : undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
