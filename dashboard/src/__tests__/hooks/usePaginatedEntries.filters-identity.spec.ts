import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

/**
 * A caller that builds its filters object inline must not spin the hook.
 *
 * QueriesPage and ExceptionsPage both add one flag of their own on top of the
 * memoised filters from `useEntryFilters`:
 *
 *   const serverFilters = { ...baseServerFilters, slow: showSlowOnly || undefined };
 *
 * That literal is rebuilt every render. While the fetch effect depended on the
 * caller's object by identity, each render refetched, set state, re-rendered and
 * built another object — `entries/cursor` fired for as long as the page stayed
 * open. These pin the fix: the hook keys on filter CONTENT, so a fresh object
 * holding the same values is not a new request.
 */
describe('usePaginatedEntries — filters identity', () => {
  const meta = {
    total: 1,
    hasMore: false,
    newestSequence: 1,
    oldestSequence: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue({ data: [], meta });
    vi.mocked(api.checkNewEntries).mockResolvedValue({
      data: { count: 0, hasNew: false },
    });
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 1 });
  });

  it('does not refetch when a re-render passes an equal but fresh filters object', async () => {
    // Arrange — a new object literal every render, exactly like QueriesPage builds.
    const { rerender } = renderHook(() =>
      usePaginatedEntries({
        type: 'query',
        limit: 50,
        filters: { slow: undefined },
      }),
    );

    await waitFor(() =>
      expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1),
    );

    // Act
    rerender();
    rerender();
    rerender();

    // Assert — without the content-keyed memo this is 5, and in a real page each
    // fetch triggers the next render, so it never stops.
    expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1);
  });

  it('refetches when the filter values actually change', async () => {
    // Arrange
    const { rerender } = renderHook(
      ({ slow }: { slow: boolean | undefined }) =>
        usePaginatedEntries({ type: 'query', limit: 50, filters: { slow } }),
      { initialProps: { slow: undefined as boolean | undefined } },
    );

    await waitFor(() =>
      expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1),
    );

    // Act
    rerender({ slow: true });

    // Assert
    await waitFor(() =>
      expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(api.getEntriesWithCursor).mock.calls[1][0]).toMatchObject({
      filters: { slow: true },
    });
  });
});
