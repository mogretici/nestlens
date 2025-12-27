/**
 * useEntryFilters - Centralized filter management hook
 *
 * ARCHITECTURE:
 * - entryTypes.ts is the single source of truth for all filter definitions
 * - This hook provides type-safe filter operations
 * - addFilter requires explicit category - NO auto-detection/guessing
 *
 * USAGE:
 *   const { addFilter } = useEntryFilters('dumps');
 *   addFilter('statuses', 'completed');  // → ?dumpStatuses=completed
 *   addFilter('formats', 'json');        // → ?dumpFormats=json
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getEntryTypeConfig } from '../config/entryTypes';

// ============================================================================
// TYPES
// ============================================================================

export interface ActiveFilter {
  category: string;
  urlKey: string;
  displayName: string;
  values: string[];
}

/** Filter item compatible with PageHeader */
export interface HeaderFilter {
  category: string;
  value: string;
  onRemove: () => void;
}

/**
 * Filter category names used across entry types.
 * These are the keys in the filters object of each entry type config.
 */
export type FilterCategory =
  // Common categories
  | 'methods' | 'statuses' | 'paths' | 'controllers' | 'hostnames' | 'ips'
  // Query/Model categories
  | 'types' | 'sources' | 'entities' | 'actions'
  // Log categories
  | 'levels' | 'contexts'
  // Event/Schedule/Command categories
  | 'names' | 'queues'
  // Cache/Dump/Batch categories
  | 'operations' | 'formats'
  // Redis categories
  | 'commands'
  // Gate categories
  | 'results'
  // GraphQL categories
  | 'operationTypes' | 'operationNames'
  // Special category for custom tags
  | 'tags';

export interface UseEntryFiltersResult {
  /**
   * Add a filter value with explicit category.
   * NO auto-detection - you must specify the category.
   *
   * @param category - The filter category (e.g., 'statuses', 'methods', 'operations')
   * @param value - The filter value (e.g., 'completed', 'GET', 'export')
   *
   * @example
   *   addFilter('statuses', 'completed')  // Dumps: → ?dumpStatuses=completed
   *   addFilter('methods', 'GET')         // Requests: → ?methods=GET
   *   addFilter('tags', 'custom')         // Any: → ?tags=custom
   */
  addFilter: (category: FilterCategory, value: string) => void;

  /** Remove a specific filter value */
  removeFilter: (urlKey: string, value: string) => void;

  /** Clear all filters */
  clearAll: () => void;

  /** Filters formatted for API calls */
  serverFilters: Record<string, string[]>;

  /** Active filters for header display (raw) */
  activeFilters: ActiveFilter[];

  /** Filters formatted for PageHeader component */
  headerFilters: HeaderFilter[];

  /** Check if any filters are active */
  hasFilters: boolean;

  /**
   * Get URL key for a category.
   * Useful when you need to know the actual URL parameter name.
   *
   * @example
   *   getUrlKey('statuses')  // Dumps: 'dumpStatuses', Requests: 'statuses'
   */
  getUrlKey: (category: FilterCategory) => string;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for managing entry-specific filters.
 *
 * @param entryType - The entry type route (e.g., 'dumps', 'redis', 'models')
 */
export function useEntryFilters(entryType: string): UseEntryFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const config = getEntryTypeConfig(entryType);

  // Helper: Get URL key for a category
  const getUrlKey = useCallback((category: FilterCategory): string => {
    if (category === 'tags') return 'tags';
    if (!config) return category;
    const filterDef = config.filters[category];
    return filterDef?.urlKey || category;
  }, [config]);

  // Parse current filters from URL
  const currentFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};

    if (!config) return filters;

    // Get all valid URL keys for this entry type
    const validKeys = Object.values(config.filters).map(f => f.urlKey);
    validKeys.push('tags', 'search');

    for (const key of validKeys) {
      const value = searchParams.get(key);
      if (value) {
        filters[key] = value.split(',').filter(Boolean);
      }
    }

    return filters;
  }, [searchParams, config]);

  // Add a filter value with EXPLICIT category
  const addFilter = useCallback((category: FilterCategory, value: string) => {
    if (!config && category !== 'tags') {
      console.warn(`[useEntryFilters] No config found for entry type, using category as urlKey`);
    }

    const urlKey = getUrlKey(category);
    const currentValues = currentFilters[urlKey] || [];

    if (!currentValues.includes(value)) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set(urlKey, [...currentValues, value].join(','));
      setSearchParams(newParams, { replace: true });
    }
  }, [config, getUrlKey, currentFilters, searchParams, setSearchParams]);

  // Remove a specific filter value
  const removeFilter = useCallback((urlKey: string, value: string) => {
    const currentValues = currentFilters[urlKey] || [];
    const newValues = currentValues.filter(v => v !== value);

    const newParams = new URLSearchParams(searchParams);
    if (newValues.length > 0) {
      newParams.set(urlKey, newValues.join(','));
    } else {
      newParams.delete(urlKey);
    }
    setSearchParams(newParams, { replace: true });
  }, [currentFilters, searchParams, setSearchParams]);

  // Clear all filters
  const clearAll = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Format filters for API calls
  const serverFilters = useMemo(() => {
    return currentFilters;
  }, [currentFilters]);

  // Active filters for header display
  const activeFilters = useMemo((): ActiveFilter[] => {
    if (!config) return [];

    const result: ActiveFilter[] = [];

    for (const [urlKey, values] of Object.entries(currentFilters)) {
      if (values.length === 0) continue;

      // Find the filter definition by urlKey
      let category = urlKey;
      let displayName = urlKey === 'tags' ? 'Tag' : urlKey;

      for (const [cat, filterDef] of Object.entries(config.filters)) {
        if (filterDef.urlKey === urlKey) {
          category = cat;
          displayName = filterDef.displayName;
          break;
        }
      }

      result.push({
        category,
        urlKey,
        displayName,
        values,
      });
    }

    return result;
  }, [currentFilters, config]);

  // Header filters for PageHeader component
  const headerFilters = useMemo((): HeaderFilter[] => {
    const items: HeaderFilter[] = [];

    for (const filter of activeFilters) {
      for (const value of filter.values) {
        items.push({
          category: filter.displayName,
          value: value.toUpperCase(),
          onRemove: () => removeFilter(filter.urlKey, value),
        });
      }
    }

    return items;
  }, [activeFilters, removeFilter]);

  const hasFilters = activeFilters.length > 0;

  return {
    addFilter,
    removeFilter,
    clearAll,
    serverFilters,
    activeFilters,
    headerFilters,
    hasFilters,
    getUrlKey,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the URL key for a specific filter category within an entry type.
 * Standalone function for use outside of React components.
 *
 * @param entryType - The entry type (e.g., 'dumps')
 * @param category - The filter category (e.g., 'statuses')
 * @returns The URL key (e.g., 'dumpStatuses')
 */
export function getFilterUrlKey(entryType: string, category: FilterCategory): string {
  if (category === 'tags') return 'tags';
  const config = getEntryTypeConfig(entryType);
  if (!config) return category;
  const filterDef = config.filters[category];
  return filterDef?.urlKey || category;
}
