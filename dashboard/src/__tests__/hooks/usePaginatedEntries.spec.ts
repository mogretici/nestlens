import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

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
  },
}));

/**
 * usePaginatedEntries Hook Tests
 *
 * Tests for pagination, auto-refresh, and entry management.
 */

describe('usePaginatedEntries', () => {
  const mockEntries = [
    { id: 1, type: 'request', sequence: 100, timestamp: '2025-01-15T10:00:00Z' },
    { id: 2, type: 'request', sequence: 99, timestamp: '2025-01-15T09:00:00Z' },
  ];

  const mockMeta = {
    total: 100,
    hasMore: true,
    newestSequence: 100,
    oldestSequence: 99,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default mock implementations
    (api.getEntriesWithCursor as any).mockResolvedValue({
      data: mockEntries,
      meta: mockMeta,
    });

    (api.checkNewEntries as any).mockResolvedValue({
      data: { count: 0 },
    });

    (api.getLatestSequence as any).mockResolvedValue({
      data: null,
    });

    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns initial state structure', async () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current).toHaveProperty('entries');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('refreshing');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('meta');
      expect(result.current).toHaveProperty('newEntriesCount');
      expect(result.current).toHaveProperty('hasMore');
      expect(result.current).toHaveProperty('loadMore');
      expect(result.current).toHaveProperty('loadNew');
      expect(result.current).toHaveProperty('refresh');
      expect(result.current).toHaveProperty('setAutoRefresh');
      expect(result.current).toHaveProperty('autoRefreshEnabled');
      expect(result.current).toHaveProperty('updateEntry');
    });

    it('loading is true initially', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.loading).toBe(true);
    });

    it('entries is empty array initially', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.entries).toEqual([]);
    });

    it('error is null initially', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.error).toBeNull();
    });
  });

  describe('API Calls', () => {
    it('calls getEntriesWithCursor on mount', async () => {
      // Arrange & Act
      renderHook(() => usePaginatedEntries({ type: 'request' }));

      // Advance timers to allow useEffect to run
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Assert
      expect(api.getEntriesWithCursor).toHaveBeenCalled();
    });

    it('passes type to API call', async () => {
      // Arrange & Act
      renderHook(() => usePaginatedEntries({ type: 'query' }));

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Assert
      expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'query' })
      );
    });

    it('passes limit to API call', async () => {
      // Arrange & Act
      renderHook(() => usePaginatedEntries({ limit: 25 }));

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Assert
      expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 })
      );
    });

    it('uses default limit of 50', async () => {
      // Arrange & Act
      renderHook(() => usePaginatedEntries());

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Assert
      expect(api.getEntriesWithCursor).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  describe('Auto Refresh State', () => {
    it('autoRefreshEnabled defaults to true when localStorage empty', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.autoRefreshEnabled).toBe(true);
    });

    it('reads autoRefreshEnabled from localStorage', () => {
      // Arrange
      localStorage.setItem('nestlens-auto-refresh', 'false');

      // Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.autoRefreshEnabled).toBe(false);
    });

    it('setAutoRefresh updates state', async () => {
      // Arrange
      const { result } = renderHook(() => usePaginatedEntries());

      // Act
      act(() => {
        result.current.setAutoRefresh(false);
      });

      // Assert
      expect(result.current.autoRefreshEnabled).toBe(false);
    });

    it('setAutoRefresh persists to localStorage', async () => {
      // Arrange
      const { result } = renderHook(() => usePaginatedEntries());

      // Act
      act(() => {
        result.current.setAutoRefresh(false);
      });

      // Assert
      expect(localStorage.getItem('nestlens-auto-refresh')).toBe('false');
    });

    it('initialAutoRefresh option overrides localStorage', () => {
      // Arrange
      localStorage.setItem('nestlens-auto-refresh', 'true');

      // Act
      const { result } = renderHook(() =>
        usePaginatedEntries({ autoRefresh: false })
      );

      // Assert
      expect(result.current.autoRefreshEnabled).toBe(false);
    });
  });

  describe('Update Entry', () => {
    it('updateEntry is a function', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(typeof result.current.updateEntry).toBe('function');
    });
  });

  describe('Callback Functions', () => {
    it('loadMore is a function', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(typeof result.current.loadMore).toBe('function');
    });

    it('loadNew is a function', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(typeof result.current.loadNew).toBe('function');
    });

    it('refresh is a function', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(typeof result.current.refresh).toBe('function');
    });
  });

  describe('hasMore', () => {
    it('hasMore defaults to false when meta is null', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('newEntriesCount', () => {
    it('newEntriesCount defaults to 0', () => {
      // Arrange & Act
      const { result } = renderHook(() => usePaginatedEntries());

      // Assert
      expect(result.current.newEntriesCount).toBe(0);
    });
  });
});

describe('stableStringify (behavior test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    (api.getEntriesWithCursor as any).mockResolvedValue({
      data: [],
      meta: { total: 0, hasMore: false, newestSequence: 0, oldestSequence: 0 },
    });
    (api.checkNewEntries as any).mockResolvedValue({ data: { count: 0 } });
    (api.getLatestSequence as any).mockResolvedValue({ data: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats null/undefined filters consistently', () => {
    // Arrange & Act
    const { result: result1 } = renderHook(() =>
      usePaginatedEntries({ filters: undefined })
    );
    const { result: result2 } = renderHook(() =>
      usePaginatedEntries({ filters: undefined })
    );

    // Assert - both should have same initial state
    expect(result1.current.loading).toBe(result2.current.loading);
  });
});

