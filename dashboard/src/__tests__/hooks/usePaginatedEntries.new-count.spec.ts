import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

/**
 * "Load N new entries" has to mean N entries this list would show.
 *
 * `entries/check-new` counts by sequence and type, and knows nothing about
 * filters. Measured in a browser on `/requests?statuses=500`, with ordinary
 * 200s arriving and no 500s at all:
 *
 *     badge: "Load 147 new entries"   rows after clicking it: 0
 *
 * So when anything is being narrowed the count comes from asking for the
 * entries themselves — the same request the automatic path already makes.
 */
describe('usePaginatedEntries — counting new entries', () => {
  const meta = (newestSequence: number | null) => ({
    total: 1,
    hasMore: false,
    newestSequence,
    oldestSequence: 1,
  });

  const row = (id: number) => ({ id, type: 'request', payload: {} });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('nestlens-auto-refresh', 'false');
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue({
      data: [row(10)],
      meta: meta(10),
    } as never);
    vi.mocked(api.checkNewEntries).mockResolvedValue({
      data: { count: 147, hasNew: true },
    } as never);
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 1 } as never);
  });

  const settle = async () => {
    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('uses the cheap count when nothing is narrowed', async () => {
    const { result } = renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, autoRefreshInterval: 50 }),
    );
    await settle();

    await waitFor(() => expect(result.current.newEntriesCount).toBe(147));
    expect(api.checkNewEntries).toHaveBeenCalled();
  });

  it('counts only matching entries when a filter is active', async () => {
    vi.mocked(api.getEntriesWithCursor).mockImplementation((async (params: {
      afterSequence?: number;
    }) =>
      params.afterSequence
        ? { data: [], meta: meta(10) }
        : { data: [row(10)], meta: meta(10) }) as never);

    const { result } = renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: { statuses: [500] },
        autoRefreshInterval: 50,
      }),
    );
    await settle();

    await waitFor(() =>
      expect(
        vi.mocked(api.getEntriesWithCursor).mock.calls.some(([p]) => p.afterSequence === 10),
      ).toBe(true),
    );

    expect(result.current.newEntriesCount).toBe(0);
    expect(api.checkNewEntries).not.toHaveBeenCalled();
  });

  it('counts the matching ones, not all of them', async () => {
    vi.mocked(api.getEntriesWithCursor).mockImplementation((async (params: {
      afterSequence?: number;
    }) =>
      params.afterSequence
        ? { data: [row(11), row(12)], meta: meta(12) }
        : { data: [row(10)], meta: meta(10) }) as never);

    const { result } = renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: { statuses: [500] },
        autoRefreshInterval: 50,
      }),
    );
    await settle();

    await waitFor(() => expect(result.current.newEntriesCount).toBe(2));
  });

  it('treats a time window as narrowing too', async () => {
    renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        windowMinutes: 15,
        autoRefreshInterval: 50,
      }),
    );
    await settle();

    await waitFor(() =>
      expect(
        vi.mocked(api.getEntriesWithCursor).mock.calls.some(([p]) => p.afterSequence === 10),
      ).toBe(true),
    );

    expect(api.checkNewEntries).not.toHaveBeenCalled();
  });

  it('ignores an empty filters object', async () => {
    // A page that spreads its filters into a literal always passes an object.
    const { result } = renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: { statuses: [], tags: [], slow: undefined },
        autoRefreshInterval: 50,
      }),
    );
    await settle();

    await waitFor(() => expect(result.current.newEntriesCount).toBe(147));
  });
});
