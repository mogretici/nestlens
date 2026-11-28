import { createContext, useContext } from 'react';
import { EntryType, WatcherState, WatcherStatusReport } from '../types';

export type WatcherStatuses = ReadonlyMap<EntryType, WatcherStatusReport>;

export const WatcherStatusContext = createContext<WatcherStatuses | undefined>(undefined);

/**
 * What a watcher reports about itself, once the dashboard has asked.
 *
 * `undefined` outside the provider and before the first answer, and a page
 * then shows its own empty message: the status adds to what a page says and
 * never stands in for the entries. Kept out of the provider's file for the
 * same fast-refresh reason as `useStats`.
 */
export function useWatcherStatus(type: EntryType | undefined): WatcherStatusReport | undefined {
  const statuses = useContext(WatcherStatusContext);

  return type === undefined ? undefined : statuses?.get(type);
}

/** A status that says more than a table's own empty message would. */
export type UnrecordingStatus = WatcherStatusReport & { state: Exclude<WatcherState, 'recording'> };

export function explainsEmptiness(
  status: WatcherStatusReport | undefined,
): status is UnrecordingStatus {
  return status !== undefined && status.state !== 'recording';
}
