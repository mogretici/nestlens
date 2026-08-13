import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { StatsContext } from './useStats';
import toast from 'react-hot-toast';
import { getStats } from '../api';
import { Stats } from '../types';

const REFRESH_INTERVAL_MS = 10_000;

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isFirstLoadRef = useRef(true);
  /**
   * Set when the provider goes away, so a request already in flight does not
   * come back to a component that is no longer there. The refresh runs every ten
   * seconds and on demand, so there is nearly always one in flight.
   */
  const activeRef = useRef(true);

  /**
   * Fetching and applying are separated on purpose.
   *
   * `applyStats` and `applyFailure` are the only places state is written, and
   * both run as continuations of a request that has already been sent — so the
   * effect below schedules work rather than rendering again before the browser
   * has painted. Written as one async function it reads the same way, but
   * neither a reader nor a static analyser can tell where the synchronous part
   * ends.
   */
  const applyStats = useCallback((next: Stats) => {
    if (!activeRef.current) return;

    setStats(next);
    setError(null);
    isFirstLoadRef.current = false;
  }, []);

  const applyFailure = useCallback((err: unknown) => {
    if (!activeRef.current) return;

    const errorObj = err instanceof Error ? err : new Error('Failed to fetch stats');
    setError(errorObj);
    console.error('Failed to fetch stats:', err);
    // Only on first load: a failing periodic refresh would otherwise spam.
    if (isFirstLoadRef.current) {
      toast.error('Failed to load statistics');
    }
    isFirstLoadRef.current = false;
  }, []);

  const refreshStats = useCallback(
    async (): Promise<void> =>
      getStats().then(
        (response) => applyStats(response.data),
        (err: unknown) => applyFailure(err),
      ),
    [applyStats, applyFailure],
  );

  useEffect(() => {
    activeRef.current = true;
    const interval = setInterval(() => void refreshStats(), REFRESH_INTERVAL_MS);
    // The request leaves here; the state it produces is written by the
    // continuations above.
    getStats().then((response) => applyStats(response.data), applyFailure);

    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [refreshStats, applyStats, applyFailure]);

  return (
    <StatsContext.Provider value={{ stats, error, refreshStats }}>
      {children}
    </StatsContext.Provider>
  );
}

