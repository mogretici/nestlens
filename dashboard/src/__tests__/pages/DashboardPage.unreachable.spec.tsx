/**
 * A monitor that cannot see must not report an all-clear.
 *
 * Every number on the overview falls back to `0` when the stats are absent, and
 * they are absent whenever the API refuses or cannot be reached. Measured in a
 * browser with every `/api/` call answered 403:
 *
 *     ENTRIES 0 total recorded
 *     ERRORS  0 unresolved exceptions
 *     SLOW QUERIES 0
 *
 * — from a dashboard that had seen nothing at all. Someone checking a
 * production service through a tunnel their address is not allowed on would
 * read that as a healthy, idle application.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

const STATS = {
  total: 12,
  byType: { request: 10, exception: 2 },
  avgResponseTime: 30,
  slowQueries: 1,
  exceptions: 2,
  unresolvedExceptions: 2,
};

const draw = () =>
  render(
    <MemoryRouter>
      <StatsProvider>
        <DashboardPage />
      </StatsProvider>
    </MemoryRouter>,
  );

describe('the overview when NestLens cannot be reached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getStorageStats).mockResolvedValue({ data: { total: 0, byType: {} } } as never);
    vi.mocked(api.getPruningStatus).mockResolvedValue({ data: {} } as never);
    vi.mocked(api.getEntriesWithCursor).mockResolvedValue({
      data: [],
      meta: { total: 0, hasMore: false, newestSequence: null, oldestSequence: null },
    } as never);
  });

  it('says it could not reach NestLens', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('API error: 403'));

    draw();

    await waitFor(() => expect(screen.getByTestId('stats-error')).toBeInTheDocument());
    expect(screen.getByText(/Could not reach NestLens/)).toBeInTheDocument();
  });

  it('reports no counts at all rather than zeros', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('API error: 403'));

    draw();

    await waitFor(() => expect(screen.getByTestId('stats-error')).toBeInTheDocument());
    expect(screen.queryByText('total recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('unresolved exceptions')).not.toBeInTheDocument();
  });

  it('says the numbers are unknown, not that nothing happened', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('API error: 403'));

    draw();

    await waitFor(() => expect(screen.getByTestId('stats-error')).toBeInTheDocument());
    expect(screen.getByTestId('stats-error')).toHaveTextContent(/not a report of an idle application/);
  });

  it('is announced', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('nope'));

    draw();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  /**
   * The stats can answer while the entry list cannot — a 500 on one endpoint,
   * a filter the storage refuses. The panel's empty state is a claim about the
   * application, so a list that could not be fetched must not read as an empty
   * one.
   */
  describe('when only the activity list fails', () => {
    beforeEach(() => {
      vi.mocked(api.getStats).mockResolvedValue({ data: STATS } as never);
      vi.mocked(api.getEntriesWithCursor).mockRejectedValue(new Error('API error: 500'));
    });

    it('says it could not load the activity', async () => {
      draw();

      await waitFor(() => expect(screen.getByTestId('activity-error')).toBeInTheDocument());
    });

    it('does not say nothing has been recorded', async () => {
      draw();

      await waitFor(() => expect(screen.getByTestId('activity-error')).toBeInTheDocument());
      expect(screen.queryByText('No entries recorded yet')).not.toBeInTheDocument();
    });

    it('still shows the numbers it could fetch', async () => {
      draw();

      await waitFor(() => expect(screen.getByText('total recorded')).toBeInTheDocument());
    });

    it('does not print the default retention as the deployment’s setting', async () => {
      vi.mocked(api.getPruningStatus).mockRejectedValue(new Error('API error: 500'));
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue({
        data: [],
        meta: { hasMore: false, total: 0 },
      } as never);

      draw();

      await waitFor(() => expect(screen.getByText('Retention')).toBeInTheDocument());
      expect(screen.queryByText('24h')).not.toBeInTheDocument();
    });

    it('says nothing about activity when the list is genuinely empty', async () => {
      vi.mocked(api.getEntriesWithCursor).mockResolvedValue({
        data: [],
        meta: { hasMore: false, total: 0 },
      } as never);

      draw();

      await waitFor(() => expect(screen.getByText('No entries recorded yet')).toBeInTheDocument());
      expect(screen.queryByTestId('activity-error')).not.toBeInTheDocument();
    });
  });

  it('shows the numbers when they can be fetched', async () => {
    vi.mocked(api.getStats).mockResolvedValue({ data: STATS } as never);

    draw();

    await waitFor(() => expect(screen.getByText('total recorded')).toBeInTheDocument());
    expect(screen.queryByTestId('stats-error')).not.toBeInTheDocument();
  });

  it('keeps the last numbers when a later refresh fails', async () => {
    // They were true when they were fetched; blanking the page would lose them.
    vi.mocked(api.getStats)
      .mockResolvedValueOnce({ data: STATS } as never)
      .mockRejectedValue(new Error('API error: 500'));

    draw();

    await waitFor(() => expect(screen.getByText('total recorded')).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByTestId('stats-error')).not.toBeInTheDocument();
  });
});
