/**
 * Pressing *Prune Now* has to say what happened.
 *
 * The handler refreshed the page's figures on success and wrote failures to
 * the console. Neither reaches the reader: the usual outcome is that nothing
 * is old enough to delete, so the button spins, stops, and every number stays
 * where it was — which reads exactly like a button that does not work. A
 * refusal read the same way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardPage from '../../pages/DashboardPage';
import { StatsProvider } from '../../contexts/StatsContext';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getStats: vi.fn(),
  getStorageStats: vi.fn(),
  getPruningStatus: vi.fn(),
  runPruning: vi.fn(),
  getEntriesWithCursor: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

const draw = () =>
  render(
    <MemoryRouter>
      <StatsProvider>
        <DashboardPage />
      </StatsProvider>
    </MemoryRouter>,
  );

const pressPrune = async (): Promise<void> => {
  const button = await screen.findByRole('button', { name: /prune now/i });
  fireEvent.click(button);
};

describe('pruning from the overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getStats).mockResolvedValue({
      data: { total: 5, byType: {}, unresolvedExceptions: 0 },
    } as never);
    vi.mocked(api.getStorageStats).mockResolvedValue({ data: { total: 5, byType: {} } } as never);
    vi.mocked(api.getPruningStatus).mockResolvedValue({
      data: { enabled: true, maxAge: 24, interval: 60, totalEntries: 5 },
    } as never);
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue({
      data: [],
      meta: { hasMore: false, total: 0 },
    } as never);
  });

  it('says how many entries went', async () => {
    vi.mocked(api.runPruning).mockResolvedValue({
      success: true,
      data: { deleted: 1234, lastRun: '', nextRun: '' },
    } as never);

    draw();
    await pressPrune();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1,234')),
    );
  });

  it('says so when nothing was old enough', async () => {
    vi.mocked(api.runPruning).mockResolvedValue({
      success: true,
      data: { deleted: 0, lastRun: '', nextRun: '' },
    } as never);

    draw();
    await pressPrune();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Nothing was old enough')),
    );
  });

  it('counts one entry as one entry', async () => {
    vi.mocked(api.runPruning).mockResolvedValue({
      success: true,
      data: { deleted: 1, lastRun: '', nextRun: '' },
    } as never);

    draw();
    await pressPrune();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pruned 1 entry'));
  });

  it('says so when it was refused', async () => {
    vi.mocked(api.runPruning).mockRejectedValue(new Error('API error: 403'));

    draw();
    await pressPrune();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('403')));
  });

  it('does not claim success when it was refused', async () => {
    vi.mocked(api.runPruning).mockRejectedValue(new Error('API error: 500'));

    draw();
    await pressPrune();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
