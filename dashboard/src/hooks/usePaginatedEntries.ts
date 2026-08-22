import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getEntriesWithCursor,
  checkNewEntries,
  CursorFilters,
} from '../api';
import { Entry, EntryType, CursorPaginationMeta } from '../types';
import { useEntryStream } from './useEntryStream';

interface UsePaginatedEntriesOptions {
  type?: EntryType;
  limit?: number;
  autoRefresh?: boolean;
  autoRefreshInterval?: number;
  filters?: CursorFilters;
  /**
   * How far back to look, in minutes, counted from each request.
   *
   * A `from` cannot be computed once and kept: "the last five minutes" would
   * quietly become "the five minutes before you chose it", and after ten
   * minutes of watching a live page it would be showing fifteen. So the window
   * travels as a duration and becomes an instant where the request is made,
   * which also keeps `filters` stable enough to compare.
   */
  windowMinutes?: number;
}

// Stable JSON stringify for filter comparison
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => `"${k}":${stableStringify((obj as Record<string, unknown>)[k])}`).join(',') + '}';
}

/**
 * How many rows the live feed may leave on screen.
 *
 * New entries arrive for as long as the page is open, and nothing was dropping
 * the old ones: a tab left on a busy service accumulated a row per request
 * forever — a few thousand within the hour, each one about nineteen DOM nodes,
 * all of them re-rendered on every update. The reader can see fifty.
 *
 * Ten pages' worth is far more than anyone scrolls back through in a live feed
 * and still bounds what the tab holds. Paging deliberately with "load more" is
 * a different thing and is not capped here — see `loadMore`.
 */
const MAX_LIVE_ROWS = 500;

/**
 * Prepends only the entries that are not on the list already.
 *
 * The guard above stops the overlap that produced duplicates; this makes a
 * duplicate impossible to render even if some other path ever produces one.
 * A list keyed by id has to hold each id once, and that is cheap to guarantee
 * here rather than to rediscover from a broken table.
 */
function prependNew<T extends Entry>(previous: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return previous;

  const known = new Set(previous.map((entry) => entry.id));
  const fresh = incoming.filter((entry) => !known.has(entry.id));

  if (fresh.length === 0) return previous;

  const combined = [...fresh, ...previous];

  // Oldest first out of the window, which is the end of the list: the feed is
  // newest-first, and what fell off the bottom is a "load more" away.
  return combined.length > MAX_LIVE_ROWS ? combined.slice(0, MAX_LIVE_ROWS) : combined;
}

