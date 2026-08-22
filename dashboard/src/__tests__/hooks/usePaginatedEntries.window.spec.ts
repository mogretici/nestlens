import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePaginatedEntries } from '../../hooks/usePaginatedEntries';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntriesWithCursor: vi.fn(),
  checkNewEntries: vi.fn(),
  getLatestSequence: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

/**
 * "The last five minutes" has to keep meaning the last five minutes.
 *
 * The window arrives as a number of minutes and is turned into an instant where
 * the request is made. Computing it during render instead would fix `from` at
 * the moment of the click, so a page left open would quietly widen: after ten
 * minutes, "last 5 minutes" would be showing fifteen.
 */
describe('usePaginatedEntries — the time window', () => {
  const meta = { total: 0, hasMore: false, newestSequence: 1, oldestSequence: 1 };

  const askedFrom = (call: number): string | undefined =>
    vi.mocked(api.getEntriesWithCursor).mock.calls[call][0].filters?.from;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue({ data: [], meta });
    vi.mocked(api.checkNewEntries).mockResolvedValue({ data: { count: 0, hasNew: false } });
    vi.mocked(api.getLatestSequence).mockResolvedValue({ data: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for nothing extra when no window is chosen', async () => {
    renderHook(() => usePaginatedEntries({ type: 'request', limit: 50, filters: {} }));

    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    expect(askedFrom(0)).toBeUndefined();
  });

  it('turns the window into an instant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));

    renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, filters: {}, windowMinutes: 5 }),
    );

    await vi.waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    expect(askedFrom(0)).toBe('2026-08-22T11:55:00.000Z');
  });

  it('keeps the other filters alongside it', async () => {
    renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: { methods: ['GET'] },
        windowMinutes: 60,
      }),
    );

    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    expect(vi.mocked(api.getEntriesWithCursor).mock.calls[0][0].filters).toMatchObject({
      methods: ['GET'],
    });
    expect(askedFrom(0)).toBeDefined();
  });

  it('moves the instant forward as time passes', async () => {
    // The point of the whole arrangement: the same chosen window, a later
    // request, a later `from`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));

    const { result } = renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, filters: {}, windowMinutes: 5 }),
    );

    await vi.waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-08-22T12:10:00.000Z'));
    await result.current.refresh();

    await vi.waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(2));

    expect(askedFrom(0)).toBe('2026-08-22T11:55:00.000Z');
    expect(askedFrom(1)).toBe('2026-08-22T12:05:00.000Z');
  });

  it('fetches again when the window changes', async () => {
    let minutes = 0;
    const { rerender } = renderHook(() =>
      usePaginatedEntries({
        type: 'request',
        limit: 50,
        filters: {},
        windowMinutes: minutes,
      }),
    );

    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    minutes = 15;
    rerender();

    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(2));
    expect(askedFrom(1)).toBeDefined();
  });

  it('does not fetch again when nothing changed', async () => {
    const { rerender } = renderHook(() =>
      usePaginatedEntries({ type: 'request', limit: 50, filters: {}, windowMinutes: 15 }),
    );

    await waitFor(() => expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1));

    rerender();
    rerender();
    rerender();

    expect(api.getEntriesWithCursor).toHaveBeenCalledTimes(1);
  });
});
