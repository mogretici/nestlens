import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';

interface EntrySearchInputProps {
  placeholder?: string;
}

/**
 * Debounced search input synced to the `?search=` URL param.
 *
 * The `search` param is picked up by useEntryFilters' serverFilters and sent
 * to the entries API, which matches it against the entry payload (names,
 * types, paths, messages, etc.) and the entry's tags (case-insensitive,
 * partial match).
 */
export default function EntrySearchInput({ placeholder = 'Search...' }: EntrySearchInputProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);

  // The URL can change without the field: a filter chip removed, "clear all",
  // plain navigation. Adjusting during render rather than in an effect keeps the
  // field and the URL in the same frame.
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchInput(urlSearch);
  }

  // Debounce: push the field to the URL 350 ms after the last keystroke.
  useEffect(() => {
    // Nothing to write. Arming the timer anyway made it navigate to the URL it
    // was already on, and that navigation could land after a row click and
    // replace the detail page the click had just pushed.
    if (searchInput === urlSearch) return;

    // React Router commits a navigation in a transition, so for as long as the
    // next page takes to load, the URL has moved on while this field is still
    // mounted and its cleanup has not run. Only the page that armed the timer
    // may be written to.
    const armedOn = window.location.pathname;
    const timer = setTimeout(() => {
      if (window.location.pathname !== armedOn) return;

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) {
            next.set('search', searchInput);
          } else {
            next.delete('search');
          }
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, setSearchParams]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      {searchInput && (
        <button
          onClick={() => setSearchInput('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
