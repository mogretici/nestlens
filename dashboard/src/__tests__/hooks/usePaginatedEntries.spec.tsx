/**
 * usePaginatedEntries Hook Tests
 *
 * Tests for the paginated entries hook that handles:
 * - Initial data fetching
 * - Load more (pagination)
 * - Load new entries
 * - Auto-refresh functionality
 * - Error handling
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';
import toast from 'react-hot-toast';

// Mock the API module
vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockEntry(id: number, sequence: number) {
  return {
    id,
    sequence,
    type: 'request',
    requestId: `req-${id}`,
    payload: { method: 'GET', path: '/api/test' },
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

function createMockResponse(entries: ReturnType<typeof createMockEntry>[], meta: Partial<{
  total: number;
  hasMore: boolean;
  newestSequence: number;
  oldestSequence: number;
}> = {}) {
  return {
    data: entries,
    meta: {
      total: meta.total ?? entries.length,
      hasMore: meta.hasMore ?? false,
      newestSequence: meta.newestSequence ?? (entries[0]?.sequence ?? 0),
      oldestSequence: meta.oldestSequence ?? (entries[entries.length - 1]?.sequence ?? 0),
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('usePaginatedEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Mock checkNewEntries to return empty by default
    vi.mocked(api.checkNewEntries).mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial Load', () => {
    it('starts with loading state', async () => {
      let resolvePromise: (value: unknown) => void;
      vi.mocked(api.getEntriesWithCursor).mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve; })
      );

      const { result, unmount } = renderHook(() => usePaginatedEntries());

      expect(result.current.loading).toBe(true);
      expect(result.current.entries).toEqual([]);

      // Resolve to cleanup
      await act(async () => {
        resolvePromise!(createMockResponse([]));
      });
      unmount();
    });

    it('fetches entries on mount', async () => {
      const mockEntries = [createMockEntry(1, 100), createMockEntry(2, 99)];
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(
        createMockResponse(mockEntries, { total: 2, hasMore: false })
      );

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].id).toBe(1);
      expect(result.current.meta?.total).toBe(2);
    });

    it('sets error state on fetch failure', async () => {
      vi.mocked(api.getEntriesWithCursor).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Network error');
      expect(toast.error).toHaveBeenCalledWith('Failed to load entries');
    });

    it('passes type filter to API', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      renderHook(() => usePaginatedEntries({ type: 'request' }));

      await waitFor(() => {
        expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'request' })
        );
      });
    });

    it('passes limit to API', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      renderHook(() => usePaginatedEntries({ limit: 25 }));

      await waitFor(() => {
        expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 25 })
        );
      });
    });

    it('passes filters to API', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));
      const filters = { methods: ['GET', 'POST'] };

      renderHook(() => usePaginatedEntries({ filters }));

      await waitFor(() => {
        expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
          expect.objectContaining({ filters })
        );
      });
    });
  });

  describe('Load More', () => {
    it('loads more entries when hasMore is true', async () => {
      const initialEntries = [createMockEntry(1, 100), createMockEntry(2, 99)];
      const moreEntries = [createMockEntry(3, 98), createMockEntry(4, 97)];

      vi.mocked(api.getEntriesWithCursor)
        .mockResolvedValueOnce(createMockResponse(initialEntries, { hasMore: true, oldestSequence: 99 }))
        .mockResolvedValueOnce(createMockResponse(moreEntries, { hasMore: false }));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.entries).toHaveLength(4);
      expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
        expect.objectContaining({ beforeSequence: 99 })
      );
    });

    it('does not load more when hasMore is false', async () => {
      const entries = [createMockEntry(1, 100)];
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(
        createMockResponse(entries, { hasMore: false })
      );

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(api.getEntriesWithCursor).mock.calls.length;

      await act(async () => {
        await result.current.loadMore();
      });

      // Should not make additional calls when hasMore is false
      expect(vi.mocked(api.getEntriesWithCursor).mock.calls.length).toBe(callCount);
    });
  });

  describe('Refresh', () => {
    it('refreshes all data', async () => {
      const initialEntries = [createMockEntry(1, 100)];
      const refreshedEntries = [createMockEntry(2, 101), createMockEntry(1, 100)];

      vi.mocked(api.getEntriesWithCursor)
        .mockResolvedValueOnce(createMockResponse(initialEntries))
        .mockResolvedValueOnce(createMockResponse(refreshedEntries, { total: 2 }));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.meta?.total).toBe(2);
    });

    it('shows error toast on refresh failure', async () => {
      vi.mocked(api.getEntriesWithCursor)
        .mockResolvedValueOnce(createMockResponse([]))
        .mockRejectedValueOnce(new Error('Refresh failed'));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to refresh entries');
    });
  });

  describe('Auto Refresh', () => {
    it('defaults to enabled from localStorage', async () => {
      localStorage.setItem('nestlens-auto-refresh', 'true');
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.autoRefreshEnabled).toBe(true);
    });

    it('respects disabled state from localStorage', async () => {
      localStorage.setItem('nestlens-auto-refresh', 'false');
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.autoRefreshEnabled).toBe(false);
    });

    it('toggles auto refresh and persists to localStorage', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setAutoRefresh(false);
      });

      expect(result.current.autoRefreshEnabled).toBe(false);
      expect(localStorage.getItem('nestlens-auto-refresh')).toBe('false');

      act(() => {
        result.current.setAutoRefresh(true);
      });

      expect(result.current.autoRefreshEnabled).toBe(true);
      expect(localStorage.getItem('nestlens-auto-refresh')).toBe('true');
    });
  });

  describe('Update Entry', () => {
    it('updates a single entry in the list', async () => {
      const entries = [
        createMockEntry(1, 100),
        createMockEntry(2, 99),
      ];
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse(entries));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedEntry = { ...entries[0], payload: { method: 'POST', path: '/api/updated' } };

      act(() => {
        result.current.updateEntry(updatedEntry);
      });

      expect(result.current.entries[0].payload).toEqual({ method: 'POST', path: '/api/updated' });
      expect(result.current.entries[1]).toEqual(entries[1]);
    });

    it('does not modify other entries', async () => {
      const entries = [createMockEntry(1, 100), createMockEntry(2, 99)];
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse(entries));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedEntry = { ...entries[0], payload: { method: 'PUT' } };

      act(() => {
        result.current.updateEntry(updatedEntry);
      });

      expect(result.current.entries[1]).toEqual(entries[1]);
    });
  });

  describe('Filter Changes', () => {
    it('refetches when filters change', async () => {
      const entries1 = [createMockEntry(1, 100)];
      const entries2 = [createMockEntry(2, 99)];

      vi.mocked(api.getEntriesWithCursor)
        .mockResolvedValueOnce(createMockResponse(entries1))
        .mockResolvedValueOnce(createMockResponse(entries2));

      const { result, rerender } = renderHook(
        ({ filters }) => usePaginatedEntries({ filters }),
        { initialProps: { filters: { methods: ['GET'] } } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.entries[0].id).toBe(1);

      rerender({ filters: { methods: ['POST'] } });

      await waitFor(() => {
        expect(result.current.entries[0]?.id).toBe(2);
      });
    });
  });

  describe('Meta State', () => {
    it('exposes hasMore from meta', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(
        createMockResponse([createMockEntry(1, 100)], { hasMore: true })
      );

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('exposes meta object', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(
        createMockResponse([createMockEntry(1, 100)], {
          total: 50,
          hasMore: true,
          newestSequence: 100,
          oldestSequence: 100,
        })
      );

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.meta).toEqual({
        total: 50,
        hasMore: true,
        newestSequence: 100,
        oldestSequence: 100,
      });
    });
  });

  describe('New Entries', () => {
    it('starts with zero new entries count', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue(createMockResponse([]));

      const { result } = renderHook(() => usePaginatedEntries());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.newEntriesCount).toBe(0);
    });
  });
});
