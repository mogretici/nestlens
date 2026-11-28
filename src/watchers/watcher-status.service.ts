import { Inject, Injectable, Logger, OnApplicationBootstrap, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ENTRY_TYPES, EntryType } from '../types';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { waitingWatchersWarning } from '../startup-summary';
import { ReportsWatcherStatus, WatcherStatus, switchedOff, watcherDocs } from './watcher-status';

/** A key of `watchers` in the configuration. */
export type WatcherOption = keyof NonNullable<NestLensConfig['watchers']>;

/** Where the status of one entry type comes from. */
export interface WatcherStatusSource {
  option: WatcherOption;
  /** The class that reports it; absent from the container when its watcher is off. */
  reporter: Type<ReportsWatcherStatus>;
  /** The watcher's documentation page, `watchers/request`. */
  page: string;
}

export type WatcherStatusSources = Record<EntryType, WatcherStatusSource>;

/** The table in `watcher-status.registry.ts`, provided as a value so this file imports no watcher. */
export const WATCHER_STATUS_SOURCES = Symbol('NESTLENS_WATCHER_STATUS_SOURCES');

export interface WatcherStatusReport extends WatcherStatus {
  type: EntryType;
  /** The option that switches it, `watchers.httpClient`. */
  option: string;
}

/**
 * Every watcher's status in one place, and the startup warning for the ones
 * that are switched on and recording nothing.
 *
 * Each status is read from the watcher when it is asked for: a field or two,
 * so it costs nothing until the API or the startup report asks, and a host
 * attached later — a `setupQueue()` call, a first `trackCheck()` — shows the
 * moment it happens.
 *
 * The report waits for the end of the bootstrap phase rather than running in
 * a hook of its own. Nest runs `onApplicationBootstrap` module by module,
 * ordered by import distance, and that order has changed between majors; the
 * query watcher attaches in that phase, a module below this one, so a report
 * from any single hook said `query` was recording nothing in an application
 * whose queries it was about to record. Each part of NestLens that attaches
 * during bootstrap holds the report from its constructor, before any hook has
 * run, and lets go when its own hook is done; the last to let go prints it.
 */
@Injectable()
export class WatcherStatusService implements OnApplicationBootstrap {
  private readonly logger = new Logger('NestLens');
  /** This service's own hold is the first. */
  private holds = 1;
  private reported = false;
  private reporters?: Map<EntryType, ReportsWatcherStatus | undefined>;

  constructor(
    @Inject(WATCHER_STATUS_SOURCES)
    private readonly sources: WatcherStatusSources,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Holds the startup report back until the function it returns is called. */
  holdStartupReport(): () => void {
    if (this.reported) return () => undefined;

    this.holds += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  onApplicationBootstrap(): void {
    this.release();
  }

  statuses(): WatcherStatusReport[] {
    const reporters = this.resolveReporters();

    return ENTRY_TYPES.map((type) => {
      const source = this.sources[type];
      const status = reporters.get(type)?.watcherStatus() ?? switchedOff(watcherDocs(source.page));

      return { type, option: `watchers.${source.option}`, ...status };
    });
  }

  private release(): void {
    this.holds -= 1;
    if (this.holds > 0 || this.reported) return;

    this.reported = true;

    const waiting = this.statuses().filter((status) => status.state === 'waiting');
    if (waiting.length > 0) {
      this.logger.warn(waitingWatchersWarning(waiting, this.config));
    }
  }

  /**
   * Found once, after every provider exists. A watcher that is off may not be
   * provided at all — the request watcher with `request: false`, the GraphQL
   * watcher unless it is on — and that absence is its status.
   */
  private resolveReporters(): Map<EntryType, ReportsWatcherStatus | undefined> {
    if (this.reporters) return this.reporters;

    this.reporters = new Map(
      ENTRY_TYPES.map((type) => [type, this.find(this.sources[type].reporter)] as const),
    );

    return this.reporters;
  }

  private find(reporter: Type<ReportsWatcherStatus>): ReportsWatcherStatus | undefined {
    try {
      return this.moduleRef.get(reporter, { strict: false });
    } catch {
      return undefined;
    }
  }
}
