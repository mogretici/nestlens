import { createContext, useContext } from 'react';
import { Stats } from '../types';

export interface StatsContextType {
  stats: Stats | null;
  error: Error | null;
  refreshStats: () => Promise<void>;
}

export const StatsContext = createContext<StatsContextType | undefined>(undefined);

/**
 * Kept out of the file that defines the provider: a module exporting both a
 * component and a plain function loses fast refresh, so editing this hook would
 * remount the tree — and this hook sits above every page.
 */
export function useStats(): StatsContextType {
  const context = useContext(StatsContext);
  if (context === undefined) {
    throw new Error('useStats must be used within a StatsProvider');
  }

  return context;
}
