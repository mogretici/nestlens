/**
 * Whether a watcher can record anything, said by the watcher itself.
 *
 * A watcher that is switched on and has nothing to observe records nothing,
 * and its tab looks exactly like a quiet system. A production application had
 * its Redis and HTTP client tabs empty for months because neither client was
 * handed over, and its Logs tab empty because `NestLensLogger` was never made
 * the application's logger; each watcher said so once, at debug level.
 *
 * - `off` — switched off in the configuration.
 * - `recording` — something is attached, so what happens is recorded.
 * - `waiting` — switched on, and nothing is attached: no host, no client, no
 *   setup call. It records nothing until that changes.
 * - `manual` — nothing is attached automatically, and the watcher records what
 *   the application's code hands its manual API (`trackCheck`, `trackBatch`,
 *   `trackDump`). Whether that code exists cannot be known before it runs, so
 *   this is neither a fault nor a promise. The first call makes it `recording`.
 */
export const WATCHER_STATES = ['off', 'recording', 'waiting', 'manual'] as const;

export type WatcherState = (typeof WATCHER_STATES)[number];

export interface WatcherStatus {
  state: WatcherState;
  /** One sentence a reader can act on. Never a connection string or a credential. */
  reason: string;
  /** The documentation page, and section, that shows the fix. */
  docs: string;
}

/** A watcher, or the logger, that can say whether it is recording. */
export interface ReportsWatcherStatus {
  watcherStatus(): WatcherStatus;
}

const DOCS_URL = 'https://nestlens-docs.vercel.app/docs';

/** `watchers/redis#provide-redis-client-to-nestlens` → its address on the documentation site. */
export const watcherDocs = (page: string): string => `${DOCS_URL}/${page}`;

export const switchedOff = (docs: string): WatcherStatus => ({
  state: 'off',
  reason: 'Switched off in the configuration.',
  docs,
});

/** What a watcher that records a host object knows about itself. */
export interface HostWatcherFacts {
  enabled: boolean;
  /** The watcher's page, `watchers/redis`. */
  page: string;
  /** The section of that page that shows how to hand the host over. */
  section: string;
  /** Why it is recording, when it is. */
  recording?: string;
  /** Set when an object was handed over and none of it could be wrapped. */
  unusable?: string;
  /** What is missing, when nothing was handed over. */
  missing: string;
  /**
   * `manual` for a watcher whose manual API records one call at a time, so
   * nothing handed over is not a fault; `waiting` for every other.
   */
  whenMissing?: Extract<WatcherState, 'waiting' | 'manual'>;
}

export const hostWatcherStatus = (facts: HostWatcherFacts): WatcherStatus => {
  if (!facts.enabled) return switchedOff(watcherDocs(facts.page));

  const docs = watcherDocs(`${facts.page}#${facts.section}`);

  if (facts.recording) return { state: 'recording', reason: facts.recording, docs };
  if (facts.unusable) return { state: 'waiting', reason: facts.unusable, docs };

  return { state: facts.whenMissing ?? 'waiting', reason: facts.missing, docs };
};
