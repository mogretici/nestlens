import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The two filters that are ranges rather than lists of values.
 *
 * Every other filter narrows to a set — these methods, those statuses — and the
 * chips in the header are built for that. When a request happened and how long
 * it took are bounds, so they get their own control and their own place in the
 * URL, alongside the rest.
 *
 * Both are kept in the query string like every other filter, so a narrowed view
 * is a link somebody can send and a refresh does not lose it.
 */

/** How far back to look, as the choices people actually reach for. */
export const WINDOWS = [
  { id: 'all', label: 'Any time', minutes: 0 },
  { id: '5m', label: 'Last 5 minutes', minutes: 5 },
  { id: '15m', label: 'Last 15 minutes', minutes: 15 },
  { id: '1h', label: 'Last hour', minutes: 60 },
  { id: '24h', label: 'Last 24 hours', minutes: 60 * 24 },
] as const;

/** Where a reader draws the line on "slow". */
export const DURATIONS = [
  { id: 'any', label: 'Any duration', ms: 0 },
  { id: '100', label: 'Over 100ms', ms: 100 },
  { id: '500', label: 'Over 500ms', ms: 500 },
  { id: '1000', label: 'Over 1s', ms: 1000 },
  { id: '5000', label: 'Over 5s', ms: 5000 },
] as const;

export type WindowId = (typeof WINDOWS)[number]['id'];
export type DurationId = (typeof DURATIONS)[number]['id'];

const WINDOW_KEY = 'window';
const DURATION_KEY = 'slower';

export interface UseRangeFiltersResult {
  window: WindowId;
  duration: DurationId;
  setWindow: (id: WindowId) => void;
  setDuration: (id: DurationId) => void;
  /**
   * How far back to look, in minutes, or `0` for any time.
   *
   * A duration rather than an instant: the instant is computed where the
   * request is made, so "the last five minutes" keeps meaning that instead of
   * freezing at the moment of the click.
   */
  windowMinutes: number;

  /** What the API is asked for besides the window. */
  rangeFilters: { minDuration?: number };
  hasRange: boolean;
  clearRanges: () => void;
}

const isWindow = (value: string | null): value is WindowId =>
  WINDOWS.some((option) => option.id === value);

const isDuration = (value: string | null): value is DurationId =>
  DURATIONS.some((option) => option.id === value);

export function useRangeFilters(): UseRangeFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const windowParam = searchParams.get(WINDOW_KEY);
  const durationParam = searchParams.get(DURATION_KEY);

  const activeWindow: WindowId = isWindow(windowParam) ? windowParam : 'all';
  const activeDuration: DurationId = isDuration(durationParam) ? durationParam : 'any';

  const set = useCallback(
    (key: string, value: string, isDefault: boolean) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (isDefault) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setWindow = useCallback((id: WindowId) => set(WINDOW_KEY, id, id === 'all'), [set]);
  const setDuration = useCallback((id: DurationId) => set(DURATION_KEY, id, id === 'any'), [set]);

  const clearRanges = useCallback(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(WINDOW_KEY);
        next.delete(DURATION_KEY);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const windowMinutes = WINDOWS.find((option) => option.id === activeWindow)?.minutes ?? 0;

  const rangeFilters = useMemo(() => {
    const ms = DURATIONS.find((option) => option.id === activeDuration)?.ms ?? 0;

    return ms > 0 ? { minDuration: ms } : {};
  }, [activeDuration]);

  return {
    window: activeWindow,
    duration: activeDuration,
    setWindow,
    setDuration,
    windowMinutes,
    rangeFilters,
    hasRange: activeWindow !== 'all' || activeDuration !== 'any',
    clearRanges,
  };
}
