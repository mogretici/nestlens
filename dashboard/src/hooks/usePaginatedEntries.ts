import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getEntriesWithCursor,
  checkNewEntries,
  getLatestSequence,
  CursorFilters,
} from '../api';
import { Entry, EntryType, CursorPaginationMeta } from '../types';

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
    filters,
  } = options;

  // Serialize filters for dependency comparison using stable stringify
  const filtersKey = stableStringify(filters);

  const [entries, setEntries] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  // Track previous filtersKey to detect filter changes
  const prevFiltersKeyRef = useRef(filtersKey);

  // Fetch initial data or refetch on filter change
  const fetchInitial = useCallback(async () => {
    // Only show full loading spinner on initial load (no existing data)
    // For filter changes, use refreshing state to avoid flicker
    if (isInitialLoadRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError(null);
      const response = await getEntriesWithCursor({ type, limit, filters });
      setEntries(response.data as T[]);
      setMeta(response.meta);
      newestSequenceRef.current = response.meta.newestSequence;
      setNewEntriesCount(0);
      isInitialLoadRef.current = false;
      prevFiltersKeyRef.current = filtersKey;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to fetch entries');
      setError(errorObj);
      console.error('Failed to fetch entries:', err);
      toast.error('Failed to load entries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type, limit, filtersKey]);

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
  }, [type, limit, meta, filtersKey]);

  // Load new entries
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
  }, [type, limit, newEntriesCount, filtersKey]);

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
  }, [type, limit, filtersKey]);

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

  // Initial fetch
  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

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
  }, [type, filtersKey]);

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
  };
}
