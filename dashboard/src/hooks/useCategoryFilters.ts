import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeFilterForUrl, filtersInclude, formatFilterForDisplay, formatFiltersForServer } from '../utils/format';

/**
 * Configuration for a filter category
 */
export interface FilterCategoryConfig {
  /** URL parameter name */
  urlKey: string;
  /** Display name for the filter chip (e.g., "Method", "Level") */
  displayName: string;
  /** Optional: transform value before sending to server */
  serverTransform?: (values: string[]) => unknown;
}

/**
 * Configuration for useCategoryFilters hook
 */
export interface UseCategoryFiltersConfig<T extends string> {
  /** Map of category key to config */
  categories: Record<T, FilterCategoryConfig>;
  /** Function to determine which category a filter value belongs to */
  getCategory: (value: string) => T;
  /** Optional: single-value filters (like path, requestId) that aren't arrays */
  singleValueFilters?: string[];
}

/**
 * Filter item for PageHeader display
 */
export interface FilterHeaderItem {
  category: string;
  value: string;
  onRemove: () => void;
}

/**
 * Return type for useCategoryFilters hook
 */
export interface UseCategoryFiltersResult<T extends string> {
  /** Current filter values by category */
  filters: Record<T, string[]>;
  /** Single value filters (path, requestId, etc.) */
  singleFilters: Record<string, string | null>;
  /** Add a filter value (auto-categorizes) */
  addFilter: (value: string) => void;
  /** Add a filter value to a specific category */
  addFilterToCategory: (value: string, category: T) => void;
  /** Remove a filter value from a category */
  removeFilter: (value: string, category: T) => void;
  /** Set a single value filter */
  setSingleFilter: (key: string, value: string | null) => void;
  /** Clear all filters */
  clearAll: () => void;
  /** Filters formatted for server API */
  serverFilters: Record<string, unknown>;
  /** Filters formatted for PageHeader display */
  headerFilters: FilterHeaderItem[];
  /** Check if any filters are active */
  hasActiveFilters: boolean;
}

/**
 * Custom hook for managing category-based filters with URL sync
 *
 * @example
 * ```tsx
 * const { filters, addFilter, removeFilter, serverFilters, headerFilters } = useCategoryFilters({
 *   categories: {
 *     levels: { urlKey: 'levels', displayName: 'Level' },
 *     contexts: { urlKey: 'contexts', displayName: 'Context' },
 *     tags: { urlKey: 'tags', displayName: 'Tag' },
 *   },
 *   getCategory: (value) => {
 *     if (logLevels.includes(value.toLowerCase())) return 'levels';
 *     if (/^[A-Z]/.test(value)) return 'contexts';
 *     return 'tags';
 *   },
 * });
 * ```
 */
