import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getStats } from '../api';
import { Stats } from '../types';

interface StatsContextType {
  stats: Stats | null;
  error: Error | null;
  refreshStats: () => Promise<void>;
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isFirstLoadRef = useRef(true);

  const refreshStats = useCallback(async () => {
    try {
      const response = await getStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to fetch stats');
      setError(errorObj);
      console.error('Failed to fetch stats:', err);
      // Only show toast on first load failure to avoid spam from periodic refreshes
      if (isFirstLoadRef.current) {
        toast.error('Failed to load statistics');
      }
    } finally {
      isFirstLoadRef.current = false;
    }
  }, []);

  // Initial fetch and interval
  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 10000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return (
    <StatsContext.Provider value={{ stats, error, refreshStats }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats() {
  const context = useContext(StatsContext);
  if (context === undefined) {
    throw new Error('useStats must be used within a StatsProvider');
  }
  return context;
}
