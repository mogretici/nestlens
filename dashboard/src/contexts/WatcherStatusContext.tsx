import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { getWatcherStatus } from '../api';
import { WatcherStatusReport } from '../types';
import { WatcherStatusContext, WatcherStatuses } from './useWatcherStatus';

/**
 * A watcher's state changes when the application hands it something — a queue
 * registered after startup, a first `trackCheck()` — so it is asked again now
 * and then, far less often than the stats.
 */
const REFRESH_INTERVAL_MS = 30_000;

export function WatcherStatusProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<WatcherStatuses | undefined>(undefined);
  const activeRef = useRef(true);

  const apply = useCallback((reports: WatcherStatusReport[]) => {
    if (!activeRef.current) return;

    setStatuses(new Map(reports.map((report) => [report.type, report])));
  }, []);

  // A failed request leaves every page on its own empty message; the table
  // already says so when the entries themselves could not be loaded.
  const ignore = useCallback(() => undefined, []);

  useEffect(() => {
    activeRef.current = true;
    const ask = (): void => {
      getWatcherStatus().then((response) => apply(response.data), ignore);
    };

    ask();
    const interval = setInterval(ask, REFRESH_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [apply, ignore]);

  return <WatcherStatusContext.Provider value={statuses}>{children}</WatcherStatusContext.Provider>;
}
