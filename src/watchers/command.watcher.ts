import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { attachHosts } from './host-token';
import { CommandWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { CommandEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { ReportsWatcherStatus, WatcherStatus, hostWatcherStatus } from './watcher-status';
import { capturePayload } from './capture-payload';

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
export class CommandWatcher implements OnModuleInit, OnModuleDestroy, ReportsWatcherStatus {
  private readonly logger = new Logger(CommandWatcher.name);
  private readonly config: CommandWatcherConfig;
  /** A watcher for each further host provided under the same token. */
  private siblings: CommandWatcher[] = [];
  /** Gives back the hosts this watcher took; nothing, if it took none. */
  private releaseHosts: () => void = () => undefined;
  private originalExecute?: (command: unknown) => Promise<unknown>;
  /**
   * The property exactly as it was found, for putting back.
   *
   * `originalExecute` is bound to the bus so the wrapper can call it; assigning
   * that back would hand the application a different function object than the
   * one it had.
   */
  private executeBeforeWrapping?: unknown;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_COMMAND_BUS)
    private commandBus?: CommandBusLike,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {
    const watcherConfig = nestlensConfig.watchers?.command;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    const attached = attachHosts({
      injected: this.commandBus,
      moduleRef: this.moduleRef,
      token: NESTLENS_COMMAND_BUS,
      logger: this.logger,
      watcher: 'CommandWatcher',
      sibling: (host) => new CommandWatcher(this.collector, this.nestlensConfig, host as never),
    });
    this.commandBus = attached.host as typeof this.commandBus;
    this.siblings = attached.siblings;
    this.releaseHosts = attached.release;

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

  watcherStatus(): WatcherStatus {
    return hostWatcherStatus({
      enabled: this.config.enabled === true,
      page: 'watchers/command',
      section: 'provide-commandbus-to-nestlens',
      recording: this.isRecording()
        ? 'Recording the CommandBus provided under NESTLENS_COMMAND_BUS.'
        : undefined,
      unusable: this.commandBus
        ? 'The object provided under NESTLENS_COMMAND_BUS has no execute() to record.'
        : undefined,
      missing: 'No CommandBus is provided under NESTLENS_COMMAND_BUS.',
    });
  }

  private isRecording(): boolean {
    return (
      this.originalExecute !== undefined || this.siblings.some((sibling) => sibling.isRecording())
    );
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
      // Track command started
      this.collectEntry(commandName, 'executing', 0, command, undefined, undefined);

      try {
        const result = await originalExecute(command);
        const duration = Date.now() - startTime;

        // Track command completed
        this.collectEntry(commandName, 'completed', duration, command, result, undefined);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

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
    for (const sibling of this.siblings) sibling.onModuleDestroy();
    this.siblings = [];
    this.releaseHosts();
    this.releaseHosts = () => undefined;

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
    // 64KB default; 0 captures nothing.
    return capturePayload(data, this.config.maxPayloadSize ?? 64 * 1024);
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
