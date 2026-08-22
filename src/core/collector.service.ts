import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Entry, EntryType } from '../types';
import { DataMaskerService } from './data-masker.service';
import { createSampler, Sampler } from './sampling';
import { currentRequestId } from './request-context';
import { STORAGE, StorageInterface } from './storage/storage.interface';
import { TagService } from './tag.service';
import { FamilyHashService } from './family-hash.service';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';

/**
 * How long the final flush may take before shutdown proceeds without it.
 *
 * A normal flush is milliseconds; anything approaching this means storage has
 * stopped answering, and waiting longer only delays the process exiting.
 */
const SHUTDOWN_FLUSH_TIMEOUT = 3000;

@Injectable()
export class CollectorService implements OnModuleDestroy {
  private readonly logger = new Logger(CollectorService.name);
  private buffer: Entry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 1000; // 1 second
  /**
   * How many entries may wait for a storage that is not answering.
   *
   * Failed entries used to go back into the buffer with nothing bounding it, so
   * an unreachable database turned into unbounded growth inside the application
   * being watched — a debugging tool causing the outage it is there to explain.
   * Ten flushes' worth is enough to ride out a blip; past that the oldest go,
   * because NestLens's data is disposable and the application's memory is not.
   */
  private readonly MAX_BUFFERED_ENTRIES = 1000;
  /**
   * Set while storage is failing, so `collect()` stops flushing inline.
   *
   * Every entry arriving past the buffer threshold used to start its own flush,
   * three attempts with backoff, awaited on the caller's path: ~200ms added to
   * each monitored operation for as long as storage was down. The timer keeps
   * retrying once a second instead.
   */
  private storageIsFailing = false;
  private droppedEntries = 0;
  private isPaused = false;
  private pausedAt?: Date;
  private pauseReason?: string;

  // Real-time stream of persisted entries. Powers the SSE live-tail and the
  // alerting service. Entries are emitted after they have been saved (so they
  // carry an id), never blocking collection if a subscriber misbehaves.
  private readonly entrySubject = new Subject<Entry>();

  /** Observable that emits every entry right after it is persisted. */
  get entryStream$(): Observable<Entry> {
    return this.entrySubject.asObservable();
  }

