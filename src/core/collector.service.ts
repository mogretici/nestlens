import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Entry, EntryType } from '../types';
import { STORAGE, StorageInterface } from './storage/storage.interface';
import { TagService } from './tag.service';
import { FamilyHashService } from './family-hash.service';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';

@Injectable()
export class CollectorService implements OnModuleDestroy {
  private readonly logger = new Logger(CollectorService.name);
  private buffer: Entry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 1000; // 1 second
  private isPaused = false;
  private pausedAt?: Date;
  private pauseReason?: string;

  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    @Optional()
    private readonly tagService?: TagService,
    @Optional()
    private readonly familyHashService?: FamilyHashService,
  ) {
    this.startFlushTimer();
  }

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
      requestId,
    } as Extract<Entry, { type: T }>;

    // Apply filter
    const shouldCollect = await this.applyFilter(entry);
    if (!shouldCollect) {
      return;
    }

    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
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
      requestId,
    } as Extract<Entry, { type: T }>;

    // Apply filter
    const shouldCollect = await this.applyFilter(entry);
    if (!shouldCollect) {
      return null;
    }

    try {
      const savedEntry = await this.storage.save(entry);

      // Apply auto-tagging and family hash after saving
      await this.applyAutoTagging(savedEntry);

      return savedEntry;
    } catch (error) {
      this.logger.error(`Failed to save entry: ${error}`);
      throw error;
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
        await new Promise(r => setTimeout(r, 100 * attempt));
      }
    }
    // This should never be reached, but TypeScript needs it
    throw new Error('Unreachable code');
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
      await Promise.all(savedEntries.map(entry => this.applyAutoTagging(entry)));
    } catch (error) {
      this.logger.error(`Failed to flush entries: ${error}`);
      // Put entries back in buffer
      this.buffer = [...entries, ...this.buffer];
    }
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
  }

  /**
   * Stop flush timer and flush remaining entries
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Lifecycle hook - cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}
