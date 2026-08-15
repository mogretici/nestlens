import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getEntriesWithCursor,
  checkNewEntries,
  getLatestSequence,
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
  } = options;

  // Serialize filters for dependency comparison using stable stringify
  const filtersKey = stableStringify(filtersOption);
  /** Everything that decides what a fetch returns, in one comparable value. */
  const requestKey = `${type}|${limit}|${filtersKey}`;

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
        filters,
      });

      setEntries((prev) => [...prev, ...(response.data as T[])]);
      setMeta(response.meta);
    } catch (err) {
      console.error('Failed to load more entries:', err);
      toast.error('Failed to load more entries');
    } finally {
      setRefreshing(false);
    }
  }, [type, limit, meta, filters]);

  // Load new entries (manual button click)
  const loadNew = useCallback(async () => {
    if (!newestSequenceRef.current) return;

    setRefreshing(true);
    try {
      const response = await getEntriesWithCursor({
        type,
        limit: newEntriesCount || limit,
        afterSequence: newestSequenceRef.current,
        filters,
      });

      if (response.data.length > 0) {
        // Mark new entries as highlighted
        const now = Date.now();
        response.data.forEach((entry) => {
          highlightedEntriesRef.current.set(entry.id, now);
        });

        setEntries((prev) => [...(response.data as T[]), ...prev]);
        newestSequenceRef.current = response.meta.newestSequence;
        setNewEntriesCount(0);
      }
    } catch (err) {
      console.error('Failed to load new entries:', err);
      toast.error('Failed to load new entries');
    } finally {
      setRefreshing(false);
    }
  }, [type, limit, newEntriesCount, filters]);

  // Refresh all data
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setError(null);
      const response = await getEntriesWithCursor({ type, limit, filters });
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
  }, [type, limit, filters]);

  // Check for new entries
  const checkForNew = useCallback(async () => {
    if (!newestSequenceRef.current) {
      // If no entries yet, get latest sequence
      try {
        const response = await getLatestSequence(type);
        if (response.data) {
          setNewEntriesCount(1);
        }
      } catch {
        // Ignore errors
      }
      return;
    }

    try {
      const response = await checkNewEntries(newestSequenceRef.current, type);
      setNewEntriesCount(response.data.count);
    } catch {
      // Ignore errors
    }
  }, [type]);

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
    getEntriesWithCursor({ type, limit, filters }).then(applyPage, applyFailure);
  }, [type, limit, filters, applyPage, applyFailure]);

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

    try {
      const checkResponse = await checkNewEntries(newestSequenceRef.current, type);
      if (checkResponse.data.count > 0) {
        const response = await getEntriesWithCursor({
          type,
          limit: checkResponse.data.count,
          afterSequence: newestSequenceRef.current,
          filters,
        });

        if (response.data.length > 0) {
          // Mark new entries as highlighted
          const now = Date.now();
          response.data.forEach((entry) => {
            highlightedEntriesRef.current.set(entry.id, now);
          });

          setEntries((prev) => [...(response.data as T[]), ...prev]);
          newestSequenceRef.current = response.meta.newestSequence;
          // Update meta total
          setMeta((prevMeta) => prevMeta ? {
            ...prevMeta,
            total: prevMeta.total + response.data.length,
            newestSequence: response.meta.newestSequence,
          } : response.meta);
        }
      }
    } catch {
      // Ignore errors
    }
  }, [type, filters]);

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