export function useCategoryFilters<T extends string>(
  config: UseCategoryFiltersConfig<T>
): UseCategoryFiltersResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, getCategory, singleValueFilters = [] } = config;

  // Get category keys
  const categoryKeys = Object.keys(categories) as T[];

  // Parse filters from URL
  const parseFiltersFromUrl = useCallback((): Record<T, string[]> => {
    const result = {} as Record<T, string[]>;
    for (const key of categoryKeys) {
      const urlKey = categories[key].urlKey;
      result[key] = searchParams.get(urlKey)?.split(',').filter(Boolean) ?? [];
    }
    return result;
  }, [searchParams, categoryKeys, categories]);

  // Parse single value filters from URL
  const parseSingleFiltersFromUrl = useCallback((): Record<string, string | null> => {
    const result: Record<string, string | null> = {};
    for (const key of singleValueFilters) {
      result[key] = searchParams.get(key);
    }
    return result;
  }, [searchParams, singleValueFilters]);

  /**
   * The URL is the state.
   *
   * These used to be `useState` as well, so every change wrote the same
   * information twice — into local state and into the query string — and an
   * effect read the URL back and reconciled the two by comparing JSON. Two
   * sources of truth with a repair loop between them: a back button, a link
   * pasted into the address bar, or anything else that moved the URL without
   * going through this hook left the two disagreeing until that effect caught
   * up, a render later.
   *
   * Derived, there is one source and nothing to reconcile. Every mutation below
   * writes the query string, and the values here follow.
   */
  const filters = useMemo(() => parseFiltersFromUrl(), [parseFiltersFromUrl]);
  const singleFilters = useMemo(() => parseSingleFiltersFromUrl(), [parseSingleFiltersFromUrl]);

  // Update URL when filters change
  const syncUrl = useCallback((
    newFilters: Record<T, string[]>,
    newSingleFilters: Record<string, string | null>
  ) => {
    const params: Record<string, string> = {};

    // Add category filters
    for (const key of categoryKeys) {
      const urlKey = categories[key].urlKey;
      if (newFilters[key].length > 0) {
        params[urlKey] = newFilters[key].join(',');
      }
    }

    // Add single value filters
    for (const key of singleValueFilters) {
      const value = newSingleFilters[key];
      if (value) {
        params[key] = value;
      }
    }

    setSearchParams(params);
  }, [categoryKeys, categories, singleValueFilters, setSearchParams]);

  // Add filter (auto-categorize)
  const addFilter = useCallback((value: string) => {
    const category = getCategory(value);
    const normalizedValue = normalizeFilterForUrl(value, category);

    if (filtersInclude(filters[category], normalizedValue)) return;

    const newFilters = {
      ...filters,
      [category]: [...filters[category], normalizedValue],
    };
    syncUrl(newFilters, singleFilters);
  }, [filters, singleFilters, getCategory, syncUrl]);

  // Add filter to specific category
  const addFilterToCategory = useCallback((value: string, category: T) => {
    const normalizedValue = normalizeFilterForUrl(value, category);

    if (filtersInclude(filters[category], normalizedValue)) return;

    const newFilters = {
      ...filters,
      [category]: [...filters[category], normalizedValue],
    };
    syncUrl(newFilters, singleFilters);
  }, [filters, singleFilters, syncUrl]);

  // Remove filter
  const removeFilter = useCallback((value: string, category: T) => {
    const newFilters = {
      ...filters,
      [category]: filters[category].filter(f => f !== value),
    };
    syncUrl(newFilters, singleFilters);
  }, [filters, singleFilters, syncUrl]);

  // Set single value filter
  const setSingleFilter = useCallback((key: string, value: string | null) => {
    const newSingleFilters = { ...singleFilters, [key]: value };
    syncUrl(filters, newSingleFilters);
  }, [filters, singleFilters, syncUrl]);

  // Clear all filters
  const clearAll = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // Build server filters
  const serverFilters = useMemo(() => {
    const result: Record<string, unknown> = {};

    for (const key of categoryKeys) {
      const categoryConfig = categories[key];
      const values = filters[key];

      if (values.length > 0) {
        if (categoryConfig.serverTransform) {
          result[categoryConfig.urlKey] = categoryConfig.serverTransform(values);
        } else {
          result[categoryConfig.urlKey] = formatFiltersForServer(values, categoryConfig.urlKey);
        }
      }
    }

    // Add single value filters
    for (const key of singleValueFilters) {
      const value = singleFilters[key];
      if (value) {
        // Convert to array format for paths
        if (key === 'path') {
          result['paths'] = [value];
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }, [filters, singleFilters, categoryKeys, categories, singleValueFilters]);

  // Build header filters for PageHeader
  const headerFilters = useMemo(() => {
    const items: FilterHeaderItem[] = [];

    for (const key of categoryKeys) {
      const categoryConfig = categories[key];
      filters[key].forEach(value => {
        items.push({
          category: categoryConfig.displayName,
          value: formatFilterForDisplay(value, categoryConfig.urlKey),
          onRemove: () => removeFilter(value, key),
        });
      });
    }

    // Add single value filters
    for (const key of singleValueFilters) {
      const value = singleFilters[key];
      if (value) {
        items.push({
          category: key.charAt(0).toUpperCase() + key.slice(1),
          value: formatFilterForDisplay(value, key === 'path' ? 'paths' : key),
          onRemove: () => setSingleFilter(key, null),
        });
      }
    }

    return items;
  }, [filters, singleFilters, categoryKeys, categories, singleValueFilters, removeFilter, setSingleFilter]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    for (const key of categoryKeys) {
      if (filters[key].length > 0) return true;
    }
    for (const key of singleValueFilters) {
      if (singleFilters[key]) return true;
    }
    return false;
  }, [filters, singleFilters, categoryKeys, singleValueFilters]);

  return {
    filters,
    singleFilters,
    addFilter,
    addFilterToCategory,
    removeFilter,
    setSingleFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasActiveFilters,
  };
}
