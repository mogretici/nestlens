/**
 * useEntryFilters Hook Tests
 *
 * Tests for the centralized filter management hook.
 * This is a critical hook that manages URL-based filtering for all entry types.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { useEntryFilters, getFilterUrlKey } from '../../hooks/useEntryFilters';

// ============================================================================
// TEST WRAPPER
// ============================================================================

function createWrapper(initialEntries: string[] = ['/']) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    );
  };
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('useEntryFilters', () => {
  describe('Initialization', () => {
    it('initializes with no filters when URL is clean', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps']),
      });

      expect(result.current.hasFilters).toBe(false);
      expect(result.current.serverFilters).toEqual({});
      expect(result.current.activeFilters).toEqual([]);
      expect(result.current.headerFilters).toEqual([]);
    });

    it('parses existing URL filters on initialization', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed,failed']),
      });

      expect(result.current.hasFilters).toBe(true);
      expect(result.current.serverFilters).toEqual({
        dumpStatuses: ['completed', 'failed'],
      });
    });

    it('parses multiple filter types from URL', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed&dumpFormats=json&tags=test']),
      });

      expect(result.current.serverFilters).toEqual({
        dumpStatuses: ['completed'],
        dumpFormats: ['json'],
        tags: ['test'],
      });
    });
  });

  describe('getUrlKey', () => {
    it('returns correct URL key for dumps statuses', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('statuses')).toBe('dumpStatuses');
    });

    it('returns correct URL key for dumps formats', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('formats')).toBe('dumpFormats');
    });

    it('returns correct URL key for dumps operations', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('operations')).toBe('dumpOperations');
    });

    it('returns correct URL key for requests methods', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('methods')).toBe('methods');
    });

    it('returns correct URL key for jobs statuses', () => {
      const { result } = renderHook(() => useEntryFilters('jobs'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('statuses')).toBe('jobStatuses');
    });

    it('returns correct URL key for gates results', () => {
      const { result } = renderHook(() => useEntryFilters('gates'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('results')).toBe('gateResults');
    });

    it('returns "tags" for tags category', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(),
      });

      expect(result.current.getUrlKey('tags')).toBe('tags');
    });
  });

  describe('addFilter', () => {
    it('adds a new filter value', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps']),
      });

      act(() => {
        result.current.addFilter('statuses', 'completed');
      });

      expect(result.current.serverFilters).toEqual({
        dumpStatuses: ['completed'],
      });
      expect(result.current.hasFilters).toBe(true);
    });

    it('appends to existing filter values', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
      });

      act(() => {
        result.current.addFilter('statuses', 'failed');
      });

      expect(result.current.serverFilters.dumpStatuses).toContain('completed');
      expect(result.current.serverFilters.dumpStatuses).toContain('failed');
    });

    it('does not add duplicate values', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
      });

      act(() => {
        result.current.addFilter('statuses', 'completed');
      });

      expect(result.current.serverFilters.dumpStatuses).toEqual(['completed']);
    });

    it('adds tags filter correctly', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps']),
      });

      act(() => {
        result.current.addFilter('tags', 'custom-tag');
      });

      expect(result.current.serverFilters.tags).toEqual(['custom-tag']);
    });

    it('adds multiple different filters', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps']),
      });

      // Each filter change requires its own act() due to URL state updates
      act(() => {
        result.current.addFilter('statuses', 'completed');
      });

      act(() => {
        result.current.addFilter('formats', 'json');
      });

      act(() => {
        result.current.addFilter('operations', 'export');
      });

      expect(result.current.serverFilters).toEqual({
        dumpStatuses: ['completed'],
        dumpFormats: ['json'],
        dumpOperations: ['export'],
      });
    });
  });

  describe('removeFilter', () => {
    it('removes a specific filter value', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed,failed']),
      });

      act(() => {
        result.current.removeFilter('dumpStatuses', 'completed');
      });

      expect(result.current.serverFilters.dumpStatuses).toEqual(['failed']);
    });

    it('removes the filter key when last value is removed', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
      });

      act(() => {
        result.current.removeFilter('dumpStatuses', 'completed');
      });

      expect(result.current.serverFilters.dumpStatuses).toBeUndefined();
      expect(result.current.hasFilters).toBe(false);
    });

    it('does not affect other filters when removing', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed&dumpFormats=json']),
      });

      act(() => {
        result.current.removeFilter('dumpStatuses', 'completed');
      });

      expect(result.current.serverFilters).toEqual({
        dumpFormats: ['json'],
      });
    });
  });

  describe('clearAll', () => {
    it('clears all filters', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed&dumpFormats=json&tags=test']),
      });

      expect(result.current.hasFilters).toBe(true);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.hasFilters).toBe(false);
      expect(result.current.serverFilters).toEqual({});
      expect(result.current.activeFilters).toEqual([]);
    });
  });

  describe('activeFilters', () => {
    it('returns active filters with display names', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
      });

      expect(result.current.activeFilters).toHaveLength(1);
      expect(result.current.activeFilters[0]).toMatchObject({
        category: 'statuses',
        urlKey: 'dumpStatuses',
        displayName: 'Status',
        values: ['completed'],
      });
    });

    it('handles multiple values in one filter', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed,failed,pending']),
      });

      expect(result.current.activeFilters[0].values).toEqual(['completed', 'failed', 'pending']);
    });
  });

  describe('headerFilters', () => {
    it('returns filters formatted for header display', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
      });

      expect(result.current.headerFilters).toHaveLength(1);
      expect(result.current.headerFilters[0]).toMatchObject({
        category: 'Status',
        value: 'COMPLETED',
      });
      expect(typeof result.current.headerFilters[0].onRemove).toBe('function');
    });

    it('creates separate header items for each value', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed,failed']),
      });

      expect(result.current.headerFilters).toHaveLength(2);
      expect(result.current.headerFilters[0].value).toBe('COMPLETED');
      expect(result.current.headerFilters[1].value).toBe('FAILED');
    });

    it('onRemove callback removes the correct filter', () => {
      const { result } = renderHook(() => useEntryFilters('dumps'), {
        wrapper: createWrapper(['/dumps?dumpStatuses=completed,failed']),
      });

      act(() => {
        result.current.headerFilters[0].onRemove();
      });

      expect(result.current.serverFilters.dumpStatuses).toEqual(['failed']);
    });
  });

  describe('Entry Type Specific URL Keys', () => {
    const testCases = [
      { entryType: 'requests', category: 'methods', expectedUrlKey: 'methods' },
      { entryType: 'requests', category: 'statuses', expectedUrlKey: 'statuses' },
      { entryType: 'queries', category: 'sources', expectedUrlKey: 'sources' },
      { entryType: 'queries', category: 'types', expectedUrlKey: 'queryTypes' },
      { entryType: 'logs', category: 'levels', expectedUrlKey: 'levels' },
      { entryType: 'logs', category: 'contexts', expectedUrlKey: 'contexts' },
      { entryType: 'jobs', category: 'statuses', expectedUrlKey: 'jobStatuses' },
      { entryType: 'jobs', category: 'queues', expectedUrlKey: 'queues' },
      { entryType: 'schedule', category: 'statuses', expectedUrlKey: 'scheduleStatuses' },
      { entryType: 'cache', category: 'operations', expectedUrlKey: 'cacheOperations' },
      { entryType: 'mail', category: 'statuses', expectedUrlKey: 'mailStatuses' },
      { entryType: 'redis', category: 'commands', expectedUrlKey: 'redisCommands' },
      { entryType: 'redis', category: 'statuses', expectedUrlKey: 'redisStatuses' },
      { entryType: 'models', category: 'actions', expectedUrlKey: 'modelActions' },
      { entryType: 'models', category: 'entities', expectedUrlKey: 'entities' },
      { entryType: 'models', category: 'sources', expectedUrlKey: 'modelSources' },
      { entryType: 'notifications', category: 'types', expectedUrlKey: 'notificationTypes' },
      { entryType: 'notifications', category: 'statuses', expectedUrlKey: 'notificationStatuses' },
      { entryType: 'views', category: 'formats', expectedUrlKey: 'viewFormats' },
      { entryType: 'views', category: 'statuses', expectedUrlKey: 'viewStatuses' },
      { entryType: 'commands', category: 'statuses', expectedUrlKey: 'commandStatuses' },
      { entryType: 'commands', category: 'names', expectedUrlKey: 'commandNames' },
      { entryType: 'gates', category: 'names', expectedUrlKey: 'gateNames' },
      { entryType: 'gates', category: 'results', expectedUrlKey: 'gateResults' },
      { entryType: 'batches', category: 'operations', expectedUrlKey: 'batchOperations' },
      { entryType: 'batches', category: 'statuses', expectedUrlKey: 'batchStatuses' },
      { entryType: 'dumps', category: 'operations', expectedUrlKey: 'dumpOperations' },
      { entryType: 'dumps', category: 'formats', expectedUrlKey: 'dumpFormats' },
      { entryType: 'dumps', category: 'statuses', expectedUrlKey: 'dumpStatuses' },
    ];

    testCases.forEach(({ entryType, category, expectedUrlKey }) => {
      it(`${entryType}: ${category} → ${expectedUrlKey}`, () => {
        const { result } = renderHook(() => useEntryFilters(entryType), {
          wrapper: createWrapper(),
        });

        expect(result.current.getUrlKey(category as any)).toBe(expectedUrlKey);
      });
    });
  });
});

// ============================================================================
// STANDALONE UTILITY FUNCTION TESTS
// ============================================================================

describe('getFilterUrlKey', () => {
  it('returns correct URL key for dumps statuses', () => {
    expect(getFilterUrlKey('dumps', 'statuses')).toBe('dumpStatuses');
  });

  it('returns correct URL key for requests methods', () => {
    expect(getFilterUrlKey('requests', 'methods')).toBe('methods');
  });

  it('returns correct URL key for gates results', () => {
    expect(getFilterUrlKey('gates', 'results')).toBe('gateResults');
  });

  it('returns "tags" for tags category', () => {
    expect(getFilterUrlKey('dumps', 'tags')).toBe('tags');
  });

  it('returns category as fallback for unknown entry type', () => {
    expect(getFilterUrlKey('unknown', 'statuses')).toBe('statuses');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('useEntryFilters Integration', () => {
  it('filter changes are reflected in serverFilters immediately', () => {
    const { result } = renderHook(() => useEntryFilters('dumps'), {
      wrapper: createWrapper(['/dumps']),
    });

    act(() => {
      result.current.addFilter('statuses', 'completed');
    });

    // serverFilters should be updated immediately
    expect(result.current.serverFilters.dumpStatuses).toContain('completed');
  });

  it('handles sequential filter changes correctly', () => {
    const { result } = renderHook(() => useEntryFilters('dumps'), {
      wrapper: createWrapper(['/dumps']),
    });

    // Each filter change requires its own act() due to URL state updates
    act(() => {
      result.current.addFilter('statuses', 'completed');
    });

    act(() => {
      result.current.addFilter('statuses', 'failed');
    });

    act(() => {
      result.current.addFilter('formats', 'json');
    });

    expect(result.current.serverFilters.dumpStatuses).toContain('completed');
    expect(result.current.serverFilters.dumpStatuses).toContain('failed');
    expect(result.current.serverFilters.dumpFormats).toContain('json');
  });

  it('maintains filter state across re-renders', () => {
    const { result, rerender } = renderHook(() => useEntryFilters('dumps'), {
      wrapper: createWrapper(['/dumps?dumpStatuses=completed']),
    });

    expect(result.current.serverFilters.dumpStatuses).toEqual(['completed']);

    rerender();

    expect(result.current.serverFilters.dumpStatuses).toEqual(['completed']);
  });
});
