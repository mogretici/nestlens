import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

/**
 * The live feed must not re-examine the same entries for ever.
 *
 * The automatic path asked from the newest entry *on screen*, and used the
 * unfiltered count of everything after it as the page size. On a filtered page
 * nothing new matched, so nothing was added, so the cursor never moved — and
 * the next poll asked for a slightly larger range. Measured in a browser on
 * `/requests?statuses=500` while traffic that did not match it arrived:
 *
 *     limit=32, 88, 136, 192, 240, … 1224, 1288
 *
 * — climbing to the API's ceiling of 1,000 in twenty-five seconds, and a scan
 * that far every five seconds for as long as the tab stayed open.
 */
describe('usePaginatedEntries — the live cursor', () => {
  const page = (data: { id: number }[], newestSequence: number | null, hasMore = false) => ({
    data,
    meta: { total: data.length, hasMore, newestSequence, oldestSequence: newestSequence },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.setItem('nestlens-auto-refresh', 'true');
  });

  const afterSequences = () =>
    vi
      .mocked(api.getEntriesWithCursor)
      .mock.calls.map(([params]) => params.afterSequence)
      .filter((value): value is number => value !== undefined);

  const tick = async (times: number) => {
    for (let i = 0; i < times; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }
  };

  it('moves past entries the filter dropped', async () => {
    // One entry on screen; the service keeps producing entries that do not
    // match, so every poll finds nothing to add.
    let newest = 100;
    vi.mocked(api.getLatestSequence).mockImplementation(async () => {
      newest += 50;
      return { data: newest } as never;
    });
    vi.mocked(api.getEntriesWithCursor).mockImplementation((async (params: {
      afterSequence?: number;
    }) => (params.afterSequence ? page([], null) : page([{ id: 100 }], 100))) as never);

    renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: { statuses: [500] },
        autoRefreshInterval: 500,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await tick(5);

    const asked = afterSequences();
    expect(asked.length).toBeGreaterThan(3);
    // Each poll starts where the last one stopped, not where the list is.
    expect(asked[asked.length - 1]).toBeGreaterThan(asked[0]);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('asks for a page, not for everything that arrived', async () => {
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 5_000 } as never);
    vi.mocked(api.getEntriesWithCursor).mockImplementation((async (params: {
      afterSequence?: number;
    }) => (params.afterSequence ? page([], null) : page([{ id: 100 }], 100))) as never);

    renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, autoRefreshInterval: 500 }),
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await tick(2);

    const limits = vi
      .mocked(api.getEntriesWithCursor)
      .mock.calls.filter(([p]) => p.afterSequence !== undefined)
      .map(([p]) => p.limit);

    expect(limits.length).toBeGreaterThan(0);
    expect(limits.every((value) => value === 50)).toBe(true);
  });

  it('does not skip entries when the page it asked for filled up', async () => {
    // More matched than fit: only what came back counts as seen, so the rest
    // are picked up next time rather than stepped over.
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 9_000 } as never);
    vi.mocked(api.getEntriesWithCursor).mockImplementation((async (params: {
      afterSequence?: number;
    }) =>
      params.afterSequence
        ? page([{ id: params.afterSequence + 1 }], params.afterSequence + 1, true)
        : page([{ id: 100 }], 100)) as never);

    renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, autoRefreshInterval: 500 }),
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await tick(3);

    const asked = afterSequences();
    // 100 -> 101 -> 102: one step per page, never jumping to 9,000.
    expect(asked.slice(0, 3)).toEqual([100, 101, 102]);
  });

  it('asks for nothing when nothing has arrived', async () => {
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 100 } as never);
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue(page([{ id: 100 }], 100) as never);

    renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, autoRefreshInterval: 500 }),
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await tick(4);

    expect(afterSequences()).toEqual([]);
  });
});
