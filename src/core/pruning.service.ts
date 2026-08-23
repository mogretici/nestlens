import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { STORAGE, StorageInterface } from './storage/storage.interface';

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_MAX_AGE_HOURS = 24;

@Injectable()
export class PruningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PruningService.name);
  private intervalId: NodeJS.Timeout | null = null;
  /** Options already complained about, so a poll does not repeat the warning. */
  private readonly warned = new Set<string>();
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
  ) {}

  onModuleInit() {
    if (this.config.pruning?.enabled !== false) {
      this.startPruning(this.intervalMinutes);
      this.logger.log(`Pruning service started (interval: ${this.intervalMinutes} minutes)`);
    }
  }

  /**
   * The window in effect, which is not always the one configured.
   *
   * Read through here by everything that prunes or reports on pruning. The API
   * had its own copy of `config.pruning.maxAge ?? 24`, so the two disagreed
   * exactly where it hurts: `maxAge: 0` is refused here and was honoured
   * there, and a reader who pressed *Run pruning* with it set deleted every
   * entry the application had recorded. `maxAge: -5` did the same.
   */
  get maxAgeHours(): number {
    return this.positiveOrDefault(this.config.pruning?.maxAge, DEFAULT_MAX_AGE_HOURS, 'maxAge');
  }

  /** The interval in effect, bounded by what a timer can hold. */
  get intervalMinutes(): number {
    return this.withinTimerRange(
      this.positiveOrDefault(this.config.pruning?.interval, DEFAULT_INTERVAL_MINUTES, 'interval'),
    );
  }

  /** When pruning last ran, by timer or by hand, and when it is next due. */
  get schedule(): { lastRun: Date | null; nextRun: Date | null } {
    return { lastRun: this.lastRun, nextRun: this.nextRun };
  }

  /**
   * Both settings are durations, so only positive values mean anything: a zero
   * interval reschedules the timer on every tick, and a zero age deletes every
   * entry the moment it is recorded. Neither is a documented way to switch
   * pruning off — `enabled: false` is — so a non-positive value is a mistake,
   * and one worth saying out loud rather than quietly replacing.
   */
  private positiveOrDefault(value: number | undefined, fallback: number, option: string): number {
    if (value === undefined || value > 0) {
      return value ?? fallback;
    }

    this.warnOnce(
      option,
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

    this.warnOnce(
      'interval-range',
      `pruning.interval: ${intervalMinutes} is longer than a timer can hold. ` +
        `Pruning every ${PruningService.MAX_INTERVAL_MINUTES} minutes instead.`,
    );

    return PruningService.MAX_INTERVAL_MINUTES;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;

    this.warned.add(key);
    this.logger.warn(message);
  }

  private startPruning(intervalMinutes: number): void {
    // Run immediately on startup
    void this.pruneNow();

    // Then run on interval. Unreferenced for the same reason as the collector's
    // flush timer: pruning is maintenance, and maintenance must not hold a
    // process open.
    this.intervalId = setInterval(() => void this.pruneNow(), intervalMinutes * 60 * 1000);
    this.intervalId.unref?.();
  }

  /**
   * Deletes everything past the window and reports how much went.
   *
   * The timer and the API endpoint both come through here, so a run is a run
   * whichever started it — `lastRun` used to be written by the endpoint alone,
   * and a server that had pruned every hour for a month still reported that
   * pruning had never run.
   */
  async pruneNow(): Promise<number> {
    const before = new Date(Date.now() - this.maxAgeHours * 60 * 60 * 1000);

    this.lastRun = new Date();
    this.nextRun = new Date(Date.now() + this.intervalMinutes * 60 * 1000);

    try {
      const deleted = await this.storage.prune(before);
      if (deleted > 0) {
        this.logger.log(`Pruned ${deleted} old entries`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to prune entries: ${error}`);
      return 0;
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