  private emit(entry: Entry): void {
    // RxJS isolates throwing subscribers from the producer; each subscriber
    // (SSE, alerting) is responsible for swallowing its own errors.
    this.entrySubject.next(entry);
  }

  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    @Optional()
    private readonly dataMasker?: DataMaskerService,
    @Optional()
    private readonly tagService?: TagService,
    @Optional()
    private readonly familyHashService?: FamilyHashService,
  ) {
    this.sampler = createSampler(this.config.sampling);
    this.startFlushTimer();
  }

  /**
   * Drops entries the configured rate does not keep.
   *
   * Applied before the filter, the mask and the buffer, because an entry that
   * is not being kept should not be paid for. `undefined` unless `sampling` is
   * configured with a rate below 1, so the default path costs nothing.
   */
  private readonly sampler?: Sampler;

  /**
   * Apply filter to an entry
   */
  private async applyFilter(entry: Entry): Promise<boolean> {
    if (!this.config.filter) return true;
    try {
      const result = this.config.filter(entry);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      this.logger.warn(`Filter callback error: ${error}`);
      return true; // Fail-open - don't block collection on filter errors
    }
  }

  /**
   * Pause recording
   */
  pause(reason?: string): void {
    if (!this.isPaused) {
      this.isPaused = true;
      this.pausedAt = new Date();
      this.pauseReason = reason;
      this.logger.log(`Recording paused${reason ? `: ${reason}` : ''}`);
    }
  }

  /**
   * Resume recording
   */
  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.pausedAt = undefined;
      this.pauseReason = undefined;
      this.logger.log('Recording resumed');
    }
  }

  /**
   * Get recording status
   */
  getRecordingStatus(): { isPaused: boolean; pausedAt?: Date; pauseReason?: string } {
    return {
      isPaused: this.isPaused,
      pausedAt: this.pausedAt,
      pauseReason: this.pauseReason,
    };
  }

  /**
   * Whether NestLens is keeping up.
   *
   * `pending` sitting near `capacity` means storage is slower than collection,
   * and `dropped` says how many entries that has already cost — the buffer
   * discards its oldest rather than growing without limit, so a rising number
   * here is the only place that loss is visible.
   *
   * The performance page has documented a metrics endpoint calling
   * `collector.getBufferSize()` for some time and there was no such method: a
   * reader copying that example got a compile error.
   */
  getBufferSize(): { pending: number; capacity: number; dropped: number } {
    return {
      pending: this.buffer.length,
      capacity: this.MAX_BUFFERED_ENTRIES,
      dropped: this.droppedEntries,
    };
  }

  /**
   * Collect an entry
   * Uses discriminated union pattern - the type parameter determines the expected payload type
   */
  async collect<T extends EntryType>(
    type: T,
    payload: Extract<Entry, { type: T }>['payload'],
    requestId?: string,
  ): Promise<void> {
    // Skip collection if paused
    if (this.isPaused) {
      return;
    }

    // Entry construction is type-safe: type and payload are correlated via the generic constraint
    const entry = {
      type,
      payload,
      // A watcher that knows the request says so; the rest are attributed from
      // the ambient context, which is how a query recorded by TypeORM's logger
      // ends up on the detail page of the request that ran it.
      requestId: requestId ?? currentRequestId(),
    } as Extract<Entry, { type: T }>;

    if (this.sampler && !this.sampler.shouldRecord(entry)) {
      return;
    }

    // The filter callback runs in the application's own process against its own
    // data, so it sees the entry as recorded; what gets buffered — and from
    // there stored, streamed and posted to webhooks — is masked.
    const shouldCollect = await this.applyFilter(entry);
    if (!shouldCollect) {
      return;
    }

    try {
      this.buffer.push(this.mask(entry));
    } catch (error) {
      // Masking walks a payload the application handed us; a getter that
      // throws or a hostile `toJSON` is its failure, not a reason to reject a
      // promise most watchers do not await.
      this.logger.warn(`Failed to record entry: ${error}`);
      return;
    }

    this.enforceBufferLimit();

    // Flush if buffer is full — unless storage is already failing, in which
    // case the periodic timer retries and the caller is not made to wait.
    if (this.buffer.length >= this.BUFFER_SIZE && !this.storageIsFailing) {
      await this.flush();
    }
  }

  /**
   * Collect and save immediately (for critical entries like exceptions)
   * Uses discriminated union pattern - the type parameter determines the expected payload type
   */
  async collectImmediate<T extends EntryType>(
    type: T,
    payload: Extract<Entry, { type: T }>['payload'],
    requestId?: string,
  ): Promise<Entry | null> {
    // Skip collection if paused
    if (this.isPaused) {
      return null;
    }

    // Entry construction is type-safe: type and payload are correlated via the generic constraint
    const entry = {
      type,
      payload,
      requestId: requestId ?? currentRequestId(),
    } as Extract<Entry, { type: T }>;

    if (this.sampler && !this.sampler.shouldRecord(entry)) {
      return null;
    }

    // Apply filter
    const shouldCollect = await this.applyFilter(entry);
    if (!shouldCollect) {
      return null;
    }

    try {
      const savedEntry = await this.storage.save(this.mask(entry));

      // Apply auto-tagging and family hash after saving
      await this.applyAutoTagging(savedEntry);

      this.emit(savedEntry);

      return savedEntry;
    } catch (error) {
      // Reported, not rethrown.
      //
      // Every caller of this is a watcher recording something the application
      // already handled, and two of the three do not await it. A rejected
      // promise nobody is holding is an unhandled rejection, which Node treats
      // as fatal — so a database outage during an application error took the
      // process down: five failing saves, five unhandled rejections, and the
      // only thing wrong was that NestLens could not write them down.
      //
      // The ones that do await it are inside a GraphQL plugin and a
      // subscription handler, where throwing would break the operation being
      // watched. `null` says "not recorded", which is all any of them can act
      // on anyway.
      this.logger.error(`Failed to save entry: ${error}`);
      return null;
    }
  }

  /**
   * Apply auto-tagging and family hash to a saved entry
   */
  private async applyAutoTagging(entry: Entry): Promise<void> {
    if (!entry.id) return;

    try {
      // Generate and save family hash
      if (this.familyHashService) {
        const familyHash = this.familyHashService.generateFamilyHash(entry);
        if (familyHash) {
          await this.storage.updateFamilyHash(entry.id, familyHash);
          entry.familyHash = familyHash;
        }
      }

      // Auto-tag the entry
      if (this.tagService) {
        await this.tagService.autoTag(entry);
      }
    } catch (error) {
      // Don't fail the save if tagging fails
      this.logger.warn(`Failed to apply auto-tagging to entry ${entry.id}: ${error}`);
    }
  }

  /**
   * Save entries with retry logic
   */
  private async saveWithRetry(entries: Entry[], maxRetries = 3): Promise<Entry[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.storage.saveBatch(entries);
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(`Failed to save entries after ${maxRetries} attempts`, error);
          throw error;
        }
        this.logger.warn(`Save attempt ${attempt} failed, retrying...`);
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }
    // This should never be reached, but TypeScript needs it
    throw new Error('Unreachable code');
  }

  /**
   * Masks an entry's payload on its way in.
   *
   * Here rather than in each watcher: this is the one place every entry passes
   * through, so a payload cannot reach storage — or the live tail, or a webhook
   * — unmasked because a watcher forgot. It is also the flow the architecture
   * note has always described: watcher → collect() → DataMasker → storage.
   */
  private mask<E extends Entry>(entry: E): E {
    if (!this.dataMasker) {
      return entry;
    }

    const masked = this.dataMasker.maskBody(entry.payload) as Record<string, unknown>;

    // An exception's stack is part of its payload and is the one field the
    // masker treats by shape rather than by name.
    if (masked && typeof masked === 'object' && typeof masked.stack === 'string') {
      masked.stack = this.dataMasker.sanitizeStackTrace(masked.stack);
    }

    return { ...entry, payload: masked } as E;
  }

  /**
   * Flush buffer to storage
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    let entries = [...this.buffer];
    this.buffer = [];

    // Apply batch filter if configured
    if (this.config.filterBatch) {
      try {
        const result = this.config.filterBatch(entries);
        entries = result instanceof Promise ? await result : result;
      } catch (error) {
        this.logger.warn(`Batch filter callback error: ${error}`);
        // Fail-open - continue with original entries on filter error
      }
    }

    // Skip if all entries were filtered out
    if (entries.length === 0) return;

    try {
      const savedEntries = await this.saveWithRetry(entries);

      // Optimized: Apply auto-tagging in parallel instead of sequentially
      await Promise.all(savedEntries.map((entry) => this.applyAutoTagging(entry)));

      // Notify real-time subscribers (SSE, alerting) after persistence
      savedEntries.forEach((entry) => this.emit(entry));

      if (this.storageIsFailing) {
        this.storageIsFailing = false;
        this.logger.log(
          this.droppedEntries > 0
            ? `Storage is answering again (${this.droppedEntries} entries were dropped meanwhile)`
            : 'Storage is answering again',
        );
        this.droppedEntries = 0;
      }
    } catch (error) {
      // Reported once per outage rather than once per second.
      if (!this.storageIsFailing) {
        this.logger.error(`Failed to flush entries, will keep retrying: ${error}`);
        this.storageIsFailing = true;
      }

      // Put entries back in buffer, oldest first, and let the limit decide what
      // survives if storage stays down.
      this.buffer = [...entries, ...this.buffer];
      this.enforceBufferLimit();
    }
  }

  /**
   * Keeps the buffer within its bound, dropping the oldest entries first.
   */
  private enforceBufferLimit(): void {
    const overflow = this.buffer.length - this.MAX_BUFFERED_ENTRIES;
    if (overflow <= 0) {
      return;
    }

    this.buffer.splice(0, overflow);
    this.droppedEntries += overflow;
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error(`Flush timer error: ${err}`);
      });
    }, this.FLUSH_INTERVAL);

    // A debugging tool must never be the reason a process stays alive. Without
    // this the flush timer keeps Node's event loop open for as long as NestLens
    // is loaded: an application that finishes its work waits forever, and so
    // did the test suite — which is how a hung CI job billed six hours instead
    // of failing.
    this.flushTimer.unref?.();
  }

  /**
   * Stop flush timer and flush remaining entries
   *
   * The last flush is given a deadline. A storage that has stopped answering
   * does not fail here — it simply never returns, and `await` on it means the
   * application never finishes shutting down: `app.close()` hangs, SIGTERM
   * does nothing, and the process waits for whatever eventually kills it.
   * Measured against a storage whose `save` never settles: healthy 1ms, a
   * throwing storage 302ms, a hanging one still going after six seconds.
   *
   * A monitoring tool must not be the reason a deployment cannot roll. So the
   * remaining entries get {@link SHUTDOWN_FLUSH_TIMEOUT} to reach storage,
   * and after that they are given up — which is the right trade in the one
   * situation where it applies, since a storage that is not answering was not
   * going to keep them anyway.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flushBeforeShutdown();
    this.entrySubject.complete();
  }

  /** The final flush, bounded. See {@link shutdown}. */
  private async flushBeforeShutdown(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), SHUTDOWN_FLUSH_TIMEOUT);
      // Nothing should stay alive for this timer, least of all during shutdown.
      timer.unref?.();
    });

    try {
      const outcome = await Promise.race([this.flush().then(() => 'flushed' as const), deadline]);

      if (outcome === 'timeout') {
        this.logger.warn(
          `Storage did not accept the final ${this.buffer.length} entries within ` +
            `${SHUTDOWN_FLUSH_TIMEOUT}ms; shutting down without them.`,
        );
      }
    } catch (error) {
      // `flush` already reports storage failures; this is here so a rejection
      // cannot escape into the shutdown sequence.
      this.logger.warn(`Final flush failed: ${error}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Lifecycle hook - cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}
