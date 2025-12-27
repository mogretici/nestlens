/**
 * Filter Flow Integration Tests
 *
 * Tests the complete filter flow from URL → Hook → API → Display
 * These tests verify that filters work end-to-end across all entry types.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { useEntryFilters, getFilterUrlKey } from '../../hooks/useEntryFilters';
import * as api from '../../api';

// Mock API
vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn().mockResolvedValue({ data: { count: 0 } }),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

// ============================================================================
// HELPERS
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

function createMockEntry(id: number, type: string, payload: Record<string, unknown> = {}) {
  return {
    id,
    sequence: id,
    type,
    requestId: `req-${id}`,
    payload,
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

function createMockResponse(entries: ReturnType<typeof createMockEntry>[]) {
  return {
    data: entries,
    meta: {
      total: entries.length,
      hasMore: false,
      newestSequence: entries[0]?.id ?? 0,
      oldestSequence: entries[entries.length - 1]?.id ?? 0,
    },
  };
}

// ============================================================================
// FILTER FLOW TESTS
// ============================================================================

describe('Filter Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));
  });

  describe('URL → Hook → API Flow', () => {
    const testCases = [
      {
        entryType: 'requests',
        urlParam: 'methods',
        value: 'GET',
        expectedApiFilter: { methods: ['GET'] },
      },
      {
        entryType: 'requests',
        urlParam: 'statuses',
        value: '200',
        expectedApiFilter: { statuses: ['200'] },
      },
      {
        entryType: 'logs',
        urlParam: 'levels',
        value: 'error',
        expectedApiFilter: { levels: ['error'] },
      },
      {
        entryType: 'jobs',
        urlParam: 'jobStatuses',
        value: 'completed',
        expectedApiFilter: { jobStatuses: ['completed'] },
      },
      {
        entryType: 'jobs',
        urlParam: 'queues',
        value: 'default',
        expectedApiFilter: { queues: ['default'] },
      },
      {
        entryType: 'gates',
        urlParam: 'gateResults',
        value: 'allowed',
        expectedApiFilter: { gateResults: ['allowed'] },
      },
      {
        entryType: 'dumps',
        urlParam: 'dumpStatuses',
        value: 'completed',
        expectedApiFilter: { dumpStatuses: ['completed'] },
      },
      {
        entryType: 'cache',
        urlParam: 'cacheOperations',
        value: 'get',
        expectedApiFilter: { cacheOperations: ['get'] },
      },
      {
        entryType: 'redis',
        urlParam: 'redisCommands',
        value: 'GET',
        expectedApiFilter: { redisCommands: ['GET'] },
      },
      {
        entryType: 'models',
        urlParam: 'modelActions',
        value: 'create',
        expectedApiFilter: { modelActions: ['create'] },
      },
      {
        entryType: 'notifications',
        urlParam: 'notificationTypes',
        value: 'email',
        expectedApiFilter: { notificationTypes: ['email'] },
      },
      {
        entryType: 'views',
        urlParam: 'viewFormats',
        value: 'html',
        expectedApiFilter: { viewFormats: ['html'] },
      },
      {
        entryType: 'commands',
        urlParam: 'commandStatuses',
        value: 'completed',
        expectedApiFilter: { commandStatuses: ['completed'] },
      },
      {
        entryType: 'batches',
        urlParam: 'batchStatuses',
        value: 'completed',
        expectedApiFilter: { batchStatuses: ['completed'] },
      },
    ];

    testCases.forEach(({ entryType, urlParam, value, expectedApiFilter }) => {
      it(`${entryType}: URL param ${urlParam}=${value} triggers API with correct filter`, async () => {
        const url = `/${entryType}?${urlParam}=${value}`;

        const { result } = renderHook(() => useEntryFilters(entryType), {
          wrapper: createWrapper([url]),
        });

        expect(result.current.serverFilters).toEqual(expectedApiFilter);
      });
    });
  });

  describe('Multiple Filters', () => {
    it('handles multiple filter values (OR logic)', async () => {
      const url = '/requests?methods=GET,POST,PUT';

      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper([url]),
      });

      expect(result.current.serverFilters).toEqual({
        methods: ['GET', 'POST', 'PUT'],
      });
    });

    it('handles multiple filter types simultaneously', async () => {
      const url = '/requests?methods=GET&statuses=200';

      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper([url]),
      });

      expect(result.current.serverFilters).toEqual({
        methods: ['GET'],
        statuses: ['200'],
      });
    });

    it('handles tags combined with other filters', async () => {
      const url = '/requests?methods=GET&tags=important';

      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper([url]),
      });

      expect(result.current.serverFilters).toEqual({
        methods: ['GET'],
        tags: ['important'],
      });
    });
  });

  describe('Filter Add/Remove Flow', () => {
    it('addFilter updates serverFilters immediately', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests']),
      });

      expect(result.current.serverFilters).toEqual({});

      act(() => {
        result.current.addFilter('methods', 'GET');
      });

      expect(result.current.serverFilters).toEqual({
        methods: ['GET'],
      });
    });

    it('removeFilter updates serverFilters immediately', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests?methods=GET,POST']),
      });

      expect(result.current.serverFilters.methods).toContain('GET');
      expect(result.current.serverFilters.methods).toContain('POST');

      act(() => {
        result.current.removeFilter('methods', 'GET');
      });

      expect(result.current.serverFilters.methods).toEqual(['POST']);
    });

    it('clearAll removes all filters', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests?methods=GET&statuses=200&tags=test']),
      });

      expect(result.current.hasFilters).toBe(true);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.hasFilters).toBe(false);
      expect(result.current.serverFilters).toEqual({});
    });
  });

  describe('Header Filters Display', () => {
    it('formats filters for header display', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests?methods=GET']),
      });

      expect(result.current.headerFilters).toHaveLength(1);
      expect(result.current.headerFilters[0]).toMatchObject({
        category: 'Method',
        value: 'GET',
      });
    });

    it('creates separate header items for each filter value', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests?methods=GET,POST']),
      });

      expect(result.current.headerFilters).toHaveLength(2);
      expect(result.current.headerFilters.map(f => f.value)).toEqual(['GET', 'POST']);
    });

    it('headerFilter onRemove callback works', () => {
      const { result } = renderHook(() => useEntryFilters('requests'), {
        wrapper: createWrapper(['/requests?methods=GET,POST']),
      });

      act(() => {
        result.current.headerFilters[0].onRemove();
      });

      expect(result.current.serverFilters.methods).toEqual(['POST']);
    });
  });
});

// ============================================================================
// FILTER URL KEY MAPPING TESTS
// ============================================================================

describe('Filter URL Key Mapping', () => {
  describe('getFilterUrlKey', () => {
    const mappings = [
      // Requests
      { entryType: 'requests', category: 'methods', expected: 'methods' },
      { entryType: 'requests', category: 'statuses', expected: 'statuses' },
      // Queries
      { entryType: 'queries', category: 'types', expected: 'queryTypes' },
      { entryType: 'queries', category: 'sources', expected: 'sources' },
      // Logs
      { entryType: 'logs', category: 'levels', expected: 'levels' },
      { entryType: 'logs', category: 'contexts', expected: 'contexts' },
      // Jobs
      { entryType: 'jobs', category: 'statuses', expected: 'jobStatuses' },
      { entryType: 'jobs', category: 'queues', expected: 'queues' },
      { entryType: 'jobs', category: 'names', expected: 'jobNames' },
      // Schedule
      { entryType: 'schedule', category: 'statuses', expected: 'scheduleStatuses' },
      { entryType: 'schedule', category: 'names', expected: 'scheduleNames' },
      // Cache
      { entryType: 'cache', category: 'operations', expected: 'cacheOperations' },
      // Mail
      { entryType: 'mail', category: 'statuses', expected: 'mailStatuses' },
      // Redis
      { entryType: 'redis', category: 'commands', expected: 'redisCommands' },
      { entryType: 'redis', category: 'statuses', expected: 'redisStatuses' },
      // Models
      { entryType: 'models', category: 'actions', expected: 'modelActions' },
      { entryType: 'models', category: 'entities', expected: 'entities' },
      { entryType: 'models', category: 'sources', expected: 'modelSources' },
      // Notifications
      { entryType: 'notifications', category: 'types', expected: 'notificationTypes' },
      { entryType: 'notifications', category: 'statuses', expected: 'notificationStatuses' },
      // Views
      { entryType: 'views', category: 'formats', expected: 'viewFormats' },
      { entryType: 'views', category: 'statuses', expected: 'viewStatuses' },
      // Commands
      { entryType: 'commands', category: 'statuses', expected: 'commandStatuses' },
      { entryType: 'commands', category: 'names', expected: 'commandNames' },
      // Gates
      { entryType: 'gates', category: 'names', expected: 'gateNames' },
      { entryType: 'gates', category: 'results', expected: 'gateResults' },
      // Batches
      { entryType: 'batches', category: 'operations', expected: 'batchOperations' },
      { entryType: 'batches', category: 'statuses', expected: 'batchStatuses' },
      // Dumps
      { entryType: 'dumps', category: 'operations', expected: 'dumpOperations' },
      { entryType: 'dumps', category: 'formats', expected: 'dumpFormats' },
      { entryType: 'dumps', category: 'statuses', expected: 'dumpStatuses' },
      // HTTP Client (uses same keys as request for simplicity)
      { entryType: 'http-client', category: 'methods', expected: 'methods' },
      { entryType: 'http-client', category: 'statuses', expected: 'statuses' },
      { entryType: 'http-client', category: 'hostnames', expected: 'hostnames' },
      // Tags (universal)
      { entryType: 'requests', category: 'tags', expected: 'tags' },
      { entryType: 'logs', category: 'tags', expected: 'tags' },
      { entryType: 'jobs', category: 'tags', expected: 'tags' },
    ];

    mappings.forEach(({ entryType, category, expected }) => {
      it(`${entryType} + ${category} → ${expected}`, () => {
        expect(getFilterUrlKey(entryType, category)).toBe(expected);
      });
    });
  });
});

// ============================================================================
// FILTER PERSISTENCE TESTS
// ============================================================================

describe('Filter Persistence', () => {
  it('filters persist across hook re-renders', () => {
    const { result, rerender } = renderHook(() => useEntryFilters('requests'), {
      wrapper: createWrapper(['/requests?methods=GET']),
    });

    expect(result.current.serverFilters.methods).toEqual(['GET']);

    rerender();

    expect(result.current.serverFilters.methods).toEqual(['GET']);
  });

  it('filters are reset when URL is cleared', () => {
    const { result } = renderHook(() => useEntryFilters('requests'), {
      wrapper: createWrapper(['/requests?methods=GET']),
    });

    expect(result.current.hasFilters).toBe(true);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.hasFilters).toBe(false);
  });
});

// ============================================================================
// ACTIVE FILTERS TESTS
// ============================================================================

describe('Active Filters', () => {
  it('returns empty array when no filters', () => {
    const { result } = renderHook(() => useEntryFilters('requests'), {
      wrapper: createWrapper(['/requests']),
    });

    expect(result.current.activeFilters).toEqual([]);
  });

  it('returns filter objects with correct structure', () => {
    const { result } = renderHook(() => useEntryFilters('requests'), {
      wrapper: createWrapper(['/requests?methods=GET']),
    });

    expect(result.current.activeFilters).toHaveLength(1);
    expect(result.current.activeFilters[0]).toMatchObject({
      category: 'methods',
      urlKey: 'methods',
      displayName: 'Method',
      values: ['GET'],
    });
  });

  it('handles multiple filter types', () => {
    const { result } = renderHook(() => useEntryFilters('requests'), {
      wrapper: createWrapper(['/requests?methods=GET&statuses=200&tags=test']),
    });

    expect(result.current.activeFilters).toHaveLength(3);

    const categories = result.current.activeFilters.map(f => f.category);
    expect(categories).toContain('methods');
    expect(categories).toContain('statuses');
    expect(categories).toContain('tags');
  });
});
