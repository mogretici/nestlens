/**
 * Clicking resolve on an exception the store no longer has.
 *
 * The API used to answer `success: true, data: null` for it, and the page
 * applied that to the row it had clicked — so the reader was told about a
 * property of null. Pruning deletes by age and every store evicts by size, so
 * an entry going while the list is open is ordinary, not exotic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import ExceptionsPage from '../../pages/ExceptionsPage';
import { EntryGoneError, resolveEntry } from '../../api';
import { StatsProvider } from '../../contexts/StatsContext';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  // Hoisted above the module scope, so the fixture lives inside the factory.
  const listed = {
    id: 7,
    type: 'exception',
    createdAt: new Date().toISOString(),
    payload: { name: 'TypeError', message: 'boom', stack: '' },
  };

  return {
    ...actual,
    resolveEntry: vi.fn(),
    unresolveEntry: vi.fn(),
    getEntriesWithCursor: vi.fn().mockResolvedValue({
      data: [listed],
      meta: { total: 1, hasMore: false, newestSequence: 7, oldestSequence: 7 },
    }),
    checkNewEntries: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    getLatestSequence: vi.fn().mockResolvedValue({ data: 7 }),
    getStats: vi.fn().mockResolvedValue({ data: { total: 1, byType: {}, unresolvedExceptions: 1 } }),
  };
});

vi.mock('react-hot-toast', () => {
  const fn = vi.fn() as unknown as { (message: string): void; error: ReturnType<typeof vi.fn> };
  fn.error = vi.fn();

  return { default: fn, Toaster: () => null };
});

const open = () =>
  render(
    <MemoryRouter>
      <StatsProvider>
        <ExceptionsPage />
      </StatsProvider>
    </MemoryRouter>,
  );

describe('an exception that is gone by the time it is clicked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says it is gone rather than reporting a property of null', async () => {
    vi.mocked(resolveEntry).mockRejectedValue(new EntryGoneError());
    open();

    const button = await screen.findByRole('button', { name: 'Mark as resolved' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('This entry is no longer stored');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still reports a real failure as one', async () => {
    vi.mocked(resolveEntry).mockRejectedValue(new Error('API error: 500'));
    open();

    const button = await screen.findByRole('button', { name: 'Mark as resolved' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
