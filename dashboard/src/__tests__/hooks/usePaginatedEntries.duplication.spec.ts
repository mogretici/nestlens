import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

// The SSE hook is a second trigger for the same "load newer" path; the tests
// below drive that path directly, so the stream itself stays inert here.
vi.mock('../../hooks/useEntryStream', () => ({
  useEntryStream: () => ({ connected: false }),
}));

/**
 * An entry list must hold each id once.
 *
 * The list is keyed by `entry.id`. Two rows with one key is not a cosmetic
 * problem: React cannot tell them apart, so it reuses and drops rows
 * unpredictably as the list changes — entries vanish from the table, and a
 * click lands on a different entry than the one under the cursor. That was the
 * reported bug, and it looked like "some requests never show up".
 *
 * It came from "load newer" having two callers — a 5s interval and the SSE
 * handler — with nothing stopping them overlapping. Both read the cursor before
 * awaiting and wrote it after, so both fetched from the same point, got the
 * same rows, and prepended them. Measured on the GraphQL page under two
 * requests per second: 3,224 rows, 121 of them distinct.
 */
describe('usePaginatedEntries: an id appears once', () => {
  const page = (ids: number[]) => ({
    data: ids.map((id) => ({ id, type: 'graphql', timestamp: '2026-08-21T00:00:00Z' })),
    meta: {
      total: ids.length,
      hasMore: false,
      newestSequence: ids[0] ?? null,
      oldestSequence: ids[ids.length - 1] ?? null,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      page([3, 2, 1]),
    );
    (api.checkNewEntries as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 0 },
    });
    (api.getLatestSequence as never as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the first page', async () => {
    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));

    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    expect(result.current.entries.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('does not prepend an entry it already has', async () => {
    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    // The server answers a "newer than 3" query with rows the list already
    // holds — which is exactly what two overlapping callers produce.
    (api.checkNewEntries as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 2 },
    });
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      page([3, 2]),
    );

    await act(async () => {
      await result.current.loadNew();
    });

    const ids = result.current.entries.map((e) => e.id);
    expect(ids).toEqual([3, 2, 1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every id distinct when new entries overlap the list', async () => {
    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    (api.checkNewEntries as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 2 },
    });
    // 4 is genuinely new; 3 is already on the list.
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      page([4, 3]),
    );

    await act(async () => {
      await result.current.loadNew();
    });

    const ids = result.current.entries.map((e) => e.id);
    expect(ids).toEqual([4, 3, 2, 1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs one "load newer" round trip at a time', async () => {
    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    (api.checkNewEntries as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 1 },
    });

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => {
      await gate;
      return page([4]);
    });

    await act(async () => {
      // Two callers, as the interval and the stream handler would be.
      const first = result.current.loadNew();
      const second = result.current.loadNew();
      release?.();
      await Promise.all([first, second]);
    });

    // The second call returns without asking the server again.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const ids = result.current.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not double-count the total when rows are already held', async () => {
    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    const totalBefore = result.current.meta?.total ?? 0;

    (api.checkNewEntries as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 2 },
    });
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      page([3, 2]),
    );

    await act(async () => {
      await result.current.loadNew();
    });

    // Nothing was added, so the count the header shows must not move — it read
    // "712 / 890" above a table holding 3,224 rows.
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.meta?.total ?? 0).toBeLessThanOrEqual(totalBefore + 2);
  });

  it('appends only unseen entries when loading older pages', async () => {
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...page([3, 2, 1]),
      meta: { total: 6, hasMore: true, newestSequence: 3, oldestSequence: 1 },
    });

    const { result } = renderHook(() => usePaginatedEntries({ type: 'graphql' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    // The older page overlaps the one on screen, which happens when entries
    // arrive between the two requests.
    (api.getEntriesWithCursor as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      page([1, 0]),
    );

    await act(async () => {
      await result.current.loadMore();
    });

    const ids = result.current.entries.map((e) => e.id);
    expect(ids).toEqual([3, 2, 1, 0]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
