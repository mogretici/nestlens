import { ChevronDown, Clock, Timer } from 'lucide-react';
import { getEntryTypeConfig } from '../config/entryTypes';
import {
  DURATIONS,
  DurationId,
  WINDOWS,
  WindowId,
  useRangeFilters,
} from '../hooks/useRangeFilters';

interface RangeFiltersProps {
  /** The route this page lists, as `entryTypes.ts` knows it — `requests`, `graphql`. */
  route: string;
}

const WRAPPER_CLASS =
  'flex items-center gap-1.5 rounded-md px-2 py-1 text-gray-500 dark:text-gray-400 ' +
  'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer ' +
  'focus-within:ring-2 focus-within:ring-primary-500';

/**
 * The chevron is drawn rather than left to the browser: `appearance-none` is
 * what keeps the control from looking like a form field wedged into a toolbar,
 * and without something in its place the value reads as a label nobody can
 * press.
 */
const SELECT_CLASS =
  'appearance-none bg-transparent text-xs font-medium text-gray-700 dark:text-gray-200 ' +
  'border-0 p-0 pr-1 focus:outline-none cursor-pointer';

/**
 * The two range filters, side by side above the table.
 *
 * They read and write the query string through `useRangeFilters`, so this holds
 * no state of its own and a page can call the same hook for the values it sends
 * to the API without the two drifting apart.
 */
export default function RangeFilters({ route }: RangeFiltersProps) {
  const { window, duration, setWindow, setDuration } = useRangeFilters();
  const measuresDuration = getEntryTypeConfig(route)?.measuresDuration ?? false;

  return (
    <div className="flex items-center gap-4">
      <label className={WRAPPER_CLASS}>
        <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="sr-only">Time window</span>
        <select
          aria-label="Time window"
          data-testid="window-filter"
          value={window}
          onChange={(event) => setWindow(event.target.value as WindowId)}
          className={SELECT_CLASS}
        >
          {WINDOWS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" aria-hidden="true" />
      </label>

      {measuresDuration && (
        <label className={WRAPPER_CLASS}>
          <Timer className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="sr-only">Minimum duration</span>
          <select
            aria-label="Minimum duration"
            data-testid="duration-filter"
            value={duration}
            onChange={(event) => setDuration(event.target.value as DurationId)}
            className={SELECT_CLASS}
          >
            {DURATIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" aria-hidden="true" />
        </label>
      )}
    </div>
  );
}
