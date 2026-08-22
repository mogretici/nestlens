import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { STORAGE, StorageInterface } from './storage/storage.interface';

@Injectable()
export class PruningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PruningService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
  ) {}

  onModuleInit() {
    const pruningConfig = this.config.pruning;

    if (pruningConfig?.enabled !== false) {
      const configured = this.positiveOrDefault(pruningConfig?.interval, 60, 'interval');
      const intervalMinutes = this.withinTimerRange(configured);
      this.startPruning(intervalMinutes);
      this.logger.log(`Pruning service started (interval: ${intervalMinutes} minutes)`);
    }
  }

  /**
   * Both settings are durations, so only positive values mean anything: a zero
   * interval reschedules the timer on every tick, and a zero age deletes every
   * entry the moment it is recorded. Neither is a documented way to switch
   * pruning off — `enabled: false` is — so a non-positive value is a mistake,
   * and one worth saying out loud rather than quietly replacing.
   */
  private positiveOrDefault(value: number | undefined, fallback: number, option: string): number {
    if (value === undefined) {
      return fallback;
    }

    if (value > 0) {
      return value;
    }

    this.logger.warn(
      `Ignoring pruning.${option}: ${value} — it must be greater than zero. ` +
        `Falling back to ${fallback}. Use pruning.enabled: false to turn pruning off.`,
    );

    return fallback;
  }

  /**
   * The longest delay a timer can hold, in minutes.
   *
   * `setInterval` keeps its delay in a signed 32-bit integer, and Node's
   * answer to a larger one is to fire after 1ms — every time. So an interval
   * meant to prune monthly ran continuously instead:
   *
   * ```text
   * pruning.interval: 43200   ->  39 prunes in 50ms, each a full scan
   * ```
   *
   * Clamping keeps the intent — prune rarely — where falling back to the
   * hourly default would not.
   */
  private static readonly MAX_INTERVAL_MINUTES = Math.floor(2 ** 31 / 60_000);

  /** {@link MAX_INTERVAL_MINUTES}. */
  private withinTimerRange(intervalMinutes: number): number {
    if (intervalMinutes <= PruningService.MAX_INTERVAL_MINUTES) {
      return intervalMinutes;
    }

    this.logger.warn(
      `pruning.interval: ${intervalMinutes} is longer than a timer can hold. ` +
        `Pruning every ${PruningService.MAX_INTERVAL_MINUTES} minutes instead.`,
    );

    return PruningService.MAX_INTERVAL_MINUTES;
  }

  private startPruning(intervalMinutes: number): void {
    // Run immediately on startup
    this.prune();

    // Then run on interval. Unreferenced for the same reason as the collector's
    // flush timer: pruning is maintenance, and maintenance must not hold a
    // process open.
    this.intervalId = setInterval(() => this.prune(), intervalMinutes * 60 * 1000);
    this.intervalId.unref?.();
  }

  private async prune(): Promise<void> {
    const maxAgeHours = this.positiveOrDefault(this.config.pruning?.maxAge, 24, 'maxAge');
    const before = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    try {
      const deleted = await this.storage.prune(before);
      if (deleted > 0) {
        this.logger.log(`Pruned ${deleted} old entries`);
      }
    } catch (error) {
      this.logger.error(`Failed to prune entries: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
}