interface UsePaginatedEntriesResult<T extends Entry> {
  entries: T[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  meta: CursorPaginationMeta | null;
  newEntriesCount: number;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loadNew: () => Promise<void>;
  refresh: () => Promise<void>;
  setAutoRefresh: (enabled: boolean) => void;
  autoRefreshEnabled: boolean;
  updateEntry: (entry: Entry) => void;
  isHighlighted: (id: number) => boolean;
  /** Whether the real-time SSE connection is currently open. */
  live: boolean;
}

const AUTO_REFRESH_STORAGE_KEY = 'nestlens-auto-refresh';

function getStoredAutoRefresh(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function setStoredAutoRefresh(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore localStorage errors
  }
}

export function usePaginatedEntries<T extends Entry = Entry>(
  options: UsePaginatedEntriesOptions = {},
): UsePaginatedEntriesResult<T> {
  const {
    type,
    limit = 50,
    autoRefresh: initialAutoRefresh,
    autoRefreshInterval = 5000,
    filters: filtersOption,
    windowMinutes,
  } = options;

  // Serialize filters for dependency comparison using stable stringify
  const filtersKey = stableStringify(filtersOption);
  /** Everything that decides what a fetch returns, in one comparable value. */
  const requestKey = `${type}|${limit}|${filtersKey}|${windowMinutes ?? 0}`;

  /**
   * The filters, re-identified from their content.
   *
   * The effects below depend on this object, so its identity decides when they
   * re-run. Depending on the caller's object assumes every caller memoises it —
   * and three pages do not: QueriesPage, ExceptionsPage and GraphQLPage each
   * spread the memoised filters into a fresh literal to add a flag of their
   * own. The fetch effect then saw a new dependency on every render: fetch,
   * setState, re-render, fetch, for as long as the page stayed open. Measured
   * on /queries before the fix: 1055 requests in ten seconds.
   *
   * `filtersKey` is already the content of that object, so carrying the value
   * alongside the key it was taken from makes the reference change when the
   * filters change and not before. Written as an adjustment during render — the
   * pattern this codebase already uses in EntrySearchInput and GraphQLViewer —
   * rather than a memo with the dependency rule switched off, because the rule
   * would be right: this does not depend on `filtersOption`, it records it.
   */
  const [identifiedFilters, setIdentifiedFilters] = useState({
    key: filtersKey,
    value: filtersOption,
  });
  if (identifiedFilters.key !== filtersKey) {
    setIdentifiedFilters({ key: filtersKey, value: filtersOption });
  }
  const filters = identifiedFilters.value;

  /**
   * The filters as they go out, with the window turned into an instant.
   *
   * Computed when a request is made rather than when the component renders:
   * "the last five minutes" has to keep meaning that, and a `from` fixed once
   * would quietly become "the five minutes before you chose it" — after ten
   * minutes of watching a live page it would be showing fifteen.
   */
  const askedFilters = useCallback((): CursorFilters | undefined => {
    if (!windowMinutes || windowMinutes <= 0) return filters;

    return {
      ...filters,
      from: new Date(Date.now() - windowMinutes * 60_000).toISOString(),
    };
  }, [filters, windowMinutes]);

  const [entries, setEntries] = useState<T[]>([]);
  /**
   * Which request the entries on screen came from, or `null` before the first
   * one lands.
   *
   * The two flags below are read from it rather than stored. They used to be
   * set at the top of the fetch — synchronously, from an effect — which is a
   * render pass before the browser paints, and left `loading` and the data able
   * to disagree if a fetch was ever interrupted. Derived, they cannot: the
   * spinner is showing exactly when what is on screen is not what was asked
   * for.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /** Refreshes the reader asked for: load more, manual refresh, new entries. */
  const [refreshingOnDemand, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [meta, setMeta] = useState<CursorPaginationMeta | null>(null);
  const [newEntriesCount, setNewEntriesCount] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    initialAutoRefresh ?? getStoredAutoRefresh(),
  );

  const newestSequenceRef = useRef<number | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  /**
   * Set while a "load newer" round trip is in the air.
   *
   * Two things ask for newer entries — the interval below and the SSE handler
   * at the bottom — and both read `newestSequenceRef` *before* awaiting and
   * write it after. Overlap them and each fetches from the same cursor, each
   * gets the same rows, and each prepends them: the table fills with copies of
   * the same request while the entries the reader came for scroll away. Under
   * real traffic this compounds fast — measured on the GraphQL page with two
   * requests per second, 3,224 rows of which 121 were distinct.
   *
   * Duplicate ids are also duplicate React keys, which is why rows went missing
   * rather than merely repeating: React cannot tell two rows with one key
   * apart, so it reuses and drops them unpredictably as the list changes.
   */
  const loadingNewerRef = useRef(false);
  // Track if this is the initial load (no data yet)
  const isInitialLoadRef = useRef(true);

  // Nothing has arrived yet and nothing has failed: the full-page spinner.
  const loading = loadedKey === null && error === null;
  // Something is on screen but it is not what is being asked for: the quiet
  // one, so a filter change does not blank the table.
  const refreshing = refreshingOnDemand || (loadedKey !== null && loadedKey !== requestKey);
  // Track previous filtersKey to detect filter changes
  const prevFiltersKeyRef = useRef(filtersKey);
  // Track highlighted (new) entries with their added timestamps (entry.id -> timestamp)
  const highlightedEntriesRef = useRef<Map<number, number>>(new Map());
  const [, forceUpdate] = useState(0); // Force re-render for highlight updates
  const HIGHLIGHT_DURATION = 10000; // 10 seconds

  /**
   * Fetching and applying are separated on purpose.
   *
   * Every state write below happens as a continuation of a request that has
   * already left, so the effect that starts the first one schedules work rather
   * than rendering again before the browser paints. Written as one async
   * function it reads the same way, but neither a reader nor a static analyser
   * can see where the synchronous part ends.
   */
  const applyPage = useCallback(
    (response: Awaited<ReturnType<typeof getEntriesWithCursor>>) => {
      setEntries(response.data as T[]);
      setMeta(response.meta);
      newestSequenceRef.current = response.meta.newestSequence;
      setNewEntriesCount(0);
      setError(null);
      isInitialLoadRef.current = false;
      prevFiltersKeyRef.current = filtersKey;
      setLoadedKey(requestKey);
    },
    [filtersKey, requestKey],
  );

  const applyFailure = useCallback(
    (err: unknown) => {
      const errorObj = err instanceof Error ? err : new Error('Failed to fetch entries');
      setError(errorObj);
      console.error('Failed to fetch entries:', err);
      toast.error('Failed to load entries');
      // Settled even so: the spinner has to stop, and the error is what the
      // page shows instead.
      setLoadedKey(requestKey);
    },
    [requestKey],
  );



  // Load older entries
  const loadMore = useCallback(async () => {
    if (!meta?.oldestSequence || !meta.hasMore) return;

    setRefreshing(true);
    try {
      const response = await getEntriesWithCursor({
        type,
        limit,
        beforeSequence: meta.oldestSequence,
        filters: askedFilters(),
      });

      setEntries((prev) => {
        // The page below can overlap the one on screen when entries arrived
        // between the two requests, and an id must appear once.
        const known = new Set(prev.map((entry) => entry.id));
        return [...prev, ...(response.data as T[]).filter((entry) => !known.has(entry.id))];
      });
      setMeta(response.meta);
    } catch (err) {
      console.error('Failed to load more entries:', err);
      toast.error('Failed to load more entries');
    } finally {
      setRefreshing(false);
    }
  }, [type, limit, meta, askedFilters]);

  // Load new entries (manual button click)
  const loadNew = useCallback(async () => {
    if (!newestSequenceRef.current) return;
    // Shares the guard with the automatic path: the button and the poll ask
    // the same question and must not both answer it.
    if (loadingNewerRef.current) return;

    loadingNewerRef.current = true;
    setRefreshing(true);
    try {
      const response = await getEntriesWithCursor({
        type,
        limit: newEntriesCount || limit,
        afterSequence: newestSequenceRef.current,
        filters: askedFilters(),
      });

      if (response.data.length > 0) {
        // Mark new entries as highlighted
        const now = Date.now();
        response.data.forEach((entry) => {
          highlightedEntriesRef.current.set(entry.id, now);
        });

        setEntries((prev) => prependNew(prev, response.data as T[]));
        newestSequenceRef.current = response.meta.newestSequence;
        setNewEntriesCount(0);
      }
    } catch (err) {
      console.error('Failed to load new entries:', err);
      toast.error('Failed to load new entries');
    } finally {
      loadingNewerRef.current = false;
      setRefreshing(false);
    }
  }, [type, limit, newEntriesCount, askedFilters]);

  // Refresh all data
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setError(null);
      const response = await getEntriesWithCursor({ type, limit, filters: askedFilters() });
      setEntries(response.data as T[]);
      setMeta(response.meta);
      newestSequenceRef.current = response.meta.newestSequence;
      setNewEntriesCount(0);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to refresh entries');
      setError(errorObj);
      console.error('Failed to refresh entries:', err);
      toast.error('Failed to refresh entries');
    } finally {
      setRefreshing(false);
    }
  }, [type, limit, askedFilters]);

  /** Whether anything is being narrowed, which decides how new entries are counted. */
  const narrowed = (asked: CursorFilters | undefined): boolean =>
    Boolean(
      asked &&
        Object.values(asked).some((value) =>
          Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '',
        ),
    );

  /**
   * How many new entries the reader would actually see.
   *
   * `entries/check-new` counts by sequence and type and knows nothing about
   * filters, so under one it counted rows the list would never show. Measured
   * on `/requests?statuses=500` with no 500s arriving: "Load 147 new entries",
   * and clicking it loaded none of them.
   *
   * With a filter active the count comes from asking for the entries
   * themselves, which is the same request the automatic path already makes —
   * so it is capped at a page, which is also all one click brings in.
   */
  const checkForNew = useCallback(async () => {
    if (!newestSequenceRef.current) {
      // Nothing on screen, so there is no cursor to count from — and the badge
      // used to say "Load 1 new entry" here whenever an entry of this type
      // existed anywhere, filter or no filter, while `loadNew` returned
      // immediately for want of that same cursor. The button could not be
      // dismissed. An empty list has nothing to lose by filling itself in.
      await refresh();
      return;
    }

    const asked = askedFilters();

    try {
      if (!narrowed(asked)) {
        const response = await checkNewEntries(newestSequenceRef.current, type);
        setNewEntriesCount(response.data.count);
        return;
      }

      const response = await getEntriesWithCursor({
        type,
        limit,
        afterSequence: newestSequenceRef.current,
        filters: asked,
      });
      setNewEntriesCount(response.data.length);
    } catch {
      // Ignore errors
    }
  }, [type, limit, askedFilters, refresh]);

  // Toggle auto-refresh
  const setAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    setStoredAutoRefresh(enabled);
  }, []);

  // Update a single entry in the list
  const updateEntry = useCallback((updatedEntry: Entry) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === updatedEntry.id ? (updatedEntry as T) : entry,
      ),
    );
  }, []);

  // The first page, and every page after a filter or page-size change. The
  // request leaves here; what it produces is written by the continuations above.
  useEffect(() => {
    // A second request can leave before the first one lands — a filter typed
    // quickly, a page switched and switched back — and the slower answer must
    // not overwrite the faster one. Without this the table shows whatever
    // finished last, which is not what was asked for.
    let current = true;

    getEntriesWithCursor({ type, limit, filters: askedFilters() }).then(
      (response) => {
        if (current) applyPage(response);
      },
      (err) => {
        if (current) applyFailure(err);
      },
    );

    return () => {
      current = false;
    };
  }, [type, limit, askedFilters, applyPage, applyFailure]);

  // Check if an entry is highlighted (new)
  const isHighlighted = useCallback((id: number): boolean => {
    const addedAt = highlightedEntriesRef.current.get(id);
    if (!addedAt) return false;
    return Date.now() - addedAt < HIGHLIGHT_DURATION;
  }, []);

  // Cleanup old highlighted entries
  const cleanupHighlights = useCallback(() => {
    const now = Date.now();
    let hasChanges = false;
    highlightedEntriesRef.current.forEach((addedAt, id) => {
      if (now - addedAt >= HIGHLIGHT_DURATION) {
        highlightedEntriesRef.current.delete(id);
        hasChanges = true;
      }
    });
    if (hasChanges) {
      forceUpdate(n => n + 1); // Trigger re-render to update row styles
    }
  }, []);

  // Auto-load new entries when auto-refresh is enabled
  const autoLoadNew = useCallback(async () => {
    if (!newestSequenceRef.current) return;
    // One round trip at a time. See `loadingNewerRef`.
    if (loadingNewerRef.current) return;

    loadingNewerRef.current = true;
    try {
      const since = newestSequenceRef.current;
      const checkResponse = await checkNewEntries(since, type);
      if (checkResponse.data.count > 0) {
        const response = await getEntriesWithCursor({
          type,
          limit: checkResponse.data.count,
          afterSequence: since,
          filters: askedFilters(),
        });

        if (response.data.length > 0) {
          // Mark new entries as highlighted
          const now = Date.now();
          response.data.forEach((entry) => {
            highlightedEntriesRef.current.set(entry.id, now);
          });

          let added = 0;
          setEntries((prev) => {
            const next = prependNew(prev, response.data as T[]);
            added = next.length - prev.length;
            return next;
          });
          newestSequenceRef.current = response.meta.newestSequence;
          // Update meta total by what was actually added, not by what came
          // back: a row already on the list must not be counted twice.
          setMeta((prevMeta) => prevMeta ? {
            ...prevMeta,
            total: prevMeta.total + added,
            newestSequence: response.meta.newestSequence,
          } : response.meta);
        }
      }
    } catch {
      // Ignore errors
    } finally {
      loadingNewerRef.current = false;
    }
  }, [type, askedFilters]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (autoRefreshEnabled) {
      checkIntervalRef.current = setInterval(autoLoadNew, autoRefreshInterval);
    } else {
      // When auto-refresh is disabled, just check for new entries count
      checkIntervalRef.current = setInterval(checkForNew, autoRefreshInterval);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, autoLoadNew, checkForNew]);

  // Set up highlight cleanup interval
  useEffect(() => {
    const cleanupInterval = setInterval(cleanupHighlights, 1000); // Check every second
    return () => clearInterval(cleanupInterval);
  }, [cleanupHighlights]);

  // Real-time: when the server pushes a matching entry over SSE, refresh
  // immediately instead of waiting for the next poll. Bursts are coalesced.
  const streamDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleStreamedEntry = useCallback(
    (entry: Entry) => {
      if (type && entry.type !== type) return;
      if (streamDebounceRef.current) return;
      streamDebounceRef.current = setTimeout(() => {
        streamDebounceRef.current = null;
        if (autoRefreshEnabled) {
          void autoLoadNew();
        } else {
          void checkForNew();
        }
      }, 200);
    },
    [type, autoRefreshEnabled, autoLoadNew, checkForNew],
  );
  const { connected: live } = useEntryStream(handleStreamedEntry);

  useEffect(() => {
    return () => {
      if (streamDebounceRef.current) {
        clearTimeout(streamDebounceRef.current);
        streamDebounceRef.current = null;
      }
    };
  }, []);

  return {
    entries,
    loading,
    refreshing,
    error,
    meta,
    newEntriesCount,
    hasMore: meta?.hasMore ?? false,
    loadMore,
    loadNew,
    refresh,
    setAutoRefresh,
    autoRefreshEnabled,
    updateEntry,
    isHighlighted,
    live,
  };
}