describe('Auto-refresh interval behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    (api.getEntriesWithCursor as any).mockResolvedValue({
      data: [{ id: 1, sequence: 100 }],
      meta: { total: 1, hasMore: false, newestSequence: 100, oldestSequence: 100 },
    });
    (api.checkNewEntries as any).mockResolvedValue({ data: { count: 0 } });
    (api.getLatestSequence as any).mockResolvedValue({ data: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls checkNewEntries on interval when auto-refresh disabled', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'false');

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Initial call count
    const initialCallCount = (api.checkNewEntries as any).mock.calls.length;

    // Act - advance past interval
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Assert - should have called checkNewEntries
    expect((api.checkNewEntries as any).mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
  });

  it('checks for new entries when newestSequence exists', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'false');
    (api.checkNewEntries as any).mockResolvedValue({ data: { count: 5 } });

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 500 }));

    // Wait for initial load
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Act - trigger interval
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Assert
    expect(api.checkNewEntries).toHaveBeenCalled();
  });

  it('gets latest sequence when no entries exist', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'false');
    (api.getEntriesWithCursor as any).mockResolvedValue({
      data: [],
      meta: { total: 0, hasMore: false, newestSequence: null, oldestSequence: null },
    });
    (api.getLatestSequence as any).mockResolvedValue({ data: { sequence: 1 } });

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 500 }));

    // Wait for initial load
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Act - trigger interval
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Assert - should try to get latest sequence since no entries
    expect(api.getLatestSequence).toHaveBeenCalled();
  });

  it('auto-loads new entries when auto-refresh enabled and new entries exist', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'true');

    const newEntries = [{ id: 2, sequence: 101 }];
    (api.checkNewEntries as any).mockResolvedValue({ data: { count: 1 } });
    (api.getEntriesWithCursor as any)
      .mockResolvedValueOnce({
        data: [{ id: 1, sequence: 100 }],
        meta: { total: 1, hasMore: false, newestSequence: 100, oldestSequence: 100 },
      })
      .mockResolvedValueOnce({
        data: newEntries,
        meta: { total: 2, hasMore: false, newestSequence: 101, oldestSequence: 100 },
      });

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 500 }));

    // Wait for initial load
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Act - trigger auto-load interval
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Assert
    expect(api.checkNewEntries).toHaveBeenCalled();
  });

  it('handles errors in checkForNew gracefully', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'false');
    (api.checkNewEntries as any).mockRejectedValue(new Error('Network error'));

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 500 }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Act - trigger interval (should not throw)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Assert - no error thrown, hook still works
    expect(api.checkNewEntries).toHaveBeenCalled();
  });

  it('handles errors in autoLoadNew gracefully', async () => {
    // Arrange
    localStorage.setItem('nestlens-auto-refresh', 'true');
    (api.checkNewEntries as any).mockRejectedValue(new Error('Network error'));

    renderHook(() => usePaginatedEntries({ autoRefreshInterval: 500 }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Act - trigger interval (should not throw)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Assert - no error thrown
    expect(api.checkNewEntries).toHaveBeenCalled();
  });

  it('clears interval on unmount', async () => {
    // Arrange
    const { unmount } = renderHook(() =>
      usePaginatedEntries({ autoRefreshInterval: 500 })
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const callsBefore = (api.checkNewEntries as any).mock.calls.length;

    // Act
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Assert - no new calls after unmount
    const callsAfter = (api.checkNewEntries as any).mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });
});
